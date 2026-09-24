# Màn hình 9-2 — Notice Detail

> Màn hình mẫu, dùng để chạy thử quy trình tự động hoá.

## Lịch sử sửa đổi

| No | Ngày | Target | Người cập nhật | Nội dung sửa đổi |
| --- | --- | --- | --- | --- |
| 1.00 | 2026-09-23 | - | Demo | Tạo mới |
| 1.01 | 2026-09-24 | - | Demo | Bổ sung nút quay lại danh sách |

## Tổng quan

| Hạng mục | Nội dung |
| :--- | :--- |
| Screen ID | 9-2 |
| Tên màn hình | Notice Detail |
| URL | /notices/{noticeId} |
| Thiết bị | PC 1280 · Tablet 834 · Mobile 390 |

## Hạng mục màn hình

| No | Tên | Loại | Bắt buộc |
| --- | --- | --- | --- |
| 1 | Tiêu đề thông báo | text | — |
| 2 | Ngày đăng | text | — |
| 3 | Nội dung | rich text | — |
| 4 | Nút "Quay lại" | button | — |

## Event

| ID | Sự kiện | Xử lý |
| --- | --- | --- |
| EVT_9-2_01 | Nhấn "Quay lại" | Về màn 9-1, giữ nguyên bộ lọc đang áp |
