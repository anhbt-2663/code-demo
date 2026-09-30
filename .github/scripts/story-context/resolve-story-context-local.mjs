// Tìm spec / design của một story NGAY TRÊN MÁY, đúng phiên bản bot đã ghi trong story.
//
// CÁCH DÙNG
//   node .github/scripts/story-context/resolve-story-context-local.mjs <issue>
//   <issue> = anhbt-2663/pm-demo#410 · #410 · 410 · link https://github.com/…/issues/410
//   Truyền task con hay story đều được: task con thì script tự lên story cha.
//
// THỨ TỰ TÌM MỖI FILE — bảng trong story ghim `path` + `sha` (commit đã merge):
//   ✅ máy có commit, file đang mở trùng đúng bản đó   ⇒ đọc thẳng file local
//   🟡 máy có commit, file đang mở KHÁC bản đó        ⇒ đọc bằng `git show <sha>:<path>`
//   ❗ máy CHƯA có commit                              ⇒ DỪNG, hỏi người dùng
//
// KHÔNG BAO GIỜ TỰ `git pull` / `git fetch` — có chủ ý:
//   Pull đổi nhánh đang làm của người dùng, có thể đụng conflict giữa chừng. Đó là
//   quyết định của người, không phải của script. Script chỉ đọc, rồi nói rõ còn thiếu gì.
//
// Exit code: 0 = mọi file đọc được ở local · 2 = cần người dùng quyết định · 1 = lỗi.

import { execFileSync } from "node:child_process";
import { resolve, sep } from "node:path";
import { fetchIssueWithParent } from "./parse-issue-ref.mjs";
import { readPreviousContext, blobUrl, LABELS } from "./render-context-block.mjs";

const PM_REPO = process.env.PM_REPO ?? "anhbt-2663/pm-demo";

/** Chạy git, trả stdout; lỗi ⇒ null (dùng cho các câu hỏi có/không). */
const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

function parseRef(input) {
  const s = (input ?? "").trim();
  const url = /github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/.exec(s);
  const full = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(s);
  const short = /^#?(\d+)$/.exec(s);
  const [owner, repo] = PM_REPO.split("/");
  if (url || full) {
    const m = url ?? full;
    return { owner: m[1], repo: m[2], number: Number(m[3]) };
  }
  return short ? { owner, repo, number: Number(short[1]) } : null;
}

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Không có GH_TOKEN và `gh auth token` thất bại — chạy `gh auth login` trước.");
  }
}

/**
 * Xác định một file có đọc được ở local không.
 * `path` và `sha` đến từ body issue — ai sửa được issue cũng sửa được — nên kiểm
 * hình dạng trước khi đưa cho git, và không cho path thoát ra ngoài repo.
 */
function locate(root, slot) {
  const { path, sha } = slot;
  const inside = resolve(root, path).startsWith(root + sep);
  if (!/^[0-9a-f]{7,40}$/.test(sha ?? "") || !path || !inside) {
    return { status: "invalid", note: "dữ liệu trong story không hợp lệ (path/sha lạ)" };
  }

  if (git(["cat-file", "-e", `${sha}^{commit}`]) === null) {
    const hasFile = git(["ls-files", "--error-unmatch", "--", path]) !== null;
    return {
      status: "missing",
      note:
        `commit ${sha.slice(0, 7)} chưa có ở máy này.` +
        (hasFile ? " Local có file cùng tên nhưng KHÔNG xác minh được là đúng bản." : ""),
    };
  }

  const expected = git(["rev-parse", `${sha}:${path}`]);
  if (!expected) return { status: "missing", note: `commit ${sha.slice(0, 7)} không chứa file này` };

  const current = git(["hash-object", "--", path]);
  return current === expected
    ? { status: "local", read: path }
    : { status: "local-commit", read: `git show ${sha}:"${path}"` };
}

async function main() {
  const ref = parseRef(process.argv[2]);
  if (!ref) throw new Error("Dùng: resolve-story-context-local.mjs <owner/repo#N | #N | N | link issue>");

  const root = git(["rev-parse", "--show-toplevel"]);
  if (!root) throw new Error("Phải chạy bên trong repo code.");
  process.chdir(root); // path trong story tính từ gốc repo — chạy từ thư mục con vẫn đúng

  const issue = await fetchIssueWithParent(ref, getToken());
  if (!issue) throw new Error(`Không tìm thấy ${ref.owner}/${ref.repo}#${ref.number}.`);

  // Truyền thẳng story thì bảng nằm ở chính nó; truyền task con thì lên story cha.
  const own = readPreviousContext(issue.body);
  const story = Object.keys(own.slots).length ? issue : issue.parent;
  const ctx = story === issue ? own : readPreviousContext(story?.body);

  console.log(`📖 ${story ? `story #${story.number} ${story.title}` : `#${issue.number} không có story cha`}`);
  if (story && story !== issue) console.log(`   (từ task #${issue.number} ${issue.title})`);

  if (!story || Object.keys(ctx.slots).length === 0) {
    console.log("\n❗ Story chưa có bảng References & Dependencies (bot chưa ghi lần nào).");
    console.log("   → HỎI NGƯỜI DÙNG spec/design nào là bản đúng. Không tự đoán, không tự pull.");
    process.exit(2);
  }

  let needUser = false;
  for (const [key, label] of Object.entries(LABELS)) {
    const slot = ctx.slots[key];
    if (!slot) continue;
    const rev = slot.rev ? `Ver ${slot.rev}` : `commit ${slot.sha.slice(0, 7)}`;
    const r = locate(root, slot);

    if (r.status === "local") console.log(`\n✅ ${label} (${rev}) — đọc file local, trùng đúng bản trong story:\n   ${r.read}`);
    else if (r.status === "local-commit") console.log(`\n🟡 ${label} (${rev}) — file đang mở KHÁC bản trong story. Đọc bản đúng bằng:\n   ${r.read}`);
    else if (r.status === "invalid") {
      // Không dựng link từ dữ liệu đã biết là lạ — link đó cũng không đáng tin.
      needUser = true;
      console.log(`\n❗ ${label} — ${r.note}. Không đọc gì cả.`);
      console.log("   → HỎI NGƯỜI DÙNG: có thể ai đó đã sửa tay khối YAML trong story.");
    } else {
      needUser = true;
      console.log(`\n❗ ${label} (${rev}) — ${r.note}`);
      console.log("   → HỎI NGƯỜI DÙNG, không tự pull/fetch. Hai lựa chọn:");
      console.log("     1. người dùng tự chạy `git fetch origin` rồi chạy lại script này");
      console.log(`     2. người dùng đồng ý xem trên GitHub: ${blobUrl(slot.path, slot.sha)}`);
    }
  }

  for (const [key, paths] of Object.entries(ctx.ambiguous ?? {})) {
    console.log(`\n⚠️  ${LABELS[key] ?? key}: nhiều file cùng khớp, story chưa chốt — hỏi người dùng chọn:`);
    for (const p of paths) console.log(`   - ${p}`);
    needUser = true;
  }

  process.exit(needUser ? 2 : 0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
