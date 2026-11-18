// Stockfish (WASM, single-threaded lite build) in a Web Worker, driven over UCI.
export interface EngineResult { cp: number; bestUci?: string }   // cp from side-to-move's view

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export class Engine {
  private worker = new Worker(ENGINE_URL);
  private listeners: ((line: string) => void)[] = [];
  private ready: Promise<unknown>;

  constructor() {
    this.worker.onmessage = (e) => this.listeners.forEach((l) => l(String(e.data)));
    this.ready = this.waitFor('uciok', 'uci').then(() => this.waitFor('readyok', 'isready'));
  }

  private waitFor(token: string, send: string, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        onLine?.(line);
        if (line.startsWith(token)) {
          this.listeners = this.listeners.filter((x) => x !== l);
          resolve(line);
        }
      };
      this.listeners.push(l);
      this.worker.postMessage(send);
    });
  }

  async analyse(fen: string, depth: number): Promise<EngineResult> {
    await this.ready;
    let cp = 0;
    this.worker.postMessage(`position fen ${fen}`);
    const done = await this.waitFor('bestmove', `go depth ${depth}`, (line) => {
      const m = / score (cp|mate) (-?\d+)/.exec(line);
      if (m && line.startsWith('info') && !/ (lower|upper)bound/.test(line)) {
        const v = +m[2];
        cp = m[1] === 'cp' ? v : (v > 0 ? 10000 : -10000);
      }
    });
    const best = done.split(' ')[1];
    return { cp, bestUci: best && best !== '(none)' ? best : undefined };
  }

  terminate() { this.worker.terminate(); }
}
