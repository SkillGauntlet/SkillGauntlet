"""The real run_trial against a fake CLI process (subprocess.Popen replaced): companions, environment, is_error.

The fake records what the trial directory and environment looked like at launch and replays canned stream-json."""
import json
import os
import unittest
from pathlib import Path
from unittest import mock

from _support import SandboxCase, tt

BACKGROUND = "builtin-background-skill"


def init_event(skills):
    return {"type": "system", "subtype": "init", "model": "fake-model", "apiKeySource": "none",
            "skills": skills, "tools": ["Skill", "Read", "Bash"]}


def skill_call(name):
    return {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Skill", "input": {"skill": name}}]}}


class FakePopen:
    launches = []
    script = []  # events replayed by every launch

    def __init__(self, cmd, cwd=None, env=None, **kw):
        skills_dir = Path(cwd) / ".claude" / "skills"
        FakePopen.launches.append({"cmd": cmd, "cwd": cwd, "env": env,
                                   "installed": sorted(p.name for p in skills_dir.glob("*"))})
        self.pid, self.stdout = 0, iter(json.dumps(e) + "\n" for e in FakePopen.script)

    def poll(self):
        return 0

    def wait(self):
        return 0


class TrialCase(SandboxCase):
    def setUp(self):
        super().setUp()
        FakePopen.launches, FakePopen.script = [], []
        p = mock.patch.object(tt.subprocess, "Popen", FakePopen)
        p.start()
        self.addCleanup(p.stop)
        self.entry = {"name": "csv-dedupe", "path": "examples/csv-dedupe",
                      "companions": [{"name": "csv-helper", "path": "examples/csv-helper"}]}

    def run_one(self, entry=None):
        FakePopen.script = [init_event(["csv-dedupe", "csv-helper", BACKGROUND]), skill_call("csv-dedupe")]
        self.assertEqual(self.run_main("--runs", "1", manifest=self.manifest(entry or self.entry)), 0)
        (run_dir,) = self.run_dirs()
        return run_dir

    def read_meta(self, run_dir):
        return json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))


class Companions(TrialCase):
    def test_companions_are_installed_in_every_trial(self):
        self.run_one()
        self.assertTrue(FakePopen.launches)
        for launch in FakePopen.launches:
            self.assertEqual(launch["installed"], ["csv-dedupe", "csv-helper"])

    def test_without_companions_only_the_skill_is_installed(self):
        self.run_one({"name": "csv-dedupe", "path": "examples/csv-dedupe"})
        for launch in FakePopen.launches:
            self.assertEqual(launch["installed"], ["csv-dedupe"])

    def test_companions_are_not_background_skills(self):
        meta = self.read_meta(self.run_one())
        self.assertEqual(meta["loaded_skills"], [BACKGROUND])
        self.assertEqual(list(meta["skills"]["csv-dedupe"]["companions"]), ["csv-helper"])

    def test_report_header_lists_companions(self):
        report = (self.run_one() / "report.md").read_text(encoding="utf-8")
        self.assertIn("Installed alongside csv-dedupe", report)
        self.assertIn("csv-helper", report.split("Installed alongside csv-dedupe", 1)[1].splitlines()[0])
        self.assertIn(BACKGROUND, report)

    def test_invoking_a_companion_counts_as_stolen(self):
        FakePopen.script = [init_event(["csv-dedupe", "csv-helper"]), skill_call("csv-helper")]
        self.assertEqual(self.run_main("--runs", "1", manifest=self.manifest(self.entry)), 0)
        (run_dir,) = self.run_dirs()
        self.assertEqual({r["verdict"] for r in self.records(run_dir)}, {"other_skill"})

    def test_resume_refuses_when_the_companion_set_changed(self):
        run_dir = self.run_one()
        before = len(self.records(run_dir))
        code = self.run_main("--runs", "1", "--resume", str(run_dir),
                             manifest=self.manifest({"name": "csv-dedupe", "path": "examples/csv-dedupe"}))
        self.assertNotEqual(code, 0)
        self.assertEqual(len(self.records(run_dir)), before)


class TrialProcess(TrialCase):
    def test_host_variables_are_stripped_and_user_ones_kept(self):
        env = {"CLAUDE_CODE_ENTRYPOINT": "claude-desktop", "CLAUDECODE": "1", "CLAUDE_CODE_OAUTH_TOKEN": "x",
               "CLAUDE_CODE_GIT_BASH_PATH": "C:/git/bash.exe", "SG_TEST_PLAIN": "kept"}
        with mock.patch.dict(os.environ, env):
            self.run_one()
        seen = FakePopen.launches[0]["env"]
        self.assertNotIn("CLAUDE_CODE_ENTRYPOINT", seen)
        self.assertNotIn("CLAUDECODE", seen)
        self.assertEqual(seen["CLAUDE_CODE_OAUTH_TOKEN"], "x")
        self.assertEqual(seen["CLAUDE_CODE_GIT_BASH_PATH"], "C:/git/bash.exe")
        self.assertEqual(seen["SG_TEST_PLAIN"], "kept")

    def test_tools_offered_are_recorded(self):
        run_dir = self.run_one()
        self.assertEqual(self.read_meta(run_dir)["tools"], ["Bash", "Read", "Skill"])
        self.assertIn("Tools offered to the model: (3)", (run_dir / "report.md").read_text(encoding="utf-8"))

    def test_error_result_is_an_error_not_a_miss(self):
        FakePopen.script = [init_event(["csv-dedupe"]),
                            {"type": "result", "is_error": True, "result": "You've hit your usage limit"}]
        rec = tt.run_trial("claude", tt.resolve_skill({"name": "csv-dedupe", "path": "examples/csv-dedupe"},
                                                      self.sandbox / ".cache"),
                           "dedupe my csv", "haiku", 5)
        self.assertEqual(rec["verdict"], "error")
        self.assertIn("usage limit", rec["error"])

    def test_clean_result_without_a_tool_call_is_not_triggered(self):
        FakePopen.script = [init_event(["csv-dedupe"]), {"type": "result", "is_error": False, "result": "done"}]
        rec = tt.run_trial("claude", tt.resolve_skill({"name": "csv-dedupe", "path": "examples/csv-dedupe"},
                                                      self.sandbox / ".cache"),
                           "dedupe my csv", "haiku", 5)
        self.assertEqual(rec["verdict"], "not_triggered")


if __name__ == "__main__":
    unittest.main()
