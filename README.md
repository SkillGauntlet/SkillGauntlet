# SkillGauntlet

*Every skill runs the gauntlet.*

Agent skills (SKILL.md) keep piling up and changing fast, yet nobody tells you which ones are still worth keeping. SkillGauntlet is an independent, third-party evaluation of popular skills, using public and reproducible methods to answer what you most need to know before installing one.

## Three layers, cheapest first

| Layer | Question | Cost |
|---|---|---|
| 0 static | What does it put in my context, what is it allowed to touch, what does its code do, does it try to hijack the model, is the description even usable? | zero |
| 1 trigger | When I ask for the job it claims, does it actually fire? Does it fire when it shouldn't? | model calls |
| 2 gain | With it versus without it, on a task a program can grade: does it help? | model calls ×2 |

Layer 0 runs first because it is free and because it disqualifies most problems before you spend anything.
Layers 1 and 2 are opt-in.

## Results so far

Step 0 tested 18 popular skills on 2026-10-28. Start with the
[overview](step0/data/OVERVIEW-2026-10-28.md), which says what each report measures and which numbers
can be compared.

- [Haiku batch](step0/data/2026-10-28_all_haiku/BATCH.md) (headline): Claude Code × claude-haiku-5-5,
  1,798 trials. 1 skill triggers well, 6 fair, 11 poorly; across all skills, recall is 41%.
- [DeepSeek batch](step0/data/2026-10-28_all_deepseek/BATCH.md): the same question sets on
  deepseek-v4-flash. Overall recall is the same, but single skills move a lot, one of them by more than 70 points.
- [Codex probe](step0/data/2026-10-28_codex_probe/BATCH.md): facts only, no trigger rate (see
  "Hosts and models").
- [Static layer](step0/data/2026-10-28_all_haiku/static/SUMMARY.md): all 18 skills, no model calls.
- [Leaderboard](LEADERBOARD.md): the maintainer's batches and community submissions in one generated page, one table per host.

## Usage

Needs Node 18 or later; the package has no dependencies.

```
npx skillgauntlet                         # interactive
npx skillgauntlet static path/to/skill    # layer 0 only, no model calls
npx skillgauntlet static path/to/repo --json
npx skillgauntlet resume path/to/run-dir  # continue an interrupted or stopped run
```

From a clone, `node bin/skillgauntlet.js` does the same, and
`node scripts/static-summary.mjs step0/skills.json step0/data/static` runs layer 0 over a whole manifest.
Add `--lang zh|ja|en`, or set `SG_LANG`, to choose the language without the menu.

The interactive flow asks the following, in this order, and takes only arrow keys, `y`/`n` and enter:

1. **Language**: 中文, 日本語 or English.
2. **Where the skill comes from**: already installed (scanned in `.agents/skills`,
   `.claude/skills`, `.codex/skills`, user and project scope), another local directory, or a GitHub
   repository for a skill you have not installed.
3. **How many**: all discovered skills, or just one picked with the arrow keys.
4. **Host**: Claude Code, CodeBuddy Code, Codewhale or Codex (see "Hosts and models").
5. **Depth**, then **backend** and **model**.
6. **An estimate before anything is spent**: trials and minutes for the whole selection, not just
   per skill. No cash figure is shown, because what a run costs depends on the backend and the plan,
   and a number would be a guess.
7. **`y`** to run, `n` to cancel.

A skill that is not installed is named the way it can be resolved: `owner/repo`, or
`owner/repo/path/to/skill` when the repository holds several. There is no global name-to-repository
registry, so a bare name like `tdd` cannot be resolved and the prompt says so.

Layer 2 results are a **local comparison and are never uploaded**. Nothing is uploaded at all: there is
no public leaderboard yet, so the CLI says so instead of offering a submission that would go nowhere.

Every run is archived under the skill's `.skillgauntlet/runs/<timestamp>/`:

| file | contents |
|---|---|
| `raw.jsonl` | one record per trial, appended as it finishes |
| `meta.json` | host, backend, model, runs, exploration budget, depth, question-set hash, platform, start and end |
| `summary.json` | the totals the report was rendered from |

`meta.json` is written before the first trial and refreshed every 25 records, so a run killed by
Ctrl-C, a quota limit or a closed laptop keeps everything it already finished and still says what
conditions produced it. The records are the only artefact that cannot be regenerated cheaply: the
report is a rendering of them, and keeping them means the statistics can be corrected, two runs
compared, or a submission assembled later without paying for the trials again.

A run stops by itself after 8 errors or timeouts in a row (a quota limit usually looks like that) and
exits with code 3. `resume <run-dir>` continues it, and retries the failed trials. It refuses to resume
when the model, backend, runs, exploration budget, question set or SKILL.md has changed, because records
made under different conditions cannot be pooled.

The report follows the language you picked (Chinese, Japanese or English). Every sentence comes from
one message table, and the scorecard JSON carries message keys rather than prose
(`skillgauntlet/scorecard/2`), so a stored scorecard can be rendered in any of the three languages
without re-analysing the skill. The Japanese wording has not yet been reviewed by a native speaker.

The static layer reports by group and never sums them: a weighted total cannot be audited or appealed,
and appeal is the one thing a rating must allow.

- **A context cost** — SKILL.md size in tokens, description length (read on every request), whether the
  body references files instead of inlining them, package size.
- **B permission surface** — whether `allowed-tools` is declared, how wide the declared scope is,
  whether the skill is manual-invocation only, how much executable code it ships.
- **C code risk** — network calls, command execution, credential access, obfuscation, install hooks.
  Reported as facts; escalated only when the skill ships code *and* declares no scope.
- **D instruction hijacking** — override phrases, requests for sensitive paths, instructions to send
  data out, zero-width characters, external images.
- **E description quality** — presence, whether it states when to use it, over-broad quantifiers,
  rough clause count, name/directory agreement.

## Submit your results

The leaderboard data has to come from people running the tests, so a finished run can be contributed with one
command. Results stay on your machine until you run it; nothing is uploaded automatically.

1. Run a test the normal way (`npx skillgauntlet`). The run is saved under `<skill>/.skillgauntlet/runs/<timestamp>/`
   and its path is printed. The skill must come from a public git repository, with the commit you tested
   pushed and no uncommitted edits to the skill. To help confirm an existing row of the leaderboard, test the
   commit that row's Skill link points to: a row is for one pinned commit.
2. Preview what would be submitted, with nothing uploaded: `npx skillgauntlet submit <run-dir> --dry-run`.
   It checks the run against [`schemas/submission-1.json`](schemas/submission-1.json), strips local paths,
   your login name, environment values and anything shaped like a key or token, refuses to continue if
   something secret-looking remains, and prints exactly what would go (the package is also left on disk to read).
3. Submit: `npx skillgauntlet submit <run-dir>`. After you confirm, it forks this repository under your account,
   pushes a branch and opens a pull request as you, using the GitHub CLI (`gh`). Without `gh`, or when it is not
   logged in, it prints the manual steps instead.
4. Sign the [CLA](CLA.md) when the bot asks (once). CI then comments on the pull request with a pass, or with
   exactly what is missing.

A merged submission is a **community single sample**. It becomes **confirmed** when another independent
submission, or a maintainer run, lands on the same grade for the same skill version, host and model.
Disagreeing results are kept side by side. See [`LEADERBOARD.md`](LEADERBOARD.md) for the current rows and what
each tag means, and [CONTRIBUTING.md](CONTRIBUTING.md#submitting-results) for the details, including what CI
checks and what it cannot.

The runner cannot prevent forgery. CI checks format, hashes and arithmetic; it cannot show that the trials
were really run. The tags say how many submissions agree, not that any of them is proven.

## Status

Early stage, and honestly labelled.

- **Layer 0: implemented and exercised** on the 18 step 0 skills, twice, with identical output; see
  [`static/SUMMARY.md`](step0/data/2026-10-28_all_haiku/static/SUMMARY.md). Its thresholds (SKILL.md
  token counts, package size) are not yet calibrated against a real distribution, so treat them as a
  ranking aid, not as a pass mark.
- **Layer 1: two runners, published data.**
  - The Python runner in [`step0/`](step0/README.md) produced every published batch. It runs a whole
    manifest, resumes, and pins each skill to a commit.
  - The Node CLI is the one meant for other people. It follows the same verdict rule and has
    been run end to end on one skill on each path: Claude Code × Haiku, Claude Code × DeepSeek,
    CodeBuddy Code and Codewhale.
  - The two runners draft questions with different prompts: the CLI's negatives must borrow the
    description's wording. Their question sets are therefore not interchangeable.
- **Layer 2: contract DSL implemented** ([`contracts/`](contracts/)), with per-task contracts for tdd,
  xlsx, webapp-testing and diagnosing-bugs: 14 contracts covering 4 of the 18 skills. No LLM judge, on
  purpose: a judge would be expensive, biased and not reproducible. A skill without a contract is
  reported as "not gradable automatically" rather than guessed. `node scripts/check-contracts.mjs`
  validates every contract file offline. It fails any contract that already passes on an untouched
  fixture, because such a contract is measuring nothing.
- **Tests**: `npm test` and `python -m unittest discover -s tests` run offline and spend no quota; CI
  runs both.

Question sets are cached in `.skillgauntlet/queries-<per-clause>x<negatives>.json` next to the report
and reused while the skill's SKILL.md is unchanged, so re-running a skill does not pay for drafting
again. Editing the description invalidates the cache, which is exactly when fresh questions are needed.

## Hosts and models

| Host | Layer 0 | Trigger rate (layer 1) | Gain (layer 2) | What it spends |
|---|---|---|---|---|
| Claude Code | yes | yes | yes | Claude plan quota, or an API key; DeepSeek via `ANTHROPIC_BASE_URL` |
| CodeBuddy Code | yes | yes | no | the CodeBuddy account's quota |
| Codewhale | yes | yes | no | DeepSeek API cash (`DEEPSEEK_API_KEY`) |
| Codex | yes | **no** (not observable) | no; activation probe instead | the ChatGPT plan's quota |

A trigger rate is a number for one host and one model. Numbers from two hosts are never merged or
ranked against each other.

Layer 0 is host-agnostic: it reads a skill directory, so it works for a skill installed by any host.

Layer 1 drives a CLI, so it measures that CLI's host. The model is whatever `--model` resolves to under
your credentials: the plan's aliases on a subscription, any model id on an API key. A non-Anthropic
backend works through `ANTHROPIC_BASE_URL`; DeepSeek's endpoint needs an API key, because there is no
login it could reuse.

**CodeBuddy Code** (the command line behind Tencent's WorkBuddy) is a second host with a measurable trigger rate: a skill call appears in its stream as a `tool_use` named `Skill`, the same shape as in Claude Code, which was confirmed on a live run. It spends the quota of its own account (log in once with `/login` inside `codebuddy`), runs the trigger layer only, and is launched with a restricted tool list because its default one has 60+ tools. A rate measured here is a CodeBuddy number and is never merged with a Claude Code one.

**Codewhale** (formerly DeepSeek-TUI, runs DeepSeek models) is a third host with a measurable trigger rate. It reads a skill through a `load_skill` tool, so the first `load_skill` call whose `input.name` is the tested skill counts as a trigger; a search (`input.query`) or a catalogue listing does not. Trials run in a throw-away `HOME` that holds only the tested skill, with `load_skill` as the only tool (its `--auto` mode has no execution sandbox on Windows). It needs `codewhale` on `PATH` (`npm install -g codewhale`, which the interactive mode can run for you) and `DEEPSEEK_API_KEY` in the environment. A rate measured here is a Codewhale number and is never merged with another host's.

**Codex is supported for what it exposes, which is a smaller surface:**

| Codex emits | Codex does not emit |
|---|---|
| `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `error` | any skill item |
| `item.started/updated/completed` carrying `command_execution`, `mcp_tool_call`, `file_change`, `todo_list`, `agent_message`, `user_message`, `agent_reasoning`, `error` | a "skill was used" event |

That schema was confirmed against a live run (codex-cli 0.159.2, ChatGPT account), which also showed
two traps worth knowing: with `--sandbox read-only` every `exec_command` is refused by policy, so a
probe needs `workspace-write`; and without `--ignore-user-config` a stale model id in
`~/.codex/config.toml` fails every turn for reasons that have nothing to do with the skill.

A skill in Codex is host-side context: selected and injected, not called as a tool. `skills_used` exists
only in the telemetry profile (`unique_skills_used`, `total_skills_used`), never in the stream. So a
trigger rate cannot be measured here, and reporting one would mean inventing it. What is measurable is
whether the agent acted and what it changed — which is the **activation probe**: the same request with
and without the skill, comparing the first action and the changed files. That is evidence of influence,
not of triggering, and the report labels it that way.

The probe path is exercised end to end: two runs of the same request on a task that must produce
files, one with the skill installed and one without. It reports facts — the first action, the files
each side produced, and whether those match — and deliberately gives **no influenced/not-influenced
verdict**. Two runs of the same request never execute identical command strings, so "the action
differs" is true almost always and would decide nothing.

Two things the probe taught us, both now baked in: the skill is installed only into `.agents/skills`,
because a `.codex/skills` copy in the workspace changed the sandbox outcome of one side and turned the
comparison into a false positive; and `file_change` items only appear for patch-style edits, so the
record of what changed comes from a filesystem diff rather than from the stream.

## Method principles

- Trigger detection follows Anthropic's skill-creator trigger eval: the model's first tool decision decides.
- "Answered without calling any tool" is counted apart from "called another tool first". On a backend
  with weaker tool-call adherence that difference decides whether the model or the description is at fault.
- Each skill is tested with **two or more independently AI-drafted question sets**, grouped by the trigger
  clauses in its description. Results are reported per clause and per set, with the **spread between
  sets**; skills whose sets disagree are flagged.
- Question sets are not reviewed by hand, and neither are grades, including low ones. Independent sets and
  a published spread make results checkable without a reviewer, and a reviewer's own judgement would be the
  one part of the method nobody could reproduce. Mistakes are corrected through public appeals instead
  (see [CONTRIBUTING.md](CONTRIBUTING.md)). Reports say plainly that they are automated results under stated
  conditions.
- **Negatives must borrow wording, and the claim is checked.** The drafter has to name a fragment of its
  own request that carries the borrowed wording, and the runner warns when it cannot. Without that, a
  drafter writes negatives from a different domain, they never trigger, and the false-positive rate comes
  out at zero for reasons that have nothing to do with the skill -- which is the one finding the report
  is supposed to deliver. This rule is in the CLI. The published 2026-10-28 batches were drafted by the
  Python runner, whose prompt was kept unchanged so earlier batches stay comparable, so their
  false-positive rates are labelled as measured with weak negatives.
- Coarse grades only, with confidence intervals computed over **queries** (the independent unit), not
  over trials: three runs of one query are not three independent observations.
- Every result is pinned on four dimensions: skill version (commit plus SKILL.md hash), host version,
  model version and question-set version. A backend other than Anthropic is recorded too.
- Raw per-trial records and the question sets are published alongside each report so anyone can
  reproduce it, and anyone can point out a bad question in an Issue.

## Deeper material

- [`step0/data/OVERVIEW-2026-10-28.md`](step0/data/OVERVIEW-2026-10-28.md): the step 0 results in one page.
- [`step0/README.md`](step0/README.md): the Python trigger-test runner (commands, verdict rules,
  isolation).
- [`step0/batch_tables.py`](step0/batch_tables.py): recounts every table of the 2026-10-28 reports from the
  raw records.
- [`step0/experiments/qset-tdd/EXPERIMENT.md`](step0/experiments/qset-tdd/EXPERIMENT.md): how much results
  depend on the question set, and why sets are not reviewed by hand.
- [`SECURITY.md`](SECURITY.md): what the runner executes, what it isolates and what it does not.

## License

| Content | License |
|---|---|
| Code (runner, scripts) | [Apache-2.0](LICENSE) |
| Data (`step0/queries/` question packs, test results and reports) | [CC BY-NC-SA 4.0](LICENSE-DATA) |

The data is free forever for personal and non-commercial use; for commercial use, contact the maintainers for a separate license. The source code of the skills under test is not in this repository; the runner fetches it from each upstream repository at run time, and copyright stays with the original authors.

## Contributing

Issues and appeals are open to everyone. Pull requests need a signed Contributor License Agreement; see
[CONTRIBUTING.md](CONTRIBUTING.md).
