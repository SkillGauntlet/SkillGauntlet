"""Adaptive sampling (v0.4.0): top-up rules, resume, and what the summary computes. The trial is replaced by a fake."""
import json
import tempfile
import unittest
from pathlib import Path

from _support import SandboxCase, canned_record, tt


class AdaptiveSampling(SandboxCase):
    def setUp(self):
        super().setUp()
        self.calls = []
        self.q05_fails = True

        def fake_trial(claude, skill, query, model, timeout, max_explore=0, fixed_dir=None):
            self.assertTrue(fixed_dir and Path(fixed_dir).name.startswith("sg-trial-"), fixed_dir)
            n = self.calls.count(query)
            self.calls.append(query)
            qid = self.qid[query]
            if qid == "q01":                      # should trigger, unanimous hit  -> 2 runs
                return canned_record("triggered")
            if qid == "q02":                      # should trigger, unanimous miss -> 2 runs
                return canned_record("not_triggered")
            if qid == "q03":                      # should trigger, runs disagree  -> 3 runs
                return canned_record("triggered" if n == 0 else "not_triggered")
            if qid == "q04":                      # negative that triggered        -> 3 runs
                return canned_record("triggered" if n == 0 else "not_triggered")
            if qid == "q05" and self.q05_fails:   # erroring negative: retried only on resume
                return canned_record("error", "boom")
            return canned_record("not_triggered")  # clean negative -> 1 run

        tt.run_trial = fake_trial

    def counts(self, run_dir):
        per = {}
        for r in self.records(run_dir):
            per[r["query_id"]] = per.get(r["query_id"], 0) + 1
        return per

    def test_rounds_resume_and_summary(self):
        self.assertEqual(self.run_main(), 0)
        (run_dir,) = self.run_dirs()
        self.assertEqual(self.counts(run_dir), {"q01": 2, "q02": 2, "q03": 3, "q04": 3, "q05": 1, "q06": 1})

        # resume: only the erroring negative is retried (and now succeeds); nothing else reruns
        self.q05_fails = False
        self.assertEqual(self.run_main("--resume", str(run_dir)), 0)
        self.assertEqual(self.counts(run_dir), {"q01": 2, "q02": 2, "q03": 3, "q04": 3, "q05": 2, "q06": 1})

        # a second resume has nothing left to do
        total = len(self.records(run_dir))
        self.assertEqual(self.run_main("--resume", str(run_dir)), 0)
        self.assertEqual(len(self.records(run_dir)), total)

        # resume under different conditions is refused, and adds nothing
        self.assertNotEqual(self.run_main("--resume", str(run_dir), "--sampling", "fixed"), 0)
        self.assertEqual(len(self.records(run_dir)), total)

        s = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))["skills"][0]
        # recall = mean(1, 0, 1/3); pooled would be 3/7. fpr = mean(1/3, 0, 0); pooled would be 1/5
        self.assertAlmostEqual(s["recall"], 4 / 9, places=3)
        self.assertAlmostEqual(s["false_positive_rate"], 1 / 9, places=3)
        self.assertEqual((s["q_pos"], s["q_neg"]), (3, 3))
        self.assertEqual(s["grade"], "insufficient data")  # 3 queries per side is below the minimum
        report = (run_dir / "report.md").read_text(encoding="utf-8")
        self.assertIn("Sampling: adaptive", report)

    def test_fixed_sampling_gives_every_query_every_run(self):
        self.q05_fails = False
        self.assertEqual(self.run_main("--sampling", "fixed"), 0)
        (run_dir,) = self.run_dirs()
        self.assertEqual(self.counts(run_dir), {f"q0{i}": 3 for i in range(1, 7)})

    def test_runs_needed_rules(self):
        need = tt.runs_needed
        self.assertEqual(need(False, [], 3, "adaptive"), 1)
        self.assertEqual(need(False, ["not_triggered"], 3, "adaptive"), 1)
        self.assertEqual(need(False, ["triggered"], 3, "adaptive"), 3)
        self.assertEqual(need(True, [], 3, "adaptive"), 2)
        self.assertEqual(need(True, ["triggered", "triggered"], 3, "adaptive"), 2)
        self.assertEqual(need(True, ["triggered", "not_triggered"], 3, "adaptive"), 3)
        self.assertEqual(need(True, [], 3, "fixed"), 3)
        self.assertEqual(need(False, [], 3, "fixed"), 3)


if __name__ == "__main__":
    unittest.main()
