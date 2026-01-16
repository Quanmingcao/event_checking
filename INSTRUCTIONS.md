# Hướng dẫn chạy Face Recognition Server (Python Backend)

Hệ thống nhận diện khuôn mặt sử dụng **InsightFace (Python)** và đã được cấu hình **Proxy** để dễ dàng kết nối.

## 1. Môi trường

Dự án sử dụng môi trường ảo (`venv`) với **Python 3.11** tại thư mục `d:\eventcheckin\venv`.

## 2. Cách khởi động (3 Bước)

Anh cần mở **3 cửa sổ Terminal** riêng biệt và chạy lần lượt các lệnh sau:

### Terminal 1: Chạy Backend (Python)
```powershell
.\venv\Scripts\python.exe python_server/app.py
```
*Server chạy tại: `http://localhost:5000`*

### Terminal 2: Chạy Frontend (Web App)
```powershell
npm run dev
```
*Web App chạy tại: `http://localhost:5173`*
*(Lưu ý: Web App đã được cấu hình để tự động nói chuyện với Python qua "cầu nối" Proxy)*

### Terminal 3: Public ra Internet (Ngrok)
Chỉ cần public **một cổng duy nhất** là 5173:
```powershell
npx ngrok http 5173
```
*Copy đường dẫn `https://...ngrok-free.dev` để truy cập trên điện thoại.*

## 3. Quy trình sử dụng

1.  **Đăng ký lại khuôn mặt:**
    - Vào link ngrok trên điện thoại: `/register/<EVENT_ID>`
    - Chụp ảnh đăng ký.

2.  **Check-in:**
    - Vào link ngrok trên thiết bị soát vé: `/checkin/<EVENT_ID>`
    - Chọn chế độ "Khuôn mặt".

## 4. Troubleshooting

- **Lỗi CORS/Network Error:** Đảm bảo anh truy cập bằng link của cổng **5173**. Không được truy cập trực tiếp vào cổng 5000.
- **Lỗi Camera:** Cấp quyền Camera cho trình duyệt trên điện thoại.
