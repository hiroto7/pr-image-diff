import type { PrSummary, RepoRef } from './github';

// localStorage が使えない環境 (プライベートブラウズ等) でも落ちないようにする
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 保存できなくても動作は続ける */
  }
}

export const getToken = () => read('gh_token') ?? '';
export function saveToken(t: string) {
  write('gh_token', t || null);
  // トークンで取得した一覧 (private な PR のタイトルを含みうる) は、トークンを変えたら捨てる
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('list:')) localStorage.removeItem(k);
  } catch {
    /* 何もしない */
  }
}

/** 前回取得した PR 一覧。次に開いたとき、再取得が終わるまでの表示に使う。 */
export function getCachedList(key: string): PrSummary[] | null {
  try {
    return JSON.parse(read(`list:${key}`) ?? 'null');
  } catch {
    return null;
  }
}
export const setCachedList = (key: string, items: PrSummary[]) => write(`list:${key}`, JSON.stringify(items));

export const getSavedMode = () => read('mode');
export const saveMode = (m: string) => write('mode', m);

export function getRecents(): PrSummary[] {
  try {
    return JSON.parse(read('recents') ?? '[]');
  } catch {
    return [];
  }
}

/** 最近見たリポジトリ (新しい順)。PR を開いたとき・リポジトリ画面を開いたときに記録する。 */
export function getRecentRepos(): RepoRef[] {
  let stored: RepoRef[] = [];
  try {
    stored = JSON.parse(read('repos') ?? '[]');
  } catch {
    /* 壊れていたら空扱い */
  }
  const seen = new Set<string>();
  return [...stored, ...getRecents()]
    .map(({ owner, repo }) => ({ owner, repo }))
    .filter((r) => {
      const k = `${r.owner}/${r.repo}`.toLowerCase();
      return !seen.has(k) && !!seen.add(k);
    })
    .slice(0, 8);
}

export function addRecentRepo(repo: RepoRef) {
  const same = (r: RepoRef) => r.owner === repo.owner && r.repo === repo.repo;
  write('repos', JSON.stringify([repo, ...getRecentRepos().filter((r) => !same(r))].slice(0, 8)));
}

export function removeRecentRepo(repo: RepoRef) {
  const same = (r: RepoRef) => r.owner === repo.owner && r.repo === repo.repo;
  write('repos', JSON.stringify(getRecentRepos().filter((r) => !same(r))));
  write('recents', JSON.stringify(getRecents().filter((r) => !same(r))));
}

export function addRecent(pr: PrSummary) {
  addRecentRepo({ owner: pr.owner, repo: pr.repo });
  const same = (a: PrSummary) => a.owner === pr.owner && a.repo === pr.repo && a.number === pr.number;
  write('recents', JSON.stringify([pr, ...getRecents().filter((r) => !same(r))].slice(0, 12)));
}
