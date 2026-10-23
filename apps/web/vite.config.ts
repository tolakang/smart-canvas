import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // pdf.js loads lazily (N2): pre-bundle it so the dev server doesn't discover it mid-session and reload the page.
  optimizeDeps: { include: ['pdfjs-dist'] },
  server: {
    proxy: { '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
