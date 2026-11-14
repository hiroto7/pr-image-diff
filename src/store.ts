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
export const saveToken = (t: string) => write('gh_token', t || null);

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

// PR ごとの画像変更数のキャッシュ。PR の更新日時が変わったら無効。
type CountCache = Record<string, { u: string; c: number }>;

function readCounts(): CountCache {
  try {
    return JSON.parse(read('imgcounts') ?? '{}');
  } catch {
    return {};
  }
}

/** updatedAt を渡さない場合は、古いかもしれないキャッシュでも返す。 */
export function getCachedCount(key: string, updatedAt?: string): number | null {
  const e = readCounts()[key];
  return e && (!updatedAt || e.u === updatedAt) ? e.c : null;
}

export function setCachedCount(key: string, updatedAt: string, count: number) {
  const all = readCounts();
  delete all[key];
  all[key] = { u: updatedAt, c: count };
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete all[k];
  write('imgcounts', JSON.stringify(all));
}
