import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useUserRole } from './useUserRole.ts';

interface ProtectedRouteProps {
  allowedRoles?: string[]; // Danh sách các role được phép truy cập (ví dụ: ['admin', 'accountant'])
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { role, loading, isAuthenticated } = useUserRole();

  // 1. Khi đang tải thông tin phân quyền từ Supabase
  if (loading) {
    return <div className="p-4 text-center">Đang kiểm tra quyền truy cập...</div>;
  }

  // 2. Nếu chưa đăng nhập -> Chuyển hướng ngay về trang Đăng nhập
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 3. Nếu đã đăng nhập nhưng Role không nằm trong danh sách được phép -> Chuyển về trang Cảnh báo hoặc Dashboard
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  // 4. Hợp lệ -> Cho phép hiển thị nội dung bên trong
  return <Outlet />;
};