# Màn hình 9-3 — Notice Create

> Màn hình mẫu, dùng để chạy thử quy trình tự động hoá.

## Lịch sử sửa đổi

| No | Ngày | Target | Người cập nhật | Nội dung sửa đổi |
| --- | --- | --- | --- | --- |
| 1.00 | 2026-09-30 | - | Demo | Tạo mới |

## Tổng quan

| Hạng mục | Nội dung |
| :--- | :--- |
| Screen ID | 9-3 |
| Tên màn hình | Notice Create |
| URL | /notices/new |
| Thiết bị | PC 1280 · Tablet 834 · Mobile 390 |

## Hạng mục màn hình

| No | Tên | Loại | Bắt buộc |
| --- | --- | --- | --- |
| 1 | Tiêu đề thông báo | text input | ✓ |
| 2 | Nội dung | textarea | ✓ |
| 3 | Nút "Đăng" | button | — |
| 4 | Nút "Huỷ" | button | — |

## Event

| ID | Sự kiện | Xử lý |
| --- | --- | --- |
| EVT_9-3_01 | Nhấn "Đăng" | Kiểm tra bắt buộc; hợp lệ thì lưu rồi về màn 9-1, thông báo mới nằm đầu danh sách |
| EVT_9-3_02 | Nhấn "Huỷ" | Về màn 9-1, không lưu |
