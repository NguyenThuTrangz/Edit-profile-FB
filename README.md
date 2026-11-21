# Edit Profile FB

Extension Chrome (Manifest V3) để **chuẩn hoá nick Facebook mới** theo bài mẫu của nick cũ, không cần Claude hay agent:

1. **Lấy bài nguồn**: trên trang nick cũ (Emily, Gracie, Cathie, Lily…), quét bài, lấy **caption đầy đủ** (giữ xuống dòng, emoji) và **toàn bộ ảnh gốc** đúng thứ tự (đi qua trình xem ảnh, lấy bản độ phân giải cao, kể cả ảnh ẩn sau ô “+N”).
2. **Làm sạch caption** tự động:
   - Mọi số WhatsApp và link `wa.me` đổi sang số chung (mặc định `+84 855 555 490`).
   - “Contact Gracie/Cathie…” đổi thành tên nick mới.
   - Link Facebook cá nhân đổi thành fanpage K-Embroidery Factory.
   - Bỏ dòng Email và dòng Instagram cá nhân. Instagram công ty `k_embroidery…` được giữ.
   - Cảnh báo khi còn sót tên nick cũ, số lạ hoặc email.
3. **Tìm bài cần thay**: đọc **Nhật ký hoạt động → Bài viết của bạn** của nick mới, đánh dấu bài “cần thay” (tuyển dụng, không phải smock) và “chuẩn”, nên không sót bài.
4. **Thay bài tại chỗ**: mở bài, extension mở hộp *Chỉnh sửa bài viết*, gỡ ảnh cũ, thay chữ, tải ảnh mới lên. Sau đó extension **dừng ở nút Lưu (viền cam)** để bạn kiểm tra rồi tự bấm Lưu. Ngày đăng cũ được giữ nguyên.
5. **Tiểu sử**: điền tiểu sử (≤ 101 ký tự) theo mẫu, kèm mẫu phần Giới thiệu (biệt danh, công việc, web) để chép tay.

Mỗi gói bài ghi lại đã dùng cho nick nào, tránh dùng 1 caption cho 2 nick.

## Cài đặt (mỗi profile Chrome SM cài 1 lần)

1. Tải repo về (Code → Download ZIP, giải nén) hoặc `git clone`. Để thư mục **cố định**: ID extension và dữ liệu gói bài gắn với đường dẫn thư mục.
2. Mở `chrome://extensions`, bật **Developer mode**.
3. Bấm **Load unpacked**, chọn thư mục repo.
4. Ghim biểu tượng **SM** trên thanh công cụ. Bấm vào biểu tượng để mở bảng bên phải.
5. Vào tab **Cài đặt**, điền **tên smock của nick** (vd `Olivia`) rồi bấm Lưu. Đổi số WhatsApp phải hỏi người phụ trách trước.

Cập nhật bản mới: chép đè file vào đúng thư mục cũ → `chrome://extensions` → nút ↻ của extension.

## Quy trình thay bài cũ cho 1 nick mới

1. **Bài nguồn**: ở tab đang xem, mở trang nick cũ cùng persona. Mở bảng → **1. Bài nguồn** → *Quét bài trên trang này* → *Lấy bài này* cho từng bài muốn dùng. Mỗi bài thay cần 1 gói.
2. **Gói bài**: đọc lại chữ đã làm sạch, sửa trực tiếp nếu cần. Phải xử lý hết dòng ⚠ cảnh báo.
3. **Thay bài**: mở trang cá nhân **nick mới** → **3. Thay bài** → *Mở Nhật ký bài viết của nick này* → đợi tải → *Quét danh sách bài*.
4. Với từng dòng **cần thay**:
   1. Bấm **Mở**.
   2. Chọn gói, bấm **Thay bài đang mở bằng gói đã chọn**.
   3. Kiểm tra chữ và ảnh trong hộp sửa, rồi bấm **Lưu**. Gói được đánh dấu đã dùng.
5. Quét lại nhật ký cho tới khi không còn dòng “cần thay” công khai. Mục “Chỉ mình tôi” là ảnh riêng tư, không hiện ra ngoài.

## Đã thử trên Facebook thật (22/11/2026, giao diện tiếng Việt)

| Bước | Kết quả |
|---|---|
| Quét bài nick nguồn (Emily) | 12 bài, đúng thứ tự |
| Lấy bài #2 | Caption 21 dòng giữ emoji; **4/4 ảnh gốc** 1254×1254 / 1200×1200, khớp lần làm tay; trình xem ảnh tự đóng |
| Nhật ký hoạt động (SM08) | 8 mục, đúng ngày / giờ / chế độ hiển thị; phân biệt bài và cập nhật hồ sơ |
| Thay bài (chạy thử, không lưu) | Mở menu → Chỉnh sửa bài viết, gỡ ảnh cũ, thay 1134/1134 ký tự, tải ảnh mới, dừng ở Lưu (viền cam); bấm Bỏ → bài gốc nguyên vẹn |
| Tiểu sử (chạy thử, không lưu) | Điền đúng ô, tìm đúng nút “Lưu phần tiểu sử trên trang cá nhân”; huỷ → tiểu sử cũ nguyên vẹn |

Bài học: ô chữ của Facebook (Lexical) bỏ qua `execCommand('delete')`. Để xoá chữ cũ, chọn hết, chờ ~300 ms rồi gửi sự kiện `beforeinput` với `deleteContentBackward`. Cách dán chữ bằng sự kiện `paste` thì giữ đúng xuống dòng và emoji.

## Giới hạn đã biết

- **Nhạc gắn sẵn**: Facebook không cho gỡ nhạc gắn trong bài khi sửa, nên tên bài nhạc cũ vẫn hiện ở đầu bài.
- **Giao diện thay đổi**: extension tìm nút theo nhãn tiếng Việt/Anh (“Hành động đối với bài viết này”, “Chỉnh sửa bài viết”, “Gỡ file đính kèm…”, “Lưu”…). Facebook đổi giao diện thì phải cập nhật `fb-content.js`.
- **Giới thiệu kiểu cũ** (vd SM08): mục Công việc bắt buộc chọn trang có sẵn, nên phần Giới thiệu chỉ có mẫu để chép tay.
- **Không thu nhỏ cửa sổ** Chrome khi đang chạy: Chrome ngừng vẽ trang, ảnh và nút không phản hồi.
- **Facebook cảnh báo** (xác minh danh tính, tạm chặn): extension dừng ngay, không thao tác tiếp.

## Cấu trúc

| Tệp | Vai trò |
|---|---|
| `manifest.json` | Khai báo MV3, side panel, content script cho facebook.com |
| `background.js` | Mở side panel; tải ảnh gốc từ `*.fbcdn.net` (trang Facebook bị CORS chặn) |
| `fb-content.js` | Chạy trong tab Facebook: quét bài, lấy ảnh qua trình xem, đọc nhật ký, sửa bài, sửa tiểu sử |
| `sidepanel.*` | Giao diện tiếng Việt, lưu cài đặt + gói bài trong `chrome.storage.local` (riêng từng profile) |
| `rules.js` | Quy tắc làm sạch caption, nhận diện bài cần thay |
| `tests/rules.test.mjs` | Test quy tắc: `node --test tests/rules.test.mjs` |

Không dùng API riêng, token hay cookie của Facebook; không gửi dữ liệu ra ngoài máy. Tham khảo cách dán chữ / tải ảnh / bấm nút từ dự án [Facebook-Automation](https://github.com/LePhuongThao038/Facebook-Automation) (FB Desk).

Phần tiếp theo có thể làm: biệt danh và trang Giới thiệu tự động, nhập gói bài từ kho content (Google Sheet).
