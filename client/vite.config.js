import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Fix broken module field in modplayer package (points to non-existent index.js)
      { find: /^modplayer$/, replacement: path.resolve('./node_modules/modplayer/index.ts') },
      { find: /^modplayer\/worklet$/, replacement: path.resolve('./node_modules/modplayer/worklet.ts') },
      { find: /^chiptune3$/, replacement: path.resolve('./node_modules/chiptune3/chiptune3.js') },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
});
