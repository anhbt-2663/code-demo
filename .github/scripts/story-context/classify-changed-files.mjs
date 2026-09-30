// Phân loại file mà PR đụng vào các ô của `References & Dependencies`,
// rồi LỌC theo screen ID của story.
//
// VÌ SAO PHẢI LỌC:
//   Một PR spec thường đụng nhiều màn cùng lúc. Ca thật: PR #213 tiêu đề chỉ nói về
//   màn 3-4 nhưng file thì đụng 2-2, 3-1, 3-3, 3-4 cộng 3 tài liệu chung. Ghi mù
//   nghĩa là story màn 3-1 mọc link spec của 3-4 — nhiễu, và người đọc không biết
//   cái nào là của mình.

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
 *   Spec/3-1_パスワード変更リクエスト画面(...)/...     → dir  "3-1_..."
 *   Spec/1-1_お客様ログイン画面(Login).md              → file "1-1_..."   (file phẳng)
 *   Design/P1_Authentication/3-1 Password Reset.dc.html → file "3-1 ..."
 *   Design/P4_Staff Property/2-4_物件一覧画面/html/... → dir  "2-4_..."
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

  for (const p of files) {
    if (isSharedDoc(p)) continue;

    if (p.startsWith("Spec/") && p.endsWith(".md")) {
      if (screenId && belongsToScreen(p, screenId)) specs.push(p);
      continue;
    }
    if (p.startsWith("Design/") && p.endsWith(".dc.html")) {
      if (screenId && belongsToScreen(p, screenId)) designs.push(p);
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

  return { slots, ambiguous };
}

/** 1 ứng viên ⇒ chắc chắn · 2+ ⇒ hỏi · 0 ⇒ im lặng bỏ qua (ô trống là thông tin ĐÚNG). */
function assign(slots, ambiguous, key, candidates) {
  if (candidates.length === 1) slots[key] = candidates;
  else if (candidates.length > 1) ambiguous[key] = candidates;
}
