// Dựng khối `References & Dependencies` và ghép vào body story.
//
// HAI ĐỊNH DẠNG, MỘT NGUỒN: bảng markdown cho người đọc, khối YAML cho AI đọc.
// Cả hai sinh từ cùng một object nên không thể lệch nhau.
//
// LUẬT CỨNG — BOT CHỈ GHI TRONG CẶP MARKER:
//   `Overview`, `Acceptance Criteria`, `Technical Approach` là của người viết.
//   Không có bản "ghi đè an toàn" nào. Ghi đè cả body là mất nội dung người ta viết.

const START = "<!-- auto:context:start";
const END = "auto:context:end -->";

// Lấy từ môi trường — Actions tự set `GITHUB_REPOSITORY`. Không hardcode để bộ
// script chạy được trên cặp repo khác (ví dụ repo cá nhân dùng chạy thử).
const CODE_REPO = process.env.GITHUB_REPOSITORY ?? "anhbt-2663/code-demo";

const LABELS = {
  spec_jp: "Spec JP",
  spec_vi: "Spec VI",
  design: "Design",
  api_docs: "API docs",
};

/** Link GHIM SHA, không trỏ nhánh.
 *  Story ghi "Ver 1.14" mà link trỏ `develop` thì tháng sau bấm vào ra Ver 1.17 —
 *  số và link nói hai chuyện khác nhau, tệ hơn là không có link. */
const blobUrl = (path, sha) =>
  `https://github.com/${CODE_REPO}/blob/${sha}/` +
  path.split("/").map(encodeURIComponent).join("/");

/**
 * @param {object} ctx
 * @param {string|null} ctx.screen_id
 * @param {Record<string, {path:string, rev:string|null, updated:string|null, sha:string, issue:number|null}>} ctx.slots
 * @param {Record<string, string[]>} [ctx.ambiguous]
 * @param {string} ctx.synced_at ISO string
 */
export function renderContextBlock(ctx) {
  const rows = Object.entries(LABELS).map(([key, label]) => {
    const s = ctx.slots[key];
    if (!s) return `| ${label} | — | — | — | — |`;

    const name = s.path.split("/").pop();
    const rev = s.rev ? `**Ver ${s.rev}**` : `\`${s.sha.slice(0, 7)}\``;
    const src = s.issue ? `#${s.issue}` : "—";
    return `| ${label} | [${name}](${blobUrl(s.path, s.sha)}) | ${rev} | ${s.updated ?? "—"} | ${src} |`;
  });

  const table = [
    "| Hạng mục | File | Rev | Cập nhật | Nguồn |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");

  const yaml = [
    `screen_id: ${ctx.screen_id ? JSON.stringify(ctx.screen_id) : "null"}`,
    ...Object.entries(ctx.slots).map(([k, s]) =>
      `${k}: { path: ${JSON.stringify(s.path)}, rev: ${s.rev ? JSON.stringify(s.rev) : "null"}, ` +
      `updated: ${s.updated ? JSON.stringify(s.updated) : "null"}, sha: ${JSON.stringify(s.sha)}, ` +
      `issue: ${s.issue ?? "null"} }`,
    ),
    `synced_at: ${JSON.stringify(ctx.synced_at)}`,
  ].join("\n");

  // KHÔNG có nhãn "tạm / đã chốt" — có chủ ý.
  //
  // Bảng luôn phản ánh trạng thái ĐÃ MERGED mới nhất: spec đổi tiếp ⇒ PR mới ⇒
  // merge ⇒ bảng cập nhật. Một nhãn nói "ticket DOCUMENTATION đã đóng hay chưa"
  // là chép lại thứ nhìn thẳng vào ticket là biết — thông tin trùng lặp, và mọi
  // bản sao đều có ngày lệch khỏi bản gốc.
  const note =
    `<sub>🤖 \`story-context-sync\` · nguồn #${ctx.source_issue} · ` +
    `${ctx.synced_at.slice(0, 16).replace("T", " ")} UTC</sub>`;

  return [
    "### References & Dependencies",
    "",
    table,
    "",
    note,
    "",
    START,
    yaml,
    END,
    ...renderAmbiguous(ctx.ambiguous),
  ].join("\n");
}

/** Ô còn 2+ ứng viên: ghi phần chắc rồi để lại checkbox cho người chọn.
 *
 *  Bot chạy khi PR ĐÃ merged, không có ai ngồi đó để hỏi đồng bộ — nên hỏi rồi đi.
 *  Hiện KHÔNG có workflow nào nhặt lại ô đã tick: người tự sửa dòng trong bảng.
 *  Ca này hiếm (bộ lọc theo screen_id đã loại gần hết mơ hồ), nên chưa đáng dựng
 *  thêm một workflow chỉ để đọc checkbox. */
function renderAmbiguous(ambiguous) {
  const entries = Object.entries(ambiguous ?? {});
  if (entries.length === 0) return [];

  const lines = ["", "---", "", "⚠️ **Cần xác nhận** — tick đúng 1 ô mỗi mục, bot sẽ tự điền vào bảng trên:", ""];
  for (const [key, paths] of entries) {
    lines.push(`**${LABELS[key] ?? key}**`);
    for (const p of paths) lines.push(`- [ ] \`${p}\``);
    lines.push(`- [ ] Không cái nào`);
    lines.push("");
  }
  return lines;
}

const HEADING = "### References & Dependencies";

/**
 * Ghép khối vào body.
 *
 *   có marker        ⇒ thay từ heading (hoặc marker) tới hết marker
 *   chưa có marker,
 *   nhưng có section ⇒ THAY CHÍNH SECTION ĐÓ (đây là ô `[Link Figma]` placeholder
 *                      mà template story sinh ra — thay vào đúng chỗ nó, đừng
 *                      chèn thêm bảng thứ hai bên dưới)
 *   không có gì      ⇒ chèn vào cuối
 *
 * Mọi thứ ngoài vùng được thay giữ nguyên byte-for-byte.
 */
export function spliceIntoBody(body, block) {
  const src = body ?? "";
  const i = src.indexOf(START);
  const j = src.indexOf(END);

  if (i !== -1 && j !== -1 && j > i) {
    // Lùi về đầu section nếu bot đã dựng nó lần trước, để không chồng bảng qua mỗi lần chạy.
    const heading = src.lastIndexOf(HEADING, i);
    const from = heading === -1 ? i : heading;
    return `${src.slice(0, from)}${block}${src.slice(j + END.length)}`;
  }

  const heading = src.indexOf(HEADING);
  if (heading !== -1) {
    // Section chạy tới heading `### ` kế tiếp, hoặc hết body.
    const next = src.indexOf("\n### ", heading + HEADING.length);
    const end = next === -1 ? src.length : next + 1;
    return `${src.slice(0, heading)}${block}\n\n${src.slice(end)}`;
  }

  return `${src.trimEnd()}\n\n${block}\n`;
}
