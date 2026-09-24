// Khai báo OpenAPI cho endpoint chi tiết thông báo. File mẫu.
export const noticeDetailPaths = {
  "/notices/{noticeId}": {
    get: {
      summary: "Chi tiết thông báo",
      parameters: [{ name: "noticeId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Không tìm thấy" } },
    },
  },
} as const;
