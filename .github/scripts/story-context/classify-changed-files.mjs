// Phân loại file mà PR đụng vào các ô của `References & Dependencies`,
// rồi LỌC theo screen ID của story.
//
// VÌ SAO PHẢI LỌC:
//   Một PR spec thường đụng nhiều màn cùng lúc. Đã gặp: một PR spec tiêu đề chỉ nói về một màn
//   nhưng đụng file của bốn màn cộng vài tài liệu chung. Ghi mù nghĩa là story
//   màn A mọc link spec của màn B — nhiễu, người đọc không biết cái nào của mình.

/** Tài liệu dùng chung cho MỌI màn — không thuộc story nào, không bao giờ ghi vào ô. */
const SHARED_DOC_PREFIXES = [
  "Spec/0-1_",
  "Spec/0-2_",
  "Spec/0-3_",
  "Spec/Message List/",
  "Spec/Screen list/",
  "Design/Documents/",
];

const isSharedDoc = (p) => SHARED_DOC_PREFIXES.some((pre) => p.startsWith(pre));

/** Escape cho screen ID — `1-8+2-9` có dấu `+`, là ký tự đặc biệt của regex. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Đường dẫn có thuộc màn này không?
 *
 * Tên thư mục/file mở đầu bằng mã màn rồi tới `_`, khoảng trắng, hoặc `(`:
 *   Spec/3-1_Screen Name(EN)/spec.md          → dir  "3-1_..."
 *   Spec/1-1_Screen Name(Login).md            → file "1-1_..."  (file phẳng)
 *   Design/P1_Group/3-1 Screen Name.dc.html   → file "3-1 ..."
 *   Design/P4_Group/2-4_Screen Name/html/...  → dir  "2-4_..."
 *
 * Ràng buộc ký tự phía sau là CỐ Ý: không có nó thì `2-1` khớp luôn `2-17`.
 */
function belongsToScreen(path, screenId) {
  const re = new RegExp(`(^|/)${escapeRe(screenId)}[_ (]`);
  return re.test(path);
}

/**
 * @param {string[]} files đường dẫn file PR đụng (relative repo root)
 * @param {string|null} screenId null ⇒ story không thuộc màn nào ⇒ không ghi ô spec/design
 * @returns {{slots: Record<string, string[]>, ambiguous: Record<string, string[]>}}
 *   `slots`    — ô đã chắc chắn (đúng 1 ứng viên, hoặc cặp JP+VI hợp lệ)
 *   `ambiguous` — ô còn 2+ ứng viên, cần người tick checkbox
 */
export function classifyChangedFiles(files, screenId) {
  const specs = [];
  const designs = [];
  const apiDocs = [];

  for (const p of files) {
    if (isSharedDoc(p)) continue;

    if (p.startsWith("Spec/") && p.endsWith(".md")) {
      if (screenId && belongsToScreen(p, screenId)) specs.push(p);
      continue;
    }
    if (p.startsWith("Design/") && p.endsWith(".dc.html")) {
      if (screenId && belongsToScreen(p, screenId)) designs.push(p);
      continue;
    }
    if (/^develop\/backend\/lib\/openapi\/paths-[\w-]+\.ts$/.test(p)) {
      // API docs không mang mã màn trong đường dẫn ⇒ không lọc được theo screenId.
      apiDocs.push(p);
    }
  }

  const slots = {};
  const ambiguous = {};

  // Spec tách hai bản: bản `_VI` là bản dịch, bản còn lại là bản JP (bản chính thức).
  const specVi = specs.filter((p) => p.includes("_VI."));
  const specJp = specs.filter((p) => !p.includes("_VI."));

  assign(slots, ambiguous, "spec_jp", specJp);
  assign(slots, ambiguous, "spec_vi", specVi);
  assign(slots, ambiguous, "design", designs);
  assign(slots, ambiguous, "api_docs", apiDocs);

  return { slots, ambiguous };
}

/** 1 ứng viên ⇒ chắc chắn · 2+ ⇒ hỏi · 0 ⇒ im lặng bỏ qua (ô trống là thông tin ĐÚNG). */
function assign(slots, ambiguous, key, candidates) {
  if (candidates.length === 1) slots[key] = candidates;
  else if (candidates.length > 1) ambiguous[key] = candidates;
}
