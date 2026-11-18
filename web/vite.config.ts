import { cpSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// Stockfish's worker script + wasm are served as-is from public/engine (copied from node_modules, not committed).
mkdirSync('public/engine', { recursive: true });
for (const ext of ['js', 'wasm']) {
  cpSync(`node_modules/stockfish/bin/stockfish-19-lite-single.${ext}`, `public/engine/stockfish-19-lite-single.${ext}`);
}

export default defineConfig({
  base: './',
  test: { environment: 'node' },
} as any);
