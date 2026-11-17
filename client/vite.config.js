import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the browser talks only to :5173 and Vite forwards /api and /socket.io to the Express server,
// so cookies are first-party exactly like in production behind a Vercel rewrite.
const API = process.env.VITE_DEV_API || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/socket.io': { target: API, ws: true, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
