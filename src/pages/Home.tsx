import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types';
import { Link } from 'react-router-dom';
import { Calendar, QrCode, Monitor, Settings, Plus, MapPin, Clock, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const { user, profile } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
      name: '',
      location: '',
      start_time: '',
      end_time: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
        fetchEvents();
    }

    // Enable Realtime updates
    const channel = supabase
    .channel('public:events')
    .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        (payload) => {
           const newEvent = payload.new as Event;
           // Only add to list if Super Admin OR owner matches
           if (profile?.role === 'super_admin' || newEvent.owner_id === user?.id) {
               setEvents((prev) => [newEvent, ...prev]);
           }
        }
    )
    .subscribe();

    return () => {
         supabase.removeChannel(channel);
    };
  }, [user, profile]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      
      let query = supabase.from('events').select('*').order('created_at', { ascending: false });

      // FILTERING LOGIC
      if (profile && profile.role !== 'super_admin') {
          query = query.eq('owner_id', user?.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name) return;
      setCreating(true);

      try {
          const code = Math.random().toString(36).substring(7).toUpperCase();
          const { error } = await supabase.from('events').insert([
              { 
                  name: formData.name,
                  location: formData.location,
                  start_time: formData.start_time || null,
                  end_time: formData.end_time || null,
                  event_code: code,
                  created_at: new Date().toISOString(),
                  owner_id: user?.id // IMPORTANT: Assign owner
              }
          ]);
          if (error) throw error;
          
          setFormData({ name: '', location: '', start_time: '', end_time: '' });
          setShowModal(false);
          // fetchEvents is usually handled by realtime, but we can also manually refresh to be safe
          fetchEvents();
      } catch (err: any) {
          alert('Lỗi khi tạo sự kiện: ' + err.message);
      } finally {
          setCreating(false);
      }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách sự kiện</h1>
        <button
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          onClick={() => setShowModal(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Tạo sự kiện mới
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div key={event.id} className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                 <div className="flex-1 overflow-hidden">
                    <h3 className="text-lg font-bold text-gray-900 truncate" title={event.name}>
                        {event.name}
                    </h3>
                    <p className="text-sm text-gray-500">Mã: <span className="font-mono bg-gray-100 px-1 rounded">{event.event_code}</span></p>
                 </div>
                 <div className="ml-2 flex-shrink-0 bg-indigo-100 rounded-full p-2">
                    <Calendar className="h-5 w-5 text-indigo-600" />
                 </div>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                {event.location && (
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}
                {event.start_time && (
                  <div className="flex items-center">
                     <Clock className="h-4 w-4 mr-2 text-gray-400" />
                     {new Date(event.start_time).toLocaleString('vi-VN')}
                  </div>
                )}
              </div>

              <div className="mt-6 border-t border-gray-100 pt-4 grid grid-cols-3 gap-2">
                 <Link
                   to={`/admin/events/${event.id}`}
                   className="flex flex-col items-center justify-center p-2 rounded hover:bg-gray-50 text-gray-600"
                 >
                   <Settings className="h-5 w-5 mb-1" />
                   <span className="text-xs font-medium">Quản lý</span>
                 </Link>
                 <Link
                   to={`/checkin/${event.id}`}
                   className="flex flex-col items-center justify-center p-2 rounded hover:bg-gray-50 text-indigo-600"
                 >
                   <QrCode className="h-5 w-5 mb-1" />
                   <span className="text-xs font-medium">Check-in</span>
                 </Link>
                 <Link
                   to={`/monitor/${event.id}`}
                   className="flex flex-col items-center justify-center p-2 rounded hover:bg-gray-50 text-green-600"
                 >
                   <Monitor className="h-5 w-5 mb-1" />
                   <span className="text-xs font-medium">Màn hình</span>
                 </Link>
              </div>
            </div>
          </div>
        ))}
        {events.length === 0 && (
            <div className="col-span-full text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Bạn chưa có sự kiện nào</h3>
                <p className="mt-1 text-sm text-gray-500">Bắt đầu bằng cách tạo một sự kiện mới.</p>
                <div className="mt-6">
                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                        Tạo sự kiện
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showModal && (
          <div className="fixed inset-0 z-10 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
              <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowModal(false)}></div>
                  <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                  
                  <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                      <div className="absolute top-0 right-0 pt-4 pr-4">
                          <button
                              type="button"
                              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                              onClick={() => setShowModal(false)}
                          >
                              <span className="sr-only">Close</span>
                              <X className="h-6 w-6" aria-hidden="true" />
                          </button>
                      </div>
                      <div className="sm:flex sm:items-start">
                          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                              <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                  Tạo sự kiện mới
                              </h3>
                              <div className="mt-4">
                                  <form onSubmit={handleCreateEvent} className="space-y-4">
                                      <div>
                                          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Tên sự kiện <span className="text-red-500">*</span></label>
                                          <input
                                              type="text"
                                              name="name"
                                              id="name"
                                              required
                                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                              value={formData.name}
                                              onChange={e => setFormData({...formData, name: e.target.value})}
                                              placeholder="Ví dụ: Gala Dinner 2024"
                                          />
                                      </div>
                                      <div>
                                          <label htmlFor="location" className="block text-sm font-medium text-gray-700">Địa điểm</label>
                                          <input
                                              type="text"
                                              name="location"
                                              id="location"
                                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                              value={formData.location}
                                              onChange={e => setFormData({...formData, location: e.target.value})}
                                              placeholder="Ví dụ: Tầng 3, Khách sạn Melia"
                                          />
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                          <div>
                                              <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">Thời gian bắt đầu</label>
                                              <input
                                                  type="datetime-local"
                                                  name="start_time"
                                                  id="start_time"
                                                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                                  value={formData.start_time}
                                                  onChange={e => setFormData({...formData, start_time: e.target.value})}
                                              />
                                          </div>
                                          <div>
                                              <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">Thời gian kết thúc</label>
                                              <input
                                                  type="datetime-local"
                                                  name="end_time"
                                                  id="end_time"
                                                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                                  value={formData.end_time}
                                                  onChange={e => setFormData({...formData, end_time: e.target.value})}
                                              />
                                          </div>
                                      </div>
                                      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                                          <button
                                              type="submit"
                                              disabled={creating}
                                              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                          >
                                              {creating ? 'Đang tạo...' : 'Tạo sự kiện'}
                                          </button>
                                          <button
                                              type="button"
                                              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                                              onClick={() => setShowModal(false)}
                                          >
                                              Hủy
                                          </button>
                                      </div>
                                  </form>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}