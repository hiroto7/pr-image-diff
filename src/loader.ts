import { fetchBlob, GhError, type ImgSrc } from './github';

export interface Loaded {
  url: string;
  el: HTMLImageElement;
  w: number;
  h: number;
  bytes: number;
}

// 同時接続数を絞って、画像が多い PR でも取りこぼさないようにする
const MAX_CONCURRENT = 6;
const RETRIES = 3;

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(src: ImgSrc, token: string): Promise<Blob> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchBlob(src, token);
    } catch (e) {
      const retryable = e instanceof GhError ? e.retryable : true;
      if (!retryable || attempt >= RETRIES) throw e;
      await sleep(500 * 2 ** attempt + Math.random() * 300);
    }
  }
}

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new GhError('画像としてデコードできませんでした。', 0, false));
    el.src = url;
  });
}

const cache = new Map<string, Promise<Loaded>>();
const loaded = new Map<string, Loaded>();
const keyOf = (s: ImgSrc) => `${s.ref.owner}/${s.ref.repo}@${s.sha}:${s.path}`;

/** 取得済みの画像があれば、待たずに返す。 */
export const peekImage = (src: ImgSrc) => loaded.get(keyOf(src));

export function loadImage(src: ImgSrc, token: string): Promise<Loaded> {
  const key = keyOf(src);
  let p = cache.get(key);
  if (!p) {
    p = withSlot(async () => {
      const blob = await fetchWithRetry(src, token);
      const url = URL.createObjectURL(blob);
      try {
        const el = await decode(url);
        // SVG などで固有サイズがない場合の保険
        return { url, el, w: el.naturalWidth || 300, h: el.naturalHeight || 150, bytes: blob.size };
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
    });
    cache.set(key, p);
    p.then((img) => loaded.set(key, img), () => {});
    // 失敗はキャッシュしない (再試行できるように)
    p.catch(() => cache.get(key) === p && cache.delete(key));
  }
  return p;
}
