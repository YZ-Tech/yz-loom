import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Mode 'lib': IIFE module loaded by JarvYZ via @yz-dev/react-dynamic-module.
//   - Externalises react/react-dom (host injects via window globals).
//   - Bundles MUI/emotion. Theme propagates via the ledfx pattern (theme prop
//     + the module's own ThemeProvider seeded with it). Same pattern as the
//     orbs / head / music satellite UIs.
//
// Mode 'pages' (default): standalone SPA for `npm run dev` — isolated visual
// dev only (no host = idle console). This is a UI-only satellite: no Python
// package / wheel, so there's no `build:pages`; the output dir below is a
// throwaway (dev uses the vite server, not a build).
const libConfig: UserConfig = {
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'YzLoom',
      formats: ['iife'],
      fileName: () => 'yz-loom.iife.js',
    },
    // Same require-shim gotcha as the other satellites: transitive CJS deps do
    // `require("react")`, but the IIFE has no module system and react is
    // external. Resolve those from window globals.
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM' },
        exports: 'named',
        extend: true,
        banner:
          'var require = function(id) {' +
          ' if (id === "react") return window.React;' +
          ' if (id === "react-dom") return window.ReactDOM;' +
          ' throw new Error("require not handled: " + id);' +
          ' };',
      },
    },
  },
}

const pagesConfig: UserConfig = {
  plugins: [react()],
  server: {
    port: 5189,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
  },
}

export default defineConfig(({ mode }) => (mode === 'lib' ? libConfig : pagesConfig))
