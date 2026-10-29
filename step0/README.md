# Step 0: Claude Code skill trigger test

Tests one host (Claude Code) and one layer (triggering) to answer a single question: once a skill is installed, does the agent actually use it when it should?

## Requirements

- Python 3.10+ (standard library only)
- A logged-in Claude Code CLI (`claude`)
- `git`, for fetching skills from GitHub

## Method: independent question sets instead of per-pack human review

Each skill is tested with **two or more independently AI-drafted question sets**, grouped by the trigger clauses in its description. The report pools all sets for the headline grade, shows each set separately and reports the **spread** between them. Large spread (over 20 points of recall, or different grades) is flagged as "question sets disagree".

Question sets are **not reviewed by hand**. In the tdd experiment (`experiments/qset-tdd/EXPERIMENT.md`), three independently drafted, unreviewed sets gave 42%, 43% and 39% recall with the same grade, so per-pack human review would not have changed the result, while it costs 20–30 minutes per skill and needs domain knowledge. Grades are not reviewed by hand either, including "triggers poorly": a reviewer's judgement would be the one step nobody could reproduce. Errors are corrected through public appeals (see `CONTRIBUTING.md`), and every report states that it is an automated result under the listed conditions.

## Usage

```bash
python trigger_test.py draft --manifest skills.json
```
Tops every skill up to two independent question sets in `queries/<skill>/clause-1.json`, `clause-2.json`. For each set the drafter lists the trigger clauses in the skill's description ("use when the user wants X, mentions Y, or asks for Z"), writes 3 should-trigger queries per clause and 10 near-miss negatives tagged by clause. Each set is a separate drafting call; set 2 onward reuses set 1's clause list so per-clause results stay comparable. Options: `--sets 3` for a third set, `--per-clause N`, `--model sonnet`, `--free` for free-form drafting without clauses.

`--force` re-drafts sets 1..`--sets` from scratch; without it, drafting only fills the gaps, so an existing set is never rewritten. Use it to redo a set that came out too thin: a description with a single trigger clause yields 3 should-trigger queries per set, and at 3 runs per query that is 9 positive trials, below the 10 a grade needs, so the per-set grade reads `insufficient data`. Drafting warns when a set falls below 4 should-trigger queries; redo those skills with `--force --per-clause 4`.

Older skills may still have a single free-form pack at `queries/<skill>.json` (set id `legacy`). It is used only when `queries/<skill>/` does not exist.

```bash
python trigger_test.py run --dry-run --model sonnet
```
Prints the number of trials and a rough cost estimate only.

```bash
python trigger_test.py run --model sonnet --runs 3
```
The real run, covering every question set of every skill. Results go to `results/<timestamp>/`: `raw.jsonl` (one record per trial, including its `query_set`), `meta.json` (environment fingerprint), `summary.json` and `report.md`. If a run is interrupted, continue it with `--resume results/<timestamp>`. Use `--only a,b,c` to run a subset of skills.

`meta.json` is written before the first trial and refreshed every 25 trials, so a run killed by Ctrl-C, a quota limit or a dropped connection always resumes and never restarts from zero. A resume must repeat the run's conditions: `--resume` refuses a different `--model`, `--runs`, `--max-explore`, `--sampling` or backend, because records from different conditions cannot be pooled.

### Sampling (v0.4.0)

`--runs` is the maximum runs per query. By default (`--sampling adaptive`) a run goes in rounds:

| Query | First round | Topped up to `--runs` when |
|---|---|---|
| should not trigger | 1 run | it triggered |
| should trigger | `--runs` − 1 runs | its runs disagree |

At `--runs 3` this cuts a full run by about half: negatives are over half the queries and rarely trigger, and on tdd with Haiku 19 of 20 queries hit the same count in two independent runs. Repeat runs of one query are not independent samples, so most of the information is in the number of distinct queries, not the repeats.

Because run counts then differ between queries, pooling trials would over-weight exactly the queries that were topped up (a negative that triggered once would count three times, a clean one once). Adaptive runs therefore report the **average of per-query rates**, with a Wilson interval sized by the **number of queries**, and grade a set once it has 4 queries of each kind (`MIN_POS_QUERIES`). With equal run counts the point estimate is identical to pooling. `--sampling fixed` gives every query every run, which is skill-creator's protocol; runs from before v0.4.0 are read as fixed and their reports are unchanged.

Each worker reuses one fixed trial directory, emptied between trials. The CLI writes the working directory into its system prompt, so a fresh random path per trial breaks the prompt cache from that point on: measured with Haiku, a random path wrote about 7.6k tokens to the cache per trial and a fixed one about 4.5k. Each trial record carries its first request's `usage`.

### Clean environment and usage limits (v0.4.1)

A host such as the Claude desktop app sets `CLAUDE_CODE_*` variables that make the CLI offer the model extra tools (for example `Artifact`), and a trial whose first move is one of them counts as not triggered. The runner therefore drops the host's `CLAUDE_CODE_*` variables before each trial, keeping only the ones a user sets on purpose (`CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_GIT_BASH_PATH`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`). `meta.json` records the tool list the model was offered, and the report header prints it.

When the CLI hits a usage limit it can end with an error result instead of exiting with an error; that trial is recorded as `error`, never as not triggered. After 8 errors or timeouts in a row the run stops, writes `stopped_reason` to `meta.json`, prints the `--resume` command and exits with code 3; resume once the limit resets and the failed trials run again.

### Backends

The runner drives the `claude` CLI, so it measures whatever backend that CLI points at. To test another model, set `ANTHROPIC_BASE_URL` and its key in the environment; the trial process inherits them.

```bash
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic ANTHROPIC_AUTH_TOKEN=... \
python trigger_test.py run --model deepseek-v4-flash --runs 3
```

`meta.json` records the backend host, the requested model, the resolved model and the API key source, so a run against a third-party backend cannot be mistaken for an Anthropic one. An Anthropic model name on a non-Anthropic backend is **refused** (`--allow-model-remap` overrides it): gateways remap those names silently — DeepSeek routes `claude-haiku*` and `claude-sonnet*` to `deepseek-flash` and `claude-opus*` to `deepseek-v4-pro` — so `--model haiku` there would test a model it does not name.

Two caveats for cross-model work. The harness is still Claude Code, so a result is "this model through Claude Code", not the model natively. And a model with weaker tool-call adherence produces `not_triggered` trials where it simply answered without calling any tool; the report's Tool behaviour section separates that from a genuine stolen trigger, and flags it when it covers half or more of the should-trigger trials.

```bash
python trigger_test.py report results/<timestamp>
```
Rebuilds the report from the raw records.

## Manifest format (skills.json)

```json
{ "skills": [
  { "name": "csv-dedupe", "path": "examples/csv-dedupe" },
  { "name": "some-skill", "repo": "https://github.com/owner/repo", "ref": "<commit or branch>", "subdir": "skills/some-skill" }
] }
```
GitHub sources are fetched into `.cache/` (a pinned 40-character commit is fetched shallowly). The actual commit and the SKILL.md sha256 are recorded in `meta.json`; together they are the "skill version" in the version pin.

The "question-set version" is `query_set_sha256`, recorded per set: a hash of each query's `id`, `query` and `should_trigger` only (canonical JSON, sorted by id). Metadata such as `note`, `clause` or `drafted_by` is excluded, so annotating a set does not invalidate earlier results. Changing a question or its label does change the hash, and `--resume` refuses to continue a run whose questions have changed.

## Verdict rules

Each trial starts from an empty project directory containing only the skill under test (`.claude/skills/<name>/`), runs `claude -p <query>`, and watches the streamed output:

**Headline rule (default, `--max-explore 0`)**: the first tool decision alone decides. This is the same detection rule as Anthropic's skill-creator trigger eval (`scripts/run_eval.py`), so results can be compared with it.

| First tool decision | Verdict |
|---|---|
| `Skill` with a matching name, or `Read` of the skill's SKILL.md | triggered |
| `Skill` invoking a different skill | other_skill (stolen) |
| Any other tool (Bash, Edit, Glob, ...) | not_triggered; the process is killed before the tool runs |
| Answers without invoking the skill, i.e. no tool call at all | not_triggered; the report counts this apart from a stolen trigger |

**Robustness check (`--max-explore N`, e.g. 3)**: the model may first make up to N read-only calls (Glob, Grep, Read, LS) before the verdict; more than N, or any other tool, means not_triggered. Read-only calls are permitted only inside the trial directory (`Read(./**)` and the like); anything outside it is denied, so exploration never touches your other files. Report it alongside the headline numbers, never instead of them.

The process is killed as soon as a verdict is reached, so a trial never carries out the task. Measured with Haiku: about 4 seconds per trial (about 5 with exploration).

Isolation and safety: `--permission-mode dontAsk` (anything needing approval is denied), `--setting-sources project` (your user-level settings and permission allowlist are ignored), `--strict-mcp-config` (no MCP servers), `--no-session-persistence`.

## Known limitations (shown in the report; state them when publishing)

- **Non-standard background skills**: skills in your `~/.claude/skills` and built-in skills still load, and they form the background that can steal triggers. The report lists all of them. Cross-machine comparable data needs a defined standard skill set, run in a clean config directory (`CLAUDE_CONFIG_DIR` plus an API key).
- **Same-name conflicts**: if the environment already has a skill with the same name (e.g. `anthropic-skills:pdf` while testing `pdf`), the report flags it and that row is not trustworthy.
- **Skill families** (v0.4.2): a skill whose description routes some work to a sibling (lark-doc sends comments to lark-drive) is tested alone by default, so the model has nowhere else to go and the routed queries look like false positives. List the siblings a real install brings under `companions` in `skills.json` (`{"name", "subdir"}`, same repo and ref); they are installed in every trial of that skill, invoking one counts as stolen, and the report header names them. With lark-drive and lark-shared installed, lark-doc's false positives on Haiku went from 20% to 7%.
- **The headline rule is strict**: a model that looks around first (Glob, `ls`) before invoking the skill is counted as not triggered. This matches skill-creator. The `--max-explore` robustness check relaxes it for read-only tools; Bash still ends a trial because it can change things. On tdd with Haiku, the relaxed rule changed only 1 of 30 should-trigger trials (see `data/2026-10-27_tdd_haiku/BATCH.md`).
- **Adaptive sampling departs from skill-creator**, which runs every query 3 times; use `--sampling fixed` where that comparison matters. A negative that does not trigger on its one run is taken as clean, so a negative that triggers rarely (say one time in five) is more often missed than at 3 runs.
- **Coarse grades only**: at 20 queries × 3 runs, the recall confidence interval is still about ±15pp, so grades are only "triggers well / triggers fair / triggers poorly / insufficient data", and results straddling a threshold are flagged "borderline, add runs".
- **Chinese vs English comparison is indicative**: the report splits recall and false positives by query language (any CJK character counts as Chinese) and flags a gap only when the two recall confidence intervals do not overlap. Per skill, each language has only about 15 should-trigger trials, so single-skill gaps rarely reach the flag; the pooled "All skills" row is where a real signal can show. The pooled interval treats trials as independent although they cluster by query, so it is somewhat too narrow. The Chinese and English queries are also different questions, so language is confounded with content; confirm a gap with translated query pairs before reporting it.
- Cost estimates are orders of magnitude only; subscription users spend quota, not cash.

## Step 0 skill list (2026-10-26)

Picked from the skills.sh all-time leaderboard. In the top 30, mattpocock has 12 entries and heygen 7, so the list is de-duplicated by publisher and domain rather than taken by rank. All commits are pinned in `skills.json`.

| Domain | Skill | Source |
|---|---|---|
| Skill discovery | find-skills | vercel-labs/skills |
| Engineering workflow | tdd, diagnosing-bugs, prototype, domain-modeling | mattpocock/skills |
| Browser automation | agent-browser | vercel-labs/agent-browser |
| Video | hyperframes | heygen-com/hyperframes |
| Design | frontend-design | anthropics/skills |
| Design | web-design-guidelines | vercel-labs/agent-skills |
| Design | design-mobile-apps | designed-by-ai/skills |
| Testing | webapp-testing | anthropics/skills |
| MCP | mcp-builder | anthropics/skills |
| Docs | doc-coauthoring | anthropics/skills |
| Spreadsheets | xlsx | anthropics/skills |
| Meta | skill-creator | anthropics/skills |
| React | vercel-react-best-practices | vercel-labs/agent-skills |
| Deployment | deploy-to-vercel | vercel-labs/agent-skills |
| Office suite (Chinese) | lark-doc | larksuite/cli |

**Excluded, but worth reporting**: 23 skills in mattpocock/skills declare `disable-model-invocation: true`. They can only be invoked manually and the model never triggers them on its own, so trigger tests do not apply. They include leaderboard regulars grill-me, grill-with-docs, improve-codebase-architecture, handoff, triage and teach. Install count and "gets used automatically" are different things, so the table should have a separate "invocation: manual only" column. The runner skips such skills automatically.

**Trigger stealing in your environment**: built-in skills on your machine such as `debug`, `verify` and `run` may steal triggers from diagnosing-bugs and webapp-testing. That is part of real-world usage, and the report's "Stolen" column shows it.

## Suggested pre-publication workflow

1. Pick 15–20 popular skills (from the skills.sh install leaderboard, covering different domains) and put them in `skills.json`.
2. Run `draft` to give every skill two independent clause-grouped question sets. No manual review is needed.
3. Run with your everyday model and `--runs 3`.
4. Check the "Question sets" table: where sets disagree, draft a third set (`draft --sets 3 --only <skill>`) and re-run that skill before drawing conclusions.
5. Pick the results with a story (heavily installed but rarely triggered, a trigger clause that never fires, high false positives, skills stealing from each other), write them up, and publish together with the raw `raw.jsonl` and the question sets so others can reproduce them.
6. State in the report that the results are automated, from AI-drafted questions, and valid only for the listed host, model and versions; point readers to the appeal template.
