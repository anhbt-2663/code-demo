// Đọc số revision của spec / design từ chính nội dung file.
//
// REV CHỈ TỒN TẠI Ở SPEC VÀ MỘT PHẦN DESIGN — nói thẳng để không ai tưởng nhầm:
//   spec  : bảng「Lịch sử sửa đổi」trong file, dòng CUỐI là bản mới nhất
//   design: `README.md` cùng thư mục, mục `## revNN`. Nhóm P4_Staff Property có,
//           P1_Authentication KHÔNG — hai nhóm design làm khác nhau.
//   api   : `.ts` không có khái niệm rev.
// Chỗ nào không có rev thì để `null` và dùng commit SHA. Bịa một con số ở đây
// là đúc ra tài liệu khẳng định sai — hại hơn là không có tài liệu.

/** `| 1.14 | 2026-09-21 | - | Trang | ... |` — cột 1 là rev, cột 2 là ngày. */
const SPEC_ROW_RE = /^\|\s*(\d+\.\d{1,2})\s*\|\s*(\d{4}-\d{2}-\d{2}|-)\s*\|/gm;

/**
 * @param {string} content nội dung file spec `.md`
 * @returns {{rev:string, updated:string|null} | null}
 */
export function readSpecRevision(content) {
  const rows = [...(content ?? "").matchAll(SPEC_ROW_RE)];
  if (rows.length === 0) return null;

  // Dòng CUỐI, không phải dòng lớn nhất: bảng có thể có rev không tăng đơn điệu
  // (ví dụ một bản bị thu hồi rồi ghi lại). Thứ tự ghi trong tài liệu là thẩm quyền.
  const last = rows[rows.length - 1];
  return { rev: last[1], updated: last[2] === "-" ? null : last[2] };
}

/** `## rev15 …` — bản mới nhất nằm TRÊN CÙNG. */
const DESIGN_REV_RE = /^##\s*rev(\d+)\s/m;

/**
 * @param {string|null} readmeContent nội dung `README.md` cùng thư mục design
 * @returns {string | null} ví dụ "15", hoặc null khi nhóm design đó không đánh rev
 */
export function readDesignRevision(readmeContent) {
  const m = DESIGN_REV_RE.exec(readmeContent ?? "");
  return m ? m[1] : null;
}

/**
 * Tải nội dung một file tại đúng commit SHA (không trỏ nhánh).
 * Trả null khi không có file — caller coi đó là "không có rev", không phải lỗi.
 */
export async function fetchFileAtSha({ owner, repo, path, sha, token }) {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/` +
    `${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${sha}`;

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github.raw" },
  });
  return res.ok ? await res.text() : null;
}
