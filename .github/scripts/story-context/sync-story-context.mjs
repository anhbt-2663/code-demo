// Entry của `story-context-sync`: PR merged → tìm story cha → ghi References & Dependencies.
//
// Biến môi trường:
//   GH_TOKEN      token có `Issues: write` trên repo QUẢN LÝ (App hoặc PAT).
//                 GITHUB_TOKEN mặc định KHÔNG ghi được sang repo khác.
//   PR_NUMBER     số PR vừa merged (repo code)
//   GITHUB_REPOSITORY  owner/repo của repo code (Actions tự set)
//   DRY_RUN       "1" ⇒ chỉ in ra, không ghi. Dùng cho lần chạy thử đầu tiên.

import {
  parseIssueRef,
  fetchIssueWithParent,
  mergedPullRequests,
  extractScreenId,
} from "./parse-issue-ref.mjs";
import { classifyChangedFiles } from "./classify-changed-files.mjs";
import { readSpecRevision, readDesignRevision, fetchFileAtSha } from "./read-artifact-revision.mjs";
import { renderContextBlock, spliceIntoBody } from "./render-context-block.mjs";

const TOKEN = process.env.GH_TOKEN;
const PR_NUMBER = Number(process.env.PR_NUMBER);
const [CODE_OWNER, CODE_REPO] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
const DRY_RUN = process.env.DRY_RUN === "1";

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

/** Thoát êm, không đỏ: đây là bot ghi chép, không phải cổng chặn.
 *  Cổng chặn là `pr-link-gate`, chạy TRƯỚC merge. */
const skip = (why) => {
  console.log(`⏭  bỏ qua — ${why}`);
  process.exit(0);
};

async function main() {
  const ref = await resolveIssueRef();
  if (!ref) skip("không xác định được issue");

  const issue = await fetchIssueWithParent(ref, TOKEN);
  if (!issue) skip(`không đọc được issue ${ref.owner}/${ref.repo}#${ref.number} (thiếu quyền?)`);

  // GHI CẢ KHI ISSUE CÒN MỞ — có chủ ý.
  //
  // Mỗi lần chạy, bot gom LẠI toàn bộ PR merged của issue rồi ghi đè cả khối, nên
  // ghi sớm không mất gì: lần sau gom lại là đủ. Còn nếu chờ issue đóng mới ghi thì
  // gặp bẫy thứ tự — PR thường merge TRƯỚC khi ai đó đóng issue, lúc bot chạy thì
  // issue còn OPEN, bot bỏ qua, và không sự kiện nào bắn lại nữa ⇒ story trống mãi.
  //
  // Khác biệt chỉ nằm ở nhãn: 🟡 tạm (còn mở) · 🟢 đã chốt (đã đóng).
  const frozen = issue.state === "CLOSED";

  const story = issue.parent;
  if (!story) skip(`issue #${issue.number} không có story cha`);

  const screenId = extractScreenId(story);
  console.log(`📌 story #${story.number} · screen_id = ${screenId ?? "(không có)"}`);

  // Gộp file của MỌI PR đã merged thuộc issue này, không chỉ PR vừa kích hoạt.
  // Lấy một PR thì mất phần của những PR còn lại.
  const prs = mergedPullRequests(issue, `${CODE_OWNER}/${CODE_REPO}`);
  if (prs.length === 0) {
    skip(`issue #${issue.number} không có PR merged nào (đóng tay?)`);
  }
  console.log(`🔗 ${prs.length} PR: ${prs.map((p) => `#${p.number}`).join(", ")}`);

  // path → SHA của PR merged SAU CÙNG đụng file đó. PR sau thắng PR trước,
  // vì nội dung mới nhất của file nằm ở đó.
  const shaByPath = new Map();
  for (const p of prs) {
    const files = await api(
      `/repos/${CODE_OWNER}/${CODE_REPO}/pulls/${p.number}/files?per_page=100`,
    );
    for (const f of files) shaByPath.set(f.filename, { sha: p.sha, pr: p.number });
  }

  const { slots: rawSlots, ambiguous } = classifyChangedFiles([...shaByPath.keys()], screenId);

  if (Object.keys(rawSlots).length === 0 && Object.keys(ambiguous).length === 0) {
    skip("không PR nào đụng nguồn sự thật của màn này");
  }

  const slots = {};
  for (const [key, paths] of Object.entries(rawSlots)) {
    const path = paths[0];
    slots[key] = await describeArtifact(key, path, shaByPath.get(path).sha, issue.number);
  }

  const block = renderContextBlock({
    screen_id: screenId,
    slots,
    ambiguous,
    frozen,
    source_issue: issue.number,
    synced_at: new Date().toISOString(),
  });

  // Đọc lại body ngay trước khi ghi: giảm cửa sổ đè lên thay đổi của người khác.
  const fresh = await api(`/repos/${ref.owner}/${ref.repo}/issues/${story.number}`);
  const body = spliceIntoBody(fresh.body, block);

  if (DRY_RUN) {
    console.log("🧪 DRY_RUN — body sẽ là:\n" + body);
    return;
  }

  await api(`/repos/${ref.owner}/${ref.repo}/issues/${story.number}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  console.log(`✅ đã cập nhật story #${story.number}`);

  if (Object.keys(ambiguous).length > 0) {
    await api(`/repos/${ref.owner}/${ref.repo}/issues/${story.number}/labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labels: ["needs:context-review"] }),
    }).catch((e) => console.log(`⚠️  không gắn được label: ${e.message}`));
  }
}

/**
 * Xác định issue cần xử lý, từ một trong hai đường vào:
 *   - PR merged  → đọc dòng `Related Issue:` trong body PR
 *   - chạy tay   → truyền thẳng ISSUE_REF `owner/repo#N`
 *
 * Đường chạy tay tồn tại vì issue có thể được đóng BẰNG TAY, không qua PR nào —
 * lúc đó không sự kiện nào bắn ở repo code. Đã gặp: issue đóng tay kèm comment, không có PR nào.
 */
async function resolveIssueRef() {
  if (process.env.ISSUE_REF) {
    const ref = parseIssueRef(`Related Issue: ${process.env.ISSUE_REF}`);
    if (!ref) console.error(`⚠️  ISSUE_REF sai định dạng: ${process.env.ISSUE_REF}`);
    return ref;
  }

  const pr = await api(`/repos/${CODE_OWNER}/${CODE_REPO}/pulls/${PR_NUMBER}`);
  if (!pr.merged) skip("PR chưa merged");

  const ref = parseIssueRef(pr.body);
  if (!ref) skip("PR body không có dòng `Related Issue: owner/repo#N`");
  return ref;
}

/** Lấy rev + ngày cho một artifact. Không có rev thì trả null — dùng SHA thay. */
async function describeArtifact(key, path, sha, issueNumber) {
  const base = { path, sha, issue: issueNumber, rev: null, updated: null };

  if (key === "spec_jp" || key === "spec_vi") {
    const content = await fetchFileAtSha({ owner: CODE_OWNER, repo: CODE_REPO, path, sha, token: TOKEN });
    const parsed = content ? readSpecRevision(content) : null;
    return parsed ? { ...base, rev: parsed.rev, updated: parsed.updated } : base;
  }

  if (key === "design") {
    // README nằm ở thư mục màn. Design đặt phẳng (không có thư mục riêng) thì không có → null.
    const dir = path.slice(0, path.lastIndexOf("/"));
    const readmeDir = dir.endsWith("/html") ? dir.slice(0, -5) : dir;
    const content = await fetchFileAtSha({
      owner: CODE_OWNER, repo: CODE_REPO, path: `${readmeDir}/README.md`, sha, token: TOKEN,
    });
    return { ...base, rev: readDesignRevision(content) };
  }

  return base; // api_docs: .ts không có khái niệm rev
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
