import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { PrFile } from './github';
import { Info, ModeTabs, PosSlider, Stage, useFileDiff, type Ctx, type Fit, type Mode } from './compare';

interface Props {
  files: PrFile[];
  index: number;
  ctx: Ctx;
  mode: Mode;
  setMode: (m: Mode) => void;
  onClose: () => void;
  onNav: (i: number) => void;
}

/** 全画面ビューア。ピンチ/ホイールで拡大、ドラッグで移動、ダブルタップで拡大切替。 */
export function Viewer({ files, index, ctx, mode, setMode, onClose, onNav }: Props) {
  const file = files[index];
  const d = useFileDiff(file, ctx, mode, true);
  const [pos, setPos] = useState(50);
  const both = d.before.status === 'ok' && d.after.status === 'ok';
  const prev = index > 0 ? () => onNav(index - 1) : undefined;
  const next = index < files.length - 1 ? () => onNav(index + 1) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev?.();
      else if (e.key === 'ArrowRight') next?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    document.body.classList.add('locked');
    return () => document.body.classList.remove('locked');
  }, []);

  return (
    <div class="viewer" role="dialog" aria-modal="true">
      <div class="viewer-head">
        <button class="icon-btn" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
        <Info file={file} d={d} mode={mode} />
      </div>
      <ModeTabs mode={mode} onChange={setMode} />
      <ZoomPan resetKey={index}>{(fit) => <Stage d={d} mode={mode} pos={pos} fit={fit} />}</ZoomPan>
      {both && (mode === 'swipe' || mode === 'onion') && <PosSlider pos={pos} onPos={setPos} />}
      <div class="viewer-nav">
        <button disabled={!prev} onClick={prev}>
          ‹ 前へ
        </button>
        <span>
          {index + 1} / {files.length}
        </span>
        <button disabled={!next} onClick={next}>
          次へ ›
        </button>
      </div>
    </div>
  );
}

const MAX_SCALE = 16;

function ZoomPan({ resetKey, children }: { resetKey: unknown; children: (fit: Fit) => ComponentChildren }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const t = useRef({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  const moved = useRef(false);

  const apply = () => {
    const el = outer.current;
    if (!el || !inner.current) return;
    const v = t.current;
    v.s = Math.min(MAX_SCALE, Math.max(1, v.s));
    // 拡大した中身が枠の外へ行き過ぎないようにする
    v.x = Math.min(0, Math.max(el.clientWidth * (1 - v.s), v.x));
    v.y = Math.min(0, Math.max(el.clientHeight * (1 - v.s), v.y));
    inner.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const v = t.current;
    const ns = Math.min(MAX_SCALE, Math.max(1, v.s * factor));
    v.x = cx - (cx - v.x) * (ns / v.s);
    v.y = cy - (cy - v.y) * (ns / v.s);
    v.s = ns;
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = outer.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useLayoutEffect(() => {
    t.current = { s: 1, x: 0, y: 0 };
    apply();
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = outer.current!;
    const measure = () => {
      setFit({ w: el.clientWidth, h: el.clientHeight });
      apply();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // preventDefault するため passive: false で登録する
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
      apply();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const onDown = (e: PointerEvent) => {
    outer.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) moved.current = false;
  };

  const onMove = (e: PointerEvent) => {
    const ps = pointers.current;
    const before = ps.get(e.pointerId);
    if (!before) return;
    const now = local(e);
    if (Math.hypot(now.x - before.x, now.y - before.y) > 0) moved.current = true;
    const v = t.current;
    if (ps.size === 1) {
      v.x += now.x - before.x;
      v.y += now.y - before.y;
    } else if (ps.size === 2) {
      const other = [...ps.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(before.x - other.x, before.y - other.y) || 1;
      const d1 = Math.hypot(now.x - other.x, now.y - other.y) || 1;
      const m0 = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
      const m1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
      zoomAt(m0.x, m0.y, d1 / d0);
      v.x += m1.x - m0.x;
      v.y += m1.y - m0.y;
    }
    ps.set(e.pointerId, now);
    apply();
  };

  const onUp = (e: PointerEvent) => {
    const ps = pointers.current;
    if (!ps.delete(e.pointerId)) return;
    if (e.type !== 'pointerup' || ps.size > 0 || moved.current) return;
    // ダブルタップ: 等倍 ⇄ 3 倍
    const p = local(e);
    const last = lastTap.current;
    if (e.timeStamp - last.time < 320 && Math.hypot(p.x - last.x, p.y - last.y) < 30) {
      if (t.current.s > 1.01) t.current = { s: 1, x: 0, y: 0 };
      else zoomAt(p.x, p.y, 3);
      apply();
      lastTap.current.time = 0;
    } else {
      lastTap.current = { time: e.timeStamp, x: p.x, y: p.y };
    }
  };

  return (
    <div
      class="zoom"
      ref={outer}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div class="zoom-inner" ref={inner}>
        {fit && children(fit)}
      </div>
    </div>
  );
}
