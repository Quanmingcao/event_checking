import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Attendant, CheckinLog } from '../types';
import { Calendar, MapPin, Users, Download, Search, Filter, Trash2, Edit, Plus, UserPlus, FileUp, Copy, Check, ArrowLeft, Upload, Save, RefreshCw, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';

import { AdminGroups } from '../components/AdminGroups';

export default function AdminEvent() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Import State
  const [importData, setImportData] = useState<any[]>([]);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'list' | 'import' | 'settings' | 'groups'>('list');
  const [uploadingBg, setUploadingBg] = useState(false);
  
  // Manual Guest Form State
  const [showModal, setShowModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Attendant | null>(null);
  const [manualForm, setManualForm] = useState({
      full_name: '',
      email: '',
      phone: '',
      organization: '',
      position: '',
      is_vip: false,
      seat_location: '',
      group_id: ''
  });
  const [manualLoading, setManualLoading] = useState(false);

  // Groups for dropdown
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if(id) {
       // Fetch groups for manual form dropdown
       supabase.from('event_groups').select('id, name').eq('event_id', id).then(({data}) => {
           if(data) setGroups(data);
       });
    }
  }, [id]);

  const openAddModal = () => {
      setEditingGuest(null);
      setManualForm({
          full_name: '', email: '', phone: '', organization: '', position: '', is_vip: false, seat_location: '', group_id: ''
      });
      setShowModal(true);
  };

  const openEditModal = (guest: Attendant) => {
      setEditingGuest(guest);
      setManualForm({
          full_name: guest.full_name,
          email: guest.email || '',
          phone: guest.phone || '',
          organization: guest.organization || '',
          position: guest.position || '',
          is_vip: guest.is_vip,
          seat_location: guest.seat_location || '',
          group_id: guest.group_id || ''
      });
      setShowModal(true);
  };

  const handleSaveGuest = async (e: React.FormEvent) => {
      e.preventDefault();
      setManualLoading(true);
      try {
          const payload: any = {
              event_id: id,
              full_name: manualForm.full_name,
              email: manualForm.email,
              phone: manualForm.phone,
              organization: manualForm.organization,
              position: manualForm.position,
              is_vip: manualForm.is_vip,
              seat_location: manualForm.seat_location,
              group_id: manualForm.group_id || null
          };
          
          if (!editingGuest) {
              // Add New
              payload.code = Math.floor(100000 + Math.random() * 900000).toString();
              const { error } = await supabase.from('attendants').insert([payload]);
              if (error) throw error;
              alert('Đã thêm khách mới!');
          } else {
              // Update
              const { error } = await supabase.from('attendants').update(payload).eq('id', editingGuest.id);
              if (error) throw error;
              alert('Đã cập nhật thông tin!');
          }
          setShowModal(false);
          // fetchAttendants will be triggered by realtime, but we can call it to be sure?
          // Realtime is already set up.
      } catch (err: any) {
          alert('Lỗi lưu: ' + err.message);
      } finally {
          setManualLoading(false);
      }
  };

  useEffect(() => {
    if (id) {
       // PARALLEL FETCHING
      const initData = async () => {
         setLoading(true);
         await Promise.all([
             fetchEventDetails(),
             fetchAttendants()
         ]);
         setLoading(false);
      };
      initData();
      
      const channel = supabase
        .channel('admin-event-updates')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'attendants', filter: `event_id=eq.${id}` },
          (payload) => {
             const updatedAttendant = payload.new as Attendant;
             setAttendants((prev) => 
                prev.map((item) => item.id === updatedAttendant.id ? updatedAttendant : item)
             );
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'checkin_logs', filter: `event_id=eq.${id}` },
          (payload) => {
             const newLog = payload.new;
             setAttendants((prev) => 
                prev.map((item) => 
                    item.id === newLog.attendant_id 
                    ? { ...item, checked_in_at: newLog.checked_in_at } 
                    : item
                )
             );
          }
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'attendants', filter: `event_id=eq.${id}` },
            (payload) => {
               const newAttendant = payload.new as Attendant;
               setAttendants((prev) => [newAttendant, ...prev]);
            }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [id]);

  const fetchEventDetails = async () => {
    const { data } = await supabase.from('events').select('*').eq('id', id).single();
    if (data) setEvent(data);
  };

  const fetchAttendants = async () => {
    const { data } = await supabase.from('attendants').select('*').eq('event_id', id).order('created_at', { ascending: false });
    if (data) setAttendants(data);
    // setLoading(false); // Handled in initData
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        processImportData(data);
    };
    reader.readAsBinaryString(file);
  };
  const processImportData = (data: any[]) => {
    const mapped = data.map((row: any) => {
      const normalizedRow = Object.keys(row).reduce((acc: any, key) => {
          acc[key.toLowerCase()] = row[key];
          return acc;
      }, {});

      const isVipRaw = normalizedRow['la_vip']?.toString().toLowerCase();
      const isVip = ['true', '1', 'có', 'yes'].includes(isVipRaw);

      return {
        event_id: id,
        code: normalizedRow['ma'],
        full_name: normalizedRow['ho_ten'],
        position: normalizedRow['chuc_vu'] || '',
        organization: normalizedRow['don_vi'] || '',
        is_vip: isVip,
        seat_location: normalizedRow['cho_ngoi'] || normalizedRow['ghe_so'] || '',
        avatar_url: normalizedRow['anh_dai_dien'] || '',
      };
    }).filter(item => item.code && item.full_name);

    setImportData(mapped);
    setImportPreview(mapped.slice(0, 5));
  };

  const executeImport = async () => {
    if (!importData.length || !id) return;
    setImporting(true);

    try {
      const { error } = await supabase.from('attendants').upsert(
        importData, 
        { onConflict: 'event_id,code' }
      );

      if (error) throw error;
      alert(`Đã nhập thành công ${importData.length} khách mời.`);
      setImportData([]);
      setImportPreview([]);
      setActiveTab('list');
      fetchAttendants();
    } catch (err: any) {
      alert('Lỗi nhập liệu: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div>Đang tải...</div>;
  if (!event) return <div>Không tìm thấy sự kiện</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
                <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
                <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                    <span>Mã sự kiện: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-800 border border-gray-200">{event.event_code}</span></span>
                    <button 
                        onClick={() => {
                            if (event?.event_code) {
                                navigator.clipboard.writeText(event.event_code);
                                alert("Đã sao chép mã sự kiện: " + event.event_code);
                            }
                        }}
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Sao chép"
                    >
                        <Copy className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
        <div className="flex space-x-2">
            <button
                onClick={() => {
                    const url = `${window.location.origin}/face-checkin/${id}`;
                    navigator.clipboard.writeText(url);
                    alert('Đã sao chép link đăng ký khuôn mặt: ' + url);
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
                <Upload className="h-4 w-4 mr-2" />
                Link gửi ảnh
            </button>
            <button
                onClick={() => setActiveTab('list')}
                className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'list' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Danh sách
            </button>
            <button
                onClick={() => setActiveTab('import')}
                className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'import' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Nhập Khách
            </button>
            <button
                onClick={() => setActiveTab('groups')}
                className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'groups' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Nhóm / Đơn vị
            </button>
            <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'settings' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Cài đặt
            </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="bg-white shadow overflow-auto sm:rounded-lg max-h-[70vh]">
           <div className="p-4 border-b border-gray-200 flex justify-between items-center">
               <h3 className="text-lg font-medium text-gray-900">Danh sách tham dự ({attendants.length})</h3>
               <button
                   onClick={openAddModal}
                   className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
               >
                   + Thêm Khách
               </button>
           </div>
           <table className="min-w-full divide-y divide-gray-200 relative">
             <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
               <tr>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Họ tên</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã / Info</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Đơn vị / Ghế</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VIP</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sửa</th>
               </tr>
             </thead>
             <tbody className="bg-white divide-y divide-gray-200">
               {attendants.map((person) => (
                 <tr key={person.id}>
                   <td className="px-6 py-4 whitespace-nowrap">
                     <div className="flex items-center">
                        {person.avatar_url && <img className="h-8 w-8 rounded-full mr-2" src={person.avatar_url} alt="" />}
                        <div className="text-sm font-medium text-gray-900">{person.full_name}</div>
                     </div>
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       <div className="font-mono font-bold text-indigo-600">{person.code}</div>
                       <div className="text-xs">{person.email}</div>
                       <div className="text-xs">{person.phone}</div>
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                     <div>{person.organization}</div>
                     {person.seat_location && <div className="text-xs text-indigo-600 font-medium">Ghế: {person.seat_location}</div>}
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                     {person.is_vip ? <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">VIP</span> : '-'}
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                     {person.checked_in_at ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Check-in {new Date(person.checked_in_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                        </span>
                     ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Chưa đến</span>
                     )}
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <button onClick={() => openEditModal(person)} className="text-indigo-600 hover:text-indigo-900">Sửa</button>
                   </td>
                 </tr>
               ))}
               {attendants.length === 0 && (
                   <tr>
                       <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">Chưa có dữ liệu khách mời.</td>
                   </tr>
               )}
             </tbody>
           </table>
        </div>
      )}

      {activeTab === 'groups' && id && (
          <AdminGroups eventId={id} />
      )}

      {activeTab === 'import' && (
        <div className="bg-white shadow sm:rounded-lg p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Tải lên file Excel (.xlsx, .xls) - Danh sách khách</label>
                <div className="mt-1 flex items-center">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-slate-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-indigo-50 file:text-indigo-700
                          hover:file:bg-indigo-100
                        "
                    />
                </div>
                <div className="mt-4 bg-yellow-50 p-4 rounded-md text-sm text-yellow-800">
                    <p className="font-bold mb-2">Hướng dẫn cấu trúc file Excel:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Sheet đầu tiên. Header: <code>ma</code>, <code>ho_ten</code>, <code>chuc_vu</code>, <code>don_vi</code>, <code>la_vip</code>, <code>cho_ngoi</code>.</li>
                    </ul>
                </div>
            </div>

            {importData.length > 0 && (
                <div className="mt-4">
                    <h3 className="text-lg font-medium">Xem trước ({importData.length} dòng)</h3>
                     <div className="mt-4">
                        <button
                            onClick={executeImport}
                            disabled={importing}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {importing ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Xác nhận nhập {importData.length} dòng
                        </button>
                    </div>
                </div>
            )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white shadow sm:rounded-lg p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Cài đặt sự kiện</h3>
            
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Ảnh nền sự kiện (Background)</label>
                    <p className="text-sm text-gray-500 mb-2">Ảnh này sẽ hiển thị trên màn hình Monitor/Check-in.</p>
                    
                    <div className="flex items-start space-x-6">
                        {event?.image_url ? (
                            <div className="relative w-64 aspect-video bg-gray-100 rounded-lg overflow-hidden border">
                                <img src={event.image_url} alt="Background" className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="w-64 aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                                <ImageIcon className="w-8 h-8 text-gray-400" />
                            </div>
                        )}

                        <div className="flex-1">
                             <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingBg}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setUploadingBg(true);
                                    
                                    try {
                                        const fileExt = file.name.split('.').pop();
                                        const fileName = `${event?.id}-bg-${Math.random()}.${fileExt}`;
                                        const filePath = `${fileName}`;
                                        
                                        const { error: uploadError } = await supabase.storage
                                            .from('event-backgrounds')
                                            .upload(filePath, file);

                                        if (uploadError) {
                                            alert('Lỗi upload: ' + uploadError.message);
                                            return;
                                        }

                                        const { data: { publicUrl } } = supabase.storage
                                            .from('event-backgrounds')
                                            .getPublicUrl(filePath);

                                        const { error: updateError } = await supabase
                                            .from('events')
                                            .update({ image_url: publicUrl })
                                            .eq('id', event?.id);

                                        if (updateError) throw updateError;
                                        
                                        setEvent(prev => prev ? { ...prev, image_url: publicUrl } : null);
                                        alert('Đã cập nhật ảnh nền thành công!');

                                    } catch (err: any) {
                                        alert('Lỗi upload: ' + err.message);
                                    } finally {
                                        setUploadingBg(false);
                                        e.target.value = '';
                                    }
                                }}
                                className="block w-full text-sm text-slate-500
                                  file:mr-4 file:py-2 file:px-4
                                  file:rounded-full file:border-0
                                  file:text-sm file:font-semibold
                                  file:bg-indigo-50 file:text-indigo-700
                                  hover:file:bg-indigo-100
                                "
                            />
                            {uploadingBg && <p className="mt-2 text-sm text-indigo-600">Đang tải lên...</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
      {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200">
                  <h3 className="text-xl font-bold mb-4">{editingGuest ? 'Chỉnh sửa thông tin' : 'Thêm khách mời mới'}</h3>
                  <form onSubmit={handleSaveGuest} className="space-y-3">
                      <div>
                          <label className="block text-sm font-medium">Họ tên *</label>
                          <input required type="text" className="w-full border p-2 rounded" value={manualForm.full_name} onChange={e => setManualForm({...manualForm, full_name: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="block text-sm font-medium">Email</label>
                            <input type="email" className="w-full border p-2 rounded" value={manualForm.email} onChange={e => setManualForm({...manualForm, email: e.target.value})} />
                         </div>
                         <div>
                            <label className="block text-sm font-medium">SĐT</label>
                            <input type="text" className="w-full border p-2 rounded" value={manualForm.phone} onChange={e => setManualForm({...manualForm, phone: e.target.value})} />
                         </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium">Đơn vị / Công ty</label>
                            <input type="text" className="w-full border p-2 rounded" value={manualForm.organization} onChange={e => setManualForm({...manualForm, organization: e.target.value})} />
                          </div>
                          <div>
                             <label className="block text-sm font-medium">Chức vụ</label>
                             <input type="text" className="w-full border p-2 rounded" value={manualForm.position} onChange={e => setManualForm({...manualForm, position: e.target.value})} />
                          </div>
                      </div>

                      <div className="border-t pt-2 mt-2">
                        <label className="block text-sm font-medium text-indigo-700 mb-1">Thiết lập Chỗ ngồi & VIP</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs text-gray-500">Chọn Nhóm / Khu vực</label>
                                <select 
                                    className="w-full border p-2 rounded text-sm"
                                    value={manualForm.group_id} 
                                    onChange={e => {
                                        const g = groups.find(x => x.id === e.target.value);
                                        setManualForm({...manualForm, group_id: e.target.value, organization: g ? g.name : manualForm.organization})
                                    }}
                                >
                                    <option value="">-- Tự do / Nhập tay --</option>
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500">Số Ghế (nếu có)</label>
                                <input type="text" className="w-full border p-2 rounded text-sm font-bold text-indigo-700" placeholder="VD: A-01" value={manualForm.seat_location} onChange={e => setManualForm({...manualForm, seat_location: e.target.value})} />
                            </div>
                        </div>
                        <div className="mt-2 flex items-center">
                            <input type="checkbox" id="is_vip" className="h-4 w-4 text-indigo-600 rounded" checked={manualForm.is_vip} onChange={e => setManualForm({...manualForm, is_vip: e.target.checked})} />
                            <label htmlFor="is_vip" className="ml-2 text-sm font-bold text-gray-700">Khách VIP (Ưu tiên hiển thị)</label>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
                          <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
                          <button type="submit" disabled={manualLoading} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                             {manualLoading ? 'Đang lưu...' : 'Lưu thông tin'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}
