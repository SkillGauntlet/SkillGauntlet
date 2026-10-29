"""The three published tdd reports (2026-10-27) must not change when rebuilt by the current runner.

Runs written before v0.4.0 carry no `sampling` field and are read as fixed sampling."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from _support import STEP0, tt, snapshot_results

DATA = STEP0 / "data" / "2026-10-27_tdd_haiku"
# (run directory, headline recall as published)
PUBLISHED = {
    "run-20261027-013422": 0.43,
    "run-20261027-013545": 0.40,
    "run-20261027-014030": 0.43,
}
STABLE_KEYS = ("grade", "recall", "false_positive_rate", "n_pos", "n_neg", "by_set", "by_language")


def strip_additive(x):
    """Newer summaries add q_pos/q_neg per set; those are additive and not part of the published numbers."""
    return {s: {k: v for k, v in d.items() if k not in ("q_pos", "q_neg")} for s, d in (x or {}).items()}


class PublishedReportsUnchanged(unittest.TestCase):
    def test_every_published_run_is_present(self):
        self.assertEqual(sorted(p.name for p in DATA.glob("run-*")), sorted(PUBLISHED))

    def test_recomputed_numbers_match(self):
        before = snapshot_results()
        for name, headline in PUBLISHED.items():
            with self.subTest(run=name):
                src = DATA / name
                work = Path(tempfile.mkdtemp(prefix="sg-test-")) / name
                self.addCleanup(shutil.rmtree, work.parent, ignore_errors=True)
                shutil.copytree(src, work)
                old = json.loads((src / "summary.json").read_text(encoding="utf-8"))["skills"]
                tt.write_report(work)
                new = json.loads((work / "summary.json").read_text(encoding="utf-8"))["skills"]
                self.assertEqual(len(old), len(new))
                for a, b in zip(old, new):
                    for k in STABLE_KEYS:
                        ka, kb = a.get(k), b.get(k)
                        if k in ("by_set", "by_language"):
                            ka, kb = strip_additive(ka), strip_additive(kb)
                        self.assertEqual(ka, kb, k)
                    self.assertEqual([float(x) for x in a["recall_ci95"]], [float(x) for x in b["recall_ci95"]])
                self.assertEqual(new[0]["grade"], "triggers poorly")
                self.assertAlmostEqual(new[0]["recall"], headline, delta=0.005)
                self.assertTrue((work / "report.md").read_text(encoding="utf-8").strip())
        self.assertEqual(snapshot_results(), before)


if __name__ == "__main__":
    unittest.main()
