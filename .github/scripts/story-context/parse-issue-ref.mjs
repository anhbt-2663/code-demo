// Đọc dòng `Related Issue:` trong PR body và xác minh issue có thật.
//
// VÌ SAO KHÔNG DÙNG `closingIssuesReferences`:
//   Từ khoá `Closes`/`Fixes` của GitHub chỉ tự đóng issue CÙNG repo. Issue của dự án
//   này nằm ở repo quản lý (anhbt-2663/pm-demo), khác repo code, nên liên
//   kết chéo repo không đảm bảo sinh ra reference. Parse một dòng cố định rồi gọi API
//   xác minh là cách duy nhất chắc chắn — và bắt được cả lỗi gõ sai số.

/** Chỉ chấp nhận dạng đầy đủ `owner/repo#123`. Dạng `#123` bị từ chối có chủ ý:
 *  nó mơ hồ giữa hai repo, và mơ hồ ở đây nghĩa là bot ghi nhầm story.
 *
 *  Nhận cả `Closes` vì đã có PR dùng dạng đó và nó tạo được cross-reference —
 *  không bắt người đang làm đúng phải đổi thói quen. */
const REF_RE = /^\s*(?:Related Issue|Closes|Close|Fixes|Fix|Resolves|Resolve):?\s*([\w.-]+)\/([\w.-]+)#(\d+)\s*$/im;

/**
 * @param {string} body PR body
 * @returns {{owner:string, repo:string, number:number} | null}
 */
export function parseIssueRef(body) {
  const m = REF_RE.exec(body ?? "");
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/**
 * Xác minh issue tồn tại và lấy parent (story cha) qua GraphQL.
 * Trả về null nếu không truy cập được — KHÔNG ném, để caller quyết định đỏ hay bỏ qua.
 *
 * @param {{owner:string, repo:string, number:number}} ref
 * @param {string} token phải có quyền đọc repo quản lý
 */
export async function fetchIssueWithParent(ref, token) {
  const query = `
    query($owner:String!, $repo:String!, $number:Int!) {
      repository(owner:$owner, name:$repo) {
        issue(number:$number) {
          number title state url
          labels(first: 20) { nodes { name } }
          parent { number title url body }
          timelineItems(last:50, itemTypes:[CROSS_REFERENCED_EVENT]) {
            nodes {
              ... on CrossReferencedEvent {
                source {
                  ... on PullRequest {
                    number merged mergedAt
                    mergeCommit { oid }
                    repository { nameWithOwner }
                  }
                }
              }
            }
          }
        }
      }
    }`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      // GraphQL trả `parent` (sub-issue) — cần header preview trên một số phiên bản GHES.
      "GraphQL-Features": "sub_issues",
    },
    body: JSON.stringify({ query, variables: ref }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.repository?.issue ?? null;
}

/**
 * Mọi PR ĐÃ MERGED từng nhắc tới issue này, xếp theo thời điểm merge tăng dần.
 *
 * VÌ SAO ĐI TỪ ISSUE CHỨ KHÔNG TỪ PR:
 *   Một issue thường có NHIỀU PR.
 *   Nếu mỗi lần một PR merged lại ghi đè story bằng riêng file của PR đó, thì
 *   lần ghi sau xoá mất kết quả của lần ghi trước. Gộp từ phía issue mới đủ.
 *
 * VÌ SAO DÙNG CROSS_REFERENCED_EVENT:
 *   `closingIssuesReferences` KHÔNG chạy chéo repo — đã đo trên repo thật: một PR viết đúng
 *   `Closes owner/repo#N` mà vẫn trả 0. Còn cross-reference thì chạy. Đây là chỉ mục gốc của GitHub, không
 *   phải quy ước tự chế, nên không hỏng khi ai đó đổi cách viết mô tả PR.
 *
 * @param {object} issue kết quả của fetchIssueWithParent
 * @param {string} codeRepo "owner/repo" của repo code — lọc bỏ PR từ repo khác
 */
export function mergedPullRequests(issue, codeRepo) {
  const nodes = issue?.timelineItems?.nodes ?? [];
  return nodes
    .map((n) => n?.source)
    .filter((pr) => pr?.merged && pr?.repository?.nameWithOwner === codeRepo)
    // Cùng một PR có thể xuất hiện nhiều lần trong timeline (mỗi lần sửa mô tả).
    .filter((pr, i, all) => all.findIndex((o) => o.number === pr.number) === i)
    .sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt))
    // GraphQL không có `mergeCommitSha` — là `mergeCommit { oid }`. Phẳng hoá để
    // phần còn lại của script chỉ thấy một khoá duy nhất.
    .map((pr) => ({ ...pr, sha: pr.mergeCommit?.oid ?? null }))
    .filter((pr) => pr.sha);
}

/** Hình dạng hợp lệ của mã màn: `3-1`, `1-8+2-9`. Dùng chung cho cả hai đường lấy. */
const SCREEN_ID_RE = /^\d+-\d+(?:\+\d+-\d+)*$/;

/**
 * Lấy screen ID của story. Trường `Screen ID` trong body là NGUỒN CHÍNH;
 * tiêu đề chỉ còn là đường lùi cho story cũ chưa có trường đó.
 *
 * VÌ SAO TRƯỜNG THẮNG TIÊU ĐỀ:
 *   Tiêu đề là văn xuôi gõ tay và đã trôi qua thời gian — có story thiếu khoảng
 *   trắng `[STORY][3-1]`, có story thừa `[1-2 ]`, có story không mang mã màn nào.
 *   Một ô riêng thì chỉ chứa đúng một giá trị, parse chắc chắn.
 *
 * Nhận mọi cách gõ đã gặp:
 *   ### Screen ID        ← GitHub issue form (`type: input`)
 *   9-2
 *
 *   **Screen ID:** 9-2   ← gõ tay trong markdown
 *   Screen ID: 9-2
 *
 * `N/A`, `_No response_`, `TBD` là câu trả lời HỢP LỆ nghĩa là "story không thuộc
 * màn nào" (Design system, Backlog...). Lúc đó trả null và bot bỏ qua story —
 * đúng ý, không phải lỗi. Giá trị rác cũng rơi về null chứ KHÔNG đem đi lọc file,
 * vì lọc bằng một chuỗi vô nghĩa sẽ im lặng cho ra bảng trống.
 *
 * @param {{title?:string, body?:string}} story
 * @returns {string | null}
 */
export function extractScreenId(story) {
  const body = story?.body ?? "";

  const fromHeading = /^#{2,4}\s*Screen\s*ID\s*$\n+\s*(\S+)/im.exec(body);
  const fromInline = /^\s*\**\s*Screen\s*ID\s*\**\s*[:：]\s*\**\s*(\S+)/im.exec(body);

  const raw = (fromHeading?.[1] ?? fromInline?.[1] ?? "").replace(/[*`_]/g, "").trim();
  if (SCREEN_ID_RE.test(raw)) return raw;

  const fromTitle = /\[STORY\]\s*\[\s*([\d\-+]+)\s*\]/i.exec(story?.title ?? "");
  const fromTitleId = fromTitle?.[1].trim();
  return fromTitleId && SCREEN_ID_RE.test(fromTitleId) ? fromTitleId : null;
}
