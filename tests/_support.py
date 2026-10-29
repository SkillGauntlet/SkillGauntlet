"""Shared fixtures for the offline runner tests. Nothing here calls a model or touches step0/results/."""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STEP0 = ROOT / "step0"
sys.path.insert(0, str(STEP0))
import trigger_test as tt  # noqa: E402

REAL_RESULTS = STEP0 / "results"


def snapshot_results():
    return sorted(p.name for p in REAL_RESULTS.glob("*")) if REAL_RESULTS.exists() else None


class SandboxCase(unittest.TestCase):
    """Points the runner's HERE at a temp copy of the pieces it needs, so runs land in the sandbox.

    The sandbox holds the csv-dedupe example (6 queries: 3 should-trigger, 3 should-not) and a second skill,
    csv-helper, to play a same-family companion."""

    def setUp(self):
        self.results_before = snapshot_results()
        self.sandbox = Path(tempfile.mkdtemp(prefix="sg-test-"))
        self.addCleanup(shutil.rmtree, self.sandbox, ignore_errors=True)
        (self.sandbox / "queries").mkdir()
        (self.sandbox / "examples").mkdir()
        shutil.copy(STEP0 / "queries" / "csv-dedupe.json", self.sandbox / "queries" / "csv-dedupe.json")
        shutil.copytree(STEP0 / "examples" / "csv-dedupe", self.sandbox / "examples" / "csv-dedupe")
        helper = self.sandbox / "examples" / "csv-helper"
        helper.mkdir()
        (helper / "SKILL.md").write_text(
            "---\nname: csv-helper\ndescription: Shared CSV conventions for the csv family.\n---\nBody.\n",
            encoding="utf-8")
        pack = json.loads((self.sandbox / "queries" / "csv-dedupe.json").read_text(encoding="utf-8"))
        self.qid = {q["query"]: q["id"] for q in pack["queries"]}
        self.orig = {k: getattr(tt, k) for k in ("HERE", "run_trial", "find_claude", "claude_version")}
        tt.HERE = self.sandbox
        tt.find_claude = lambda: "claude"
        tt.claude_version = lambda c: "fake"
        self.addCleanup(self._restore)

    def _restore(self):
        for k, v in self.orig.items():
            setattr(tt, k, v)
        # the real results directory must be exactly as the test found it
        self.assertEqual(snapshot_results(), self.results_before)

    def manifest(self, entry=None):
        entry = entry or {"name": "csv-dedupe", "path": "examples/csv-dedupe"}
        path = self.sandbox / "m.json"
        path.write_text(json.dumps({"skills": [entry]}), encoding="utf-8")
        return path

    def run_main(self, *extra, manifest=None):
        """Run `trigger_test.py run ...`; returns the exit code (0 when main returns normally)."""
        argv = ["trigger_test.py", "run", "--manifest", str(manifest or self.manifest()),
                "--model", "haiku", "--workers", "1", *extra]
        old, sys.argv = sys.argv, argv
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                try:
                    tt.main()
                except SystemExit as e:
                    return 0 if e.code in (0, None) else e.code
            return 0
        finally:
            sys.argv = old

    def run_dirs(self):
        d = self.sandbox / "results"
        return sorted(d.glob("*")) if d.exists() else []

    @staticmethod
    def records(run_dir):
        text = (run_dir / "raw.jsonl").read_text(encoding="utf-8")
        return [json.loads(l) for l in text.splitlines() if l.strip()]


def canned_record(verdict, error=None):
    return {"verdict": verdict, "invoked_skill": None, "first_tool": None, "tools": [], "explore_steps": 0,
            "denied": 0, "cost_usd": None, "usage": None, "error": error, "init": None, "latency_s": 0.0}
