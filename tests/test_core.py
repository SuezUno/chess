import unittest

import chess.engine

from trainer import analysis, chesscom, config, db


def fake_game(uuid, white="player1", black="rival", result_white="win", result_black="resigned"):
    return {
        "uuid": uuid, "url": f"https://www.chess.com/game/live/{uuid}", "time_class": "blitz",
        "time_control": "180", "rated": True, "rules": "chess", "end_time": 1700000000,
        "white": {"username": white, "rating": 500, "result": result_white},
        "black": {"username": black, "rating": 510, "result": result_black},
        "eco": "https://www.chess.com/openings/Italian-Game",
        "pgn": '[ECO "C50"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 1-0',
    }


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        self.user = db.get_or_create_user(self.conn, "tester")
        self.acc = db.link_account(self.conn, self.user, "chesscom", "Player1")
        self.months = {"2026/10": [fake_game("a"), fake_game("b")], "2026/11": [fake_game("c")]}

    def fetch(self, url):
        if url.endswith("/archives"):
            return {"archives": [f"https://api.chess.com/pub/player/player1/games/{m}" for m in self.months]}
        return {"games": self.months["/".join(url.rsplit("/", 2)[-2:])]}

    def test_incremental_sync_without_duplicates(self):
        self.assertEqual(chesscom.sync_account(self.conn, self.acc, self.fetch), 3)
        self.months["2026/11"].append(fake_game("d", white="rival", black="player1",
                                                result_white="checkmated", result_black="win"))
        self.assertEqual(chesscom.sync_account(self.conn, self.acc, self.fetch), 1)
        rows = self.conn.execute("SELECT * FROM games ORDER BY platform_game_id").fetchall()
        self.assertEqual(len(rows), 4)
        self.assertEqual((rows[0]["user_color"], rows[0]["result"], rows[0]["eco"]), ("white", "win", "C50"))
        self.assertEqual((rows[3]["user_color"], rows[3]["result_detail"]), ("black", "checkmated"))
        acc = self.conn.execute("SELECT * FROM platform_accounts").fetchone()
        self.assertEqual((acc["last_archive"], acc["last_sync_status"]), ("2026/11", "ok"))

    def test_error_is_recorded(self):
        def broken(url):
            raise chesscom.SyncError("sin red")
        with self.assertRaises(chesscom.SyncError):
            chesscom.sync_account(self.conn, self.acc, broken)
        acc = self.conn.execute("SELECT * FROM platform_accounts").fetchone()
        self.assertEqual((acc["last_sync_status"], acc["last_error"]), ("error", "sin red"))


class AnalysisTest(unittest.TestCase):
    def test_win_chance_and_classify(self):
        self.assertAlmostEqual(analysis.win_chance(0), 50)
        self.assertGreater(analysis.win_chance(300), 75)
        self.assertEqual(analysis.classify(35), "blunder")
        self.assertEqual(analysis.classify(5), None)

    def test_hung_queen_is_a_blunder(self):
        # White gives the queen away on move 3.
        pgn = "1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 *"
        with chess.engine.SimpleEngine.popen_uci(config.STOCKFISH_PATH) as engine:
            plies = analysis.analyze_pgn(pgn, engine, depth=10)
        self.assertEqual(len(plies), 6)
        self.assertEqual(plies[4]["san"], "Qxf7+")
        self.assertEqual(plies[4]["classification"], "blunder")
        self.assertIsNone(plies[5]["classification"])  # Kxf7 is the best reply


if __name__ == "__main__":
    unittest.main()
