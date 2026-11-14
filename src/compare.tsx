import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { ImgSrc, PrFile, PrRef } from './github';
import { loadImage, type Loaded } from './loader';
import { computeDiff, type DiffResult } from './pixeldiff';

export type Mode = '2up' | 'swipe' | 'onion' | 'diff';
export const MODES: { id: Mode; label: string }[] = [
  { id: '2up', label: '2-up' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'onion', label: 'Onion' },
  { id: 'diff', label: 'Diff' },
];

export interface Ctx {
  ref: PrRef;
  baseSha: string;
  headSha: string;
  token: string;
}

export type ImgState =
  | { status: 'none' }
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; img: Loaded }
  | { status: 'error'; message: string };

type DiffState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; result: DiffResult }
  | { status: 'error'; message: string };

export interface FileDiff {
  before: ImgState;
  after: ImgState;
  diff: DiffState;
  retry: () => void;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useImage(src: ImgSrc | null, token: string, enabled: boolean): [ImgState, () => void] {
  const [state, setState] = useState<ImgState>(src ? { status: 'idle' } : { status: 'none' });
  const [attempt, setAttempt] = useState(0);
  const key = src ? `${src.sha}:${src.path}` : '';
  useEffect(() => {
    if (!src) return setState({ status: 'none' });
    if (!enabled) return setState({ status: 'idle' });
    let alive = true;
    setState({ status: 'loading' });
    loadImage(src, token).then(
      (img) => alive && setState({ status: 'ok', img }),
      (e) => alive && setState({ status: 'error', message: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [key, token, enabled, attempt]);
  return [state, () => setAttempt((a) => a + 1)];
}

/** 1 ファイル分の変更前後の画像と、Diff モード時のピクセル差分を読み込む。 */
export function useFileDiff(file: PrFile, ctx: Ctx, mode: Mode, enabled: boolean): FileDiff {
  const beforeSrc =
    file.status === 'added' ? null : { ref: ctx.ref, sha: ctx.baseSha, path: file.previous_filename ?? file.filename };
  const afterSrc = file.status === 'removed' ? null : { ref: ctx.ref, sha: ctx.headSha, path: file.filename };
  const [before, retryBefore] = useImage(beforeSrc, ctx.token, enabled);
  const [after, retryAfter] = useImage(afterSrc, ctx.token, enabled);
  const [diff, setDiff] = useState<DiffState>({ status: 'idle' });

  const b = before.status === 'ok' ? before.img : null;
  const a = after.status === 'ok' ? after.img : null;
  useEffect(() => {
    if (mode !== 'diff' || !b || !a) return;
    let alive = true;
    setDiff({ status: 'loading' });
    computeDiff(b, a).then(
      (result) => alive && setDiff({ status: 'ok', result }),
      (e) => alive && setDiff({ status: 'error', message: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [mode, b, a]);

  return {
    before,
    after,
    diff,
    retry: () => {
      if (before.status === 'error') retryBefore();
      if (after.status === 'error') retryAfter();
    },
  };
}

export function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div class="tabs" role="tablist">
      {MODES.map((m) => (
        <button role="tab" aria-selected={m.id === mode} class={m.id === mode ? 'on' : ''} onClick={() => onChange(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  added: '追加',
  removed: '削除',
  modified: '変更',
  changed: '変更',
  renamed: '名前変更',
  copied: 'コピー',
};

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const dims = (i: Loaded) => `${i.w}×${i.h}`;

/** ファイル名・状態・寸法・(Diff モードなら) 変化量。 */
export function Info({ file, d, mode }: { file: PrFile; d: FileDiff; mode: Mode }) {
  const b = d.before.status === 'ok' ? d.before.img : null;
  const a = d.after.status === 'ok' ? d.after.img : null;
  let meta = '';
  if (b && a) {
    meta = dims(b) === dims(a) ? dims(a) : `${dims(b)} → ${dims(a)}`;
    meta += ` · ${kb(b.bytes)} → ${kb(a.bytes)}`;
  } else if (b || a) {
    const i = (b ?? a)!;
    meta = `${dims(i)} · ${kb(i.bytes)}`;
  }
  let diffText = '';
  if (mode === 'diff' && b && a && d.diff.status === 'ok') {
    const { changed, total } = d.diff.result;
    diffText =
      changed === 0
        ? 'ピクセル差分なし'
        : `${changed.toLocaleString()} px (${((changed / total) * 100).toFixed(changed / total < 0.001 ? 4 : 2)}%) が変化`;
  }
  return (
    <div class="info">
      <div class="info-name">
        <span class={`badge ${file.status}`}>{STATUS_LABEL[file.status] ?? file.status}</span>
        <span class="path">{file.filename}</span>
      </div>
      {file.previous_filename && <div class="meta">← {file.previous_filename}</div>}
      {(meta || diffText) && (
        <div class="meta">
          {meta}
          {diffText && <strong class={d.diff.status === 'ok' && d.diff.result.changed ? 'hot' : ''}> · {diffText}</strong>}
        </div>
      )}
    </div>
  );
}

export function PosSlider({ pos, onPos }: { pos: number; onPos: (p: number) => void }) {
  return (
    <label class="slider">
      <span>Before</span>
      <input
        type="range"
        min="0"
        max="100"
        step="0.5"
        value={pos}
        aria-label="比較位置"
        onInput={(e) => onPos(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span>After</span>
    </label>
  );
}

export interface Fit {
  w: number;
  h: number;
}

// fit があればその枠に収まる最大サイズ、なければ親の幅いっぱい (ただし原寸まで)
function box(w: number, h: number, fit?: Fit): JSX.CSSProperties {
  return fit ? { width: `${Math.min(fit.w, (fit.h * w) / h)}px` } : { width: '100%', maxWidth: `${w}px` };
}

interface StageProps {
  d: FileDiff;
  mode: Mode;
  pos: number;
  /** 指定すると Swipe モードで画像上のドラッグが有効になる */
  onPos?: (p: number) => void;
  fit?: Fit;
}

export function Stage({ d, mode, pos, onPos, fit }: StageProps) {
  const dragStart = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const errors = (
    [
      ['変更前', d.before],
      ['変更後', d.after],
    ] as const
  ).flatMap(([label, s]) => (s.status === 'error' ? [`${label}: ${s.message}`] : []));
  if (errors.length)
    return (
      <div class="ph error" onClick={(e) => e.stopPropagation()}>
        {errors.map((m) => (
          <p>{m}</p>
        ))}
        <button onClick={d.retry}>再試行</button>
      </div>
    );
  if ([d.before, d.after].some((s) => s.status === 'idle' || s.status === 'loading'))
    return <div class="ph">読み込み中…</div>;

  const b = d.before.status === 'ok' ? d.before.img : null;
  const a = d.after.status === 'ok' ? d.after.img : null;
  if (!b || !a) {
    const i = (b ?? a)!;
    return (
      <div class="stage checker" style={{ ...box(i.w, i.h, fit), aspectRatio: `${i.w}/${i.h}` }}>
        <img src={i.url} alt="" draggable={false} />
      </div>
    );
  }

  const W = Math.max(b.w, a.w);
  const H = Math.max(b.h, a.h);

  if (mode === '2up')
    return (
      <div class="twoup" style={box(W * 2 + 8, H, fit)}>
        {[b, a].map((i, n) => (
          <div class={`cell ${n ? 'after' : 'before'}`}>
            <div class="checker" style={{ width: `${(i.w / W) * 100}%`, aspectRatio: `${i.w}/${i.h}` }}>
              <img src={i.url} alt={n ? '変更後' : '変更前'} draggable={false} />
            </div>
          </div>
        ))}
      </div>
    );

  const stageStyle = { ...box(W, H, fit), aspectRatio: `${W}/${H}` };

  if (mode === 'diff') {
    if (d.diff.status === 'error') return <div class="ph error">{d.diff.message}</div>;
    if (d.diff.status !== 'ok') return <div class="ph">差分を計算中…</div>;
    return (
      <div class="stage" style={stageStyle}>
        <img src={d.diff.result.url} alt="ピクセル差分" draggable={false} />
      </div>
    );
  }

  const swipe = mode === 'swipe';
  const draggable = swipe && !!onPos;
  const move = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (dragStart.current == null || !el.hasPointerCapture(e.pointerId)) return;
    // タップ (拡大表示) と区別するため、少し動いてからドラッグ扱いにする
    if (!suppressClick.current && Math.abs(e.clientX - dragStart.current) < 4) return;
    suppressClick.current = true;
    const r = el.getBoundingClientRect();
    onPos!(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  const handlers = draggable
    ? {
        onPointerDown: (e: PointerEvent) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragStart.current = e.clientX;
          suppressClick.current = false;
        },
        onPointerMove: move,
        onPointerUp: () => (dragStart.current = null),
        onPointerCancel: () => (dragStart.current = null),
        onClickCapture: (e: MouseEvent) => {
          if (suppressClick.current) e.stopPropagation();
          suppressClick.current = false;
        },
      }
    : {};

  return (
    <div class={`stage checker ${draggable ? 'draggable' : ''}`} style={stageStyle} {...handlers}>
      <div class={`layer ${swipe ? 'checker' : ''}`}>
        <img src={b.url} alt="変更前" draggable={false} style={{ width: `${(b.w / W) * 100}%` }} />
      </div>
      <div
        class={`layer ${swipe ? 'checker' : ''}`}
        style={swipe ? { clipPath: `inset(0 0 0 ${pos}%)` } : { opacity: pos / 100 }}
      >
        <img src={a.url} alt="変更後" draggable={false} style={{ width: `${(a.w / W) * 100}%` }} />
      </div>
      {swipe && <div class="divider" style={{ left: `${pos}%` }} />}
    </div>
  );
}
