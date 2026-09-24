// Quét issue vừa đóng ở repo quản lý rồi gọi lại `sync-story-context` cho từng cái.
//
// VÌ SAO CẦN CÁI NÀY:
//   Sự kiện `issues: closed` bắn ở repo QUẢN LÝ, workflow ở repo code không nghe được.
//   Mà PR thường merge TRƯỚC khi ai đó đóng issue — nên nếu chỉ dựa vào PR merged thì
//   khoảnh khắc "spec đã chốt" không bao giờ được ghi nhận. Cron là cách tự chủ nhất:
//   không cần đụng repo quản lý, không cần team khác duyệt gì.
//
// Biến môi trường:
//   GH_TOKEN    đọc repo quản lý + ghi issue ở đó
//   PM_REPO     mặc định "anhbt-2663/pm-demo"
//   SWEEP_HOURS cửa sổ quét, mặc định 16.
//
//               Cron chạy 08:00–18:00 VN các ngày T2–T6, nên khoảng hở dài nhất
//               là từ 18:00 thứ Sáu tới 08:00 thứ Hai — nhưng lượt 08:00 hôm sau
//               chỉ cần phủ hết ĐÊM TRƯỚC (18:00 → 08:00 = 14 giờ). Lấy 16 cho dư.
//               Cuối tuần do lượt 08:00 thứ Hai phủ nốt phần thứ Bảy/Chủ nhật —
//               không phủ hết, nên nếu team hay đóng issue cuối tuần thì chạy tay
//               `workflow_dispatch` với hours=72, hoặc mở cron sang T7/CN.
//
//               Quét trùng là VÔ HẠI: mỗi lần ghi đều gom lại toàn bộ PR của issue
//               rồi ghi đè cả khối, nên ghi lại cùng nội dung. Thà thừa còn hơn sót.

import { spawn } from "node:child_process";

const TOKEN = process.env.GH_TOKEN;
const PM_REPO = process.env.PM_REPO ?? "anhbt-2663/pm-demo";
const HOURS = Number(process.env.SWEEP_HOURS ?? 16);

// Dấu thời gian ĐẦY ĐỦ, không cắt còn ngày: `closed:>=2026-09-24` là cả ngày, làm
// cửa sổ 2h nở thành 24h và mỗi issue bị xử lý lại hàng chục lần.
// GitHub search nhận ISO có giờ: `closed:>=2026-09-24T08:00:00Z`.
const since = new Date(Date.now() - HOURS * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");

const query = `
  query($q:String!) {
    search(query:$q, type:ISSUE, first:50) {
      nodes { ... on Issue { number title closedAt parent { number } } }
    }
  }`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${TOKEN}`,
    "content-type": "application/json",
    "GraphQL-Features": "sub_issues",
  },
  body: JSON.stringify({
    query,
    variables: { q: `repo:${PM_REPO} is:issue is:closed closed:>=${since} sort:updated-desc` },
  }),
});

if (!res.ok) {
  console.error(`❌ search lỗi ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const nodes = (await res.json())?.data?.search?.nodes ?? [];

// Chỉ đồng bộ issue CÓ story cha — issue mồ côi không có chỗ nào để ghi.
const targets = nodes.filter((n) => n?.parent?.number);

console.log(`🔎 ${nodes.length} issue đóng từ ${since} · ${targets.length} cái có story cha\n`);

let failed = 0;
for (const issue of targets) {
  console.log(`── #${issue.number} ${issue.title}`);
  const code = await run(`${PM_REPO}#${issue.number}`);
  if (code !== 0) failed++;
  console.log("");
}

// Một issue hỏng không được kéo cả lượt quét xuống: lần sau quét lại vẫn gặp nó.
if (failed > 0) console.log(`⚠️  ${failed}/${targets.length} issue lỗi — xem log ở trên`);

/** Gọi lại entry chính, cùng process env, để logic ghi chỉ tồn tại ở MỘT chỗ. */
function run(issueRef) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [new URL("./sync-story-context.mjs", import.meta.url).pathname],
      { env: { ...process.env, ISSUE_REF: issueRef }, stdio: "inherit" },
    );
    child.on("close", resolve);
  });
}
