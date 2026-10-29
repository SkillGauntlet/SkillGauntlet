"""Eight consecutive failed trials stop the run: exit code 3, nothing summarised, resume command printed."""
import contextlib
import io
import json
import sys
import unittest

from _support import SandboxCase, canned_record, tt

LIMIT = "You've hit your usage limit"


class ErrorStreakStop(SandboxCase):
    def test_eight_consecutive_errors_stop_the_run(self):
        tt.run_trial = lambda *a, **k: canned_record("error", LIMIT)
        self.assertEqual(self.run_main(), 3)
        (run_dir,) = self.run_dirs()
        self.assertEqual(len(self.records(run_dir)), 8)
        meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
        self.assertIn("usage limit", meta["stopped_reason"])
        self.assertFalse((run_dir / "summary.json").exists())  # an unfinished run is not summarised

    def test_stop_prints_the_resume_command(self):
        tt.run_trial = lambda *a, **k: canned_record("error", LIMIT)
        out, old = io.StringIO(), sys.argv
        sys.argv = ["t", "run", "--manifest", str(self.manifest()), "--model", "haiku", "--workers", "1"]
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                with self.assertRaises(SystemExit) as cm:
                    tt.main()
        finally:
            sys.argv = old
        self.assertEqual(cm.exception.code, 3)
        self.assertIn("--resume", out.getvalue())

    def test_a_success_resets_the_streak(self):
        n = {"i": 0}

        def flaky(*a, **k):
            n["i"] += 1
            return canned_record("error", LIMIT) if n["i"] % 5 else canned_record("not_triggered")  # 4 errors, 1 ok

        tt.run_trial = flaky
        self.assertEqual(self.run_main(), 0)
        (run_dir,) = self.run_dirs()
        meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
        self.assertFalse(meta.get("stopped_reason"))

    def test_timeouts_count_toward_the_streak(self):
        tt.run_trial = lambda *a, **k: canned_record("timeout", "slow")
        self.assertEqual(self.run_main(), 3)


if __name__ == "__main__":
    unittest.main()
