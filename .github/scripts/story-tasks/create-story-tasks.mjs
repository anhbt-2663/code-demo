// Sinh bộ task con cho một story, và gắn quan hệ cha–con (sub-issue) bằng API.
//
// CÁCH DÙNG
//   node .github/scripts/story-tasks/create-story-tasks.mjs <số story> [--apply]
//
//   Mặc định là XEM TRƯỚC — in ra sẽ tạo gì rồi dừng. Phải thêm `--apply` mới tạo thật.
//   Ngược với `DRY_RUN` của bộ story-context: ở đó mặc định ghi, ở đây mặc định KHÔNG.
//   Lý do: tạo issue không rút lại được. Tạo nhầm 9 issue thì phải đi xoá tay từng cái,
//   và số issue đã cấp thì không lấy lại được.
//
// BIẾN MÔI TRƯỜNG
//   GH_TOKEN   token có `Issues: write` trên repo quản lý. Không có thì lấy từ `gh auth token`.
//   PM_REPO    mặc định "anhbt-2663/pm-demo"

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PM_REPO = process.env.PM_REPO ?? "anhbt-2663/pm-demo";
const [OWNER, REPO] = PM_REPO.split("/");

const args = process.argv.slice(2);
const storyNumber = Number(args.find((a) => /^\d+$/.test(a)));
const APPLY = args.includes("--apply");

if (!storyNumber) {
  console.error("Dùng: node create-story-tasks.mjs <số story> [--apply]");
  process.exit(1);
}

const TOKEN =
  process.env.GH_TOKEN || execSync("gh auth token", { encoding: "utf8" }).trim();

const TEMPLATE = new URL("../../story-task-template.json", import.meta.url);

const gql = async (query, variables = {}) => {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "GraphQL-Features": "sub_issues",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
};

/** Tên màn = phần sau `[STORY] [x-y]`. Dùng để điền `{name}` vào tiêu đề task.
 *  `[STORY] [3-1] Notice List/<bản dịch>` → `Notice List`
 *  Cắt ở `/` vì bản dịch phía sau làm tiêu đề task dài gấp đôi mà không thêm nghĩa. */
function parseStoryTitle(title) {
  const m = /\[STORY\]\s*\[\s*([\d\-+]+)\s*\]\s*(.+)$/i.exec(title);
  if (!m) return { screenId: null, name: title.trim() };
  return { screenId: m[1].trim(), name: m[2].split("/")[0].trim() };
}

const fill = (s, v) => s.replaceAll("{name}", v.name).replaceAll("{screen_id}", v.screenId ?? "—");

async function main() {
  const data = await gql(
    `query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){
       issue(number:$n){ id number title state
         subIssues(first:50){ nodes{ number title } } } } }`,
    { o: OWNER, r: REPO, n: storyNumber },
  );

  const story = data?.repository?.issue;
  if (!story) throw new Error(`Không tìm thấy ${PM_REPO}#${storyNumber}`);

  const { screenId, name } = parseStoryTitle(story.title);
  console.log(`📖 #${story.number} ${story.title}`);
  console.log(`   screen_id = ${screenId ?? "(không có)"} · name = "${name}"\n`);

  const existing = story.subIssues.nodes.map((n) => n.title);
  if (existing.length) {
    console.log(`⚠️  Story đã có ${existing.length} task con:`);
    for (const t of existing) console.log(`     • ${t}`);
    console.log("");
  }

  const tpl = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  const planned = tpl.tasks
    .filter((t) => t.enabled !== false)
    .map((t) => ({
      title: fill(t.title, { name, screenId }),
      body: fill(t.body ?? "", { name, screenId }),
      labels: t.labels ?? [],
    }))
    // Không tạo lại task đã có — chạy script hai lần không đúc ra bản sao.
    .filter((t) => !existing.includes(t.title));

  if (planned.length === 0) {
    console.log("✅ Không có gì để tạo — mọi task trong mẫu đã tồn tại.");
    return;
  }

  console.log(`${APPLY ? "🚀 SẼ TẠO" : "👀 XEM TRƯỚC"} — ${planned.length} task:\n`);
  for (const t of planned) console.log(`   • ${t.title}\n     ${t.labels.join(" · ")}`);

  if (!APPLY) {
    console.log(`\n⏸  Chưa tạo gì. Thêm --apply để tạo thật.`);
    return;
  }

  console.log("");
  for (const t of planned) {
    const res = await fetch(`https://api.github.com/repos/${PM_REPO}/issues`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: t.title, body: t.body, labels: t.labels }),
    });

    if (!res.ok) {
      console.error(`   ❌ ${t.title} → ${res.status} ${await res.text()}`);
      continue;
    }

    const child = await res.json();

    // Gắn cha–con. Tạo được issue mà gắn hỏng thì issue vẫn còn nhưng mồ côi —
    // nên báo rõ số để người còn gắn tay được, đừng nuốt lỗi.
    try {
      await gql(
        `mutation($p:ID!,$c:ID!){ addSubIssue(input:{issueId:$p, subIssueId:$c}){ clientMutationId } }`,
        { p: story.id, c: child.node_id },
      );
      console.log(`   ✅ #${child.number} ${t.title}`);
    } catch (e) {
      console.error(`   ⚠️  #${child.number} tạo xong nhưng CHƯA gắn được vào story: ${e.message}`);
    }
  }

  console.log(`\n🔗 ${story.html_url ?? `https://github.com/${PM_REPO}/issues/${storyNumber}`}`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
