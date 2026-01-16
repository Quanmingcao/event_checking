import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Home from './pages/Home';
import AdminEvent from './pages/AdminEvent';
import CheckIn from './pages/CheckIn';
import Monitor from './pages/Monitor';
import PublicFaceRegister from './pages/PublicFaceRegister';
import Login from './pages/Login';
import StaffLogin from './pages/StaffLogin';
import AdminUsers from './pages/AdminUsers';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/staff" element={<StaffLogin />} />
          <Route path="/checkin/:id" element={<CheckIn />} />
          <Route path="/face-checkin/:eventId" element={<PublicFaceRegister />} />
          <Route path="/monitor/:id" element={<Monitor />} />
          
          {/* Protected Routes (Admin) */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Home />} />
            <Route path="admin/events/:id" element={<AdminEvent />} />
            <Route path="admin/users" element={<AdminUsers />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
