import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'node18',
    rollupOptions: {
      input: {
        cli: path.resolve(__dirname, 'src/cli.ts'),
        daemon: path.resolve(__dirname, 'src/daemon.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'esm',
        banner: () => '#!/usr/bin/env node',
      },
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        'node-pty',
      ],
    },
    minify: false,
    sourcemap: true,
  },
});
