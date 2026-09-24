// Khai báo OpenAPI cho nhóm endpoint /notices.
// File mẫu — chỉ tồn tại để bot nhận diện ô "API docs". Không phải code chạy được.

export const noticePaths = {
  "/notices": {
    get: {
      summary: "Danh sách thông báo",
      parameters: [
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
} as const;
