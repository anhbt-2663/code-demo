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

export const LABELS = {
  spec_jp: "Spec JP",
  spec_vi: "Spec VI",
  design: "Design",
};

/** Link GHIM SHA, không trỏ nhánh.
 *  Story ghi "Ver 1.14" mà link trỏ `develop` thì tháng sau bấm vào ra Ver 1.17 —
 *  số và link nói hai chuyện khác nhau, tệ hơn là không có link. */
export const blobUrl = (path, sha) =>
  `https://github.com/${CODE_REPO}/blob/${sha}/` +
  path.split("/").map(encodeURIComponent).join("/");

/**
 * @param {object} ctx
 * @param {string|null} ctx.screen_id
 * @param {Record<string, {path:string, rev:string|null, updated:string|null, sha:string, issue:number|null}>} ctx.slots
 * @param {Record<string, string[]>} [ctx.ambiguous]
 * @param {number} ctx.source_issue issue của lượt ghi này
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

  // Mỗi giá trị là JSON một dòng — JSON là YAML hợp lệ, nên AI đọc như YAML được,
  // còn bot đọc lại bằng JSON.parse mà không cần thư viện YAML.
  const ambiguous = ctx.ambiguous ?? {};
  const yaml = [
    `screen_id: ${JSON.stringify(ctx.screen_id ?? null)}`,
    ...Object.entries(ctx.slots).map(([k, s]) => `${k}: ${JSON.stringify(s)}`),
    ...(Object.keys(ambiguous).length ? [`ambiguous: ${JSON.stringify(ambiguous)}`] : []),
    `synced_at: ${JSON.stringify(ctx.synced_at)}`,
  ].join("\n");

  // KHÔNG có nhãn "tạm / đã chốt" — có chủ ý: bảng luôn phản ánh bản ĐÃ MERGED
  // mới nhất. Trạng thái ticket thì nhìn thẳng vào ticket, không chép lại ở đây.
  const note =
    `<sub>🤖 \`story-context-sync\` · lần ghi gần nhất từ #${ctx.source_issue} · ` +
    `${ctx.synced_at.slice(0, 16).replace("T", " ")} UTC</sub>`;

  // Phần "cần xác nhận" nằm TRƯỚC marker END ⇒ nằm trong vùng bị thay mỗi lần chạy.
  // Để nó sau END thì mỗi lượt chạy lại chèn thêm một bản, không bao giờ xoá được.
  return [
    "### References & Dependencies",
    "",
    table,
    "",
    note,
    ...renderAmbiguous(ambiguous),
    "",
    START,
    yaml,
    END,
  ].join("\n");
}

/** Ô còn 2+ ứng viên: liệt kê để người đọc biết nên mở file nào.
 *  Là danh sách thường, KHÔNG phải checkbox — chưa có bot nào đọc lựa chọn của người,
 *  checkbox sẽ khiến người ta tick rồi ngồi chờ một thứ không bao giờ xảy ra. */
function renderAmbiguous(ambiguous) {
  const entries = Object.entries(ambiguous);
  if (entries.length === 0) return [];

  const lines = ["", "⚠️ **Cần xác nhận** — nhiều file cùng khớp, bot không tự chọn được:", ""];
  for (const [key, paths] of entries) {
    lines.push(`**${LABELS[key] ?? key}**`);
    for (const p of paths) lines.push(`- \`${p}\``);
    lines.push("");
  }
  return lines;
}

/**
 * Đọc lại các ô đã ghi ở lần trước, từ khối YAML trong marker.
 * Body chưa có khối, hoặc dòng nào hỏng ⇒ coi như chưa có ô đó (không ném).
 *
 * @param {string} body
 * @returns {{slots: Record<string, object>, ambiguous: Record<string, string[]>}}
 */
export function readPreviousContext(body) {
  const src = body ?? "";
  const i = src.indexOf(START);
  const j = src.indexOf(END);
  const out = { slots: {}, ambiguous: {} };
  if (i === -1 || j <= i) return out;

  for (const line of src.slice(i + START.length, j).split("\n")) {
    const m = /^(\w+):\s*(\{.*\})\s*$/.exec(line.trim());
    if (!m) continue;
    try {
      const value = JSON.parse(m[2]);
      if (m[1] === "ambiguous") out.ambiguous = value;
      else if (m[1] in LABELS) out.slots[m[1]] = value;
    } catch {
      // Dòng bị người sửa tay làm hỏng — bỏ dòng đó, lần ghi của ticket sở hữu sẽ dựng lại.
    }
  }
  return out;
}

/**
 * Gộp kết quả lần này với lần trước.
 *
 * VÌ SAO: mỗi lượt chạy chỉ biết về MỘT ticket. Hiện chỉ ticket DOCUMENTATION được
 * ghi, nhưng một story vẫn có thể có hơn một ticket ghi (ví dụ khi thêm ô API docs
 * sau này). Dựng lại cả bảng chỉ từ ticket hiện tại thì lượt của ticket này xoá sạch
 * link mà ticket kia vừa ghi.
 *
 *   ô ticket này ĐƯỢC PHÉP ghi   ⇒ lấy kết quả mới (vắng mặt ⇒ xoá, vì đó là sự thật mới)
 *   ô KHÔNG thuộc quyền ticket   ⇒ giữ nguyên lần trước — không phải việc của lượt này
 *
 * @param {{slots:object, ambiguous:object}} prev kết quả readPreviousContext
 * @param {{slots:object, ambiguous:object}} next kết quả của lượt này
 * @param {string[]} allowed các ô ticket này được phép ghi
 */
export function mergeWithPrevious(prev, next, allowed) {
  const pick = (prevMap, nextMap) => {
    const out = {};
    for (const key of Object.keys(LABELS)) {
      const value = allowed.includes(key) ? nextMap[key] : prevMap[key];
      if (value) out[key] = value;
    }
    return out;
  };
  return {
    slots: pick(prev.slots, next.slots),
    ambiguous: pick(prev.ambiguous, next.ambiguous),
  };
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
