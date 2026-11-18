"""Command line entry point: python -m trainer <command>."""
import argparse
import sys
import time

import chess

from . import analysis, chesscom, db


def _user(conn, name):
    row = conn.execute("SELECT id FROM users WHERE display_name = ?", (name,)).fetchone()
    if not row:
        sys.exit(f"No hay usuario '{name}'. Créalo con: python -m trainer link --user {name} --chesscom <usuario>")
    return row["id"]


def cmd_link(conn, args):
    user_id = db.get_or_create_user(conn, args.user)
    acc = db.link_account(conn, user_id, "chesscom", args.chesscom)
    print(f"Usuario '{args.user}' (id {user_id}) enlazado a chess.com/{args.chesscom} (cuenta {acc}).")


def cmd_sync(conn, args):
    user_id = _user(conn, args.user)
    for acc in conn.execute("SELECT id, platform, username FROM platform_accounts WHERE user_id = ?", (user_id,)):
        print(f"Sincronizando {acc['platform']}/{acc['username']}...")
        try:
            print(f"  {chesscom.sync_account(conn, acc['id'])} partidas nuevas")
        except chesscom.SyncError as e:
            print(f"  ERROR: {e}")


def cmd_status(conn, args):
    user_id = _user(conn, args.user)
    for a in conn.execute("SELECT * FROM platform_accounts WHERE user_id = ?", (user_id,)):
        print(f"{a['platform']}/{a['username']}: {a['last_sync_status'] or 'nunca'} "
              f"{a['last_sync_at'] or ''} último mes {a['last_archive'] or '-'} {a['last_error'] or ''}")
    g = conn.execute("SELECT COUNT(*) n, COUNT(analyzed_at) a FROM games WHERE user_id = ?", (user_id,)).fetchone()
    print(f"Partidas: {g['n']} ({g['a']} analizadas)")


def cmd_analyze(conn, args):
    user_id = _user(conn, args.user)
    t = time.time()
    n = analysis.analyze_pending(conn, user_id, limit=args.limit, depth=args.depth, workers=args.workers)
    print(f"{n} partidas analizadas en {time.time() - t:.0f} s")


def _phase(fen: str, ply: int) -> str:
    if ply <= 20:
        return "apertura"
    board = chess.Board(fen)
    heavy = sum(len(board.pieces(p, c)) for p in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT)
                for c in chess.COLORS)
    return "final" if heavy <= 4 else "medio juego"


def cmd_report(conn, args):
    """Quick look at the analyzed games (phase 0 check, not the final profile)."""
    user_id = _user(conn, args.user)
    games = conn.execute(
        "SELECT id, user_color, time_class, time_control, result FROM games "
        "WHERE user_id = ? AND analyzed_at IS NOT NULL", (user_id,)).fetchall()
    if not games:
        sys.exit("No hay partidas analizadas todavía.")
    ids = {g["id"]: g for g in games}
    mine = [m for m in conn.execute(
        "SELECT m.*, g.time_control FROM moves m JOIN games g ON g.id = m.game_id "
        "WHERE g.user_id = ? AND g.analyzed_at IS NOT NULL AND m.color = g.user_color", (user_id,))]
    print(f"{len(games)} partidas analizadas, {len(mine)} jugadas tuyas")

    counts = {}
    for m in mine:
        counts[m["classification"]] = counts.get(m["classification"], 0) + 1
    for k in ("blunder", "mistake", "inaccuracy"):
        print(f"  {k}: {counts.get(k, 0)} ({counts.get(k, 0) / len(games):.1f} por partida)")

    by_phase = {}
    for m in mine:
        if m["classification"] in ("blunder", "mistake"):
            ph = _phase(m["fen_before"], m["ply"])
            by_phase[ph] = by_phase.get(ph, 0) + 1
    print("Errores graves por fase:", by_phase)

    trouble = 0
    serious = [m for m in mine if m["classification"] in ("blunder", "mistake")]
    for m in serious:
        base = (m["time_control"] or "").split("+")[0]
        if m["clock_seconds"] is not None and base.isdigit() and m["clock_seconds"] < 0.1 * int(base):
            trouble += 1
    print(f"Errores graves con menos del 10% del tiempo: {trouble}/{len(serious)}")

    missed = 0
    for m in mine:
        prev = conn.execute("SELECT classification FROM moves WHERE game_id = ? AND ply = ?",
                            (m["game_id"], m["ply"] - 1)).fetchone()
        if prev and prev["classification"] == "blunder" and m["classification"] in ("mistake", "blunder", "inaccuracy"):
            missed += 1
    print(f"Errores graves del rival que no castigaste: {missed}")

    worst = sorted(serious, key=lambda m: m["win_before"] - m["win_after"], reverse=True)[:5]
    print("Peores jugadas:")
    for m in worst:
        print(f"  partida {m['game_id']} jugada {(m['ply'] + 1) // 2}: {m['san']} "
              f"(mejor {m['best_san']}) {m['win_before']:.0f}% -> {m['win_after']:.0f}%")


def main(argv=None):
    p = argparse.ArgumentParser(prog="trainer")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("link", help="crear usuario y enlazar cuenta de chess.com")
    s.add_argument("--chesscom", required=True)
    for name in ("sync", "status", "report"):
        sub.add_parser(name)
    s2 = sub.add_parser("analyze")
    s2.add_argument("--limit", type=int)
    s2.add_argument("--depth", type=int)
    s2.add_argument("--workers", type=int)
    for sp in sub.choices.values():
        sp.add_argument("--user", default="me", help="nombre del usuario en la app (por defecto 'me')")
    args = p.parse_args(argv)
    conn = db.connect()
    globals()[f"cmd_{args.cmd}"](conn, args)


if __name__ == "__main__":
    main()
