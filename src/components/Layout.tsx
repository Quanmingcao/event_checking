import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Calendar, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { signOut, user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                 <Link to="/" className="flex items-center">
                    <Calendar className="h-8 w-8 text-indigo-600" />
                    <span className="ml-2 text-xl font-bold text-gray-900">Event Check-in</span>
                 </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link to="/" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Danh sách sự kiện
                </Link>
                {/* TODO: Check role super_admin clearly */}
                {profile?.role === 'super_admin' && (
                  <Link to="/admin/users" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    Quản lý tài khoản
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center">
                {user && (
                    <div className="hidden md:flex items-center text-sm text-gray-600 mr-6 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                        <UserIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <span className="font-medium text-gray-700 truncate max-w-[150px]">{user.email}</span>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="flex items-center text-gray-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    title="Đăng xuất"
                >
                    <LogOut className="h-5 w-5 mr-1" />
                    <span className="hidden sm:inline">Check Out / Đăng xuất</span>
                </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
