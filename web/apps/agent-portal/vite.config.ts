import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

// Agent portal (PLAN 3.1): served at /agent/ (router basename '/agent'); Vite redirects the dev root "/" to "/agent/".
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
  base: '/agent/',
  plugins: [react(), tailwindcss(), redirectBareBase('/agent/')],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 5174, strictPort: true },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
