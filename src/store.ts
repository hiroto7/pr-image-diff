import type { PrSummary } from './github';

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

export function addRecent(pr: PrSummary) {
  const same = (a: PrSummary) => a.owner === pr.owner && a.repo === pr.repo && a.number === pr.number;
  write('recents', JSON.stringify([pr, ...getRecents().filter((r) => !same(r))].slice(0, 12)));
}
