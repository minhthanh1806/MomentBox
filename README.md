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



---

## 🎨 Luật Prompt cho AI tạo ảnh Standee (Momentbox)

> Dùng cho Midjourney / DALL·E / Gemini Imagen / Stable Diffusion. Mục tiêu: ra ảnh **standee 3D dạng hộp quà**, đồng bộ phong cách, dùng được cho web và mockup.

### 1. Quy tắc bắt buộc (AI phải tuân thủ)

1. **Chủ thể duy nhất**: chỉ 1 standee mỗi ảnh, đặt chính giữa, nhìn thẳng hoặc nghiêng nhẹ 15–20°.
2. **Standee phải là vật thể cắt rời (die-cut)**: nhân vật/chibi bằng giấy cứng, có viền trắng dày 3–5 mm quanh hình, có **chân đế gấp** phía sau.
3. **Đặt trong hộp quà**: standee đứng trong hộp trong suốt/hộp giấy mở nắp, có các lớp nền 3D (layered diorama) tạo chiều sâu.
4. **Nền sạch**: nền trắng/kem hoặc gradient pastel, không có chi tiết thừa, không chữ nền.
5. **Ánh sáng**: softbox mềm, bóng đổ nhẹ dưới chân đế, không cháy sáng.
6. **Phong cách**: **chỉ vẽ chibi khi khách yêu cầu chibi**; nếu không thì vẽ bình thường, tỉ lệ cơ thể tự nhiên, bám sát chủ thể. Màu ấm hài hòa, nét sạch, chất liệu giấy/in offset có độ mờ nhẹ (matte).
7. **Không**: chữ sai chính tả, logo lạ, watermark, thêm tay/chân dư, mặt méo, nhiều nhân vật trùng lặp, nền rối.
8. **Tỉ lệ**: 1:1 (vuông) cho sản phẩm; 4:5 cho banner dọc. Độ phân giải tối thiểu 2048 px.

### 2. Cấu trúc prompt chuẩn

```
[Chủ thể + dịp tặng], [phong cách], [chất liệu & kết cấu], [bố cục hộp quà],
[bảng màu], [ánh sáng], [nền], [góc máy], [chất lượng]
```

### 3. Prompt mẫu

**Mẫu chung (copy & thay phần trong ngoặc vuông):**

```
A cute chibi paper standee of [mô tả nhân vật: cặp đôi cưới / bé gái tốt nghiệp / ...],
die-cut with a thick white border and a folded stand base at the back,
standing inside an open gift box with layered 3D paper diorama, [chủ đề: hoa, trái tim, ...],
matte printed cardboard texture, pastel [màu chủ đạo] color palette,
soft studio lighting with a gentle shadow, clean cream background,
front view slightly angled, product photography, ultra detailed, sharp focus, 1:1
```

**Negative prompt (nếu AI hỗ trợ):**

```
text, watermark, logo, extra limbs, deformed face, blurry, low quality,
multiple standees, messy background, cropped, overexposed, realistic human photo
```

### 4. Prompt theo dịp

| Dịp | Chủ thể | Chi tiết bổ sung |
|---|---|---|
| Đám cưới | Cô dâu chú rể chibi, váy trắng, vest | cổng hoa, bóng bay, trái tim, màu trắng–hồng phấn |
| Tình yêu / Valentine | Cặp đôi ôm nhau | hoa hồng, thư tình, màu đỏ–hồng |
| Sinh nhật | Nhân vật cầm bánh kem | nến, pháo giấy, màu vàng–xanh pastel |
| Tốt nghiệp | Chibi áo cử nhân, mũ, bằng | sách, huy hiệu trường, màu xanh navy–vàng |
| Kỷ niệm / Gia đình | Cả nhà chibi | khung ảnh, ngôi nhà nhỏ, màu be ấm |

### 5. Quy trình làm việc

1. Lấy ảnh khách gửi → mô tả đặc điểm chính (tóc, trang phục, màu sắc, phụ kiện).
2. Điền vào **mẫu chung** + thêm dòng của dịp tương ứng.
3. Sinh 4 biến thể, chọn 1 ảnh đẹp nhất.
4. Kiểm tra theo checklist bên dưới, sinh lại nếu lỗi.

### 6. Checklist kiểm tra ảnh

- [ ] Chỉ có 1 standee, nằm chính giữa
- [ ] Viền trắng quanh hình, có chân đế
- [ ] Mặt và tay chân không méo, không dư
- [ ] Không có chữ lạ/watermark
- [ ] Màu pastel, đồng bộ với các ảnh standee khác trong `images/`
- [ ] Nền sạch, ánh sáng mềm

### 7. Lưu file

* Đặt tên: `standee-XX.png` (XX là số thứ tự) trong thư mục `images/`.
* Cập nhật đường dẫn ảnh trong `index.html` nếu thêm hoặc thay ảnh.

### 8. Luật khi khách nhắc tên nhân vật (vd: Leon Kennedy)

1. **Tra cứu trước, vẽ sau**: AI phải xác định nhân vật là ai (game/phim/anime), rồi mô tả ngoại hình đặc trưng (tóc, trang phục, màu sắc, phụ kiện) trước khi tạo ảnh.
2. Tên mơ hồ thì chọn nhân vật nổi tiếng nhất; có nhiều lựa chọn thì ghi rõ đã chọn bản nào.
3. Chỉ chuyển thành bản **chibi** khi khách yêu cầu chibi; còn lại vẽ bình thường (tỉ lệ cơ thể tự nhiên), đúng luật standee ở mục 1.
4. Người thật (nghệ sĩ, người quen): không vẽ giống khuôn mặt, chỉ vẽ phong cách/trang phục dạng hoạt hình.
5. Không nhận diện được thì dùng nguyên mô tả của khách.
6. Lưu ý bản quyền: nhân vật có bản quyền chỉ nên dùng làm quà cá nhân, không bán đại trà khi chưa xin phép.
7. Chức năng này cần GEMINI_API_KEY (dùng model chữ có tra cứu web); không có key thì AI dùng nguyên mô tả của khách.



### 9. Luật khi khách tải ảnh lên (nút đính kèm trong khung chat)

1. Ảnh được thu nhỏ tối đa 1024px ngay trên trình duyệt trước khi gửi.
2. AI nhìn ảnh để mô tả đúng số người, tóc, kính, trang phục, màu sắc rồi vẽ standee giống người trong ảnh (quà cá nhân của khách).
3. Không gọi tên người trong ảnh; người nổi tiếng nêu tên thì không vẽ giống khuôn mặt.
4. Chỉ chibi khi khách ghi rõ chibi, còn lại vẽ bình thường.
5. Cần `GEMINI_API_KEY` để AI nhìn ảnh; ảnh khách chỉ gửi qua server để tạo ảnh, không lưu lại.
