#!/usr/bin/env python3
"""Count the tables of the 2026-10-28 batch reports from the run data, so no published number is typed by hand.

    python step0/batch_tables.py haiku      # step0/data/2026-10-28_all_haiku/BATCH.md
    python step0/batch_tables.py deepseek   # step0/data/2026-10-28_all_deepseek/BATCH.md

Haiku rows come from run A (all 18 skills alone), with lark-doc taken from run B (installed with its companions).
Run C added a third question set for the four skills whose first two sets disagreed; their headline rows pool all
three sets (A or B plus C). The DeepSeek run has two sets per skill, so the Haiku/DeepSeek comparison uses Haiku's
first two sets only, to compare like with like.
"""
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import trigger_test as tt  # noqa: E402

DATA = HERE / "data"
HAIKU = DATA / "2026-10-28_all_haiku"
RUN_A, RUN_B, RUN_C = HAIKU / "run-20261028-163738", HAIKU / "run-20261028-215214", HAIKU / "run-20261028-225156"
RUN_DS = DATA / "2026-10-28_all_deepseek" / "run-20261028-234251"
SHORT = {"triggers well": "well", "triggers fair": "fair", "triggers poorly": "poorly", "insufficient data": "insuff."}


def meta(d):
    return json.loads((d / "meta.json").read_text(encoding="utf-8"))


def raw(d):
    return [json.loads(line) for line in (d / "raw.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]


def counted(recs):
    """The last record of each trial (a retried error is replaced by its retry), valid verdicts only."""
    last = {}
    for r in recs:
        last[(r["skill"], r.get("query_set"), r["query_id"], r["run"])] = r
    return [r for r in last.values() if r["verdict"] in ("triggered", "not_triggered", "other_skill")]


def summarize(recs, metas):
    m = {"sampling": "adaptive", "skills": {}, "loaded_skills": metas[0].get("loaded_skills")}
    for x in metas:
        for name, s in x["skills"].items():
            q = {**m["skills"].get(name, {}).get("query_sets", {}), **(s.get("query_sets") or {})}
            m["skills"][name] = {**s, "query_sets": q}
    return {s["skill"]: s for s in tt.summarize(recs, m)}


def pct(x):
    return "–" if x is None else f"{round(x * 100)}%"


def ci(c):
    return f"{round(c[0] * 100)}–{round(c[1] * 100)}%"


def stolen(s):
    return ", ".join(f"{k} {v}" for k, v in sorted(s["stolen_by"].items(), key=lambda kv: -kv[1])) or "–"


def disagree(s):
    return "question sets disagree" in s["flags"]


def headline(s):
    """Grade as published. The pooled grade stands when a majority of the question sets give that same grade: both
    sets out of two, at least two out of three. Otherwise the sets disagree and no grade is published. A recall gap
    alone (sets agreeing on the grade) keeps the grade and is shown as the spread."""
    agree = sum(x["grade"] == s["grade"] for x in s["by_set"].values())
    return SHORT[s["grade"]] if agree * 2 > len(s["by_set"]) else "sets disagree"


def sets_cell(s):
    return " / ".join(f"{k.replace('clause-', 'set ')} {pct(x['recall'])} {SHORT[x['grade']]}" for k, x in sorted(s["by_set"].items()))


def main_table(rows, run_of=None):
    head = "| Skill | Grade | Recall | False positives | Queries (pos / neg) | Stolen | No tool call | Per set (recall, grade) | Spread |"
    print(head + (" Runs |" if run_of else ""))
    print("|---" * (10 if run_of else 9) + "|")
    for n in sorted(rows, key=lambda n: -rows[n]["recall"]):
        s = rows[n]
        line = (f"| {n} | {headline(s)} | {pct(s['recall'])} ({ci(s['recall_ci95'])}) | {pct(s['false_positive_rate'])} "
                f"({ci(s['fpr_ci95'])}) | {s['q_pos']} / {s['q_neg']} | {stolen(s)} | {pct(s['no_tool_call_rate'])} | "
                f"{sets_cell(s)} | {round(s['set_spread'] * 100)} pts{' ⚠' if disagree(s) else ''} |")
        print(line + (f" {run_of(n)} |" if run_of else ""))


def overview(rows, valid):
    print("\nheadline grades", Counter(headline(s) for s in rows.values()))
    print("disagree", {n: round(s["set_spread"] * 100) for n, s in rows.items() if disagree(s)})
    rc = sorted(s["recall"] for s in rows.values())
    print("median recall", pct((rc[8] + rc[9]) / 2), "under 50%:", sum(x < 0.5 for x in rc))
    print("fpr>0", {n: pct(s["false_positive_rate"]) for n, s in rows.items() if s["false_positive_rate"]})
    print("no tool >= 10%", {n: pct(s["no_tool_call_rate"]) for n, s in rows.items() if (s["no_tool_call_rate"] or 0) >= 0.1})
    o = tt.rates(valid, adaptive=True)
    print("all skills: recall", pct(o["recall"]), ci(o["recall_ci95"]), "fp", pct(o["false_positive_rate"]), ci(o["fpr_ci95"]),
          "queries", o["q_pos"], "/", o["q_neg"], "trials", len(valid))
    for lang, x in tt.by_language(valid, adaptive=True).items():
        print(" ", lang, pct(x["recall"]), ci(x["recall_ci95"]), "fp", pct(x["false_positive_rate"]), ci(x["fpr_ci95"]))
    for n, s in sorted(rows.items()):
        note = tt.lang_gap_note(s["by_language"]["zh"], s["by_language"]["en"])
        if note:
            print("  language gap", n, note, pct(s["by_language"]["zh"]["recall"]), pct(s["by_language"]["en"]["recall"]))
    print("stolen", Counter(r["invoked_skill"] for r in valid if r["verdict"] == "other_skill"))


def clauses(rows):
    print("\n| Skill | Best clause | Worst clause |\n|---|---|---|")
    for n in sorted(rows, key=lambda n: -rows[n]["recall"]):
        bc = rows[n]["by_clause"]
        hi = max(bc.items(), key=lambda kv: kv[1]["recall"] or 0)
        lo = min(bc.items(), key=lambda kv: kv[1]["recall"] or 0)
        print(f"| {n} | {hi[0]} — {pct(hi[1]['recall'])} | {lo[0]} — {pct(lo[1]['recall'])} |")


def haiku_records(with_c=True):
    a, b, c = raw(RUN_A), raw(RUN_B), raw(RUN_C)
    recs = [r for r in a if r["skill"] != "lark-doc"] + b + (c if with_c else [])
    return counted(recs), [meta(RUN_A), meta(RUN_B), meta(RUN_C)]


def cmd_haiku():
    valid, metas = haiku_records()
    rows = summarize(valid, metas)
    third = {r["skill"] for r in raw(RUN_C)}
    run_of = lambda n: ("B+C" if n in third else "B") if n == "lark-doc" else ("A+C" if n in third else "A")
    print("runs", {m["run_id"]: (m["runner_version"], m["claude_version"], m["model_resolved"], len(m["tools"]),
                                 len(m["loaded_skills"])) for m in metas})
    print("records A/B/C", len(raw(RUN_A)), len(raw(RUN_B)), len(raw(RUN_C)), "| counted", len(valid),
          "| errors", sum(r["verdict"] in ("error", "timeout") for r in raw(RUN_A) + raw(RUN_B) + raw(RUN_C)))
    print("same tools A/B/C", metas[0]["tools"] == metas[1]["tools"] == metas[2]["tools"],
          "same background", metas[0]["loaded_skills"] == metas[1]["loaded_skills"] == metas[2]["loaded_skills"])
    print()
    main_table(rows, run_of)
    overview(rows, valid)
    clauses(rows)
    print("\nthird-set skills, run C only:")
    for n, s in sorted(summarize(counted(raw(RUN_C)), [meta(RUN_C)]).items()):
        print(" ", n, "recall", pct(s["recall"]), ci(s["recall_ci95"]), "fp", pct(s["false_positive_rate"]), "stolen", stolen(s),
              "pos/neg", s["q_pos"], s["q_neg"])
    fp = Counter((r["skill"], r["query_set"], r["query_id"]) for r in valid if not r["should_trigger"] and r["verdict"] == "triggered")
    print("negatives that triggered", dict(fp))


def cmd_deepseek():
    ds_recs = raw(RUN_DS)
    valid = counted(ds_recs)
    rows = summarize(valid, [meta(RUN_DS)])
    m = meta(RUN_DS)
    print("run", m["run_id"], m["runner_version"], m["claude_version"], m["model_resolved"], m["backend"], len(m["tools"]),
          len(m["loaded_skills"]), m["started_at"], m.get("finished_at"))
    print("records", len(ds_recs), "| counted", len(valid), "| error records", sum(r["verdict"] in ("error", "timeout") for r in ds_recs))
    print()
    main_table(rows)
    overview(rows, valid)
    pos = [r for r in valid if r["should_trigger"]]
    print("no tool on should-trigger", sum(not r.get("first_tool") for r in pos if r["verdict"] == "not_triggered"), "of", len(pos))
    print("first tool of should-trigger misses", Counter(r.get("first_tool") or "(none)" for r in pos if r["verdict"] == "not_triggered").most_common(5))
    clauses(rows)
    h_valid, h_metas = haiku_records(with_c=False)
    hk = summarize(h_valid, h_metas)
    print("\nSame two question sets on both models (Haiku without run C):")
    print("| Skill | Haiku recall | DeepSeek recall | Haiku grade | DeepSeek grade |\n|---|---|---|---|---|")
    diffs = []
    for n in sorted(rows, key=lambda n: -(rows[n]["recall"] - hk[n]["recall"])):
        a, b = hk[n], rows[n]
        diffs.append(b["recall"] - a["recall"])
        print(f"| {n} | {pct(a['recall'])} | {pct(b['recall'])} | {headline(a)} | {headline(b)} |")
    print("deepseek higher", sum(d > 0 for d in diffs), "lower", sum(d < 0 for d in diffs), "equal", sum(d == 0 for d in diffs))
    ho = tt.rates(h_valid, adaptive=True)
    print("haiku two-set overall recall", pct(ho["recall"]), ci(ho["recall_ci95"]), "fp", pct(ho["false_positive_rate"]))
    hm = h_metas[0]
    print("tools ds-only", sorted(set(m["tools"]) - set(hm["tools"])), "haiku-only", sorted(set(hm["tools"]) - set(m["tools"])))
    print("background ds-only", sorted(set(m["loaded_skills"]) - set(hm["loaded_skills"])),
          "haiku-only", sorted(set(hm["loaded_skills"]) - set(m["loaded_skills"])))


if __name__ == "__main__":
    {"haiku": cmd_haiku, "deepseek": cmd_deepseek}[sys.argv[1] if len(sys.argv) > 1 else "haiku"]()
