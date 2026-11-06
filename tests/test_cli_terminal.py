"""The npm CLI on a real pseudo-terminal, against a fake host: no network needed, no model, nothing installed.

Some bugs only exist on a terminal. Signing in hands the terminal to the host and has to get it back, and a program
whose stdin is gone does not fail: the next question draws itself, node runs out of work, and the shell prompt returns.
"""
import json
import os
import re
import select
import shutil
import signal
import stat
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
DOWN = b"\x1b[B"

FAKE_HOST = """#!/bin/sh
case "$1" in
  --version) echo "2.0.0 (Claude Code)"; exit 0;;
  auth) touch "$HOME/signed-in"; echo "Login successful."; exit 0;;
esac
if [ ! -e "$HOME/signed-in" ]; then
  echo '{"type":"result","is_error":true,"result":"Not logged in - Please run /login"}'
  exit 1
fi
case "$2" in
  "Reply with"*) echo '{"type":"result","result":"OK"}';;
  *) cat "$HOME/draft.json";;
esac
"""


@unittest.skipIf(sys.platform == "win32" or not shutil.which("node"), "needs a pty and node")
class SignInOnATerminal(unittest.TestCase):
    def setUp(self):
        import pty

        self.pty = pty
        self.home = Path(tempfile.mkdtemp(prefix="sg-term-"))
        self.addCleanup(shutil.rmtree, self.home, True)
        skill = self.home / ".claude" / "skills" / "csv-dedupe"
        shutil.copytree(ROOT / "step0" / "examples" / "csv-dedupe", skill)
        fake = self.home / "fakebin"
        fake.mkdir()
        (fake / "claude").write_text(FAKE_HOST)
        (fake / "claude").chmod(stat.S_IRWXU)
        queries = [{"query": f"please dedupe file {i}", "should_trigger": True, "clause": "c"} for i in range(3)]
        queries += [{"query": f"dedupe my inbox {i}", "should_trigger": False, "clause": "c", "shares": "dedupe", "borrows": "dedupe"} for i in range(3)]
        (self.home / "draft.json").write_text(json.dumps({"type": "result", "result": json.dumps({"clauses": ["c"], "queries": queries})}))
        self.env = {
            "HOME": str(self.home),
            "PATH": f"{fake}:{Path(shutil.which('node')).parent}:/usr/bin:/bin",
            "TERM": "xterm",
            "COLUMNS": "130",
            "SG_NO_UPDATE_CHECK": "1",
            "SKILLGAUNTLET_CACHE": str(self.home / "cache"),
        }

    def test_questions_still_work_after_signing_in(self):
        pid, fd = self.pty.fork()
        if pid == 0:
            os.chdir(self.home)
            os.execve(shutil.which("node"), ["node", str(ROOT / "bin" / "skillgauntlet.js"), "--lang", "en"], self.env)
        self.addCleanup(self._kill, pid)

        out = ""
        alive = True
        answered = 0
        reached = False
        last = time.time()
        deadline = time.time() + 60
        while time.time() < deadline and alive:
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    data = b""
                if not data:
                    alive = False
                    break
                out += ANSI.sub("", data.decode("utf8", "replace"))
                last = time.time()
                continue
            if time.time() - last < 1.0:
                continue
            tail = out[answered:]
            if re.search(r"questions × \d+ run", tail):
                reached = True
                break
            # Installed skill, not the suggested one, so nothing is fetched; every other question takes its default.
            key = DOWN + b"\r" if "Which skill should be tested" in tail else b"y" if "Start drafting" in tail else b"\r"
            answered = len(out)
            os.write(fd, key)
            last = time.time()

        self.assertTrue((self.home / "signed-in").exists(), f"never signed in:\n{out[-1500:]}")
        self.assertTrue(alive, f"the program ended without being answered:\n{out[-800:]}")
        self.assertTrue(reached, f"never reached the trials question:\n{out[-800:]}")

        # Still there, and still listening: the third entry declines the trials and the run goes on.
        time.sleep(1.5)
        self.assertEqual(os.waitpid(pid, os.WNOHANG), (0, 0), f"the program ended by itself at the question:\n{out[-800:]}")
        os.write(fd, DOWN + DOWN + b"\r")
        end = time.time() + 15
        finished = False
        while time.time() < end:
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    finished = True
                    break
                if not data:
                    finished = True
                    break
                out += ANSI.sub("", data.decode("utf8", "replace"))
        self.assertTrue(finished, f"the keys were not read:\n{out[-800:]}")
        self.assertRegex(out[answered:], r"(?i)skip|not run|no trial|declin", out[-800:])

    @staticmethod
    def _kill(pid):
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except OSError:
            pass


if __name__ == "__main__":
    unittest.main()
