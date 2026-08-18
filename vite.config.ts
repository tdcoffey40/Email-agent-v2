import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const clientDir = new URL('./src/client/', import.meta.url).pathname;
const sharedDir = new URL('./src/shared/', import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': clientDir.replace(/\/$/, ''),
      '@shared': sharedDir.replace(/\/$/, ''),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      // `wrangler dev` serves the API and email handler on 8787.
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
});
