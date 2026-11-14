import { useEffect, useState } from 'preact/hooks';
import { prHash, type PrRef, type RepoRef } from './github';
import { MODES, type Mode } from './compare';
import { Home, RepoView } from './home';
import { PrView } from './pr';
import { getSavedMode, getToken, saveMode, saveToken } from './store';

type Route = { name: 'home' } | { name: 'repo'; repo: RepoRef } | { name: 'pr'; ref: PrRef; file: number | null };

function parseHash(): Route {
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/f\/(\d+))?/);
  if (!m) {
    const r = location.hash.match(/^#\/([^/]+)\/([^/]+)\/?$/);
    return r ? { name: 'repo', repo: { owner: decodeURIComponent(r[1]), repo: decodeURIComponent(r[2]) } } : { name: 'home' };
  }
  return {
    name: 'pr',
    ref: { owner: decodeURIComponent(m[1]), repo: decodeURIComponent(m[2]), number: Number(m[3]) },
    file: m[4] == null ? null : Number(m[4]),
  };
}

// ビューアを一覧から開いたか (= 履歴を 1 つ戻れば一覧に戻れるか)
let viewerPushed = false;

export function App() {
  const [route, setRoute] = useState(parseHash);
  const [token, setToken] = useState(getToken);
  const [mode, setMode] = useState<Mode>(() => {
    const saved = getSavedMode();
    return MODES.some((m) => m.id === saved) ? (saved as Mode) : '2up';
  });

  useEffect(() => {
    const onHash = () => {
      const r = parseHash();
      if (r.name !== 'pr' || r.file == null) viewerPushed = false;
      setRoute(r);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.name === 'home')
    return (
      <Home
        token={token}
        onToken={(t) => {
          saveToken(t);
          setToken(t);
        }}
      />
    );

  if (route.name === 'repo')
    return <RepoView key={`${route.repo.owner}/${route.repo.repo}`} repo={route.repo} token={token} />;

  const { ref } = route;
  return (
    <PrView
      key={`${ref.owner}/${ref.repo}/${ref.number}`}
      prRef={ref}
      token={token}
      fileIndex={route.file}
      mode={mode}
      setMode={(m) => {
        saveMode(m);
        setMode(m);
      }}
      onOpenFile={(i) => {
        viewerPushed = true;
        location.hash = prHash(ref, i);
      }}
      onNavFile={(i) => location.replace(prHash(ref, i))}
      onCloseFile={() => (viewerPushed ? history.back() : location.replace(prHash(ref)))}
    />
  );
}
