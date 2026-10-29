# Question pack review log (2026-10-26)

> **Historical.** On 2026-10-27 per-pack review was retired in favour of two or more independently drafted, clause-grouped question sets per skill, with the spread between sets reported (see `../experiments/qset-tdd/EXPERIMENT.md` and `../README.md`). The single packs in this folder are kept as the `legacy` set; the "Set them to `true`" instruction below no longer applies, and the runner ignores `reviewed`.

The question packs for the 18 skills were drafted with `draft` and then revised by hand under the rules below. Every revision is recorded in the `note` field of the affected query, with one of these prefixes:

| Prefix | Meaning |
|---|---|
| `[review: flipped to positive]` | Was labeled negative, but the skill's description covers it |
| `[review: replaced, near-miss negative]` | The original negative was too far from the skill; replaced with a near miss from the same domain |
| `[review: added, near-miss negative]` | Added to restore the positive/negative balance |
| `[review: rewritten]` | The original copied the description; rewritten as a natural request |
| `[review: confirmed, sibling skill]` | The skill's own description assigns this job to a sibling skill |
| `[kept: borderline]` | Ambiguous; original label kept, interpret the result separately |
| `[kept: copies trigger phrase]` | Matches a trigger phrase in the description, but real users ask this way; kept as a control |

All packs are still `reviewed: false`. Set them to `true` after checking them, or run with `--allow-unreviewed` and the report will flag them as "question pack not reviewed".

## Review rules

- Whether a query should trigger is judged by the **literal text of the skill's description**, not by what the skill was "meant" for. High false-positive rates caused by broad descriptions are themselves a finding worth reporting (e.g. vercel-react-best-practices says it triggers when "writing, reviewing, or refactoring React/Next.js code").
- Negatives must be **near misses**: a different job in the same domain, a sibling skill's job, or something phrased like a trigger phrase that should not trigger. Unrelated general coding tasks cannot reveal false positives.

## Revisions made

**Flipped to positive (5 queries, with new negatives added to keep the balance)**
- domain-modeling q14: the description explicitly mentions editing GLOSSARY.md. Added q21.
- webapp-testing q19: tests a local app's signup flow, just without naming Playwright. Added q21.
- vercel-react-best-practices q11, q15, q16: literal reading of the description. Added q21–q23 (Svelte, Express backend performance, Angular).

**Negatives rewritten**
- find-skills: all 10 negatives rewritten. The description triggers on "how do I do X" and "can you do X" phrasing, so the new negatives mostly use that phrasing for trivial tasks, plus near misses such as skill-creator's jobs and installing npm packages.
- agent-browser: q13, q14, q15 and q20 replaced with browser- or Electron-related tasks that need no browser automation.
- deploy-to-vercel: q12, q14, q19 and q20 replaced with deploy-related tasks that do not deploy (config questions, reading logs, project settings, "don't deploy yet").
- diagnosing-bugs: q18 and q20 replaced with a refactor of the same code area and a "looks like a bug, but nothing is broken" question.

**Positive rewritten because it copied the description**: web-design-guidelines q10.

**Settled by the skill's own description**: lark-doc q15 (replying to a comment) and q18 (copying a document). The description routes both to lark-drive, so they are confirmed negatives.

## Borderline items kept (interpret results separately)

| Skill | Query | Reason |
|---|---|---|
| agent-browser | q16 | Writes a Playwright spec without running it; the description includes "testing web apps" |
| deploy-to-vercel | q11, q15 | Editing vercel.json, migrating Netlify rules: configuration, not deployment |
| diagnosing-bugs | q17 | Profiling cold start; not a regression and no fix requested |
| doc-coauthoring | q19 | Reviewing rather than co-authoring |
| hyperframes | q11, q17 | Sibling skills' jobs, but this skill's description says "Read first to … any video" |
| web-design-guidelines | q11 | Fixing contrast directly rather than reviewing |
| design-mobile-apps | q16 | Figma rather than Sleek |
| vercel-react-best-practices | q13, q18 | Build-config migration and debugging a 500, not writing code |

## A systematic bias to know before running

The runner installs only the skill under test; **sibling skills are absent**. Negatives of the "this belongs to a sibling skill" kind (lark-doc q15 and q18, hyperframes q11 and q17, find-skills q13 and q15) are therefore more likely to be falsely triggered, because the model has no better-fitting skill to choose. With the whole family installed, false positives would be lower. Read these results separately and state the caveat when publishing. Once a standard background skill set is defined, the sibling skills should be added to it.
