const API = 'https://api.github.com';

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PrInfo {
  title: string;
  state: string;
  merged: boolean;
  draft: boolean;
  author: string;
  baseSha: string;
  headSha: string;
  changedFiles: number;
  htmlUrl: string;
}

export interface PrFile {
  filename: string;
  previous_filename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface PrSummary extends PrRef {
  title: string;
  createdAt?: string;
  author?: string;
  draft?: boolean;
  state?: 'open' | 'merged' | 'closed';
  /** 画像の変更数。わからないときは undefined */
  images?: number;
}

export class GhError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

const NAME = '[A-Za-z0-9_.-]+';

/** PR の URL、`owner/repo#123`、`owner/repo/pull/123` を解釈する。共有テキスト中の URL でもよい。 */
export function parsePrRef(input: string): PrRef | null {
  const s = input.trim();
  const m =
    s.match(new RegExp(`github\\.com/(${NAME})/(${NAME})/pull/(\\d+)`, 'i')) ??
    s.match(new RegExp(`^/?(${NAME})/(${NAME})/pull/(\\d+)`)) ??
    s.match(new RegExp(`^(${NAME})/(${NAME})#(\\d+)$`));
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** `owner/repo` またはリポジトリの URL を解釈する。 */
export function parseRepoRef(input: string): RepoRef | null {
  const s = input.trim();
  const m =
    s.match(new RegExp(`github\\.com/(${NAME})/(${NAME})/?(?:[?#].*)?$`, 'i')) ?? s.match(new RegExp(`^(${NAME})/(${NAME})$`));
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

export const repoHash = (r: RepoRef) => `#/${r.owner}/${r.repo}`;

export function prHash(ref: PrRef, file?: number | null): string {
  const base = `#/${ref.owner}/${ref.repo}/pull/${ref.number}`;
  return file == null ? base : `${base}/f/${file}`;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
export const isImage = (path: string) => IMAGE_EXT.test(path);

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};
export const mimeOf = (path: string) =>
  MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

async function toError(res: Response, hasToken: boolean): Promise<GhError> {
  const s = res.status;
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    /* 本文なし */
  }
  if (s === 401) return new GhError('トークンが無効か期限切れです。設定し直してください。', s, false);
  if (s === 403 || s === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const at = reset ? new Date(reset).toLocaleTimeString() : '';
      return new GhError(
        `GitHub API のレート制限に達しました${at ? `（${at} に回復）` : ''}。` +
          (hasToken ? '' : 'トークンを設定すると上限が上がります。'),
        s,
        false,
      );
    }
    if (res.headers.get('retry-after') || /rate limit/i.test(detail))
      return new GhError('一時的なレート制限です。少し待って再試行してください。', s, true);
    return new GhError(`アクセスが拒否されました。トークンの権限を確認してください。${detail}`, s, false);
  }
  if (s === 404)
    return new GhError(
      hasToken
        ? '見つかりません。URL か、トークンがこのリポジトリを読めるかを確認してください。'
        : '見つかりません。private リポジトリの場合はトークンを設定してください。',
      s,
      false,
    );
  return new GhError(`GitHub API エラー (${s}) ${detail}`, s, s >= 500);
}

async function gh(path: string, token: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API + path, { headers });
  } catch {
    throw new GhError('ネットワークエラーで取得できませんでした。', 0, true);
  }
  if (!res.ok) throw await toError(res, !!token);
  return res;
}

const repoPath = (r: PrRef) => `/repos/${r.owner}/${r.repo}`;

export async function getPr(ref: PrRef, token: string): Promise<PrInfo> {
  const d = await (await gh(`${repoPath(ref)}/pulls/${ref.number}`, token)).json();
  return {
    title: d.title,
    state: d.state,
    merged: !!d.merged,
    draft: !!d.draft,
    author: d.user?.login ?? '',
    baseSha: d.base.sha,
    headSha: d.head.sha,
    changedFiles: d.changed_files,
    htmlUrl: d.html_url,
  };
}

/** GitHub の PR 差分と同じく merge base を「変更前」とする。取れなければ base の先頭で代用。 */
export async function getMergeBase(ref: PrRef, pr: PrInfo, token: string): Promise<string> {
  try {
    const d = await (
      await gh(`${repoPath(ref)}/compare/${pr.baseSha}...${pr.headSha}?per_page=1`, token)
    ).json();
    return d.merge_base_commit?.sha ?? pr.baseSha;
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return pr.baseSha;
    throw e;
  }
}

export async function listFiles(ref: PrRef, pr: PrInfo, token: string): Promise<PrFile[]> {
  // API の上限は 3000 ファイル (100 件 × 30 ページ)
  const pages = Math.min(30, Math.max(1, Math.ceil(pr.changedFiles / 100)));
  const out: PrFile[][] = new Array(pages);
  let next = 0;
  const worker = async () => {
    while (next < pages) {
      const p = next++;
      const res = await gh(`${repoPath(ref)}/pulls/${ref.number}/files?per_page=100&page=${p + 1}`, token);
      out[p] = await res.json();
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pages) }, worker));
  return out.flat();
}

export interface ImgSrc {
  ref: PrRef;
  sha: string;
  path: string;
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** 指定コミット時点のファイルを Blob で取得する。 */
export async function fetchBlob(src: ImgSrc, token: string): Promise<Blob> {
  let res: Response;
  if (token) {
    res = await gh(
      `${repoPath(src.ref)}/contents/${encPath(src.path)}?ref=${src.sha}`,
      token,
      'application/vnd.github.raw+json',
    );
  } else {
    // トークンなし (public) は raw から取り、API のレート制限 (60/h) を消費しない
    const url = `https://raw.githubusercontent.com/${src.ref.owner}/${src.ref.repo}/${src.sha}/${encPath(src.path)}`;
    try {
      res = await fetch(url);
    } catch {
      throw new GhError('ネットワークエラーで取得できませんでした。', 0, true);
    }
    if (!res.ok) throw await toError(res, false);
  }
  const blob = await res.blob();
  if (blob.size < 1024) {
    const head = await blob.slice(0, 64).text();
    if (head.startsWith('version https://git-lfs.github.com/spec/'))
      throw new GhError('Git LFS で管理された画像には未対応です。', 0, false);
  }
  return new Blob([blob], { type: mimeOf(src.path) });
}

interface GqlPr {
  number?: number;
  title: string;
  url: string;
  createdAt: string;
  isDraft: boolean;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  changedFiles: number;
  author?: { login: string } | null;
  files?: { nodes: ({ path: string } | null)[] } | null;
}

const GQL_FILES = 100;
const GQL_SEARCH = `query($q: String!) {
  search(query: $q, type: ISSUE_ADVANCED, first: 50) {
    nodes {
      ... on PullRequest {
        number title url createdAt isDraft state changedFiles
        author { login }
        files(first: ${GQL_FILES}) { nodes { path } }
      }
    }
  }
}`;

/**
 * PR (open / merged / closed すべて) を検索して新しい順に最大 50 件返す。条件は OR で結合する。
 *
 * GraphQL を使うのは、検索と各 PR の変更ファイル一覧を 1 リクエストで取れるため
 * (PR ごとに API を呼ばずに画像の変更数がわかる)。GraphQL は認証必須なので、一覧にはトークンが要る。
 * 条件ごとに検索を分けて 1 リクエストに並べると直列に実行されて遅い (4 本で約 8 秒) ので、
 * OR でつないだ 1 本の検索にしている (約 2 秒)。
 */
export async function searchPrs(qualifiers: string[], token: string): Promise<PrSummary[]> {
  const cond = qualifiers.length > 1 ? `(${qualifiers.join(' OR ')})` : qualifiers[0];
  let res: Response;
  try {
    res = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GQL_SEARCH, variables: { q: `is:pr ${cond} sort:created-desc` } }),
    });
  } catch {
    throw new GhError('ネットワークエラーで取得できませんでした。', 0, true);
  }
  if (!res.ok) throw await toError(res, true);
  const body = (await res.json()) as {
    data?: { search?: { nodes: (GqlPr | null)[] } | null };
    errors?: { message: string }[];
  };
  const nodes = body.data?.search?.nodes;
  if (!nodes) throw new GhError(`GitHub API エラー ${body.errors?.[0]?.message ?? ''}`, 0, false);
  return nodes.flatMap((n): PrSummary[] => {
    const ref = n?.url ? parsePrRef(n.url) : null;
    if (!n || !ref) return [];
    const paths = n.files?.nodes.flatMap((f) => (f ? [f.path] : []));
    const count = paths?.filter(isImage).length;
    // 先頭 100 ファイルに画像がなく、まだ続きがある場合は「不明」
    const images = count == null || (count === 0 && n.changedFiles > GQL_FILES) ? undefined : count;
    return [
      {
        ...ref,
        title: n.title,
        createdAt: n.createdAt,
        author: n.author?.login,
        draft: n.isDraft,
        state: n.state.toLowerCase() as PrSummary['state'],
        images,
      },
    ];
  });
}

/** ホームに出す新着 PR: 自分のリポジトリ、自分が関係する PR、最近見たリポジトリ。 */
export function listFeed(repos: RepoRef[], token: string): Promise<PrSummary[]> {
  return searchPrs(
    [...repos.map((r) => `repo:${r.owner}/${r.repo}`), 'user:@me', 'involves:@me', 'review-requested:@me'],
    token,
  );
}

export const listRepoPrs = (repo: RepoRef, token: string) => searchPrs([`repo:${repo.owner}/${repo.repo}`], token);
