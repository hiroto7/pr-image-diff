import { useEffect, useState } from 'preact/hooks';
import {
  listFeed,
  listRepoPrs,
  parsePrRef,
  parseRepoRef,
  prHash,
  repoHash,
  type PrSummary,
  type RepoRef,
} from './github';
import { imageCount } from './imagecount';
import { addRecentRepo, getRecentRepos, getRecents, removeRecentRepo } from './store';

const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
function ago(iso: string): string {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const hours = Math.round(min / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30), 'month');
}

const STATE_LABEL = { open: 'Open', merged: 'Merged', closed: 'Closed' };

function PrItem({ p, showRepo, token }: { p: PrSummary; showRepo: boolean; token: string }) {
  // undefined: 調査中 / null: 不明 / 数値: 画像の変更数
  const [images, setImages] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setImages(undefined);
    imageCount(p, token).then((n) => alive && setImages(n));
    return () => {
      alive = false;
    };
  }, [p.owner, p.repo, p.number, p.updatedAt, token]);

  return (
    <li class={images === 0 ? 'dim' : ''}>
      <a href={prHash(p)}>
        <div class="title">{p.title}</div>
        <div class="meta">
          {p.state && <span class={`badge st-${p.state}`}>{STATE_LABEL[p.state]}</span>}{' '}
          {[
            showRepo ? `${p.owner}/${p.repo}#${p.number}` : `#${p.number}`,
            p.author,
            p.createdAt && ago(p.createdAt),
            p.draft && p.state === 'open' && 'Draft',
          ]
            .filter(Boolean)
            .join(' · ')}
          {images != null && (images > 0 ? <strong class="has-images"> · 画像 {images}</strong> : ' · 画像なし')}
        </div>
      </a>
    </li>
  );
}

function PrList({ items, token, showRepo = true }: { items: PrSummary[]; token: string; showRepo?: boolean }) {
  return (
    <ul class="pr-list">
      {items.map((p) => (
        <PrItem key={`${p.owner}/${p.repo}#${p.number}`} p={p} showRepo={showRepo} token={token} />
      ))}
    </ul>
  );
}

type Loadable = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; items: PrSummary[] };

function useLoad(load: () => Promise<PrSummary[]>, deps: unknown[]): [Loadable, () => void] {
  const [state, setState] = useState<Loadable>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load().then(
      (items) => alive && setState({ status: 'ok', items }),
      (e) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [...deps, attempt]);
  return [state, () => setAttempt((a) => a + 1)];
}

function Loaded(props: { state: Loadable; retry: () => void; empty: string; token: string; showRepo?: boolean }) {
  const { state, retry, empty, token, showRepo } = props;
  if (state.status === 'loading') return <p class="meta">読み込み中…</p>;
  if (state.status === 'error')
    return (
      <p class="error-text">
        {state.message} <button onClick={retry}>再試行</button>
      </p>
    );
  return state.items.length ? <PrList items={state.items} token={token} showRepo={showRepo} /> : <p class="meta">{empty}</p>;
}

export function Home({ token, onToken }: { token: string; onToken: (t: string) => void }) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [draft, setDraft] = useState('');
  const recents = getRecents();
  const repos = getRecentRepos();
  const hasFeed = !!token || repos.length > 0;
  const [feed, retryFeed] = useLoad(() => listFeed(repos, token), [token, repos.map(repoHash).join()]);

  const open = (e: Event) => {
    e.preventDefault();
    const pr = parsePrRef(input);
    const repo = pr ? null : parseRepoRef(input);
    if (pr) location.hash = prHash(pr);
    else if (repo) location.hash = repoHash(repo);
    else setInputError('PR の URL、owner/repo#123、または owner/repo の形式で入力してください。');
  };

  return (
    <main class="home">
      <h1>PR Image Diff</h1>
      <p class="lead">GitHub の PR に含まれる画像差分を確認します。</p>

      <form class="open" onSubmit={open}>
        <input
          type="text"
          inputMode="url"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          placeholder="PR の URL または owner/repo"
          aria-label="PR の URL またはリポジトリ"
          value={input}
          onInput={(e) => {
            setInput((e.currentTarget as HTMLInputElement).value);
            setInputError('');
          }}
        />
        <button type="submit" class="primary">
          開く
        </button>
      </form>
      {inputError && <p class="error-text">{inputError}</p>}

      {repos.length > 0 && (
        <section>
          <h2>リポジトリ</h2>
          <div class="chips">
            {repos.map((r) => (
              <a class="chip" href={repoHash(r)}>
                {r.owner}/{r.repo}
              </a>
            ))}
          </div>
        </section>
      )}

      {hasFeed && (
        <section>
          <h2>新しい PR{token ? '（自分のリポジトリ・関係する PR・最近見たリポジトリ）' : '（最近見たリポジトリ）'}</h2>
          <Loaded state={feed} retry={retryFeed} empty="PR はありません。" token={token} />
        </section>
      )}

      {recents.length > 0 && (
        <section>
          <h2>最近開いた PR</h2>
          <PrList items={recents} token={token} />
        </section>
      )}

      <details class="settings" open={!token}>
        <summary>GitHub トークン{token ? '（設定済み）' : '（未設定）'}</summary>
        <p class="meta">
          private リポジトリを見るには Personal Access Token が必要です。fine-grained トークンなら対象リポジトリの
          <b> Contents: Read-only </b>と<b> Pull requests: Read-only </b>
          を付けてください。トークンはこのブラウザの localStorage にだけ保存され、api.github.com 以外には送信しません。
          未設定でも public リポジトリは表示できます。設定すると、自分のリポジトリや自分が関係する PR も一覧に出ます。
        </p>
        <p class="meta">
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
            トークンを作成する (GitHub)
          </a>
        </p>
        <form
          class="open"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onToken(draft.trim());
            setDraft('');
          }}
        >
          <input
            type="password"
            autocomplete="off"
            placeholder={token ? '新しいトークンで置き換える' : 'github_pat_…'}
            aria-label="GitHub トークン"
            value={draft}
            onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit">保存</button>
        </form>
        {token && (
          <button class="danger" onClick={() => onToken('')}>
            トークンを削除
          </button>
        )}
      </details>
    </main>
  );
}

/** 1 リポジトリの PR 一覧。開くと「最近見たリポジトリ」に入り、ホームの新着にも出るようになる。 */
export function RepoView({ repo, token }: { repo: RepoRef; token: string }) {
  const name = `${repo.owner}/${repo.repo}`;
  const [state, retry] = useLoad(() => listRepoPrs(repo, token), [name, token]);
  useEffect(() => {
    if (state.status === 'ok') addRecentRepo(repo);
  }, [state.status, name]);

  return (
    <>
      <header class="bar">
        <div class="bar-row">
          <a class="icon-btn" href="#/" aria-label="ホームへ戻る">
            ‹
          </a>
          <div class="bar-title">
            <div class="title">{name}</div>
            <div class="meta">PR（新しい順・最大 30 件）</div>
          </div>
          <a class="icon-btn small" href={`https://github.com/${name}/pulls`} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>
      <main class="home repo">
        <Loaded state={state} retry={retry} empty="PR はありません。" token={token} showRepo={false} />
        <button
          class="danger"
          onClick={() => {
            removeRecentRepo(repo);
            location.hash = '#/';
          }}
        >
          このリポジトリをホームから外す
        </button>
      </main>
    </>
  );
}
