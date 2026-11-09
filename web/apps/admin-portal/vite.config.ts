import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

// Admin console = STAFF DOOR (PLAN 3.1): served at /gahi/ (router basename '/gahi'), never linked publicly.
// Vite redirects the dev root "/" to "/gahi/".
/** `/<base>` without the trailing slash would hit Vite's "did you mean /<base>/" page; send it to the portal. */
function redirectBareBase(base: string): Plugin {
  const bare = base.replace(/\/$/, '');
  const redirect = (req: { url?: string }, res: ServerResponse, next: () => void) => {
    const [path, query] = (req.url ?? '').split('?');
    if (path !== bare) return next();
    res.statusCode = 302;
    res.setHeader('Location', base + (query ? `?${query}` : ''));
    res.end();
  };
  return {
    name: 'redirect-bare-base',
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  };
}

export default defineConfig({
  base: '/gahi/',
  plugins: [react(), tailwindcss(), redirectBareBase('/gahi/')],
  server: {
    port: 5176,
    strictPort: true,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 5176, strictPort: true, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
