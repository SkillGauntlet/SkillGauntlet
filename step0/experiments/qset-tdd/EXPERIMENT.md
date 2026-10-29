# Experiment: how much does the question set matter? (tdd, 2026-10-27)

## Question

Trigger results depend on which queries are asked. If independently AI-drafted question sets give very different recall for the same skill, single-set results are unreliable and something has to control the question set (human review, or a more structured drafting method). This experiment measures that spread for one skill.

## Setup

| | Value |
|---|---|
| Skill | `tdd`, mattpocock/skills @ `5beb35b` |
| Description | "Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests." |
| Host / model | Claude Code 2.1.303 / claude-haiku-5-5 |
| Verdict rule | skill-creator first-decision rule (headline rule, `--max-explore 0`) |
| Trials | 3 per query |

Three question sets, each drafted independently by AI and **none human-reviewed**:

| Set | How it was drafted | Queries (pos / neg) | Runs |
|---|---|---|---|
| A | `draft`, free-form (CLI default model), then light review fixes on other packs only | 10 / 10 | 2 runs (`data/2026-10-27_tdd_haiku`, headline runs) |
| B | `draft`, free-form, Sonnet | 10 / 10 | 1 run (`run-B-free`) |
| C | `draft --by-clause --per-clause 3`, Sonnet: 3 positives for each of the 4 trigger clauses, 10 near-miss negatives tagged by clause | 12 / 10 | 1 run (`run-C-clause`) |

The sets differ a lot in composition. For example, 8 of B's 10 positives say "TDD", "test-first" or "red-green-refactor" explicitly, against 4 of A's 10.

## Results

**Overall recall is nearly the same across all three sets.**

| Set | Recall | False positives | Grade |
|---|---|---|---|
| A (2 runs) | 25/60 = 42% | 0/60 | triggers poorly |
| B | 13/30 = 43% | 0/30 | triggers poorly |
| C | 14/36 = 39% | 0/30 | triggers poorly |

**Recall by trigger clause.** Set C is tagged by the drafting model; A and B were tagged by hand against the four clauses in the description.

| Clause | A | B | C | All sets |
|---|---|---|---|---|
| Build features test-first | 18/18 | 7/12 | 6/9 | 31/39 (79%) |
| Mentions red-green-refactor | 6/6 | 3/3 | 8/9 | 17/18 (94%) |
| Fix bugs test-first | 1/18 | 3/6 | 0/9 | 4/33 (12%) |
| Wants integration tests | 0/18 | 0/6 | 0/9 | **0/33 (0%)** |
| (B q09: rewrite existing unit tests "the TDD way"; fits no clause) | — | 0/3 | — | 0/3 |

## Findings

1. **Set-to-set spread was small for this skill.** Three independently drafted, unreviewed sets gave 39–43% recall and the same grade. The prediction that composition would swing the grade (e.g. B near 80% because it says "TDD" more often) was wrong: saying "TDD" is not what drives triggering. The task type is.
2. **The clause-level pattern is consistent across sets.** Building a new feature test-first, or naming red-green-refactor, triggers the skill reliably. Fixing a bug test-first rarely does, even when the request says "TDD style" or "red first" (C q05, q06: 0/6). Asking for integration tests never did: 0 of 33 trials across all three sets, although the description lists it as a trigger.
3. **Per-clause results are more useful than one number.** "42% recall" hides that two of the four promised situations essentially never trigger. A per-clause breakdown tells the skill author which part of the description is not working.
4. **No false positives in any set** (0/120 negative trials).

## Implications for the method

- For this skill, human review of the question set would not have changed the conclusion. That is evidence (one skill, one model) for replacing per-pack human review with: clause-grouped drafting, two or more independently drafted sets per skill, and reporting the spread between sets.
- Adopt `draft --by-clause` as the default drafting mode and report recall per clause.
- Still needed before generalising: repeat on skills with broad or vague descriptions (e.g. find-skills, frontend-design), where the clause list itself is less clear and set-to-set spread may be larger.

## Caveats

- One skill, one model (Haiku), three sets, one or two runs each. Per-clause cells have only 6–18 trials, so their confidence intervals are wide; the pooled "All sets" column is the most reliable.
- Clause tags for A and B were assigned by hand after the runs.
- B and C were drafted by Sonnet, A by the CLI default model; the drafter may matter.
