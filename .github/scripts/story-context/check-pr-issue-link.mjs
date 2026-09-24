// Cổng chặn: PR phải liên kết được với một issue có thật ở repo quản lý.
// Exit != 0 ⇒ CI đỏ ⇒ không merge được. Đây là cổng, không phải lời nhắc.

import { parseIssueRef, fetchIssueWithParent } from "./parse-issue-ref.mjs";

const token = process.env.GH_TOKEN;
const body = process.env.PR_BODY ?? "";
// Chỉ dùng cho thông báo lỗi. Đặt PM_REPO khi chạy trên cặp repo khác (repo thử nghiệm).
const PM_REPO = process.env.PM_REPO ?? "anhbt-2663/pm-demo";

if (!token) {
  console.error("❌ Thiếu secret PM_REPO_TOKEN — gate không xác minh được issue.");
  console.error(`   Tạo App token / PAT có quyền \`Issues: read\` trên ${PM_REPO},`);
  console.error("   rồi lưu vào Settings → Secrets → Actions của repo này.");
  console.error("   (Gate đỏ chứ không xanh thầm: xanh thầm là cách một lưới chết mà không ai biết.)");
  process.exit(1);
}

const ref = parseIssueRef(body);
if (!ref) {
  console.error("❌ PR body thiếu dòng liên kết issue, hoặc sai định dạng.\n");
  console.error(`   Đúng:  Related Issue: ${PM_REPO}#123`);
  console.error("   Sai:   Close #[437]          — dấu ngoặc vuông, GitHub không parse được");
  console.error("   Sai:   Related Issue: #123   — thiếu owner/repo, mà issue nằm ở repo KHÁC\n");
  console.error("   Sửa mô tả PR rồi lưu lại, gate sẽ chạy lại tự động.");
  process.exit(1);
}

const issue = await fetchIssueWithParent(ref, token);
if (!issue) {
  console.error(`❌ Không tìm thấy ${ref.owner}/${ref.repo}#${ref.number}.`);
  console.error("   Kiểm tra lại số issue, hoặc token thiếu quyền đọc repo đó.");
  process.exit(1);
}

console.log(`✅ #${issue.number} ${issue.title}`);
console.log(
  issue.parent
    ? `   story cha: #${issue.parent.number} ${issue.parent.title}`
    : "   ⚠️  issue này không có story cha — story-context-sync sẽ bỏ qua PR này (không đỏ).",
);
