import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api/ (with trailing slash) proxies to the SchoolSync backend without
// swallowing same-origin asset paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Socket.io engine endpoint (websocket upgrade)
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: { outDir: 'dist' },
});
