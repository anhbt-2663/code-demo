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

/** Lấy screen ID: ưu tiên field `Screen ID` trong body story, sau đó tới tiêu đề.
 *
 *  Tiêu đề theo quy ước `[STORY] [3-1] Tên màn` — 27/30 story đang theo đúng.
 *  Biến thể đã gặp và phải nuốt được: `[STORY][3-1]` (thiếu space), `[1-2 ]` (thừa space).
 *  Story không thuộc màn nào (Design system, Backlog) trả null — đó là kết quả HỢP LỆ.
 *
 * @param {{title?:string, body?:string}} story
 * @returns {string | null}
 */
export function extractScreenId(story) {
  const fromField = /###\s*Screen ID\s*\n+\s*([\d\-+]+)\s*$/m.exec(story?.body ?? "");
  if (fromField && fromField[1] !== "N/A") return fromField[1].trim();

  const fromTitle = /\[STORY\]\s*\[\s*([\d\-+]+)\s*\]/i.exec(story?.title ?? "");
  return fromTitle ? fromTitle[1].trim() : null;
}
