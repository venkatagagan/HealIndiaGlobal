import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

// Patient portal (PLAN 3.1): served at /app/; the router keeps basename '/' because the portal routes already
// live under /app/*. Vite redirects the dev root "/" to "/app/". The public pages and the sign-in door are the
// website (http://localhost:3000).
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
  base: '/app/',
  plugins: [react(), tailwindcss(), redirectBareBase('/app/')],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 5173, strictPort: true },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
