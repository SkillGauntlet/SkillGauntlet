# Batch 2026-10-27: tdd on Claude Code with Haiku

**Status: ready.** The question set is AI-drafted and not reviewed by hand, as the method now prescribes. Its result is backed by two further independently drafted sets for the same skill and model (`../../experiments/qset-tdd/`), which agree within 4 points of recall.

## What was tested

| Dimension | Value |
|---|---|
| Skill | `tdd` from [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/tdd) at commit `5beb35b`, SKILL.md sha256 `96958308…` |
| Host | Claude Code 2.1.303 |
| Model | claude-haiku-5-5 |
| Question set | `queries/tdd.json` (set `legacy`), query set sha256 `e50c0a1f…` (questions and labels only), 10 should-trigger and 10 should-not-trigger queries, AI-drafted, not reviewed by hand |
| Design | Three independent runs, each with 20 queries × 3 trials = 60 trials |

| Run | Runner | Verdict rule | Role |
|---|---|---|---|
| run-20261027-013422 | v0.1.0 | First tool decision only (skill-creator rule) | **Headline** |
| run-20261027-013545 | v0.1.0 | First tool decision only (skill-creator rule) | **Headline** (replicate) |
| run-20261027-014030 | v0.2.0 | Up to 3 read-only tool calls (Glob/Grep/Read/LS, confined to the trial directory) before the verdict | Robustness check |

## Results

**Headline (skill-creator rule)**: triggers poorly. Recall 43% and 40% in two independent runs; false positives 0%.

| Run | Grade | Recall | False positives |
|---|---|---|---|
| run-20261027-013422 (headline) | triggers poorly | 43% (27%–61%) | 0% (0%–11%) |
| run-20261027-013545 (headline replicate) | triggers poorly | 40% (25%–58%) | 0% (0%–11%) |
| run-20261027-014030 (robustness check) | triggers poorly | 43% (27%–61%) | 0% (0%–11%) |

**Run-to-run stability (headline rule, two runs)**: 19 of 20 queries produced identical hit counts. The only difference was q10 (1/3 vs 0/3). No query's majority verdict flipped, and the grade was the same.

**Robustness check, allowing read-only exploration**: in the v0.1 runs, most not-triggered trials stopped at a read-only exploration call (Glob 52 of 95, Read 17, Grep 5), because the queries mention files that do not exist in the empty test directory. Letting the model explore first changed only one of 30 should-trigger trials: q02 went from 0/6 to 1/3. After exploring, the model mostly went on to run Bash (41 of 47 not-triggered trials), i.e. it started doing the work itself without invoking the skill. No exploration call was denied, so it never tried to look outside the trial directory.

## Finding

The skill triggered every time (3/3 in each run) when the request named the method explicitly: "TDD", "red-green-refactor", "test-driven", "test-first". It essentially never triggered for requests that only asked for integration tests (q03, q04, q08: 0 of 27 trials across all runs) or "write a failing test first, then fix" (q02, q07, q10: 2 of 27 trials), even though the description says it applies when the user "wants integration tests". There were no false positives.

The finding holds under both the headline rule and the robustness check. Remaining caveat: Bash ends a trial under both rules, and some of those Bash calls were probably `ls`/`find`-style exploration.

## Caveats to state when publishing

Haiku only, one host, non-standard background skills (listed in each run's report), and a model that looks around with Glob or `ls` first is counted as not triggered (skill-creator rule).

Each run report flags "one question set only" because it covers a single set; the cross-set comparison is in `../../experiments/qset-tdd/EXPERIMENT.md`.
