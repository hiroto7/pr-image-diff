import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { getMergeBase, getPr, isImage, listFiles, type PrFile, type PrInfo, type PrRef } from './github';
import { Info, ModeTabs, PosSlider, Stage, useFileDiff, type Ctx, type Mode } from './compare';
import { Viewer } from './viewer';
import { addRecent } from './store';

interface Data {
  pr: PrInfo;
  ctx: Ctx;
  images: PrFile[];
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: Data };

interface Props {
  prRef: PrRef;
  token: string;
  fileIndex: number | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  onOpenFile: (i: number) => void;
  onNavFile: (i: number) => void;
  onCloseFile: () => void;
}

export function PrView({ prRef, token, fileIndex, mode, setMode, onOpenFile, onNavFile, onCloseFile }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    (async () => {
      const pr = await getPr(prRef, token);
      addRecent({ ...prRef, title: pr.title });
      const [baseSha, files] = await Promise.all([getMergeBase(prRef, pr, token), listFiles(prRef, pr, token)]);
      const images = files.filter((f) => isImage(f.filename) && f.status !== 'unchanged');
      return { pr, images, ctx: { ref: prRef, baseSha, headSha: pr.headSha, token } };
    })().then(
      (data) => alive && setState({ status: 'ok', data }),
      (e) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [prRef.owner, prRef.repo, prRef.number, token, attempt]);

  const data = state.status === 'ok' ? state.data : null;
  const name = `${prRef.owner}/${prRef.repo}#${prRef.number}`;
  useEffect(() => {
    document.title = data ? `${data.pr.title} · ${name}` : name;
    return () => {
      document.title = 'PR Image Diff';
    };
  }, [data, name]);

  return (
    <>
      <header class="bar">
        <div class="bar-row">
          <a class="icon-btn" href="#/" aria-label="ホームへ戻る">
            ‹
          </a>
          <div class="bar-title">
            <div class="title">{data ? data.pr.title : name}</div>
            <div class="meta">
              {name}
              {data && ` · 画像 ${data.images.length} / 全 ${data.pr.changedFiles} ファイル`}
            </div>
          </div>
          <a
            class="icon-btn small"
            href={`https://github.com/${prRef.owner}/${prRef.repo}/pull/${prRef.number}/files`}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
        {data && data.images.length > 0 && <ModeTabs mode={mode} onChange={setMode} />}
      </header>

      <main class="list">
        {state.status === 'loading' && <div class="ph">PR を読み込み中…</div>}
        {state.status === 'error' && (
          <div class="ph error">
            <p>{state.message}</p>
            <button onClick={() => setAttempt((a) => a + 1)}>再試行</button>
            <a href="#/">ホームへ戻る</a>
          </div>
        )}
        {data && data.images.length === 0 && <div class="ph">この PR には画像の変更がありません。</div>}
        {data && data.pr.changedFiles > 3000 && (
          <p class="note">変更ファイルが 3000 件を超えているため、一部の画像は表示されません (GitHub API の上限)。</p>
        )}
        {data?.images.map((f, i) => (
          <Card key={f.filename} file={f} ctx={data.ctx} mode={mode} onOpen={() => onOpenFile(i)} />
        ))}
      </main>

      {data && fileIndex != null && data.images[fileIndex] && (
        <Viewer
          files={data.images}
          index={fileIndex}
          ctx={data.ctx}
          mode={mode}
          setMode={setMode}
          onClose={onCloseFile}
          onNav={onNavFile}
        />
      )}
    </>
  );
}

/** 画面に近づいたら true になり、以後は true のまま。 */
function useNearViewport(): [RefObject<HTMLElement>, boolean] {
  const el = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!el.current || near) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '800px 0px',
    });
    io.observe(el.current);
    return () => io.disconnect();
  }, [near]);
  return [el, near];
}

function Card({ file, ctx, mode, onOpen }: { file: PrFile; ctx: Ctx; mode: Mode; onOpen: () => void }) {
  const [el, near] = useNearViewport();
  const d = useFileDiff(file, ctx, mode, near);
  const [pos, setPos] = useState(50);
  const both = d.before.status === 'ok' && d.after.status === 'ok';
  return (
    <section class="card" ref={el}>
      <Info file={file} d={d} mode={mode} />
      <div class="card-body" onClick={onOpen}>
        <Stage d={d} mode={mode} pos={pos} onPos={setPos} />
      </div>
      {both && mode === 'onion' && <PosSlider pos={pos} onPos={setPos} />}
    </section>
  );
}
