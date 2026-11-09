import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Hospital provider portal (PLAN section 10): dev server on 5175, /api (incl. WebSocket) proxied to the API.
// Served at /hospital/ (PLAN 3.1, router basename '/hospital'); Vite redirects the dev root "/" to "/hospital/".
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
  base: '/hospital/',
  plugins: [react(), tailwindcss(), redirectBareBase('/hospital/')],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 5175,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // SEC-050: never ship source maps to the browser
    chunkSizeWarningLimit: 1200,
  },
});
