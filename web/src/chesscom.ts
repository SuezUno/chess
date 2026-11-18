// Incremental import from the chess.com Published-Data API, straight from the browser (CORS is open).
// Re-fetches the last stored month plus newer ones; games are keyed by uuid, so no duplicates.
import { parseChesscomGame } from './core';
import { db, type Account } from './db';

const API = 'https://api.chess.com/pub/player/';

async function get(url: string, retries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      if (attempt < retries - 1) { await sleep(2 ** attempt * 5000); continue; }
      throw new Error('Sin conexión con chess.com');
    }
    if (res.ok) return res.json();
    if (res.status === 404) throw new Error('Ese usuario no existe en chess.com o no es público');
    if (res.status === 429 && attempt < retries - 1) { await sleep(60000); continue; }
    throw new Error(`chess.com respondió ${res.status}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function linkAccount(username: string): Promise<Account> {
  const u = username.trim().toLowerCase();
  const acc: Account = { id: `chesscom:${u}`, platform: 'chesscom', username: u };
  const d = await db();
  const existing = await d.get('accounts', acc.id);
  if (!existing) await d.put('accounts', acc);
  return existing ?? acc;
}

/** Returns number of new games stored. */
export async function syncAccount(acc: Account, onProgress?: (msg: string) => void): Promise<number> {
  const d = await db();
  try {
    const { archives } = await get(`${API}${acc.username}/games/archives`);
    const months = (archives as string[]).map((url) => ({ url, month: url.split('/').slice(-2).join('/') }))
      .filter((m) => !acc.lastArchive || m.month >= acc.lastArchive);
    let added = 0;
    for (const { url, month } of months) {
      onProgress?.(`Descargando ${month}…`);
      const { games } = await get(url);
      const tx = d.transaction('games', 'readwrite');
      for (const raw of games ?? []) {
        const row = parseChesscomGame(raw, acc.username, acc.id);
        if (row && !(await tx.store.getKey(row.id))) { await tx.store.put(row); added++; }
      }
      await tx.done;
      acc.lastArchive = month;
      await d.put('accounts', acc);
    }
    Object.assign(acc, { lastSyncAt: new Date().toISOString(), lastSyncStatus: 'ok', lastError: undefined });
    await d.put('accounts', acc);
    return added;
  } catch (e) {
    Object.assign(acc, { lastSyncAt: new Date().toISOString(), lastSyncStatus: 'error', lastError: String((e as Error).message) });
    await d.put('accounts', acc);
    throw e;
  }
}
