export interface ExpenseItem {
  id: string;
  date: string;          // Ngày ghi nhận chi phí (YYYY-MM-DD)
  category: string;      // Khoản mục chi phí (Xăng, Dầu, Nhân công,...)
  amount: number;        // Số tiền (VNĐ)
  note: string;          // Ghi chú giải trình
  imageUrl?: string;     // Link ảnh chứng từ/hóa đơn trên Google Drive (nếu có)
}