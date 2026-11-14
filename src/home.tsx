import { useEffect, useState } from 'preact/hooks';
import { listMyPrs, parsePrRef, prHash, type PrSummary } from './github';
import { getRecents } from './store';

function PrList({ items }: { items: PrSummary[] }) {
  return (
    <ul class="pr-list">
      {items.map((p) => (
        <li>
          <a href={prHash(p)}>
            <div class="title">{p.title}</div>
            <div class="meta">
              {p.owner}/{p.repo}#{p.number}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Home({ token, onToken }: { token: string; onToken: (t: string) => void }) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [draft, setDraft] = useState('');
  const [mine, setMine] = useState<{ items?: PrSummary[]; error?: string }>({});
  const recents = getRecents();

  useEffect(() => {
    if (!token) return setMine({});
    let alive = true;
    listMyPrs(token).then(
      (items) => alive && setMine({ items }),
      (e) => alive && setMine({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [token]);

  const open = (e: Event) => {
    e.preventDefault();
    const ref = parsePrRef(input);
    if (!ref) return setInputError('PR の URL か owner/repo#123 の形式で入力してください。');
    location.hash = prHash(ref);
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
          placeholder="https://github.com/owner/repo/pull/123"
          aria-label="PR の URL"
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

      {token && (
        <section>
          <h2>自分が関係する open な PR</h2>
          {mine.error && <p class="error-text">{mine.error}</p>}
          {!mine.error && !mine.items && <p class="meta">読み込み中…</p>}
          {mine.items && (mine.items.length ? <PrList items={mine.items} /> : <p class="meta">ありません。</p>)}
        </section>
      )}

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
          未設定でも public リポジトリは表示できます。
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
