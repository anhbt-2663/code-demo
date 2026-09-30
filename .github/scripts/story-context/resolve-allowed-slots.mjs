// Loại issue quyết định ô nào ĐƯỢC PHÉP ghi. File PR đụng quyết định ghi GÌ.
//
// VÌ SAO CẦN CỔNG NÀY — file một mình là chưa đủ:
//   Một PR dev task sửa code, tiện tay đụng kèm một dòng trong spec, sẽ làm story
//   cập nhật dù việc đó không phải việc tài liệu. Nội dung ghi ra vẫn đúng, nhưng
//   nguồn kích hoạt thì sai — và story trở thành thứ đổi vì lý do không ai hiểu.
//
// HAI CỔNG NỐI TIẾP:
//   nhãn/tiêu đề issue  →  ô nào được phép     (file này)
//   file PR đụng        →  ô đó điền gì        (classify-changed-files.mjs)
//
// CHỈ TICKET [DOCUMENTATION] ĐƯỢC GHI — quyết định của dự án:
//   Tài liệu của màn (spec JP/VI + design) do ticket DOCUMENTATION sở hữu. Các ticket
//   khác (FE/BE, UI DESIGN, Doc API) không ghi vào story. Khi cần tự động điền ô
//   API docs thì làm thành một hạng mục riêng, không nhồi vào cổng này.
//
// NHÃN TRƯỚC, TIÊU ĐỀ SAU:
//   Nhãn do template issue tự gắn, không ai gõ tay nên không sai chính tả. Nhưng
//   nhãn VẪN CÓ THỂ THIẾU — đã gặp issue tạo ngoài template, không mang nhãn nào.
//   Nên tiêu đề là đường lùi, không phải nguồn chính.

const SPEC_SLOTS = ["spec_jp", "spec_vi", "design"];

const isDocumentation = (labels, title) =>
  labels.includes("type:documentation") || /^\s*\[DOCUMENTATION\]/i.test(title);

/**
 * @param {{title?:string, labels?:{nodes?:{name:string}[]}}} issue
 * @returns {{allowed: string[], reason: string}}
 *   `allowed` rỗng ⇒ issue này không có quyền ghi ô nào, bot nên bỏ qua.
 *   `reason` để log — bỏ qua im lặng là cách hỏng mà không ai biết.
 */
export function resolveAllowedSlots(issue) {
  const labels = (issue?.labels?.nodes ?? []).map((l) => l.name);
  const title = issue?.title ?? "";

  if (isDocumentation(labels, title)) {
    return { allowed: [...SPEC_SLOTS], reason: "ticket DOCUMENTATION" };
  }

  const seen = labels.length ? labels.join(", ") : "(không có nhãn nào)";
  return { allowed: [], reason: `không phải ticket DOCUMENTATION — nhãn: ${seen}` };
}

/** Bỏ khỏi kết quả phân loại những ô mà loại issue này không được phép ghi. */
export function filterSlotsByPermission(slots, allowed) {
  const out = {};
  for (const [key, value] of Object.entries(slots)) {
    if (allowed.includes(key)) out[key] = value;
  }
  return out;
}
