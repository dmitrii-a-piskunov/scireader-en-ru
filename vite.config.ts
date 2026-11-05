import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const sample = resolve('references/articles/sensors-23-03762-v2.pdf');
export default defineConfig({
  root: 'prototype', base: './',
  plugins: [react(), {
    name: 'prototype-sample-pdf',
    configureServer(server) {
      server.middlewares.use('/sample.pdf', (_req, res) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.end(readFileSync(sample));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sample.pdf', source: readFileSync(sample) });
    },
  }],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
});
