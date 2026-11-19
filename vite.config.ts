import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/clsx|tailwind-merge|class-variance-authority/.test(id)) return 'ui';
          if (/recharts|d3-|victory/.test(id)) return 'charts';
          if (/@supabase/.test(id)) return 'supabase';
          if (/react-dom|react-router|scheduler|\/react\//.test(id)) return 'react';
        },
      },
    },
  },
});
