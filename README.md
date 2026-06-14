# Momentbox - Landing Page Thiết Kế Standee 3D

Momentbox là trang Landing Page (trang đơn) giới thiệu dịch vụ thiết kế và sản xuất hộp quà standee 3D độc bản. Trang web tích hợp trợ lý tư vấn ý tưởng bằng trí tuệ nhân tạo (AI Assistant) để kết nối và chăm sóc khách hàng.

---

## 🌟 Các tính năng chính

1. **Tư Vấn Ý Tưởng Bằng AI**: Chatbot tự động tư vấn các gói sản phẩm, gợi ý concept và kịch bản lời chúc theo dịp tặng quà (sử dụng API Google Gemini).
2. **Phím Tắt Gửi Chat**: Nhấn **Enter** để gửi tin nhắn AI và **Shift + Enter** để xuống dòng nhanh chóng.
3. **Nút Nổi Tiện Lợi**: Nút "Tư vấn AI" và "Chat Zalo" nổi ở góc màn hình giúp cuộn nhanh và liên hệ trực tiếp.
4. **Logo Nghiêng 3D & Favicon**: Logo thương hiệu tự động xoay nghiêng nhẹ khi di chuột và tích hợp icon nhỏ trên tab trình duyệt.

---

## 🛠️ Công nghệ sử dụng

* **Frontend tĩnh**: HTML5, Vanilla CSS3 (giao diện responsive cho máy tính và điện thoại), JavaScript (ES6+).
* **Hàm kết nối API (Netlify Function)**: File hàm nhỏ `chat.js` đóng vai trò làm cổng trung gian bảo mật để gọi tới Google Gemini API mà không bị lộ khóa API Key ra ngoài trình duyệt.
* **Hosting**: Netlify (kết nối trực tiếp với kho lưu trữ GitHub để tự động cập nhật khi sửa code).

---

## 💻 Hướng dẫn chạy và cập nhật web

### 1. Chạy thử nghiệm trên máy tính (Local)
* Đảm bảo đã cài đặt Node.js.
* Mở Terminal tại thư mục code và chạy lệnh cài đặt thư viện: `npm install`
* Tạo file `.env` chứa khóa AI: `GEMINI_API_KEY=mã_khóa_của_bạn`
* Chạy server local bằng Netlify CLI: `npx netlify dev` (mở tại `http://localhost:8888`)

### 2. Đưa lên online (Netlify)
* Tải toàn bộ thư mục code lên GitHub (ngoại trừ thư mục `node_modules` và file `.env`).
* Liên kết dự án Netlify với kho lưu trữ GitHub đó.
* Thêm khóa `GEMINI_API_KEY` vào phần cấu hình biến môi trường (`Environment variables`) trên trang quản trị Netlify và Deploy lại là xong.
