import { countImages, hasCoreBudget, type PrSummary } from './github';
import { getCachedCount, setCachedCount } from './store';

// 一覧の各 PR に「画像の変更が何件あるか」を付けるための調査。
// PR 1 件につき API を 1 回以上使うので、同時実行を絞り、結果は localStorage にキャッシュする。
const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];
const inflight = new Map<string, Promise<number | null>>();

const keyOf = (p: PrSummary) => `${p.owner}/${p.repo}#${p.number}`;

/** 画像の変更数。調べられない・調べていない場合は null (= 不明)。 */
export function imageCount(p: PrSummary, token: string): Promise<number | null> {
  const key = keyOf(p);
  const cached = getCachedCount(key, p.updatedAt);
  if (cached != null) return Promise.resolve(cached);
  // 更新日時がわからない PR (履歴) は、キャッシュがなければ調べない
  if (!p.updatedAt) return Promise.resolve(null);

  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
      active++;
      try {
        // トークンなしは 60 回/時 しかないので、PR を開く分を残して打ち切る
        if (!hasCoreBudget(token)) return null;
        const n = await countImages(p, token);
        if (n != null) setCachedCount(key, p.updatedAt!, n);
        return n;
      } catch {
        return null;
      } finally {
        active--;
        waiting.shift()?.();
        inflight.delete(key);
      }
    })();
    inflight.set(key, job);
  }
  return job;
}
