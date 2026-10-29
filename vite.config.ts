import { defineConfig } from 'vitest/config';

// Configuration Vite + Vitest.
// - base './' : chemins relatifs, indispensables pour servir l'application
//   depuis les assets Android (WebView) comme depuis un sous-dossier.
// - build.target : syntaxe abaissée pour les WebView Chromium anciennes
//   des Fire TV (Fire OS 6/7). Voir docs/FIRE-TV.md.
export default defineConfig({
  base: './',
  build: {
    target: ['es2018', 'chrome64'],
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
