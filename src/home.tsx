import { useEffect, useState } from 'preact/hooks';
import {
  LIST_SIZE,
  listRepoPrs,
  parsePrRef,
  parseRepoRef,
  prHash,
  repoHash,
  type PrSummary,
  type RepoRef,
} from './github';
import { addRecentRepo, getCachedList, getRecentRepos, getRecents, removeRecentRepo, setCachedList } from './store';

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

function PrList({ items, showRepo = true }: { items: PrSummary[]; showRepo?: boolean }) {
  return (
    <ul class="pr-list">
      {items.map((p) => (
        <li class={p.images === 0 ? 'dim' : ''}>
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
              {p.images != null &&
                (p.images > 0 ? <strong class="has-images"> · 画像 {p.images}</strong> : ' · 画像なし')}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

const NEED_TOKEN =
  'リポジトリの PR 一覧を出すには GitHub トークンの設定が必要です。PR の URL を指定して開く場合は、public リポジトリならトークンなしで表示できます。';

type Loadable =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  // refreshing: 前回の一覧を表示しつつ再取得中 / error: 再取得に失敗して前回の一覧を表示中
  | { status: 'ok'; items: PrSummary[]; refreshing?: boolean; error?: string };

/** cacheKey を渡すと、前回の結果をすぐ表示してから裏で取り直す。 */
function useLoad(load: () => Promise<PrSummary[]>, deps: unknown[], cacheKey?: string): [Loadable, () => void] {
  const initial = (): Loadable => {
    const cached = cacheKey ? getCachedList(cacheKey) : null;
    return cached ? { status: 'ok', items: cached, refreshing: true } : { status: 'loading' };
  };
  const [state, setState] = useState<Loadable>(initial);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const start = initial();
    setState(start);
    load().then(
      (items) => {
        if (cacheKey) setCachedList(cacheKey, items);
        if (alive) setState({ status: 'ok', items });
      },
      (e) => {
        const message = e instanceof Error ? e.message : String(e);
        if (alive) setState(start.status === 'ok' ? { status: 'ok', items: start.items, error: message } : { status: 'error', message });
      },
    );
    return () => {
      alive = false;
    };
  }, [...deps, cacheKey, attempt]);
  return [state, () => setAttempt((a) => a + 1)];
}

function Loaded({ state, retry, empty, showRepo }: { state: Loadable; retry: () => void; empty: string; showRepo?: boolean }) {
  if (state.status === 'loading') return <p class="meta">読み込み中…</p>;
  const error = state.status === 'error' ? state.message : state.error;
  return (
    <>
      {error && (
        <p class="error-text">
          {error} <button onClick={retry}>再試行</button>
        </p>
      )}
      {state.status === 'ok' && state.refreshing && <p class="meta refreshing">更新中…</p>}
      {state.status === 'ok' &&
        (state.items.length ? <PrList items={state.items} showRepo={showRepo} /> : <p class="meta">{empty}</p>)}
    </>
  );
}

export function Home({ token, onToken }: { token: string; onToken: (t: string) => void }) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [draft, setDraft] = useState('');
  const recents = getRecents();
  const repos = getRecentRepos();

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

      {token && repos.length > 0 && (
        <section>
          <h2>最近見たリポジトリ</h2>
          <ul class="pr-list">
            {repos.map((r) => (
              <li>
                <a class="repo-row" href={repoHash(r)}>
                  <span class="title">
                    {r.owner}/{r.repo}
                  </span>
                  <span class="meta">PR 一覧 ›</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!token && <p class="notice">{NEED_TOKEN}</p>}

      {recents.length > 0 && (
        <section>
          <h2>最近開いた PR</h2>
          <PrList items={recents} />
        </section>
      )}

      <details class="settings" open={!token}>
        <summary>GitHub トークン{token ? '（設定済み）' : '（未設定）'}</summary>
        <p class="meta">
          private リポジトリを見るには Personal Access Token が必要です。fine-grained トークンなら対象リポジトリの
          <b> Contents: Read-only </b>と<b> Pull requests: Read-only </b>
          を付けてください。トークンはこのブラウザの localStorage にだけ保存され、api.github.com 以外には送信しません。
          未設定でも、public リポジトリの PR は URL を指定すれば表示できます。リポジトリの PR 一覧を出すにはトークンが必要です。
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
  const [state, retry] = useLoad(() => (token ? listRepoPrs(repo, token) : Promise.resolve([])),
    [name, token],
    token ? `repo:${name}` : undefined,
  );
  useEffect(() => {
    if (token && state.status === 'ok') addRecentRepo(repo);
  }, [state.status, name, token]);

  return (
    <>
      <header class="bar">
        <div class="bar-row">
          <a class="icon-btn" href="#/" aria-label="ホームへ戻る">
            ‹
          </a>
          <div class="bar-title">
            <div class="title">{name}</div>
            <div class="meta">PR（新しい順・最新 {LIST_SIZE} 件）</div>
          </div>
          <a class="icon-btn small" href={`https://github.com/${name}/pulls`} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>
      <main class="home repo">
        {token ? (
          <Loaded state={state} retry={retry} empty="PR はありません。" showRepo={false} />
        ) : (
          <p class="notice">
            {NEED_TOKEN} <a href="#/">ホームで設定する</a>
          </p>
        )}
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
