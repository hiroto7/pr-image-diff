import { render } from 'preact';
import { App } from './app';
import { parsePrRef, prHash } from './github';
import './style.css';

// 共有ターゲット (Android で「共有」からこのアプリを選んだ場合) や ?url= で渡された PR を開く
const q = new URLSearchParams(location.search);
const shared = ['url', 'text', 'title'].map((k) => q.get(k) ?? '').join(' ');
if (shared.trim()) {
  const ref = parsePrRef(shared);
  history.replaceState(null, '', location.pathname + (ref ? prHash(ref) : ''));
}

render(<App />, document.getElementById('app')!);
