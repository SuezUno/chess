import { Chess } from 'chess.js';
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
import { buildProfile, fmtPct, type Evidence, type Finding } from './profile';

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
  const byId = new Map(analyzed.map((g) => [g.id, g]));
  const moves = ((await d.getAll('moves')) as MoveRow[]).filter((m) => byId.has(m.gameId));
  renderStats(games, analyzed, byId, moves);
  renderProfile(games, moves, analyzed.length);
  renderErrors(byId, moves);
}

const isErr = (m: MoveRow) => m.classification === 'blunder' || m.classification === 'mistake';

function renderStats(games: GameRow[], analyzed: GameRow[], byId: Map<string, GameRow>, moves: MoveRow[]) {
  // Rating of the time class played most in the last 100 games.
  const recent = [...games].sort((a, b) => b.endTime - a.endTime).slice(0, 100);
  const count = (tc?: string) => recent.filter((g) => g.timeClass === tc).length;
  const main = recent.reduce<string | undefined>((x, g) => (count(g.timeClass) > count(x) ? g.timeClass : x), undefined);
  const last = recent.find((g) => g.timeClass === main);
  $('stat-elo').textContent = last?.userRating ? String(last.userRating) : '–';
  $('stat-elo-sub').textContent = last?.timeClass ?? '';
  $('stat-games').textContent = String(games.length);
  $('stat-games-sub').textContent = `${analyzed.length} analizadas`;
  const n = analyzed.length;
  const mineErr = moves.filter((m) => isErr(m) && m.color === byId.get(m.gameId)!.userColor).length;
  const theirErr = moves.filter((m) => isErr(m) && m.color !== byId.get(m.gameId)!.userColor).length;
  $('stat-errors').textContent = n ? (mineErr / n).toLocaleString('es', { maximumFractionDigits: 1 }) : '–';
  $('stat-errors-sub').textContent = n ? `por partida · rivales ${(theirErr / n).toLocaleString('es', { maximumFractionDigits: 1 })}` : 'analiza partidas';
}

function evidenceChip({ game, move }: Evidence) {
  const label = `${move ? `${Math.ceil(move.ply / 2)}. ${move.san} · ` : ''}vs ${game.opponent ?? '?'}`;
  if (move) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => showPosition(move, game);
    return b;
  }
  const a = document.createElement('a');
  a.textContent = label;
  if (game.url?.startsWith('https://www.chess.com/')) Object.assign(a, { href: game.url, target: '_blank', rel: 'noopener' });
  return a;
}

function findingItem(f: Finding) {
  const li = document.createElement('li');
  li.className = f.kind;
  const dots = { baja: '●○○', media: '●●○', alta: '●●●' }[f.confidence];
  const max = Math.max(f.compare.you, f.compare.them) || 1;
  const bar = (cls: string, name: string, v: number) =>
    `<span class="name">${esc(name)}</span><span class="bar ${cls}"><i style="width:${(v / max) * 100}%"></i></span><span class="val">${fmtPct(v)}</span>`;
  li.innerHTML = `<div class="finding-head"><b>${esc(f.title)}</b><span class="dots" title="Confianza ${f.confidence}">${dots}</span></div>
    <div class="bars">${bar('you', f.compare.labels[0], f.compare.you)}${bar('them', f.compare.labels[1], f.compare.them)}</div>
    <p class="finding-detail">${esc(f.detail)}</p><div class="evidence"></div>`;
  li.querySelector('.evidence')!.append(...f.evidence.map(evidenceChip));
  return li;
}

function renderProfile(games: GameRow[], moves: MoveRow[], analyzedCount: number) {
  const findings = buildProfile(games, moves);
  $('profile-note').textContent = analyzedCount < 200
    ? `${analyzedCount} partidas analizadas · comparado con tus rivales · analiza más para afinarlo`
    : `${analyzedCount} partidas analizadas · comparado con tus rivales`;
  const fill = (id: string, kind: Finding['kind'], empty: string) => {
    const items = findings.filter((f) => f.kind === kind).map(findingItem);
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = empty;
      items.push(li);
    }
    $(id).replaceChildren(...items);
  };
  fill('strengths', 'strength', 'Aún no hay ninguna diferencia clara a tu favor. Con más partidas analizadas saldrán.');
  fill('weaknesses', 'weakness', 'Nada destaca en contra frente a tus rivales.');
}

function renderErrors(byId: Map<string, GameRow>, moves: MoveRow[]) {
  const errors = moves.filter((m) => isErr(m) && m.color === byId.get(m.gameId)!.userColor);
  const blunders = errors.filter((e) => e.classification === 'blunder').length;
  $('summary').textContent = byId.size
    ? `${blunders} graves · ${errors.length - blunders} errores · los 100 más recientes`
    : 'Analiza algunas partidas para ver tus errores.';
  errors.sort((a, b) => byId.get(b.gameId)!.endTime - byId.get(a.gameId)!.endTime || a.ply - b.ply);
  $('errors').replaceChildren(...errors.slice(0, 100).map((m) => {
    const g = byId.get(m.gameId)!;
    const li = document.createElement('li');
    li.className = m.classification!;
    li.innerHTML = `<span class="sev">${m.classification === 'blunder' ? 'Grave' : 'Error'}</span>
      <span class="move">${Math.ceil(m.ply / 2)}. ${esc(m.san)}<span>mejor ${esc(m.bestSan ?? '?')}</span></span>
      <span class="drop">${Math.round(m.winBefore)} → ${Math.round(m.winAfter)} %</span>
      <small>vs ${esc(g.opponent)} · ${esc(g.timeClass)} · ${new Date(g.endTime * 1000).toLocaleDateString()}</small>`;
    li.onclick = () => showPosition(m, g);
    return li;
  }));
}

function showPosition(m: MoveRow, g: GameRow) {
  const dialog = $<HTMLDialogElement>('position');
  $('position-title').textContent = `${Math.ceil(m.ply / 2)}${m.color === 'white' ? '.' : '…'} ${m.san} · vs ${g.opponent ?? '?'}`;
  const arrow = (uci: string, brush: string) => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });
  const shapes = [arrow(m.uci, 'red'), ...(m.bestUci ? [arrow(m.bestUci, 'green')] : [])];
  const cg = Chessground($('board'), {
    fen: m.fenBefore,
    orientation: g.userColor,
    viewOnly: true,
    coordinates: false,
    drawable: { autoShapes: shapes },
  });
  const reset = () => cg.set({ fen: m.fenBefore, lastMove: undefined, drawable: { autoShapes: shapes } });
  // Play from the starting position each time; chess.js computes the FEN (handles castling, en passant, promotion).
  const play = (uci: string) => {
    reset();
    const pos = new Chess(m.fenBefore);
    pos.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    cg.set({ fen: pos.fen(), lastMove: [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key], drawable: { autoShapes: [] } });
  };
  $('play-mine').onclick = () => play(m.uci);
  $<HTMLButtonElement>('play-best').disabled = !m.bestUci;
  $('play-best').onclick = () => m.bestUci && play(m.bestUci);
  $('play-reset').onclick = reset;
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
  const progress = $<HTMLProgressElement>('analyze-progress');
  progress.value = 0;
  $('analyze').hidden = true;
  $('stop').hidden = false;
  progress.hidden = false;
  try {
    for (const [i, g] of pending.entries()) {
      if (stopRequested) break;
      await saveAnalysis(g, await analyzeGame(g, engine, depth), depth);
      const perGame = (performance.now() - start) / 1000 / (i + 1);
      progress.value = (i + 1) / pending.length;
      $('analyze-status').textContent = `${i + 1}/${pending.length} · ${perGame.toFixed(1)} s por partida`;
    }
  } catch (err) {
    $('analyze-status').textContent = `Error al analizar: ${(err as Error).message}`;
  } finally {
    engine.terminate();
    $('analyze').hidden = false;
    $('stop').hidden = true;
    progress.hidden = true;
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
