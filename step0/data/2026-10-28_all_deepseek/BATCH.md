# Batch 2026-10-28: 18 skills on Claude Code with DeepSeek (deepseek-v4-flash)

**Status: final numbers.** Every number below was counted by `step0/batch_tables.py deepseek` from the run in this directory (and, for the comparison, from the Haiku runs); none was typed by hand. The same 18 skills, the same 36 question sets and the same runner as the Haiku batch (`../2026-10-28_all_haiku/`), run on the same host (Claude Code 2.1.303) against DeepSeek's Anthropic-compatible endpoint. The comparison with Haiku holds only because the question sets, the host and the CLI version are identical; it is not a comparison of the two models in general.

**These are automated test results.** The questions were drafted by AI and not reviewed by hand. The results describe how each skill triggered on the host, model and versions listed here; they are not an overall judgement of the skill's quality. If you think a question or a result is wrong, open an appeal in the repository (see "Appeals" in [CONTRIBUTING.md](../../../CONTRIBUTING.md)).

## What was tested

| Dimension | Value |
|---|---|
| Skills | The same 18 pinned skills as the Haiku batch (sources, commits and SKILL.md hashes are in `../2026-10-28_all_haiku/BATCH.md`); lark-doc is installed with its companions lark-drive and lark-shared |
| Host | Claude Code 2.1.303, headless (`claude -p`, stream-json) |
| Backend / model | `api.deepseek.com` (Anthropic-compatible endpoint), `deepseek-v4-flash` as requested; the gateway reports no resolved model (`model_resolved` is `deepseek-v4-flash`) |
| Question sets | The 36 sets of the Haiku batch, unchanged: 967 queries, 609 should-trigger, 358 should-not-trigger, about half Chinese. Not reviewed by hand |
| Verdict rule | First tool decision only (skill-creator rule, `--max-explore 0`) |
| Sampling | Adaptive, at most 3 runs per query, as in the Haiku batch; rates are averages of per-query rates |
| Environment | Empty project directory with only the skill under test; host-injected `CLAUDE_CODE_*` variables removed; the model was offered 26 tools and 18 background skills (listed in `meta.json`) |
| Runner | v0.4.2 |
| Trials | 1,700 records, 15 of them failed attempts that were retried (see below); **1,685 counted, 0 unresolved errors** |
| Time | 2026-10-28 23:42 to 2026-10-29 00:27 (local time of the run), 4 workers |

**The run was interrupted once.** At trial 1,227 the DeepSeek account ran out of balance (`402 Insufficient Balance`); the runner stopped after 8 consecutive failures and the run was resumed with `--resume` under identical conditions after a top-up. The 15 failed records (11 balance errors, 4 `error_during_execution`) stay in `raw.jsonl`; each was retried and the retry is counted. `report.md` lists them in its "Errors" column, which counts records, not unresolved trials.

## Results

The columns are the same as in the Haiku batch:

- "No tool call" is the share of should-trigger trials where the model answered without calling any tool.
- "Per set" gives each question set's own recall and grade.

A grade is published only when both question sets give it on their own. When they disagree, the row reads "sets disagree" and carries no grade. This batch has no third set (see Finding 6).

| Skill | Grade | Recall | False positives | Queries (pos / neg) | Stolen | No tool call | Per set (recall, grade) | Spread |
|---|---|---|---|---|---|---|---|---|
| mcp-builder | triggers well | 100% (86–100%) | 3% (0–21%) | 24 / 20 | claude-api 2 | 0% | set 1 100% well / set 2 100% well | 0 pts |
| doc-coauthoring | triggers well | 85% (71–93%) | 0% (0–16%) | 40 / 20 | – | 1% | set 1 90% well / set 2 80% well | 10 pts |
| lark-doc | sets disagree | 78% (61–89%) | 8% (2–28%) | 32 / 20 | lark-drive 3, lark-shared 2 | 0% | set 1 83% well / set 2 73% fair | 10 pts ⚠ |
| diagnosing-bugs | triggers fair | 61% (42–78%) | 0% (0–16%) | 25 / 20 | – | 0% | set 1 64% fair / set 2 58% fair | 6 pts |
| tdd | sets disagree | 50% (34–66%) | 0% (0–16%) | 32 / 20 | – | 0% | set 1 44% poorly / set 2 56% fair | 12 pts ⚠ |
| find-skills | sets disagree | 43% (27–60%) | 0% (0–16%) | 32 / 20 | – | 14% | set 1 52% fair / set 2 33% poorly | 19 pts ⚠ |
| prototype | sets disagree | 42% (22–65%) | 0% (0–18%) | 16 / 18 | – | 0% | set 1 54% fair / set 2 29% poorly | 25 pts ⚠ |
| webapp-testing | triggers poorly | 38% (24–53%) | 0% (0–16%) | 40 / 20 | – | 0% | set 1 43% poorly / set 2 32% poorly | 12 pts |
| hyperframes | triggers poorly | 37% (24–52%) | 2% (0–19%) | 40 / 20 | dataviz 1 | 1% | set 1 30% poorly / set 2 43% poorly | 13 pts |
| frontend-design | triggers poorly | 35% (22–50%) | 0% (0–16%) | 40 / 20 | – | 1% | set 1 42% poorly / set 2 28% poorly | 13 pts |
| xlsx | triggers poorly | 35% (22–50%) | 0% (0–16%) | 40 / 20 | – | 0% | set 1 32% poorly / set 2 38% poorly | 7 pts |
| deploy-to-vercel | triggers poorly | 32% (19–50%) | 8% (2–28%) | 32 / 20 | – | 0% | set 1 29% poorly / set 2 35% poorly | 6 pts |
| design-mobile-apps | triggers poorly | 32% (17–52%) | 12% (4–32%) | 24 / 20 | – | 0% | set 1 33% poorly / set 2 31% poorly | 3 pts |
| agent-browser | triggers poorly | 29% (18–43%) | 0% (0–16%) | 48 / 20 | claude-api 1 | 0% | set 1 29% poorly / set 2 29% poorly | 0 pts |
| skill-creator | triggers poorly | 21% (11–36%) | 0% (0–16%) | 40 / 20 | – | 0% | set 1 18% poorly / set 2 23% poorly | 5 pts |
| domain-modeling | triggers poorly | 18% (8–37%) | 0% (0–16%) | 24 / 20 | – | 0% | set 1 19% poorly / set 2 17% poorly | 3 pts |
| web-design-guidelines | triggers poorly | 10% (4–23%) | 8% (2–28%) | 40 / 20 | – | 0% | set 1 2% poorly / set 2 18% poorly | 17 pts |
| vercel-react-best-practices | triggers poorly | 5% (1–16%) | 0% (0–16%) | 40 / 20 | code-review 1 | 0% | set 1 7% poorly / set 2 3% poorly | 3 pts |

**Grades**: 2 skills trigger well, 1 fair and 11 poorly; 4 have no grade because their sets disagree. Every row is flagged "borderline, add runs" in the run report. Median recall is 36%, and 13 of 18 skills are under 50%.

**All skills together**: recall 40% (36–44%), false positives 2% (1–4%). Recall was 39% (34–45%) on Chinese queries and 41% (35–46%) on English ones. No skill shows a language gap with non-overlapping intervals.

## Findings

**1. Here a low recall is not the model answering without tools.** The report's tool-behaviour section was checked first, because on a non-Anthropic backend "no tool call at all" is often the real reason for low recall. It is not the reason here: on should-trigger trials the model made no tool call in 13 of 1,305 (1%). Only find-skills stands out (14%, 10 of 69). Of the 774 should-trigger misses, 602 (78%) started with `Bash`, 89 with `Glob`, 27 with `PowerShell`, 26 with `Read`. The model acts on the task itself instead of invoking the skill. Across all trials the first tool was `Bash` 844 times and `Skill` 564 times.

**2. Same queries, different model, different ranking.** This comparison uses the two question sets both batches share. The Haiku batch's third set for four skills is left out here, so Haiku's grades below can differ from that batch's headline grades. Against Haiku, DeepSeek's recall is higher on 10 skills and lower on 8, with large swings in both directions:

- Biggest rises: doc-coauthoring (12% → 85%), mcp-builder (54% → 100%), diagnosing-bugs (20% → 61%).
- Biggest falls: design-mobile-apps (83% → 32%), agent-browser (74% → 29%), deploy-to-vercel (72% → 32%).

The two models read the same description differently, so a grade is a property of a skill on a specific host and model, not of the skill alone. Overall recall on the shared sets is the same for both models (40%).

| Skill | Haiku recall | DeepSeek recall | Haiku grade | DeepSeek grade |
|---|---|---|---|---|
| doc-coauthoring | 12% | 85% | poorly | well |
| mcp-builder | 54% | 100% | fair | well |
| diagnosing-bugs | 20% | 61% | poorly | fair |
| find-skills | 20% | 43% | poorly | sets disagree |
| frontend-design | 12% | 35% | poorly | poorly |
| webapp-testing | 17% | 38% | poorly | poorly |
| tdd | 33% | 50% | poorly | sets disagree |
| skill-creator | 16% | 21% | poorly | poorly |
| lark-doc | 75% | 78% | fair | sets disagree |
| vercel-react-best-practices | 3% | 5% | poorly | poorly |
| prototype | 52% | 42% | sets disagree | sets disagree |
| domain-modeling | 36% | 18% | poorly | poorly |
| xlsx | 57% | 35% | fair | poorly |
| web-design-guidelines | 32% | 10% | poorly | poorly |
| hyperframes | 68% | 37% | fair | poorly |
| deploy-to-vercel | 72% | 32% | fair | poorly |
| agent-browser | 74% | 29% | fair | poorly |
| design-mobile-apps | 83% | 32% | sets disagree | poorly |

**3. Explicit requests still trigger; situations still mostly do not.** The clause pattern of the Haiku batch repeats: tdd's "red-green-refactor mentioned" 88% and "wants integration tests" 0%; find-skills' "explicit find-a-skill request" 96% and "how do I do X" 12%; deploy-to-vercel's "deploy my app to Vercel" 92% and "deploy and give me the link" 0%; design-mobile-apps' "design screens with Sleek" 92% and "implement Sleek designs" 0%. Each clause has only 8–9 should-trigger queries, so single clause rates are indicative.

**4. False positives are higher than on Haiku, but still measured with weak negatives.** 6 skills have false positives here (design-mobile-apps 12%, deploy-to-vercel 8%, web-design-guidelines 8%, lark-doc 8%, mcp-builder 3%, hyperframes 2%); the Haiku batch has only lark-doc. Overall 2% (1–4%), against 0% on Haiku over the same two sets. The same caveat applies: the Python runner's negatives are mostly far from the description, so a low rate is not evidence of a tight boundary.

**5. lark-doc with companions.** Siblings took 5 negative trials (lark-drive 3, lark-shared 2); no should-trigger trial went to a sibling. False positives 8%, as in Haiku's companion run (7%).

**6. Four skills' question sets disagree, and they are not the same four as on Haiku.** find-skills (19 points), prototype (25), tdd (12) and lark-doc (10). Each skill's two sets give different grades, so these four rows carry no grade. On Haiku the flagged skills were lark-doc, prototype, diagnosing-bugs and design-mobile-apps, so a "sets disagree" flag depends on the model as well as on the questions. No third set was drafted for this batch. The Haiku batch shows what a third set does: it usually sides with one of the first two and leaves the recall gap in place.

## Caveats to state when publishing

- **Comparability with the Haiku batch** rests on the same 36 question sets, the same Claude Code CLI (2.1.303) and the same verdict rule. Not identical: Haiku run A used runner v0.4.1 (lark-doc: run B, v0.4.2), this run v0.4.2; the model was offered 26 tools here and 27 there (this run has `Workflow`; the Haiku run has `RemoteTrigger` and `ToolSearch`); the background skills differ by three (this run has `deep-research` and `workflow-authoring`; the Haiku run has `schedule`). The Stolen column depends on that list. The runs were made on the same machine a few hours apart.
- **One backend and one model.** `deepseek-v4-flash` through DeepSeek's endpoint. The gateway remaps Anthropic model names, so the requested name (not a Claude name) is what was tested. No `deepseek-v4-pro` result.
- **Token usage is incomplete.** DeepSeek's endpoint returns only `input_tokens` (median 24,185 per trial, 40.8M over all records); output and cache fields are 0 in `raw.jsonl`, so per-trial cost cannot be computed from the data and cache hits cannot be told apart. Cost comes from the provider's billing, not from this data.
- **False positives are measured with weak negatives** (see Finding 4), questions are AI-drafted and not reviewed by hand, adaptive sampling departs from skill-creator's fixed 3 runs, and clause and language breakdowns are indicative (8–9 should-trigger queries per clause). All as in the Haiku batch.
- **Strict verdict rule.** A model that runs `Bash` or `Glob` before invoking the skill counts as a miss. This model starts with `Bash` far more often than it invokes the skill, so the rule matters more here than on Haiku; the read-only robustness check (`--max-explore 3`) was not run on this backend, and was not run on the 18-skill Haiku batch either (only on tdd in `../2026-10-27_tdd_haiku/`), so no robustness comparison exists. `deepseek-v4-pro` was not tested.

## Reproducing

```bash
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=<your DeepSeek key>
python step0/trigger_test.py run --model deepseek-v4-flash --runs 3
python step0/batch_tables.py deepseek
```

The run directory holds `meta.json` (environment fingerprint, tool list, background skills, backend), `raw.jsonl` (one record per trial), `summary.json` and `report.md`. The tables above were counted by `batch_tables.py` from `raw.jsonl` of this run, and of Haiku runs A and B for the comparison.
