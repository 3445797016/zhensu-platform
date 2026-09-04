import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:7799', '/ws': { target: 'ws://localhost:7799', ws: true } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
});
