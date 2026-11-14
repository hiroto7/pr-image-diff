import type { Loaded } from './loader';

export interface DiffResult {
  url: string;
  changed: number;
  total: number;
}

// スマホの canvas 上限 (iOS は約 1670 万 px) とメモリを考慮して、これを超える画像は縮小して比較する
const MAX_PIXELS = 8_000_000;
// 各チャンネル差の合計がこれを超えたら「変化あり」
const THRESHOLD = 12;

const cache = new Map<string, Promise<DiffResult>>();

export function computeDiff(before: Loaded, after: Loaded): Promise<DiffResult> {
  const key = `${before.url}|${after.url}`;
  let p = cache.get(key);
  if (!p) {
    p = run(before, after);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function run(before: Loaded, after: Loaded): Promise<DiffResult> {
  const w = Math.max(before.w, after.w);
  const h = Math.max(before.h, after.h);
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas を利用できません。');

  const read = (img: Loaded) => {
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img.el, 0, 0, img.w * scale, img.h * scale);
    return ctx.getImageData(0, 0, cw, ch);
  };
  const a = read(before).data;
  const outImg = read(after);
  const b = outImg.data;

  let changed = 0;
  for (let i = 0; i < b.length; i += 4) {
    const d =
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]) +
      Math.abs(a[i + 3] - b[i + 3]);
    if (d > THRESHOLD) {
      changed++;
      b[i] = 255;
      b[i + 1] = 0;
      b[i + 2] = 128;
      b[i + 3] = 255;
    } else {
      // 変化のない部分は、変更後の画像を白っぽいグレーに落として背景にする
      const alpha = b[i + 3] / 255;
      const lum = (0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]) * alpha + 255 * (1 - alpha);
      const v = Math.round(lum * 0.3 + 255 * 0.7);
      b[i] = b[i + 1] = b[i + 2] = v;
      b[i + 3] = 255;
    }
  }
  ctx.putImageData(outImg, 0, 0);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('差分画像を生成できませんでした。');
  return { url: URL.createObjectURL(blob), changed, total: cw * ch };
}
