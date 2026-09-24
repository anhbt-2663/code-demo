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
// NHÃN TRƯỚC, TIÊU ĐỀ SAU:
//   Nhãn do template issue tự gắn, không ai gõ tay nên không sai chính tả. Nhưng
//   nhãn VẪN CÓ THỂ THIẾU — đã gặp issue tạo ngoài template, không mang nhãn nào.
//   Nên tiêu đề là đường lùi, không phải nguồn chính.

const SPEC_SLOTS = ["spec_jp", "spec_vi", "design"];

/** Ticket tài liệu: nguồn của spec JP/VI và design. */
const isDocumentation = (labels, title) =>
  labels.includes("type:documentation") || /^\s*\[DOCUMENTATION\]/i.test(title);

/** Ticket thiết kế UI: chỉ cấp quyền cho ô design. */
const isUiDesign = (labels, title) =>
  labels.includes("type:uidesign") || /^\s*\[UI\s*DESIGN\]/i.test(title);

/**
 * Ticket khai báo API.
 *
 * Nhãn KHÔNG phân biệt được: `[BE TASK] Doc API …` và `[BE TASK] Implement API …`
 * mang đúng cùng bộ nhãn (`type:devtask` + `team:backend`). Khác biệt duy nhất
 * nằm ở tiêu đề, nên ở đây buộc phải dò chữ — và đó là chỗ yếu đã biết:
 * ai đổi cách đặt tên task thì ô API docs im lặng ngừng được điền.
 * Muốn chắc thì thêm một nhãn riêng (ví dụ `scope:apidocs`) rồi ưu tiên nó.
 */
const isApiDocs = (labels, title) =>
  labels.includes("scope:apidocs") || /\bdoc(?:s|umentation)?\s+api\b/i.test(title);

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
  if (isApiDocs(labels, title)) {
    return { allowed: ["api_docs"], reason: "ticket khai báo API" };
  }
  if (isUiDesign(labels, title)) {
    return { allowed: ["design"], reason: "ticket UI DESIGN" };
  }

  const seen = labels.length ? labels.join(", ") : "(không có nhãn nào)";
  return { allowed: [], reason: `không phải ticket tài liệu — nhãn: ${seen}` };
}

/** Bỏ khỏi kết quả phân loại những ô mà loại issue này không được phép ghi. */
export function filterSlotsByPermission(slots, allowed) {
  const out = {};
  for (const [key, value] of Object.entries(slots)) {
    if (allowed.includes(key)) out[key] = value;
  }
  return out;
}
