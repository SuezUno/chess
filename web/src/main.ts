import { Chessground } from 'chessground';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { analyzeGame } from './analysis';
import { linkAccount, syncAccount } from './chesscom';
import type { GameRow, MoveRow } from './core';
import { db, getSetting, saveAnalysis, setSetting, type Account } from './db';
import { Engine } from './engine';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// Text from chess.com goes into innerHTML below, so escape it.
const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let stopRequested = false;

async function currentAccount(): Promise<Account | undefined> {
  return (await (await db()).getAll('accounts'))[0];
}

async function render() {
  const acc = await currentAccount();
  $('setup').hidden = !!acc;
  $('main').hidden = !acc;
  if (!acc) return;
  const d = await db();
  const games = (await d.getAll('games')) as GameRow[];
  const analyzed = games.filter((g) => g.analyzedAt);
  $('account').textContent = `chess.com/${acc.username}`;
  $('sync-status').textContent = acc.lastSyncStatus === 'error'
    ? `Error: ${acc.lastError}`
    : acc.lastSyncAt ? `Última sincronización: ${new Date(acc.lastSyncAt).toLocaleString()}` : 'Sin sincronizar';
  $('counts').textContent = `${games.length} partidas · ${analyzed.length} analizadas`;
  await renderErrors(analyzed);
}

async function renderErrors(analyzed: GameRow[]) {
  const d = await db();
  const byId = new Map(analyzed.map((g) => [g.id, g]));
  const errors: MoveRow[] = [];
  let mine = 0;
  for (const g of analyzed) {
    const moves = (await d.getAllFromIndex('moves', 'gameId', g.id)) as MoveRow[];
    for (const m of moves) {
      if (m.color !== g.userColor) continue;
      mine++;
      if (m.classification === 'blunder' || m.classification === 'mistake') errors.push(m);
    }
  }
  const n = analyzed.length || 1;
  const blunders = errors.filter((e) => e.classification === 'blunder').length;
  $('summary').textContent = analyzed.length
    ? `${blunders} errores graves y ${errors.length - blunders} errores en ${mine} jugadas tuyas (${(errors.length / n).toFixed(1)} por partida)`
    : 'Analiza algunas partidas para ver tus errores.';
  errors.sort((a, b) => byId.get(b.gameId)!.endTime - byId.get(a.gameId)!.endTime || a.ply - b.ply);
  const list = $('errors');
  list.replaceChildren(...errors.slice(0, 100).map((m) => {
    const g = byId.get(m.gameId)!;
    const li = document.createElement('li');
    li.className = m.classification!;
    li.innerHTML = `<b>${Math.ceil(m.ply / 2)}. ${m.san}</b> <span>mejor ${m.bestSan ?? '?'}</span>
      <small>${Math.round(m.winBefore)}% → ${Math.round(m.winAfter)}% · vs ${esc(g.opponent)} · ${esc(g.timeClass)}</small>`;
    li.onclick = () => showPosition(m, g);
    return li;
  }));
}

function showPosition(m: MoveRow, g: GameRow) {
  const dialog = $<HTMLDialogElement>('position');
  const arrow = (uci: string, brush: string) => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });
  Chessground($('board'), {
    fen: m.fenBefore,
    orientation: g.userColor,
    viewOnly: true,
    coordinates: false,
    drawable: { autoShapes: [arrow(m.uci, 'red'), ...(m.bestUci ? [arrow(m.bestUci, 'green')] : [])] },
  });
  $('position-text').innerHTML = `Jugaste <b class="bad">${m.san}</b>; lo mejor era <b class="good">${m.bestSan ?? '?'}</b>.
    Tu probabilidad de ganar pasó de ${Math.round(m.winBefore)}% a ${Math.round(m.winAfter)}%.
    ${g.url?.startsWith('https://www.chess.com/') ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">Ver partida</a>` : ''}`;
  dialog.showModal();
}

async function onLink(e: Event) {
  e.preventDefault();
  const name = $<HTMLInputElement>('username').value;
  if (!name.trim()) return;
  await linkAccount(name);
  await render();
  await onSync();
}

async function onSync() {
  const acc = await currentAccount();
  if (!acc) return;
  const btn = $<HTMLButtonElement>('sync');
  btn.disabled = true;
  try {
    const added = await syncAccount(acc, (msg) => ($('sync-status').textContent = msg));
    await render();
    $('sync-status').textContent += ` · ${added} nuevas`;
  } catch {
    await render();
  } finally {
    btn.disabled = false;
  }
}

async function onAnalyze() {
  const limit = +$<HTMLSelectElement>('limit').value;
  const depth = +$<HTMLSelectElement>('depth').value;
  await setSetting('depth', depth);
  const d = await db();
  const pending = ((await d.getAllFromIndex('games', 'endTime')) as GameRow[])
    .filter((g) => !g.analyzedAt && (!g.rules || g.rules === 'chess'))
    .reverse()
    .slice(0, limit);
  if (!pending.length) { $('analyze-status').textContent = 'No hay partidas pendientes.'; return; }
  const engine = new Engine();
  const start = performance.now();
  stopRequested = false;
  $('analyze').hidden = true;
  $('stop').hidden = false;
  try {
    for (const [i, g] of pending.entries()) {
      if (stopRequested) break;
      await saveAnalysis(g, await analyzeGame(g, engine, depth), depth);
      const perGame = (performance.now() - start) / 1000 / (i + 1);
      $('analyze-status').textContent = `${i + 1}/${pending.length} · ${perGame.toFixed(1)} s por partida`;
    }
  } catch (err) {
    $('analyze-status').textContent = `Error al analizar: ${(err as Error).message}`;
  } finally {
    engine.terminate();
    $('analyze').hidden = false;
    $('stop').hidden = true;
    await render();
  }
}

$('link-form').addEventListener('submit', onLink);
$('sync').onclick = onSync;
$('analyze').onclick = onAnalyze;
$('stop').onclick = () => (stopRequested = true);
$('close').onclick = () => $<HTMLDialogElement>('position').close();
getSetting('depth', 12).then((v) => ($<HTMLSelectElement>('depth').value = String(v)));
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
