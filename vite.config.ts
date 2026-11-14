import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  // 相対パスにしておくと GitHub Pages のサブパスでもそのまま動く
  base: './',
  plugins: [preact()],
});
