import path from 'node:path';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const client = path.resolve(root, 'src/standalone/client.ts');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.resolve(root, 'public/glacier-link-logo.png')).toString('base64');

export default defineConfig({
  root,
  base: '/',
  plugins: [react(), tailwindcss({ optimize: false })],
  define: {
    'import.meta.env.VITE_STANDALONE_DEMO': JSON.stringify('true'),
    'import.meta.env.VITE_STANDALONE_LOGO': JSON.stringify(logo),
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(''),
    'import.meta.env.VITE_CLERK_PROXY_URL': JSON.stringify(''),
  },
  resolve: {
    alias: [
      { find: '@/lib/api', replacement: client },
      { find: /^\.\/api$/, replacement: client },
      { find: '@', replacement: path.resolve(root, 'src') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: path.resolve(root, '../../generated-artifacts/standalone-build'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
