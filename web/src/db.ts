// On-device storage (IndexedDB). Nothing leaves the device except calls to chess.com.
import { openDB, type IDBPDatabase } from 'idb';
import type { GameRow, MoveRow } from './core';

export interface Account {
  id: string;               // `chesscom:${username}`
  platform: 'chesscom';
  username: string;
  lastArchive?: string;     // 'YYYY/MM'
  lastSyncAt?: string;
  lastSyncStatus?: 'ok' | 'error';
  lastError?: string;
}

let dbp: Promise<IDBPDatabase> | undefined;

export function db() {
  dbp ??= openDB('chess-trainer', 1, {
    upgrade(d) {
      d.createObjectStore('accounts', { keyPath: 'id' });
      const games = d.createObjectStore('games', { keyPath: 'id' });
      games.createIndex('endTime', 'endTime');
      const moves = d.createObjectStore('moves', { keyPath: ['gameId', 'ply'] });
      moves.createIndex('gameId', 'gameId');
      d.createObjectStore('settings');
    },
  });
  return dbp;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return ((await (await db()).get('settings', key)) as T | undefined) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await (await db()).put('settings', value, key);
}

export async function saveAnalysis(game: GameRow, moves: MoveRow[], depth: number) {
  const tx = (await db()).transaction(['games', 'moves'], 'readwrite');
  const store = tx.objectStore('moves');
  for (const key of await store.index('gameId').getAllKeys(game.id)) await store.delete(key);
  for (const m of moves) await store.put(m);
  await tx.objectStore('games').put({ ...game, analyzedAt: new Date().toISOString(), analysisDepth: depth });
  await tx.done;
}

/** Import a file made by `python -m trainer export`. Keeps analysis already done on the device. Returns games added. */
export async function importExport(json: string, accountId: string): Promise<number> {
  const data = JSON.parse(json);
  if (data?.version !== 1 || !Array.isArray(data.games)) throw new Error('Archivo no válido');
  // Files without a username (older exports) are accepted.
  if (data.username && `chesscom:${data.username.toLowerCase()}` !== accountId) throw new Error(`el archivo es de otra cuenta (${data.username})`);
  const d = await db();
  let added = 0;
  for (const { moves, ...g } of data.games) {
    const game: GameRow = { ...g, id: `${accountId}:${g.platformGameId}`, accountId };
    const tx = d.transaction(['games', 'moves'], 'readwrite');
    const have = (await tx.objectStore('games').get(game.id)) as GameRow | undefined;
    if (!have?.analyzedAt) {
      await tx.objectStore('games').put(game);
      for (const m of moves) await tx.objectStore('moves').put({ ...m, gameId: game.id });
      added++;
    }
    await tx.done;
  }
  return added;
}
