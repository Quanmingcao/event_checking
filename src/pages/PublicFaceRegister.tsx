import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FaceCapture } from '../components/FaceCapture';
import { Event, EventGroup } from '../types';
import { User, CheckCircle, AlertCircle, Calendar, MapPin, Building, Briefcase, Phone, Mail } from 'lucide-react';

export default function PublicFaceRegister() {
    const { eventId } = useParams<{ eventId: string }>();
    const [step, setStep] = useState<'loading' | 'form' | 'capture' | 'success' | 'error'>('loading');
    const [event, setEvent] = useState<Event | null>(null);
    const [groups, setGroups] = useState<EventGroup[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<EventGroup | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCustomOrg, setIsCustomOrg] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        organization: '',
        position: ''
    });
    const [attendantId, setAttendantId] = useState<string | null>(null);
    const [successCode, setSuccessCode] = useState<string>('');
    const [wantFaceCheckIn, setWantFaceCheckIn] = useState<boolean>(true);

    // Load Event Info
    useEffect(() => {
        const fetchEvent = async () => {
            if (!eventId) {
                setStep('error');
                setError('Đường dẫn không hợp lệ (Thiếu Event ID).');
                return;
            }

            try {
                // 1. Get Event
                const { data: eventData, error: eventError } = await supabase
                    .from('events')
                    .select('*')
                    .eq('id', eventId)
                    .single();

                if (eventError || !eventData) {
                    setStep('error');
                    setError('Không tìm thấy sự kiện này.');
                    return;
                }
                setEvent(eventData);

                // 2. Get Groups
                const { data: groupsData } = await supabase
                    .from('event_groups')
                    .select('*')
                    .eq('event_id', eventId)
                    .order('name');
                
                if (groupsData) setGroups(groupsData);
                
                setStep('form');
            } catch (err) {
                setStep('error');
                setError('Lỗi kết nối.');
            }
        };
        fetchEvent();
    }, [eventId]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.full_name || !formData.email) {
            setError('Vui lòng nhập Họ tên và Email.');
            return;
        }
        
        setLoading(true);
        setError(null);
        if (!event) return;

        try {
            // 1. Validate Quota (if group selected and HAS LIMIT)
            if (selectedGroup && selectedGroup.limit_count > 0) {
                 const { count, error: countError } = await supabase
                    .from('attendants')
                    .select('*', { count: 'exact', head: true })
                    .eq('group_id', selectedGroup.id);
                 
                 if (countError) throw countError;
                 
                 if (count !== null && count >= selectedGroup.limit_count) {
                     setError(`Nhóm "${selectedGroup.name}" đã đủ số lượng đăng ký (${selectedGroup.limit_count}). Vui lòng chọn nhóm khác.`);
                     setLoading(false);
                     return;
                 }
            }

            // 2. Prepare Data
            let finalCode = Math.floor(100000 + Math.random() * 900000).toString();
            let currentAttendantId = null;

            // 3. Check Existence (Get FULL data to preserve VIP status)
            let { data: existing } = await supabase
                .from('attendants')
                .select('*')
                .eq('event_id', event.id)
                .or(`email.eq.${formData.email},phone.eq.${formData.phone}`)
                .maybeSingle();

            // FALLBACK: If not found by unique contact info, try matching by NAME (Case Insensitive)
            // This is for cases where Admin added a VIP by name only (no email/phone)
            if (!existing) {
                const { data: existingByName } = await supabase
                    .from('attendants')
                    .select('*')
                    .eq('event_id', event.id)
                    .ilike('full_name', formData.full_name.trim())
                    .maybeSingle(); // Take the first match if multiple
                
                if (existingByName) {
                    // Only match if the existing record actually looks like a placeholder (optional check, but good for safety)
                    // For now, we assume if names match and email/phone didn't match (meaning input email is new), we merge.
                    existing = existingByName;
                }
            }

            const commonData = {
                event_id: event.id,
                full_name: formData.full_name,
                email: formData.email,
                phone: formData.phone,
                organization: selectedGroup ? selectedGroup.name : formData.organization,
                position: formData.position,
                group_id: selectedGroup?.id || null,
                // Default checked_in_at is null if new, but if updating, we don't touch it here unless we want to reset? 
                // Requirement: "checked_in_at: null" was for NEW registrations. 
                // If existing, we should probably NOT reset checked_in_at? 
                // Let's keep it simple: If existing, don't update checked_in_at. If new, set null.
            };

            if (existing) {
                 finalCode = existing.code;
                 currentAttendantId = existing.id;
                 
                 // PRESERVE VIP & SEAT & CHECK-IN status
                 const updateData = {
                     ...commonData,
                     code: finalCode,
                     // Preserve these important fields
                     is_vip: existing.is_vip, 
                     seat_location: existing.seat_location,
                     // Do NOT reset checked_in_at for existing users (they might just be updating info)
                 };

                 const { error } = await supabase.from('attendants').update(updateData).eq('id', existing.id);
                 if (error) throw error;
            } else {
                const newData = {
                    ...commonData,
                    code: finalCode,
                    is_vip: false,
                    seat_location: null,
                    checked_in_at: null
                };
                const { data: newAttendant, error } = await supabase.from('attendants').insert(newData).select('id').single();
                if (error) throw error;
                currentAttendantId = newAttendant.id;
            }
            
            setSuccessCode(finalCode);
            setAttendantId(currentAttendantId);
            
            if (wantFaceCheckIn) {
                setStep('capture');
            } else {
                setStep('success');
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Có lỗi xảy ra khi đăng ký.');
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Update Face Data
    const handleFaceUpdate = async (blob: Blob, embedding: number[]) => {
        setLoading(true);
        if (!event || !attendantId) return;

        try {
            const fileName = `${event.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const { error: uploadError } = await supabase.storage
                .from('attendant-photos')
                .upload(fileName, blob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const publicUrl = supabase.storage
                .from('attendant-photos')
                .getPublicUrl(fileName).data.publicUrl;

            const { error: updateError } = await supabase
                .from('attendants')
                .update({ 
                    avatar_url: publicUrl,
                    face_descriptor: embedding // Already number[]
                })
                .eq('id', attendantId);
            
            if (updateError) throw updateError;

            setStep('success');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Lỗi cập nhật khuôn mặt.');
        } finally {
            setLoading(false);
        }
    };

    if (step === 'loading') {
        return <div className="min-h-screen flex items-center justify-center text-gray-500">Đang tải thông tin...</div>;
    }
    
    if (step === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                        <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Đã có lỗi xảy ra</h2>
                    <p className="text-gray-600 text-sm mb-4">{error}</p>
                    <a href="/" className="text-indigo-600 hover:text-indigo-500 font-medium">Về trang chủ</a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-indigo-600 rounded-t-lg p-6 text-white text-center shadow-md">
                    <h2 className="text-2xl font-bold">{event?.name}</h2>
                    <div className="mt-2 flex items-center justify-center gap-4 text-indigo-100 text-sm">
                        {event?.location && (
                            <div className="flex items-center gap-1">
                                <MapPin size={14} />
                                <span>{event.location}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white py-8 px-4 shadow sm:rounded-b-lg sm:px-10 border-t border-gray-100">
                    
                    {error && (
                        <div className="mb-4 bg-red-50 p-4 rounded-md flex items-center gap-2 text-red-700">
                            <AlertCircle size={20} />
                            <span>{error}</span>
                        </div>
                    )}

                    {step === 'form' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <h3 className="text-lg font-medium text-gray-900">Đăng ký tham dự</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Vui lòng điền thông tin bên dưới để nhận mã Check-in.
                                </p>
                            </div>
                            <form onSubmit={handleRegister} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Họ và Tên *</label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <User className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                            placeholder="Nguyễn Văn A"
                                            value={formData.full_name}
                                            onChange={e => setFormData({...formData, full_name: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Email *</label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                            placeholder="email@example.com"
                                            value={formData.email}
                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Số điện thoại</label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Phone className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            type="tel"
                                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                            placeholder="0912..."
                                            value={formData.phone}
                                            onChange={e => setFormData({...formData, phone: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Đơn vị / Lớp / Nhóm</label>
                                        <div className="mt-1 relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Building className="h-5 w-5 text-gray-400" />
                                            </div>
                                            {groups.length > 0 ? (
                                                <>
                                                    <select
                                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                                        value={isCustomOrg ? 'other' : (selectedGroup?.id || '')}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (val === 'other') {
                                                                setIsCustomOrg(true);
                                                                setSelectedGroup(null);
                                                                setFormData({...formData, organization: ''});
                                                            } else {
                                                                setIsCustomOrg(false);
                                                                const g = groups.find(x => x.id === val);
                                                                setSelectedGroup(g || null);
                                                                setFormData({...formData, organization: g ? g.name : ''});
                                                            }
                                                        }}
                                                    >
                                                        <option value="">-- Chọn đơn vị --</option>
                                                        {groups.map(g => (
                                                            <option key={g.id} value={g.id} disabled={g.current_count >= g.limit_count && g.limit_count > 0}>
                                                                {g.name} {g.limit_count > 0 ? `(Giới hạn: ${g.limit_count})` : ''} {g.current_count >= g.limit_count && g.limit_count > 0 ? '- Đã đủ' : ''}
                                                            </option>
                                                        ))}
                                                        <option value="other">-- Khác / Tự nhập --</option>
                                                    </select>
                                                    
                                                    {isCustomOrg && (
                                                        <input
                                                            type="text"
                                                            required
                                                            className="mt-2 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                                            placeholder="Nhập tên đơn vị của bạn..."
                                                            value={formData.organization}
                                                            onChange={e => setFormData({...formData, organization: e.target.value})}
                                                        />
                                                    )}
                                                </>
                                            ) : (
                                                <input
                                                    type="text"
                                                    className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                                    placeholder="Công ty ABC"
                                                    value={formData.organization}
                                                    onChange={e => setFormData({...formData, organization: e.target.value})}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Chức vụ</label>
                                        <div className="mt-1 relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Briefcase className="h-5 w-5 text-gray-400" />
                                            </div>
                                            <input
                                                type="text"
                                                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border"
                                                placeholder="Giám đốc..."
                                                value={formData.position}
                                                onChange={e => setFormData({...formData, position: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                    <input 
                                        type="checkbox" 
                                        id="faceCheckIn" 
                                        checked={wantFaceCheckIn} 
                                        onChange={(e) => setWantFaceCheckIn(e.target.checked)}
                                        className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="faceCheckIn" className="text-sm text-gray-700 cursor-pointer select-none">
                                        <span className="font-semibold block text-indigo-900">Đăng ký khuôn mặt</span>
                                        <span className="text-xs text-gray-500">Cho phép check-in cực nhanh bằng camera tại sự kiện.</span>
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mt-4 disabled:opacity-50"
                                >
                                    {loading ? 'Đang xử lý...' : (wantFaceCheckIn ? 'Tiếp tục: Chụp ảnh' : 'Đăng ký & Nhận mã QR')}
                                </button>
                            </form>
                        </div>
                    )}
                    
                    {step === 'capture' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <p className="text-lg font-medium text-gray-900">
                                    Cập nhật dữ liệu khuôn mặt
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    Giúp check-in nhanh hơn tại sự kiện.
                                </p>
                            </div>
                            {loading ? (
                                <div className="text-center py-8 text-indigo-600 flex flex-col items-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                                    <span>Đang cập nhật...</span>
                                </div>
                            ) : (
                                <FaceCapture onCapture={handleFaceUpdate} />
                            )}
                            {!loading && (
                                <button
                                    onClick={() => setStep('success')}
                                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700 underline"
                                >
                                    Bỏ qua, quay lại màn hình mã QR
                                </button>
                            )}
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-4 py-4">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 animate-bounce">
                                <CheckCircle className="h-8 w-8 text-green-600" />
                            </div>
                            <h3 className="text-xl leading-6 font-bold text-gray-900">
                                Đăng ký thành công!
                            </h3>
                            <p className="text-gray-500">
                                Cảm ơn <strong>{formData.full_name}</strong> đã hoàn tất đăng ký.
                            </p>

                            {(selectedGroup?.zone_label) && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mx-4">
                                    <h4 className="text-blue-800 font-bold uppercase tracking-wider text-sm mb-1">Khu vực ngồi của bạn</h4>
                                    <div className="text-2xl font-bold text-blue-900">{selectedGroup.zone_label}</div>
                                </div>
                            )}
                            
                            <div className="bg-white border-2 border-dashed border-indigo-200 rounded-lg p-6 mt-4 flex flex-col items-center">
                                <p className="text-sm text-gray-500 mb-3">Mã Check-in dự phòng của bạn</p>
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${successCode}`} 
                                    alt="QR Code" 
                                    className="w-48 h-48"
                                />
                                <p className="mt-2 text-2xl font-mono font-bold text-indigo-600 tracking-wider">
                                     {successCode}
                                </p>
                                <button
                                    onClick={async () => {
                                        try {
                                            const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${successCode}`);
                                            const blob = await response.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.style.display = 'none';
                                            a.href = url;
                                            a.download = `QR_EVENT_${successCode}.png`;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                        } catch (e) {
                                            alert("Không thể tải ảnh. Vui lòng thử chụp màn hình.");
                                        }
                                    }}
                                    className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 underline font-medium"
                                >
                                    Tải ảnh QR về máy
                                </button>
                            </div>

                            <button
                                onClick={() => setStep('capture')}
                                className="w-full flex justify-center py-2 px-4 border border-indigo-600 rounded-md shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-indigo-50 mb-2"
                            >
                                Thêm dữ liệu khuôn mặt (Check-in nhanh)
                            </button>

                            <button
                                onClick={() => window.location.reload()}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                            >
                                Đăng ký người khác
                            </button>
                        </div>
                    )}
                </div>
                <div className="mt-4 text-center text-xs text-gray-400">
                    Powered by EventCheckIn
                </div>
            </div>
        </div>
    );
}
