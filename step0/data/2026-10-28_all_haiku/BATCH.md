# Batch 2026-10-28: 18 skills on Claude Code with Haiku

**Status: final numbers.** This is the headline report of step 0. Every number below was counted from the three runs in this directory by `step0/batch_tables.py haiku`; none was typed by hand. Read the caveats before quoting any number. The false-positive column in particular is not yet informative (see "Caveats").

**These are automated test results.** The questions were drafted by AI and not reviewed by hand. The results describe how each skill triggered on the host, model and versions listed here; they are not an overall judgement of the skill's quality. If you think a question or a result is wrong, open an appeal in the repository (see "Appeals" in [CONTRIBUTING.md](../../../CONTRIBUTING.md)).

## What was tested

| Dimension | Value |
|---|---|
| Skills | 18 third-party skills, each pinned to a commit (table below) |
| Host | Claude Code 2.1.303, headless (`claude -p`, stream-json) |
| Model | claude-haiku-5-5 (requested as `haiku`) |
| Question sets | 2 independently AI-drafted sets per skill (`clause-1`, `clause-2`), plus a third (`clause-3`) for the four skills whose first two sets disagreed: 40 sets, 1,053 queries (657 should-trigger, 396 should-not-trigger), about half of them in Chinese. Drafted by Sonnet from the skill's description and grouped by trigger clause. Not reviewed by hand |
| Verdict rule | First tool decision only (skill-creator rule, `--max-explore 0`): invoking the skill is a hit, invoking another skill is stolen, any other tool or a plain answer is a miss |
| Sampling | Adaptive, at most 3 runs per query. Negatives run once and go to 3 runs only if one triggered; should-trigger queries run twice and get a 3rd run only if the two disagree. Rates are averages of per-query rates, and 95% Wilson intervals are sized by the number of queries |
| Environment | An empty project directory holding only the skill under test (plus its companions, below). Host-injected `CLAUDE_CODE_*` variables were removed, user settings and MCP servers were not loaded, and anything needing approval was denied. The model was offered 27 tools; the 17 background skills are listed under "Caveats" |
| Trials | 1,798 counted, 0 errors |

| Run | Runner | Skills | Trials | Role |
|---|---|---|---|---|
| A: run-20261028-163738 | v0.4.1 | all 18, each installed alone, sets 1–2 | 1,656 | Headline for 17 skills (pooled with C for three of them) |
| B: run-20261028-215214 | v0.4.2 | lark-doc with its siblings lark-drive and lark-shared, sets 1–2 | 91 | Replaces lark-doc's rows from run A |
| C: run-20261028-225156 | v0.4.2 | set 3 of design-mobile-apps, diagnosing-bugs, prototype, lark-doc (lark-doc with siblings) | 148 | Third set, pooled with A or B |

Run A's own `report.md` still shows lark-doc at 20% false positives. That row is superseded. lark-doc's description says comments go to lark-drive, but lark-drive was not installed in run A, so the model had nowhere else to route those requests. A real install of `larksuite/cli` brings both. All three runs used the same CLI version, model, tool list and background skills. v0.4.2 differs from v0.4.1 only by installing the `companions` listed in `skills.json`.

An earlier pilot (find-skills and frontend-design, 191 trials) is not included. In that pilot the desktop app's environment offered the model three extra Artifact tools, and one of them was the model's first move in 5 trials. Run A was made after that was fixed.

### Skills

| Skill | Source | Commit | SKILL.md sha256 |
|---|---|---|---|
| agent-browser | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser/tree/04ba5264dade678062c3cdcce0f4f293e748249f/skills/agent-browser) | `04ba526` | `19c4b9f7…` |
| deploy-to-vercel | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/deploy-to-vercel) | `063bee9` | `0df550ec…` |
| design-mobile-apps | [designed-by-ai/skills](https://github.com/designed-by-ai/skills/tree/03c20aec6dcedb5fabfb03dc37982eb52ef19ed6/skills/design-mobile-apps) | `03c20ae` | `54b4606f…` |
| diagnosing-bugs | [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/diagnosing-bugs) | `5beb35b` | `aa87b0ac…` |
| doc-coauthoring | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/doc-coauthoring) | `dbd4588` | `acb9b89b…` |
| domain-modeling | [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/domain-modeling) | `5beb35b` | `b62d9972…` |
| find-skills | [vercel-labs/skills](https://github.com/vercel-labs/skills/tree/a80e4c9d12d607631249d4d7d059f835d4b2f13a/skills/find-skills) | `a80e4c9` | `c1d96289…` |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design) | `dbd4588` | `b8009ae6…` |
| hyperframes | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes/tree/575f68cf5bc4789e0f2b71c16333f5ef79586156/skills/hyperframes) | `575f68c` | `180ce4ee…` |
| lark-doc | [larksuite/cli](https://github.com/larksuite/cli/tree/017b19a793ad71794a02887ede04757f3d82e10d/skills/lark-doc) | `017b19a` | `0f1aea17…` |
| mcp-builder | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/mcp-builder) | `dbd4588` | `57231330…` |
| prototype | [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/prototype) | `5beb35b` | `f74ae01f…` |
| skill-creator | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/skill-creator) | `dbd4588` | `e030e768…` |
| tdd | [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/tdd) | `5beb35b` | `96958308…` |
| vercel-react-best-practices | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | `063bee9` | `3286ace6…` |
| web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines) | `063bee9` | `17e48da9…` |
| webapp-testing | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/webapp-testing) | `dbd4588` | `8bc27790…` |
| xlsx | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/xlsx) | `dbd4588` | `111e0652…` |

lark-doc's companions in runs B and C come from the same commit: lark-drive (SKILL.md `b140cd55…`) and lark-shared (`9fa68bb1…`).

## Results

Column definitions:

- **Recall**: the share of should-trigger queries where the skill was invoked.
- **False positives**: the share of should-not-trigger queries where the skill was invoked.
- 95% intervals are in parentheses.
- **No tool call**: the share of should-trigger trials where the model answered without calling any tool at all.
- **Per set**: each question set's own recall and grade.
- **Spread**: the largest recall gap between sets. ⚠ marks sets that disagree (a gap over 20 points, or different grades).

**How a grade is published.** Each row's grade is computed from all its question sets pooled. It is published only when most of the sets give that same grade on their own: both sets when there are two, at least two when there are three. Otherwise the row would read "sets disagree" and carry no grade. In this batch every skill meets that rule. The four skills that got a third set (Finding 6) still carry ⚠, because the gap between their sets is still large.

| Skill | Grade | Recall | False positives | Queries (pos / neg) | Stolen | No tool call | Per set (recall, grade) | Spread | Runs |
|---|---|---|---|---|---|---|---|---|---|
| design-mobile-apps | triggers well | 85% (70–93%) | 0% (0–11%) | 36 / 30 | – | 0% | set 1 75% fair / set 2 92% well / set 3 89% well | 17 pts ⚠ | A+C |
| agent-browser | triggers fair | 74% (60–84%) | 0% (0–16%) | 48 / 20 | claude-api 1 | 6% | set 1 75% fair / set 2 72% fair | 3 pts | A |
| deploy-to-vercel | triggers fair | 72% (55–84%) | 0% (0–16%) | 32 / 20 | – | 0% | set 1 75% fair / set 2 69% fair | 6 pts | A |
| lark-doc | triggers fair | 71% (57–82%) | 10% (4–26%) | 48 / 30 | lark-drive 7, lark-shared 1 | 6% | set 1 92% fair / set 2 58% fair / set 3 62% fair | 33 pts ⚠ | B+C |
| hyperframes | triggers fair | 68% (53–81%) | 0% (0–16%) | 40 / 20 | dataviz 1 | 2% | set 1 67% fair / set 2 70% fair | 3 pts | A |
| xlsx | triggers fair | 57% (41–71%) | 0% (0–16%) | 40 / 20 | – | 0% | set 1 55% fair / set 2 58% fair | 3 pts | A |
| mcp-builder | triggers fair | 54% (35–72%) | 0% (0–16%) | 24 / 20 | claude-api 1 | 11% | set 1 56% fair / set 2 53% fair | 3 pts | A |
| prototype | triggers poorly | 46% (28–65%) | 0% (0–13%) | 24 / 26 | – | 0% | set 1 67% fair / set 2 38% poorly / set 3 33% poorly | 33 pts ⚠ | A+C |
| domain-modeling | triggers poorly | 36% (20–56%) | 0% (0–16%) | 24 / 20 | – | 0% | set 1 33% poorly / set 2 39% poorly | 6 pts | A |
| tdd | triggers poorly | 33% (20–51%) | 0% (0–16%) | 32 / 20 | – | 0% | set 1 27% poorly / set 2 40% poorly | 12 pts | A |
| web-design-guidelines | triggers poorly | 32% (20–48%) | 0% (0–16%) | 40 / 20 | – | 0% | set 1 25% poorly / set 2 40% poorly | 15 pts | A |
| find-skills | triggers poorly | 20% (10–36%) | 0% (0–16%) | 32 / 20 | – | 57% | set 1 21% poorly / set 2 19% poorly | 2 pts | A |
| diagnosing-bugs | triggers poorly | 18% (9–33%) | 0% (0–11%) | 37 / 30 | – | 0% | set 1 31% poorly / set 2 8% poorly / set 3 14% poorly | 22 pts ⚠ | A+C |
| webapp-testing | triggers poorly | 17% (8–31%) | 0% (0–16%) | 40 / 20 | run 8 | 0% | set 1 17% poorly / set 2 17% poorly | 0 pts | A |
| skill-creator | triggers poorly | 16% (8–30%) | 0% (0–16%) | 40 / 20 | – | 5% | set 1 18% poorly / set 2 13% poorly | 5 pts | A |
| doc-coauthoring | triggers poorly | 12% (6–26%) | 0% (0–16%) | 40 / 20 | – | 32% | set 1 18% poorly / set 2 7% poorly | 12 pts | A |
| frontend-design | triggers poorly | 12% (6–26%) | 0% (0–16%) | 40 / 20 | dataviz 2 | 20% | set 1 10% poorly / set 2 15% poorly | 5 pts | A |
| vercel-react-best-practices | triggers poorly | 3% (1–14%) | 0% (0–16%) | 40 / 20 | – | 12% | set 1 5% poorly / set 2 2% poorly | 3 pts | A |

**Grades**: 1 skill triggers well, 6 fair, 11 poorly. With 24–48 should-trigger queries per skill the intervals are wide, and most of them cross a grade boundary. Every row is flagged "borderline, add runs" in the run reports. Median recall is 35%, and 11 of 18 skills are under 50%.

**All skills together**: recall 41% (37–44%), false positives 1% (0–2%).

## Findings

**1. Explicit requests trigger; descriptive situations mostly do not.** Recall by trigger clause shows the same pattern in most skills. A clause that names the skill's own job in the user's words does well. A clause that describes a situation the skill should recognise does badly.

| Skill | Best clause | Worst clause |
|---|---|---|
| design-mobile-apps | Design mobile app screens with Sleek — 94% | Edit Sleek projects — 72% |
| agent-browser | AWS Bedrock AgentCore cloud browsers — 88% | Exploratory testing, dogfooding, QA — 50% |
| deploy-to-vercel | Deploy my app/website to Vercel — 96% | Push this live — 38% |
| lark-doc | User gives a doc URL/token — 100% | Insert or download image attachments — 50% |
| hyperframes | Render video to file — 100% | Edit an existing video — 46% |
| xlsx | Open/edit/fix existing spreadsheet file — 83% | Convert between tabular file formats — 25% |
| mcp-builder | Build MCP server to integrate external API/service — 79% | Build MCP server in Node/TypeScript with MCP SDK — 42% |
| prototype | Sanity-check a state model or logic — 58% | Explore what a UI should look like — 33% |
| domain-modeling | Writing or editing GLOSSARY.md — 75% | Discussing codebase terminology — 0% |
| tdd | Red-green-refactor mentioned — 75% | Wants integration tests — 0% |
| web-design-guidelines | Check site against best practices — 62% | Review UX — 0% |
| find-skills | Explicit find-a-skill request — 67% | Interest in extending capabilities — 0% |
| diagnosing-bugs | User explicitly asks to diagnose or debug — 44% | User reports something broken, throwing, or failing — 3% |
| webapp-testing | Interacting with local web apps via Playwright — 25% | Debugging UI behavior — 8% |
| skill-creator | Benchmark with variance analysis — 38% | Create skill from scratch — 0% |
| doc-coauthoring | Write technical specs — 33% | Write decision docs / similar structured content — 0% |
| frontend-design | Building new UI with distinctive visual design — 50% | Aesthetic direction and visual identity choices — 0% |
| vercel-react-best-practices | Reviewing code for performance issues — 12% | Implementing data fetching (client or server) — 0% |

Each clause has 8–12 should-trigger queries, so a single clause's rate is only indicative; the finding is the pattern across skills. tdd repeats the result of the 2026-10-27 batch (`../2026-10-27_tdd_haiku/`): "red-green-refactor" triggers, "wants integration tests" does not. Its overall recall is lower here (33% vs 40–43%). The likely reason is that the new sets give every clause the same number of queries, so tdd's weak clauses weigh as much as its strong ones.

**2. For three skills, a low recall is partly the model answering directly.** On should-trigger queries, Haiku called no tool at all in 57% of find-skills trials, 32% of doc-coauthoring trials and 20% of frontend-design trials. Many of those requests can be answered in text, and the model answered them without considering any skill. That is as much a property of the model and the host as of the description, and a better description may not fix it.

**3. A host skill takes webapp-testing's triggers.** The host's built-in `run` skill was invoked instead of webapp-testing in 8 trials, while webapp-testing itself had 17% recall. This is part of real use on this host, but the number depends on which skills the host ships.

**4. lark-doc: two gaps between its description and the model's choices.** With its siblings installed, lark-drive took 7 trials and lark-shared 1, all of them on negatives; no should-trigger trial went to a sibling. Two kinds of negatives still went to lark-doc:

- **Copying a doc.** Two independently drafted questions, "copy this feishu doc as a backup copy" (set 1) and "make a copy of our Lark design doc and save it as …" (set 3), went to lark-doc in 3 of 3 trials each. lark-doc's body sends copies to lark-drive, but its description does not mention copies, and the model chooses a skill from the description. Adding "copy / save as a copy → lark-drive" to the description is a concrete fix.
- **A Miaoda app link** (`/page/<token>`). It went to lark-doc in 2 of 3 trials, although the description says explicitly that such links are not cloud docs. Here the description is already right and the model overrode it. This is one question, so the result is indicative only.

One comment request (set 1) went to lark-doc in 1 of 3 trials; the other false positives were the copy and Miaoda questions above.

**5. Chinese vs English.** Across all skills, recall was 37% (32–42%) on Chinese queries and 44% (39–50%) on English ones; the intervals overlap. Only web-design-guidelines shows a gap with non-overlapping intervals: 10% in Chinese, 55% in English.

**6. A third question set settled the grades but not the gaps.** Four skills' first two sets disagreed, so each got a third independent set:

| Skill | First two sets | What the third set showed |
|---|---|---|
| design-mobile-apps | 92% (well) vs 75% (fair) | 89%, which sides with "well" |
| prototype | 38% (poorly) vs 67% (fair) | 33%, which sides with "poorly" |
| diagnosing-bugs | 8% vs 31%, both poorly | 14%, still poorly |
| lark-doc | 58% vs 92%, both fair | 62%, still fair |

In three of the four, the third set agreed with one of the first two, and one set stood apart. lark-doc's three sets all differ. Recall gaps above 20 points remain for prototype, diagnosing-bugs and lark-doc. Their grades follow the majority rule above, but a different set of AI-drafted questions could move their recall by 20–30 points. prototype's pooled 46% also sits close to the 50% line between "poorly" and "fair", with only 8 should-trigger queries in each set.

## Caveats to state when publishing

- **False positives are measured with weak negatives.** 17 of 18 skills show 0% false positives. That does not show their descriptions have tight boundaries. The Python runner's drafting prompt lets a negative share only a domain with the skill, so most negatives are far from the description. That prompt is frozen, so this batch stays comparable with the tdd batch. The Node line has a prompt that requires negatives to borrow the description's words, but it was not used for this batch.
- **AI-drafted questions, not reviewed by hand.** The independent sets are the check: four skills failed it and got a third set (Finding 6).
- **Haiku only.** Users more often run Sonnet, and there is no Sonnet result here. The DeepSeek batch (`../2026-10-28_all_deepseek/`) runs the same question sets on another model and shows how much a ranking can move.
- **One machine's background.** The 17 skills loaded alongside every trial were: design, design-sync, dataviz, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring. The Stolen column depends on this list.
- **Siblings only for lark-doc.** The other skills were installed alone. An audit of all 18 descriptions found no other skill whose description routes work to a sibling, so lark-doc is the only one that needs its siblings for a fair test (`_companions_audit` in `skills.json`).
- **Strict verdict rule.** A model that looks around first (Glob, `ls`) and would have invoked the skill afterwards counts as a miss, as in skill-creator. The read-only robustness check was run only on tdd (`../2026-10-27_tdd_haiku/`), where it changed 1 of 30 should-trigger trials.
- **Adaptive sampling departs from skill-creator's fixed 3 runs.** A negative that triggers in 1 of 5 attempts is more likely to be missed after one run. Rates use per-query means, so topped-up queries are not over-weighted.
- **Clause and language breakdowns are indicative.** Each has 8–12 should-trigger queries per clause and 8–25 per language per skill.

## Reproducing

```bash
python step0/trigger_test.py run --runs 3 --model haiku
python step0/trigger_test.py run --only lark-doc --runs 3 --model haiku
python step0/batch_tables.py haiku
```

The first command reproduces run A, and the second reproduces run B (lark-doc with its companions). For run C, `clause-1.json` and `clause-2.json` of the four skills were moved aside so that only `clause-3.json` ran (`run` has no option to select one set):

```bash
python step0/trigger_test.py run --only design-mobile-apps,diagnosing-bugs,prototype,lark-doc --runs 3 --model haiku
```

Each run directory holds four files:

- `meta.json`: environment fingerprint, tool list, background skills.
- `raw.jsonl`: one record per trial, with the first request's token usage.
- `summary.json`
- `report.md`

A run's own `report.md` covers only that run. The pooled rows above come from `batch_tables.py`.
