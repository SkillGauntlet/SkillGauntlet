#!/usr/bin/env python3
"""SkillGauntlet step 0: Claude Code skill trigger test (single host, trigger layer only).

Requires only the Python 3.10+ standard library and a logged-in `claude` CLI.

  python trigger_test.py draft  --manifest skills.json             # draft question packs for skills without one (needs human review)
  python trigger_test.py run    --manifest skills.json --dry-run   # print the plan and a rough cost estimate only
  python trigger_test.py run    --manifest skills.json --runs 3    # real run
  python trigger_test.py report results/<run_id>                   # rebuild the report from raw records

Verdict rules (one trial = a fresh temp project dir + only the skill under test + one query):
  - the model calls the Skill tool with a matching name, or Reads the skill's SKILL.md  -> triggered
  - the model calls a different skill                                                     -> other_skill (stolen)
  - the model first calls any other tool (Bash, Edit, Glob, ...)                          -> not_triggered, process killed at once
  - the model answers without invoking the skill                                          -> not_triggered
This default (--max-explore 0) is the detection rule of Anthropic's skill-creator (scripts/run_eval.py): the first
tool decision alone decides. Use it for headline numbers.

Robustness check: --max-explore N lets the model make up to N read-only calls (Glob/Grep/Read/LS) before the
verdict, confined to the trial directory (anything outside is denied); more than N, or any other tool, means
not_triggered. The process is killed as soon as a verdict is reached, so a trial never carries out the task.
"""
import argparse
import concurrent.futures as cf
import contextlib
import datetime as dt
import hashlib
import json
import math
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

RUNNER_VERSION = "0.4.2"
READ_ONLY_TOOLS = {"Glob", "Grep", "Read", "LS"}  # exploration allowed before a verdict, up to --max-explore calls
DEFAULT_MAX_EXPLORE = 0  # 0 = skill-creator's first-decision rule, used for headline numbers
QUERY_HASH_SCHEME = "sha256 of canonical JSON [{id, query, should_trigger}] sorted by id"
SET_SPREAD_FLAG = 0.2  # flag a skill when recall differs by more than this between question sets
MIN_TRIALS = 10  # positive or negative trial records needed before a set gets a grade
MIN_POS_QUERIES = 4  # should-trigger queries per set needed to reach MIN_TRIALS at 3 runs per query
HERE = Path(__file__).resolve().parent

# Rough USD cost range per trial (only the first decision after early stop; subscription users spend quota instead)
COST_PER_TRIAL = {"haiku": (0.003, 0.012), "sonnet": (0.01, 0.04), "opus": (0.02, 0.08), "fable": (0.02, 0.08),
                  # DeepSeek's Anthropic-compatible endpoint ignores cache_control, so the whole prompt is billed
                  # at the cache-miss price (~2.66e4 tokens/trial): about 0.004 at off-peak, double at peak hours
                  "deepseek": (0.003, 0.009)}
DEFAULT_BACKEND = "anthropic"  # when ANTHROPIC_BASE_URL is unset the CLI talks to Anthropic itself
# Gateways commonly remap Anthropic model names instead of rejecting them (DeepSeek: claude-haiku*/claude-sonnet* ->
# deepseek-flash, claude-opus* -> deepseek-v4-pro), which silently tests a model other than the one named.
ANTHROPIC_MODEL_HINTS = ("haiku", "sonnet", "opus", "claude")


def backend_of(base_url):
    """Host of ANTHROPIC_BASE_URL, so a run's backend is recorded and cannot be confused with Anthropic's."""
    if not base_url:
        return DEFAULT_BACKEND
    p = urlsplit(base_url if "://" in base_url else "https://" + base_url)
    if p.netloc == "api.anthropic.com":  # some launchers (e.g. the desktop app) set it to Anthropic's own endpoint
        return DEFAULT_BACKEND
    return p.netloc or base_url


def check_model_backend(model, backend, allow_remap):
    """Refuse an Anthropic model name on a non-Anthropic backend: the gateway will remap it silently."""
    if backend == DEFAULT_BACKEND or not model or allow_remap:
        return
    if any(h in model.lower() for h in ANTHROPIC_MODEL_HINTS):
        die(f"backend {backend} remaps Anthropic model names (a name like {model!r} would silently test a different "
            f"model), so pass the backend's own model id instead, or --allow-model-remap if it passes names through")


def cost_range(model, backend):
    if backend != DEFAULT_BACKEND and "deepseek" in backend:
        return COST_PER_TRIAL["deepseek"]
    return COST_PER_TRIAL.get((model or "").lower(), (0.005, 0.08))


# ---------- common ----------

def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def find_claude():
    exe = shutil.which("claude")
    if not exe:
        die("claude CLI not found; install Claude Code and log in first")
    return exe


def claude_version(claude):
    try:
        return subprocess.run([claude, "--version"], capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return "unknown"


def wilson(k, n, z=1.96):
    """Wilson 95% confidence interval for a binomial proportion."""
    if n == 0:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def read_frontmatter(skill_md):
    text = skill_md.read_text(encoding="utf-8", errors="replace")
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    fm = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith(" "):
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, text


# ---------- skills and question packs ----------

def resolve_skill(entry, cache_dir):
    """Resolve a manifest entry to a local directory, pinning the source commit and SKILL.md hash."""
    name = entry["name"]
    if "path" in entry:
        skill_dir = (HERE / entry["path"]).resolve() if not os.path.isabs(entry["path"]) else Path(entry["path"])
        source = {"path": str(entry["path"])}
    elif "repo" in entry:
        repo, ref, subdir = entry["repo"], entry.get("ref"), entry.get("subdir", "")
        slug = re.sub(r"[^A-Za-z0-9_.-]", "_", repo.split("://")[-1]) + ("@" + ref if ref else "")
        clone = cache_dir / slug
        if not clone.exists():
            if ref and re.fullmatch(r"[0-9a-f]{40}", ref):
                # shallow-fetch only the pinned commit instead of cloning a large repo in full
                clone.mkdir(parents=True)
                for c in (["init", "--quiet"], ["remote", "add", "origin", repo],
                          ["fetch", "--quiet", "--depth", "1", "origin", ref], ["checkout", "--quiet", "FETCH_HEAD"]):
                    subprocess.run(["git", "-C", str(clone)] + c, check=True)
            else:
                cmd = ["git", "clone", "--quiet", "--depth", "1"] + (["--branch", ref] if ref else []) + [repo, str(clone)]
                subprocess.run(cmd, check=True)
        commit = subprocess.run(["git", "-C", str(clone), "rev-parse", "HEAD"],
                                capture_output=True, text=True, check=True).stdout.strip()
        skill_dir = clone / subdir
        source = {"repo": repo, "commit": commit, "subdir": subdir}
    else:
        die(f"skill {name} needs either path or repo")
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        die(f"SKILL.md for skill {name} not found: {skill_md}")
    fm, _ = read_frontmatter(skill_md)
    if fm.get("name") and fm["name"] != name:
        print(f"warning: manifest name {name} differs from name={fm['name']} in SKILL.md; using SKILL.md", file=sys.stderr)
        name = fm["name"]
    # companions: skills from the same family that a real install puts alongside (e.g. the sibling a description
    # routes work to); installed in every trial of this skill, and invoking one counts as other_skill
    companions = [resolve_skill({**entry, **c, "companions": []}, cache_dir) for c in entry.get("companions", [])]
    return {"name": name, "dir": skill_dir, "source": source,
            "skill_md_sha256": sha256_bytes(skill_md.read_bytes()),
            "description": fm.get("description", ""),
            "model_invocable": fm.get("disable-model-invocation", "").lower() != "true",
            "companions": companions}


def query_set_files(entry, name):
    """Question sets for a skill as [(set_id, path)]: an explicit "queries" file in the manifest, else every
    queries/<skill>/*.json, else the legacy single pack queries/<skill>.json (set id "legacy")."""
    if "queries" in entry:
        p = HERE / entry["queries"]
        return [(p.stem, p)] if p.is_file() else []
    d = HERE / "queries" / name
    files = sorted(d.glob("*.json")) if d.is_dir() else []
    if files:
        return [(p.stem, p) for p in files]
    p = HERE / "queries" / f"{name}.json"
    return [("legacy", p)] if p.is_file() else []


def query_set_sha256(queries):
    """Hash of the test content only: id, query and should_trigger of each query, in canonical JSON sorted by id.
    Review metadata (reviewed, review_notes, note) is excluded, so annotating a pack does not change its version."""
    core = sorted(({"id": q["id"], "query": q["query"], "should_trigger": bool(q["should_trigger"])} for q in queries),
                  key=lambda q: q["id"])
    return sha256_bytes(json.dumps(core, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def load_queries(path):
    if not path.is_file():
        return None
    pack = json.loads(path.read_text(encoding="utf-8"))
    for i, q in enumerate(pack["queries"]):
        q.setdefault("id", f"q{i + 1:02d}")
    pack["sha256"] = query_set_sha256(pack["queries"])
    return pack


# ---------- single trial ----------

def kill_tree(proc):
    """Kill the process and its children (on Windows claude may spawn children that keep file handles open)."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.kill()


def matches_skill(invoked, name):
    return invoked == name or invoked.endswith(":" + name)


# Variables a host (the Claude desktop app, the Agent SDK, an outer Claude Code session) sets for its own child
# processes. A trial inherits them otherwise, and they change what the model under test sees: under the desktop app
# the CLI adds Artifact, ArtifactComments and ArtifactData to the tool list, and the model then picks Artifact first
# on page-building requests. Auth and platform settings a user sets on purpose are kept.
HOST_ENV_KEEP = {"CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
                 "CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CODE_MAX_OUTPUT_TOKENS"}
HOST_ENV_DROP = {"CLAUDECODE", "CLAUDE_PID", "CLAUDE_EFFORT", "CLAUDE_AGENT_SDK_VERSION", "CLAUDE_AGENT_SDK_MCP_NO_PREFIX",
                 "CLAUDE_PREVIEW_CLASSIFIER_FLOOR", "MCP_SERVER_CONNECTION_BATCH_SIZE", "MCP_CONNECTION_NONBLOCKING"}


def trial_env():
    """The environment for a trial: this process's, minus what a host injected for its own children."""
    return {k: v for k, v in os.environ.items()
            if k in HOST_ENV_KEEP or not (k.startswith("CLAUDE_CODE_") or k in HOST_ENV_DROP)}


@contextlib.contextmanager
def trial_dir(fixed=None):
    """A fresh, empty project dir for one trial. `fixed` reuses the same path (emptied first), so the working
    directory that the CLI writes into its system prompt is identical across trials."""
    if not fixed:
        with tempfile.TemporaryDirectory(prefix="sg-trig-", ignore_cleanup_errors=True) as tmp:
            yield tmp
        return
    p = Path(fixed)
    shutil.rmtree(p, ignore_errors=True)
    p.mkdir(parents=True)
    try:
        yield str(p)
    finally:
        shutil.rmtree(p, ignore_errors=True)


def run_trial(claude, skill, query, model, timeout, max_explore=DEFAULT_MAX_EXPLORE, fixed_dir=None):
    rec = {"verdict": None, "invoked_skill": None, "first_tool": None, "tools": [], "explore_steps": 0,
           "denied": 0, "cost_usd": None, "usage": None, "error": None, "init": None}
    # tools that may appear before a verdict without ending the trial
    allowed_before_verdict = {"Skill"} | (READ_ONLY_TOOLS if max_explore > 0 else {"Read"})
    t0 = time.time()
    with trial_dir(fixed_dir) as tmp:
        for s in [skill] + skill.get("companions", []):
            shutil.copytree(s["dir"], Path(tmp) / ".claude" / "skills" / s["name"], ignore=shutil.ignore_patterns(".git"))
        cmd = [claude, "-p", query,
               "--output-format", "stream-json", "--verbose", "--include-partial-messages",
               "--permission-mode", "dontAsk",   # deny anything that would need approval
               "--setting-sources", "project",   # ignore user-level settings (and their permission allowlist)
               "--strict-mcp-config",            # load no MCP servers
               "--no-session-persistence"]
        if max_explore > 0:
            # read-only exploration, confined to the trial directory
            cmd += ["--allowedTools", "Read(./**)", "Glob(./**)", "Grep(./**)", "LS(./**)"]
        if model:
            cmd += ["--model", model]
        err_path = Path(tmp) / "stderr.txt"
        with open(err_path, "w", encoding="utf-8") as err:
            proc = subprocess.Popen(cmd, cwd=tmp, env=trial_env(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=err, text=True, encoding="utf-8", errors="replace")
            timer = threading.Timer(timeout, kill_tree, [proc])
            timer.start()

            def decide(verdict, **kw):
                rec["verdict"] = verdict
                rec.update(kw)
                kill_tree(proc)

            try:
                for line in proc.stdout:
                    try:
                        ev = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    et = ev.get("type")
                    if et == "system" and ev.get("subtype") == "init":
                        rec["init"] = {k: ev.get(k) for k in ("model", "claude_code_version", "skills", "apiKeySource",
                                                              "tools")}
                    elif et == "stream_event":
                        se = ev.get("event") or {}
                        if se.get("type") == "message_start" and rec["usage"] is None:
                            # the first request's token use: the trial is killed before a result event reports totals
                            u = (se.get("message") or {}).get("usage") or {}
                            rec["usage"] = {k: u.get(k) for k in ("input_tokens", "cache_creation_input_tokens",
                                                                  "cache_read_input_tokens")}
                        block = se.get("content_block") or {}
                        if block.get("type") == "tool_use" and block.get("name") not in allowed_before_verdict:
                            # stop before the tool actually runs: this is both the verdict and a guard against side effects
                            rec["tools"].append(block.get("name"))
                            decide("not_triggered", first_tool=rec["first_tool"] or block.get("name"))
                            break
                    elif et == "user":
                        content = ev.get("message", {}).get("content")
                        for c in content if isinstance(content, list) else []:
                            if c.get("type") == "tool_result" and "has been denied" in str(c.get("content", "")):
                                rec["denied"] += 1
                    elif et == "assistant":
                        for c in ev["message"].get("content", []):
                            if c.get("type") != "tool_use":
                                continue
                            name, inp = c.get("name"), c.get("input") or {}
                            rec["tools"].append(name)
                            rec["first_tool"] = rec["first_tool"] or name
                            if name == "Skill":
                                inv = str(inp.get("skill", ""))
                                if matches_skill(inv, skill["name"]):
                                    decide("triggered", invoked_skill=inv)
                                else:
                                    decide("other_skill", invoked_skill=inv)
                            elif name == "Read" and f"skills/{skill['name']}/" in str(inp.get("file_path", "")).replace("\\", "/"):
                                decide("triggered")
                            elif name in READ_ONLY_TOOLS and max_explore > 0:
                                rec["explore_steps"] += 1
                                if rec["explore_steps"] > max_explore:
                                    decide("not_triggered")
                                else:
                                    continue  # let the exploration run and keep watching
                            else:
                                decide("not_triggered")
                            break
                        if rec["verdict"]:
                            break
                    elif et == "result":
                        rec["cost_usd"] = ev.get("total_cost_usd")
                        if not rec["verdict"] and ev.get("is_error"):
                            # e.g. a usage limit: the CLI ends with an error result and no tool call, which would
                            # otherwise read as "answered without the skill"
                            rec["verdict"] = "error"
                            rec["error"] = str(ev.get("result") or ev.get("subtype"))[:500]
                        elif not rec["verdict"]:
                            rec["verdict"] = "not_triggered"
            finally:
                timer.cancel()
                kill_tree(proc)
                proc.wait()
        if not rec["verdict"]:
            elapsed = time.time() - t0
            rec["verdict"] = "timeout" if elapsed >= timeout else "error"
            rec["error"] = err_path.read_text(encoding="utf-8", errors="replace")[-500:]
    rec["latency_s"] = round(time.time() - t0, 2)
    return rec


# ---------- summary and grading ----------

def grade(recall, fpr, n_pos, n_neg, min_trials):
    """Coarse grade for the trigger layer only; no precise scores."""
    if n_pos < min_trials or n_neg < min_trials:
        return "insufficient data", []
    flags = []
    if recall < 0.5:
        flags.append("rarely triggers")
    if fpr > 0.25:
        flags.append("over-triggers")
    if recall >= 0.8 and fpr <= 0.1:
        g = "triggers well"
    elif not flags:
        g = "triggers fair"
    else:
        g = "triggers poorly"
    return g, flags


CJK = re.compile(r"[一-鿿]")


def query_lang(query):
    return "zh" if CJK.search(query) else "en"


def runs_needed(should_trigger, verdicts, max_runs, sampling):
    """Runs a query gets. Adaptive: negatives start at 1 run and go to max_runs only if one triggered; should-trigger
    queries start at max_runs - 1 and go to max_runs only if their runs disagree. `verdicts` are the valid ones so far."""
    if sampling != "adaptive":
        return max_runs
    start = max(1, max_runs - 1) if should_trigger else 1
    if len(verdicts) < start:
        return start
    hits = sum(v == "triggered" for v in verdicts)
    escalate = 0 < hits < len(verdicts) if should_trigger else hits > 0
    return max_runs if escalate else start


def query_key(r):
    """One question across trials: ids repeat across sets and skills, so all three identify it."""
    return r["skill"], r.get("query_set"), r["query_id"]


def rate(rs, adaptive):
    """Hit rate and its Wilson CI. Fixed sampling pools trials. Adaptive sampling gives queries unequal run counts
    (a negative that triggered once gets 3 runs, the rest 1), so pooling would over-weight exactly the queries that
    triggered; instead average per-query rates and size the CI by the number of queries. With equal run counts the
    point estimate is the same either way."""
    if not rs:
        return None, (None, None)
    if not adaptive:
        k = sum(r["verdict"] == "triggered" for r in rs)
        return k / len(rs), wilson(k, len(rs))
    per_q = {}
    for r in rs:
        per_q.setdefault(query_key(r), []).append(r["verdict"] == "triggered")
    p = sum(sum(h) / len(h) for h in per_q.values()) / len(per_q)
    return p, wilson(p * len(per_q), len(per_q))


def n_queries(rs):
    return len({query_key(r) for r in rs})


def rates(valid, adaptive=False):
    """Recall and false-positive rate (with Wilson CIs) over a list of valid trial records."""
    pos = [r for r in valid if r["should_trigger"]]
    neg = [r for r in valid if not r["should_trigger"]]
    recall, r_ci = rate(pos, adaptive)
    fpr, f_ci = rate(neg, adaptive)
    rnd = lambda ci: [round(x, 3) if x is not None else None for x in ci]
    return {"recall": round(recall, 3) if pos else None, "recall_ci95": rnd(r_ci),
            "false_positive_rate": round(fpr, 3) if neg else None,
            "fpr_ci95": rnd(f_ci), "n_pos": len(pos), "n_neg": len(neg),
            "q_pos": n_queries(pos), "q_neg": n_queries(neg)}


def grade_of(x, adaptive, min_trials):
    """Grade for a rates() dict. Adaptive sampling counts queries towards the minimum (MIN_POS_QUERIES is the query
    count that reaches MIN_TRIALS at 3 runs), since its CI is sized by queries, not trials."""
    n_pos, n_neg, floor = (x["q_pos"], x["q_neg"], MIN_POS_QUERIES) if adaptive else (x["n_pos"], x["n_neg"], min_trials)
    return grade(x["recall"] or 0.0, x["false_positive_rate"] or 0.0, n_pos, n_neg, floor)


def by_language(valid, adaptive=False):
    return {lang: rates([r for r in valid if query_lang(r["query"]) == lang], adaptive) for lang in ("zh", "en")}


def summarize(records, meta, min_trials=MIN_TRIALS):
    adaptive = meta.get("sampling") == "adaptive"
    by_skill = {}
    for r in records:
        by_skill.setdefault(r["skill"], []).append(r)
    out = []
    for name, rs in sorted(by_skill.items()):
        valid = [r for r in rs if r["verdict"] in ("triggered", "not_triggered", "other_skill")]
        pos = [r for r in valid if r["should_trigger"]]
        head = rates(valid, adaptive)
        recall, fpr = head["recall"] or 0.0, head["false_positive_rate"] or 0.0
        r_ci, f_ci = head["recall_ci95"], head["fpr_ci95"]
        g, flags = grade_of(head, adaptive, min_trials)
        # confidence interval straddles a grade threshold -> suggest more runs (adaptive sampling)
        if g != "insufficient data" and (r_ci[0] < 0.8 <= r_ci[1] or f_ci[0] <= 0.1 < f_ci[1]):
            flags.append("borderline, add runs")
        # Tool behaviour. "Answered without calling any tool at all" is a property of the model and the harness, not
        # of the skill's description, and it dominates the verdict on backends with weaker tool-call adherence, so
        # keep it apart from "called another tool first" (which really is a stolen trigger).
        pos_no_tool = sum(1 for r in pos if r["verdict"] == "not_triggered" and not r.get("first_tool"))
        first_tool = {}
        for r in valid:
            k = r.get("first_tool") or "(no tool)"
            first_tool[k] = first_tool.get(k, 0) + 1
        if pos and pos_no_tool / len(pos) >= 0.5:
            flags.append(f"{pct(pos_no_tool / len(pos))} of should-trigger trials called no tool at all "
                         f"(model or harness, not the description)")
        per_q = {}
        for r in valid:
            # ids repeat across question sets (each set numbers from q01), so key by set too
            qkey = f"{r['query_set']}/{r['query_id']}" if r.get("query_set") else r["query_id"]
            q = per_q.setdefault(qkey, {"query": r["query"], "should_trigger": r["should_trigger"], "n": 0, "hits": 0})
            q["n"] += 1
            q["hits"] += r["verdict"] == "triggered"
        others = {}
        for r in valid:
            if r["verdict"] == "other_skill":
                others[r["invoked_skill"]] = others.get(r["invoked_skill"], 0) + 1
        sm = meta["skills"].get(name, {})
        loaded = meta.get("loaded_skills") or []
        same_name = [s for s in loaded if s != name and s.split(":")[-1] == name]
        if same_name:
            flags.append("same-name skill in environment: " + ",".join(same_name))
        # independent question sets: per-set results and the spread between them
        by_set = {}
        for set_id in sorted({r.get("query_set") or "legacy" for r in valid}):
            x = rates([r for r in valid if (r.get("query_set") or "legacy") == set_id], adaptive)
            x["grade"] = grade_of(x, adaptive, min_trials)[0]
            by_set[set_id] = x
        recalls = [x["recall"] for x in by_set.values() if x["recall"] is not None]
        set_spread = round(max(recalls) - min(recalls), 3) if len(recalls) >= 2 else None
        if len(by_set) < 2:
            flags.append("one question set only")
        elif set_spread > SET_SPREAD_FLAG or len({x["grade"] for x in by_set.values()}) > 1:
            flags.append("question sets disagree")
        out.append({
            "skill": name, "grade": g, "flags": flags,
            "recall": round(recall, 3), "recall_ci95": r_ci,
            "false_positive_rate": round(fpr, 3), "fpr_ci95": f_ci,
            "n_pos": head["n_pos"], "n_neg": head["n_neg"], "q_pos": head["q_pos"], "q_neg": head["q_neg"],
            "errors": len(rs) - len(valid), "stolen_by": others,
            "no_tool_call": pos_no_tool,
            "no_tool_call_rate": round(pos_no_tool / len(pos), 3) if pos else None,
            "first_tool": dict(sorted(first_tool.items(), key=lambda kv: -kv[1])),
            "source": sm.get("source"), "skill_md_sha256": sm.get("skill_md_sha256"),
            "query_sets": sm.get("query_sets") or {"legacy": {"query_set_sha256": sm.get("query_set_sha256")}},
            "by_set": by_set, "set_spread": set_spread,
            "by_language": by_language(valid, adaptive),
            "by_clause": {c: rates([r for r in valid if r.get("clause") == c], adaptive)
                          for c in sorted({r.get("clause") for r in valid if r.get("clause")})},
            "per_query": per_q,
        })
    return out


def lang_gap_note(zh, en):
    """Flag a language gap only when the two recall CIs do not overlap."""
    if zh["recall"] is None or en["recall"] is None:
        return ""
    if zh["recall_ci95"][1] < en["recall_ci95"][0]:
        return "Chinese lower"
    if en["recall_ci95"][1] < zh["recall_ci95"][0]:
        return "English lower"
    return ""


def pct(x):
    return "—" if x is None else f"{x * 100:.0f}%"


def write_report(run_dir):
    meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
    records = [json.loads(l) for l in (run_dir / "raw.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    summary = summarize(records, meta)
    (run_dir / "summary.json").write_text(json.dumps({"meta": meta, "skills": summary}, ensure_ascii=False, indent=2),
                                          encoding="utf-8")
    backend = meta.get("backend") or DEFAULT_BACKEND
    model_label = meta.get("model_resolved") or meta.get("model") or "default"
    if meta.get("model") and meta.get("model_resolved") and meta["model"] != meta["model_resolved"]:
        model_label += f" (requested as {meta['model']})"
    L = [f"# Trigger test report {meta['run_id']}", "",
         f"- Host: Claude Code {meta.get('claude_version')}; backend: {backend}; model: {model_label}",
         f"- Runs per query: {meta['runs']}; total trials: {len(records)}; runner v{meta['runner_version']}; {meta['platform']}",
         f"- Sampling: " + ("adaptive (should-not-trigger queries run once and go to the full count only if one "
                            "triggered; should-trigger queries run one fewer and go to the full count only if their "
                            "runs disagree). Rates are averages of per-query rates and CIs are sized by the number of "
                            "queries, since repeat runs of one query are not independent"
                            if meta.get("sampling") == "adaptive" else "fixed (every query gets every run)"),
         f"- Verdict rule: " + (f"up to {meta['max_explore']} read-only tool calls (Glob/Grep/Read/LS, confined to the trial "
                                f"directory) allowed before the verdict (robustness check, not the headline rule)"
                                if meta.get("max_explore")
                                else "first tool decision only (skill-creator rule, headline)"),
         f"- Other skills loaded in the environment ({len(meta.get('loaded_skills') or [])}, the background that can steal triggers): "
         f"{', '.join(meta.get('loaded_skills') or []) or 'none'}",
         *[f"- Installed alongside {n} (same-family companions, invoking one counts as stolen): {', '.join(sm['companions'])}"
           for n, sm in meta["skills"].items() if sm.get("companions")],
         f"- Tools offered to the model: " + (f"({len(meta['tools'])}) {', '.join(meta['tools'])}" if meta.get("tools")
                                              else "not recorded (runs before v0.4.1)"),
         "- Recall = share of should-trigger queries where the skill was actually invoked; "
         "false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.",
         "", "| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |", "|---|---|---|---|---|---|---|"]
    for s in summary:
        note = list(s["flags"])
        stolen = sum(s["stolen_by"].values())
        L.append(f"| {s['skill']} | {s['grade']} "
                 f"| {pct(s['recall'])} ({pct(s['recall_ci95'][0])}–{pct(s['recall_ci95'][1])}) "
                 f"| {pct(s['false_positive_rate'])} ({pct(s['fpr_ci95'][0])}–{pct(s['fpr_ci95'][1])}) "
                 f"| {stolen} | {s['errors']} | {'; '.join(note)} |")

    L += ["", "## Tool behaviour",
          "",
          "`no tool` = on a should-trigger trial the model answered without calling any tool at all. That is a "
          "property of the model and the harness, not of the skill's description, so read this before blaming a "
          "description: on a non-Anthropic backend it is often what a low recall actually reflects.",
          "",
          "| Skill | No tool call (should-trigger) | First tool across all trials |", "|---|---|---|"]
    for s in summary:
        dist = ", ".join(f"{k} {v}" for k, v in s["first_tool"].items()) or "—"
        L.append(f"| {s['skill']} | {s['no_tool_call']}/{s['n_pos']} ({pct(s['no_tool_call_rate'])}) | {dist} |")

    def rate_cell(x, key, ci_key):
        if x[key] is None:
            return "—"
        return f"{pct(x[key])} ({pct(x[ci_key][0])}–{pct(x[ci_key][1])})"

    L += ["", "## Question sets",
          "",
          "Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; "
          f"the spread is the largest recall difference between sets, flagged above {SET_SPREAD_FLAG * 100:.0f} "
          "points or when sets get different grades.",
          "",
          "| Skill | Set | Grade | Recall | False positives | Trials pos / neg |", "|---|---|---|---|---|---|"]
    for s in summary:
        for set_id, x in s["by_set"].items():
            L.append(f"| {s['skill']} | {set_id} | {x['grade']} | {rate_cell(x, 'recall', 'recall_ci95')} "
                     f"| {rate_cell(x, 'false_positive_rate', 'fpr_ci95')} | {x['n_pos']} / {x['n_neg']} |")
        spread = "—" if s["set_spread"] is None else f"{s['set_spread'] * 100:.0f} points"
        L.append(f"| {s['skill']} | **spread** | | {spread} | | |")

    valid_all = [r for r in records if r["verdict"] in ("triggered", "not_triggered", "other_skill")]
    pooled = by_language(valid_all, meta.get("sampling") == "adaptive")
    L += ["", "## Chinese vs English queries",
          "",
          "Language is detected per query (any CJK character counts as Chinese). "
          "A gap is flagged only when the two recall confidence intervals do not overlap.",
          "",
          "| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |",
          "|---|---|---|---|---|---|---|"]
    for name, bl in [(s["skill"], s["by_language"]) for s in summary] + [("**All skills**", pooled)]:
        zh, en = bl["zh"], bl["en"]
        L.append(f"| {name} | {rate_cell(zh, 'recall', 'recall_ci95')} | {rate_cell(en, 'recall', 'recall_ci95')} "
                 f"| {rate_cell(zh, 'false_positive_rate', 'fpr_ci95')} | {rate_cell(en, 'false_positive_rate', 'fpr_ci95')} "
                 f"| {zh['n_pos'] + zh['n_neg']} / {en['n_pos'] + en['n_neg']} | {lang_gap_note(zh, en)} |")
    if any(s["by_clause"] for s in summary):
        L += ["", "## Recall by trigger clause",
              "",
              "Clauses are the situations the skill's description says it should be used in. Near-miss negatives "
              "are tagged with the clause they imitate.",
              "",
              "| Skill | Clause | Recall | False positives | Trials pos / neg |", "|---|---|---|---|---|"]
        for s in summary:
            for c, x in s["by_clause"].items():
                L.append(f"| {s['skill']} | {c} | {rate_cell(x, 'recall', 'recall_ci95')} "
                         f"| {rate_cell(x, 'false_positive_rate', 'fpr_ci95')} | {x['n_pos']} / {x['n_neg']} |")
    L += ["", "## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)", ""]
    for s in summary:
        bad = [(qid, q) for qid, q in s["per_query"].items()
               if (q["should_trigger"] and q["hits"] / q["n"] < 0.5) or (not q["should_trigger"] and q["hits"] > 0)]
        if not bad:
            continue
        L.append(f"### {s['skill']}")
        for qid, q in bad:
            kind = "should trigger" if q["should_trigger"] else "should not trigger"
            L.append(f"- `{qid}` [{kind}] hits {q['hits']}/{q['n']}: {q['query']}")
        if s["stolen_by"]:
            L.append(f"- Stolen by: {json.dumps(s['stolen_by'], ensure_ascii=False)}")
        L.append("")
    (run_dir / "report.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    return run_dir / "report.md"


# ---------- subcommands ----------

def load_manifest(path, only=None):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    entries = data["skills"] if isinstance(data, dict) else data
    if only:
        names = set(only.split(","))
        entries = [e for e in entries if e["name"] in names]
    return entries


def cmd_run(args):
    claude = find_claude()
    backend = backend_of(os.environ.get("ANTHROPIC_BASE_URL"))
    check_model_backend(args.model, backend, args.allow_model_remap)
    entries = load_manifest(args.manifest, args.only)
    cache = HERE / ".cache"
    cache.mkdir(exist_ok=True)
    plan, meta_skills = [], {}
    for e in entries:
        sk = resolve_skill(e, cache)
        if not sk["model_invocable"]:
            print(f"skipping {sk['name']}: declares disable-model-invocation (manual-only), so trigger tests do not apply", file=sys.stderr)
            continue
        sets = query_set_files(e, sk["name"])
        if not sets:
            print(f"skipping {sk['name']}: no question set; run the draft subcommand first", file=sys.stderr)
            continue
        if len(sets) < 2:
            print(f"note: {sk['name']} has only one question set; the method calls for two or more "
                  f"(draft --sets 2) so the spread between sets can be reported", file=sys.stderr)
        meta_sets = {}
        for set_id, path in sets:
            pack = load_queries(path)
            meta_sets[set_id] = {"query_set_sha256": pack["sha256"], "file": str(path.relative_to(HERE)),
                                 "drafted_by": pack.get("drafted_by")}
            for q in pack["queries"]:
                plan.append((sk, set_id, q))
        meta_skills[sk["name"]] = {"source": sk["source"], "skill_md_sha256": sk["skill_md_sha256"],
                                   "query_sets": meta_sets}
        if sk["companions"]:
            meta_skills[sk["name"]]["companions"] = {c["name"]: {"source": c["source"],
                                                                 "skill_md_sha256": c["skill_md_sha256"]}
                                                     for c in sk["companions"]}
    if not plan:
        die("nothing to run")
    lo, hi = cost_range(args.model, backend)
    n_max = len(plan) * args.runs
    n_min = sum(runs_needed(q["should_trigger"], [], args.runs, args.sampling) for _, _, q in plan)
    span = f"{n_min}–{n_max}" if n_min != n_max else str(n_max)
    print(f"Plan: {len(meta_skills)} skills, {len(plan)} queries, {span} trials (each stops as soon as a verdict is reached)")
    print(f"Backend: {backend}; model: {args.model or 'CLI default'}; runs per query: {args.runs}; sampling: {args.sampling}")
    print(f"Rough cost: about ${n_min * lo:.2f}–${n_max * hi:.2f} equivalent (subscription users spend quota)")
    if args.dry_run:
        return

    if args.resume:
        run_dir = Path(args.resume)
        meta_path = run_dir / "meta.json"
        if not meta_path.is_file():
            die(f"{run_dir} has no meta.json, so it is not a resumable run directory "
                f"(a run writes meta.json before its first trial)")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        # records from different conditions cannot be pooled, so a resume must keep the run's conditions
        meta.setdefault("sampling", "fixed")  # runs from before v0.4.0 gave every query every run
        for k, v in (("model", args.model), ("runs", args.runs), ("max_explore", args.max_explore),
                     ("backend", backend), ("sampling", args.sampling)):
            if meta.get(k) != v:
                die(f"this run used {k}={meta.get(k)!r}; resume it with the same value (got {v!r})")
        for name, sm in meta_skills.items():
            if name in meta["skills"] and meta["skills"][name].get("companions", {}).keys() != sm.get("companions", {}).keys():
                die(f"the skills installed alongside {name} changed since this run started; start a new run instead")
            old_sets = meta["skills"].get(name, {}).get("query_sets", {})
            for set_id, s in sm["query_sets"].items():
                old = old_sets.get(set_id, {}).get("query_set_sha256")
                if old and old != s["query_set_sha256"]:
                    die(f"the questions in {name}/{set_id} changed since this run started; start a new run instead")
        meta["skills"].update(meta_skills)  # pick up sets added since the run started
    else:
        run_id = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        run_dir = HERE / "results" / run_id
        run_dir.mkdir(parents=True)
        meta = {"run_id": run_id, "runner_version": RUNNER_VERSION, "host": "claude-code",
                "claude_version": claude_version(claude), "model": args.model, "runs": args.runs,
                "sampling": args.sampling, "trial_dirs": "fixed per worker",
                "max_explore": args.max_explore, "query_hash": QUERY_HASH_SCHEME,
                "backend": backend, "base_url": os.environ.get("ANTHROPIC_BASE_URL") or None,
                "api_key_source": None,
                "platform": f"{platform.system()} {platform.release()} / Python {platform.python_version()}",
                "started_at": dt.datetime.now().isoformat(timespec="seconds"), "skills": meta_skills}
    meta_path = run_dir / "meta.json"

    def save_meta():
        """Write meta atomically, so an interrupted run is always resumable."""
        tmp = meta_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, meta_path)

    save_meta()  # before the first trial: a run that dies early must still be resumable
    raw_path = run_dir / "raw.jsonl"
    done = {}  # (skill, set, query id) -> {run index: verdict}, valid verdicts only
    if raw_path.exists():
        for l in raw_path.read_text(encoding="utf-8").splitlines():
            if l.strip():
                r = json.loads(l)
                if r["verdict"] not in ("error", "timeout"):
                    done.setdefault((r["skill"], r.get("query_set"), r["query_id"]), {})[r["run"]] = r["verdict"]
    print(f"{sum(map(len, done.values()))} trials already done; results: {run_dir}")

    lock = threading.Lock()
    counter = {"n": 0, "err_streak": 0, "stopped": None}
    ERROR_STREAK_STOP = 8  # consecutive failed trials (usage limit, auth, network) before the run stops itself
    SAVE_EVERY = 25  # trials between meta writes; a crash costs at most this many records of bookkeeping
    # One fixed directory per worker: the CLI writes the working directory into its system prompt, so a fresh random
    # path every trial makes the prompt cache miss from that point on (measured: ~7.6k tokens written per trial
    # with random paths, ~4.5k with a fixed one). The directory is emptied between trials.
    free_dirs = __import__("queue").Queue()
    for k in range(args.workers):
        free_dirs.put(Path(tempfile.gettempdir()) / f"sg-trial-{meta['run_id']}-{k}")

    def work(item):
        sk, set_id, q, i = item
        if counter["stopped"]:
            return
        d = free_dirs.get()
        try:
            rec = run_trial(claude, sk, q["query"], args.model, args.timeout, meta.get("max_explore", 0), fixed_dir=d)
        finally:
            free_dirs.put(d)
        init = rec.pop("init")
        row = {"skill": sk["name"], "query_set": set_id, "query_id": q["id"], "query": q["query"],
               "should_trigger": bool(q["should_trigger"]), "clause": q.get("clause"), "run": i, **rec}
        with lock:
            dirty = False
            if init and "loaded_skills" not in meta:
                meta["model_resolved"] = init.get("model")
                meta["api_key_source"] = init.get("apiKeySource")
                ours = set(meta_skills) | {c for sm in meta_skills.values() for c in sm.get("companions", {})}
                meta["loaded_skills"] = [s for s in (init.get("skills") or []) if s not in ours]
                meta["tools"] = sorted(init.get("tools") or [])
                dirty = True
            with open(raw_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            if row["verdict"] not in ("error", "timeout"):
                done.setdefault((sk["name"], set_id, q["id"]), {})[i] = row["verdict"]
            counter["n"] += 1
            counter["err_streak"] = counter["err_streak"] + 1 if row["verdict"] in ("error", "timeout") else 0
            if counter["err_streak"] >= ERROR_STREAK_STOP and not counter["stopped"]:
                counter["stopped"] = ((row.get("error") or row["verdict"]).strip().splitlines() or ["?"])[-1][:200]
            if dirty or counter["n"] % SAVE_EVERY == 0:
                save_meta()
            mark = {"triggered": "✓", "not_triggered": "·", "other_skill": "↷"}.get(row["verdict"], "!")
            print(f"[{counter['n']}] {mark} {sk['name']}/{set_id} {q['id']}#{i} "
                  f"{'should trigger' if q['should_trigger'] else 'should not trigger'} -> {row['verdict']}"
                  + (f" ({row['invoked_skill']})" if row["verdict"] == "other_skill" else ""), flush=True)

    def pending(attempted):
        """Trials still owed under the sampling rule. A trial that errored in this process is not retried until a
        resume, so a persistently failing query cannot loop."""
        out = []
        for sk, set_id, q in plan:
            got = done.get((sk["name"], set_id, q["id"]), {})
            n = runs_needed(q["should_trigger"], [got[i] for i in sorted(got)], args.runs, args.sampling)
            out += [(sk, set_id, q, i) for i in range(n) if i not in got and (sk["name"], set_id, q["id"], i) not in attempted]
        return out

    resume_cmd = (f"python step0/trigger_test.py run --resume {run_dir} --model {args.model or 'default'} "
                  f"--runs {args.runs} --max-explore {args.max_explore} --sampling {args.sampling}")
    try:
        attempted, rnd = set(), 0
        # adaptive sampling runs in rounds: the first round's verdicts decide which queries get more runs
        while not counter["stopped"] and (todo := pending(attempted)):
            rnd += 1
            print(f"Round {rnd}: {len(todo)} trials", flush=True)
            attempted |= {(sk["name"], set_id, q["id"], i) for sk, set_id, q, i in todo}
            with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
                list(ex.map(work, todo))
    except KeyboardInterrupt:
        meta["interrupted_at"] = dt.datetime.now().isoformat(timespec="seconds")
        save_meta()
        print(f"\ninterrupted after {counter['n']} trials; the records so far are kept.\nresume with: {resume_cmd}",
              file=sys.stderr)
        sys.exit(130)
    if counter["stopped"]:
        meta["stopped_at"] = dt.datetime.now().isoformat(timespec="seconds")
        meta["stopped_reason"] = counter["stopped"]
        save_meta()
        print(f"\nstopped after {ERROR_STREAK_STOP} failed trials in a row ({counter['stopped']}); the records so far "
              f"are kept and failed trials are retried on resume.\nresume with: {resume_cmd}", file=sys.stderr)
        sys.exit(3)
    meta["finished_at"] = dt.datetime.now().isoformat(timespec="seconds")
    save_meta()
    print(f"Report: {write_report(run_dir)}")


DRAFT_PROMPT = """You are building a trigger-test set for an agent skill. Below is the skill's SKILL.md.

Write exactly {n_pos} SHOULD-TRIGGER and {n_neg} SHOULD-NOT-TRIGGER user requests, as a real user would type them to a coding agent.
Rules:
- Realistic, varied phrasing: casual, terse, typos, with context (file names, project details). Do NOT paraphrase the description.
- About half in Chinese and half in English.
- SHOULD-NOT-TRIGGER items must be near misses: same domain but a different job, or a job a sibling/competing skill would own. No obviously unrelated requests (e.g. for a deploy skill, a CSV-to-Excel script is too far; a build-config or CI question is a fair near miss).
- Every request must be answerable on its own; do not reference earlier conversation.
- The split is strict: exactly {n_pos} items with "should_trigger": true and exactly {n_neg} with false. Count before answering.
- Write each "note" in English.
Output ONLY a JSON array, no prose: [{{"query": "...", "should_trigger": true, "note": "why"}}, ...]

--- SKILL.md ---
{skill_md}
"""

DRAFT_BY_CLAUSE_PROMPT = """You are building a trigger-test set for an agent skill. Below is the skill's SKILL.md.

{clause_step}

Step 2. For EACH clause, write exactly {per_clause} SHOULD-TRIGGER user requests that clearly fall under that clause and no other.

Step 3. Write exactly {n_neg} SHOULD-NOT-TRIGGER near misses in total, spread across the clauses: each shares vocabulary or domain with one clause but is a different job (or a job a sibling skill would own). Tag each with the clause it is a near miss for.

Rules for every request:
- Realistic, varied phrasing as a real user would type to a coding agent: casual, terse, typos, concrete file names. Do NOT paraphrase the description.
- About half in Chinese and half in English, within each clause as far as possible.
- Answerable on its own; do not reference earlier conversation.
- Write each "note" in English.
Output ONLY JSON, no prose:
{{"clauses": ["...", "..."], "queries": [{{"query": "...", "should_trigger": true, "clause": "<one of clauses>", "note": "why"}}, ...]}}

--- SKILL.md ---
{skill_md}
"""


CLAUSE_STEP_EXTRACT = ("Step 1. List the trigger clauses: the distinct situations in which the frontmatter `description` "
                       "says the skill should be used (e.g. \"Use when the user wants X, mentions Y, or asks for Z\" gives "
                       "three clauses). Use only the description, not the body. Name each clause in a few English words.")
CLAUSE_STEP_FIXED = ("Step 1. Use exactly these trigger clauses, with these exact names, and do not add, merge or rename "
                     "any: {clauses}")


def draft_targets(d, prefix, sets, force, existing=None):
    """Question-set files to draft for one skill: fill the gaps up to `sets`, or with --force rewrite sets 1..sets.
    A set that comes out too thin (see MIN_POS_QUERIES) is otherwise impossible to redo, because a full skill dir
    makes the fill-the-gaps branch return nothing."""
    existing = (sorted(d.glob("*.json")) if d.is_dir() else []) if existing is None else existing
    if force:
        return [d / f"{prefix}-{k}.json" for k in range(1, sets + 1)]
    outs, k = [], 1
    while len(existing) + len(outs) < sets:
        p = d / f"{prefix}-{k}.json"
        if not p.exists():
            outs.append(p)
        k += 1
    return outs


def cmd_draft(args):
    claude = find_claude()
    cache = HERE / ".cache"
    cache.mkdir(exist_ok=True)
    by_clause = not args.free
    jobs = []
    for e in load_manifest(args.manifest, args.only):
        sk = resolve_skill(e, cache)
        if "queries" in e:  # explicit single-file manifest entry (e.g. experiments)
            out = HERE / e["queries"]
            if out.exists() and not args.force:
                print(f"{sk['name']}: {out.name} exists, skipping (use --force to overwrite)")
                continue
            jobs.append((sk, [out]))
            continue
        d = HERE / "queries" / sk["name"]
        existing = sorted(d.glob("*.json")) if d.is_dir() else []
        prefix = "clause" if by_clause else "free"
        outs = draft_targets(d, prefix, args.sets, args.force, existing)
        if not outs:
            print(f"{sk['name']}: already has {len(existing)} question set(s), skipping (use --sets to ask for more)")
            continue
        if args.force and existing:
            print(f"{sk['name']}: --force, re-drafting {len(outs)} question set(s) from scratch", flush=True)
        jobs.append((sk, outs))

    def draft_one(sk, out, md, clauses_hint):
        if by_clause:
            step = (CLAUSE_STEP_FIXED.format(clauses=json.dumps(clauses_hint, ensure_ascii=False)) if clauses_hint
                    else CLAUSE_STEP_EXTRACT)
            prompt = DRAFT_BY_CLAUSE_PROMPT.format(clause_step=step, per_clause=args.per_clause, n_neg=args.n // 2,
                                                   skill_md=md[:20000])
        else:
            prompt = DRAFT_PROMPT.format(n_pos=args.n // 2, n_neg=args.n - args.n // 2, skill_md=md[:20000])
        cmd = [claude, "-p", prompt, "--output-format", "json", "--tools", "", "--no-session-persistence",
               "--strict-mcp-config", "--setting-sources", "project"]
        if args.model:
            cmd += ["--model", args.model]
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                             stdin=subprocess.DEVNULL, timeout=600)
        try:
            text = json.loads(res.stdout)["result"]
            if by_clause:
                obj = json.loads(text[text.index("{"): text.rindex("}") + 1])
                clauses, items = obj["clauses"], obj["queries"]
            else:
                clauses, items = None, json.loads(text[text.index("["): text.rindex("]") + 1])
        except Exception:
            print(f"{sk['name']}: drafting failed\n{res.stdout[-800:]}\n{res.stderr[-800:]}", file=sys.stderr)
            return None
        items = [it for it in items if isinstance(it, dict) and str(it.get("query", "")).strip()]
        n_pos = sum(1 for it in items if it.get("should_trigger"))
        if n_pos < MIN_POS_QUERIES:
            # grade() needs MIN_TRIALS positive trial records per set; below this the per-set grade reads
            # "insufficient data" and the pooled headline number is thin, so say so before the expensive run
            print(f"{sk['name']}: only {n_pos} should-trigger queries in {out.name} (want >= {MIN_POS_QUERIES}; "
                  f"raise --per-clause or add a clause list)", file=sys.stderr)
        if not items:
            print(f"{sk['name']}: no usable queries returned for {out.name}", file=sys.stderr)
            return None
        pack = {"skill": sk["name"], "skill_md_sha256": sk["skill_md_sha256"],
                "drafted_by": f"trigger_test.py draft{'' if by_clause else ' --free'}"
                              f" (model: {args.model or 'CLI default'}), {dt.date.today().isoformat()}",
                "review": "none: AI-drafted. The method tests each skill with two or more independently drafted sets "
                          "and reports the spread between them instead of reviewing each set by hand.",
                "queries": [{"id": f"q{i + 1:02d}", "query": it["query"], "should_trigger": bool(it.get("should_trigger")),
                             **({"clause": it.get("clause", "")} if clauses else {}),
                             "note": it.get("note", "")} for i, it in enumerate(items)]}
        if clauses:
            pack["clauses"] = clauses
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{sk['name']}: drafted {len(items)} queries -> {out}", flush=True)
        return clauses

    def one(job):
        """Draft one skill's sets in order, so later sets reuse the first set's clause list."""
        sk, outs = job
        _, md = read_frontmatter(sk["dir"] / "SKILL.md")
        clauses = None
        d = HERE / "queries" / sk["name"]
        for p in sorted(d.glob("*.json")) if d.is_dir() else []:
            clauses = json.loads(p.read_text(encoding="utf-8")).get("clauses")
            if clauses:
                break
        for out in outs:
            clauses = draft_one(sk, out, md, clauses) or clauses

    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(one, jobs))


def main():
    ap = argparse.ArgumentParser(description="SkillGauntlet step 0: Claude Code skill trigger test")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run the trigger test")
    r.add_argument("--manifest", default=str(HERE / "skills.json"))
    r.add_argument("--only", help="only these skills (comma-separated)")
    r.add_argument("--runs", type=int, default=3, help="maximum runs per query (default 3)")
    r.add_argument("--sampling", choices=("adaptive", "fixed"), default="adaptive",
                   help="adaptive (default): should-not-trigger queries run once, should-trigger queries --runs - 1, "
                        "each topped up to --runs only when a negative triggered or the runs disagree; "
                        "fixed: every query gets --runs runs (skill-creator's protocol)")
    r.add_argument("--model", help="model alias or full name, e.g. haiku / sonnet / opus; defaults to the CLI default")
    r.add_argument("--allow-model-remap", action="store_true",
                   help="do not refuse an Anthropic model name when ANTHROPIC_BASE_URL points at another backend "
                        "(gateways such as DeepSeek remap claude-haiku* to their own model, which tests something else)")
    r.add_argument("--workers", type=int, default=2, help="parallel trials (default 2; keep it low on a subscription quota)")
    r.add_argument("--timeout", type=int, default=180, help="per-trial timeout in seconds")
    r.add_argument("--max-explore", type=int, default=DEFAULT_MAX_EXPLORE,
                   help="read-only tool calls allowed before a verdict (default 0 = skill-creator's first-decision "
                        "rule, for headline numbers; e.g. 3 for a robustness check)")
    r.add_argument("--resume", help="resume a results directory (skips finished trials)")
    r.add_argument("--allow-unreviewed", action="store_true", help=argparse.SUPPRESS)  # no-op, kept for old commands
    r.add_argument("--dry-run", action="store_true", help="print the plan and a rough cost estimate only")
    d = sub.add_parser("draft", help="draft independent question sets for skills")
    d.add_argument("--manifest", default=str(HERE / "skills.json"))
    d.add_argument("--only", help="only these skills (comma-separated)")
    d.add_argument("--sets", type=int, default=2,
                   help="top each skill up to this many independent question sets in queries/<skill>/ (default 2)")
    d.add_argument("--n", type=int, default=20,
                   help="queries per set with --free (half each); with clause grouping, negatives = n/2")
    d.add_argument("--model", help="model used for drafting")
    d.add_argument("--free", action="store_true", help="free-form drafting instead of grouping by trigger clause")
    d.add_argument("--by-clause", action="store_true", help=argparse.SUPPRESS)  # now the default; kept for old commands
    d.add_argument("--per-clause", type=int, default=3, help="should-trigger queries per trigger clause (default 3)")
    d.add_argument("--workers", type=int, default=4, help="parallel drafts (default 4)")
    d.add_argument("--force", action="store_true",
                   help="re-draft question sets 1..--sets from scratch (to redo a set that came out too thin)")
    p = sub.add_parser("report", help="rebuild the report from raw.jsonl")
    p.add_argument("run_dir")
    args = ap.parse_args()
    if args.cmd == "run":
        cmd_run(args)
    elif args.cmd == "draft":
        cmd_draft(args)
    else:
        print(write_report(Path(args.run_dir)))


if __name__ == "__main__":
    main()
