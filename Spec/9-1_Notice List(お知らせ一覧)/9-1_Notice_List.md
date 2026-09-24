# Màn hình 9-1 — Notice List

> Màn hình mẫu, dùng để chạy thử quy trình tự động hoá. Không phải tài liệu của
> sản phẩm nào.

## Lịch sử sửa đổi

| No | Ngày | Target | Người cập nhật | Nội dung sửa đổi |
| --- | --- | --- | --- | --- |
| 1.00 | 2026-09-20 | - | Demo | Tạo mới |
| 1.01 | 2026-09-22 | - | Demo | Bổ sung bộ lọc theo ngày |

## Tổng quan

| Hạng mục | Nội dung |
| :--- | :--- |
| Screen ID | 9-1 |
| Tên màn hình | Notice List |
| URL | /notices |
| Thiết bị | PC 1280 · Tablet 834 · Mobile 390 |

## Hạng mục màn hình

| No | Tên | Loại | Bắt buộc |
| --- | --- | --- | --- |
| 1 | Ô tìm kiếm từ khoá | text | không |
| 2 | Bộ lọc khoảng ngày | date range | không |
| 3 | Bảng danh sách | table | — |
| 4 | Phân trang | pagination | — |

## Event

| ID | Sự kiện | Xử lý |
| --- | --- | --- |
| EVT_9-1_01 | Nhấn "Tìm kiếm" | Lọc danh sách theo từ khoá và khoảng ngày |
| EVT_9-1_02 | Nhấn một dòng | Mở màn chi tiết thông báo |
