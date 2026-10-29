# Contributing

Thanks for your interest. Issues are open to everyone. Pull requests are welcome too, with one condition: **every pull request needs a signed [Contributor License Agreement](CLA.md) before it can be merged.**

## Contributor License Agreement

The code is under [Apache-2.0](LICENSE). Test results, question sets and reports are data, published under [CC BY-NC-SA 4.0](LICENSE-DATA), while a commercial license for that data stays possible. Data that came in under NC-SA alone could never be relicensed later, so contributors grant the maintainer, He Yifeng, the right to license their contributions under other terms as well. You keep the copyright in what you write; the CLA is a license, not an assignment.

[CLA.md](CLA.md) is the Harmony Individual Contributor License Agreement, version 1.0, filled in for this project. It has not been reviewed by a lawyer.

How to agree:

1. Read [CLA.md](CLA.md).
2. Open a pull request. The CLA Assistant bot comments on it with a link.
3. Follow the link, sign in with GitHub and click to agree. The check on the pull request turns green.

You only agree once. Questions or results you send in an Issue (for example with an appeal) are covered by the same agreement: the Issue form asks you to confirm that.

If your employer may own rights in your work, open an Issue before contributing; an individual agreement is not enough in that case.

## Submitting results

The leaderboard needs runs from many people, hosts and models. If you can run a test, you can contribute it: see "Submit your results" in the [README](README.md) for the commands. This section is the reference.

**What a submission is.** A directory `submissions/<skill>/<host>-<model>/<timestamp>-<your-github-login>/` holding four files written by the CLI: `meta.json` (run conditions plus the skill's repository, pinned commit and SKILL.md sha256, host and model versions, the question pack id and hash, the runner version and an environment fingerprint), `raw.jsonl` (one line per trial), `summary.json` and `queries.json` (the questions used). The format is [`schemas/submission-1.json`](schemas/submission-1.json). Open the pull request as yourself, from your own fork: it is your contribution, and a merged pull request counts in your GitHub record.

**Scrubbing.** Run records can hold what the host printed: your home path, login name, machine name, environment values, and sometimes a key echoed in an error. `skillgauntlet submit` replaces local paths, your login name, your machine name and values of environment variables whose names look like keys or tokens, redacts text shaped like a key or token, and then scans the result again with a wider net. If anything secret-looking remains, it refuses to package. The question text is never edited (its hash is part of the submission), so a secret or a path of yours inside a question also stops the submission. Always read the preview: scrubbing is best effort, and what you submit is public and permanent. If something private got through, open an Issue (do not paste it there) and we will remove it.

**What CI checks.** On a pull request that touches `submissions/`, a read-only workflow with no secrets and no model calls checks that:

- the pull request only adds files under `submissions/`, with the right layout, and the folder name carries the account that opened the pull request;
- the four files match the schema, and `meta.json`, `queries.json`, `raw.jsonl` and `summary.json` agree with each other (every trial belongs to the question pack; the question pack matches its hash);
- SKILL.md, fetched from the skill's repository at the pinned commit, has the sha256 the submission states, taken over the text with LF line endings so a Windows checkout and the repository agree (so a result cannot be filed under a different skill version);
- the summary numbers (trials, recall, false-positive rate, intervals, per-question counts) recompute exactly from `raw.jsonl`;
- no secret-shaped text and no local path is present.

It then comments on the pull request with a pass, or with exactly what is missing.

**Automatic merge.** A pull request that passes is merged without a maintainer, as a squash merge by a bot (`automerge` workflow). That workflow never trusts the result of the check above, because a fork runs its own copy of it. It never checks out or runs anything from the pull request: it downloads the four files through the GitHub API as data and re-runs the validator from `main`. It merges only if all of these hold: the pull request adds exactly one new `submissions/<skill>/<host>-<model>/<timestamp>-<login>/` folder with exactly the four files (no modified or extra files, no symlinks, nothing outside that folder), each file is at most 4 MB and the four together at most 10 MB, the full validation passes, `license/cla` is green, the account is at least 30 days old and none of its submissions was refused in the last 24 hours (maintainers are exempt from these two), the account has fewer than 5 auto-merged submissions in the last 24 hours, and the pull request's head commit is still the one that was checked (GitHub rejects the merge otherwise). If any of this fails, the bot comments with the reasons and adds the `needs-review` label; a maintainer decides by hand. If you pushed a fix, the check runs again on the new commit. The first pull request from a new account still waits for a maintainer to approve the workflow run. The check script always runs from the default branch, never from your pull request. The first pull request from a new account may wait for a maintainer to click "Approve and run": GitHub requires that for first-time fork contributors, and it happens once per person.

**How confirmation works.** Merging does not grade anything; it only says the file is well-formed and the skill pin is real. A merged submission is a **community single sample**. A skill-version / host / model combination becomes **confirmed** when two submissions from different GitHub accounts land on the same grade, or when a maintainer run and one community submission do. If submissions disagree, all of them stay on the leaderboard, side by side, tagged conflicting. The leaderboard page (https://skillgauntlet.github.io/SkillGauntlet/) is rebuilt from the data on `main` by the `pages` workflow after every merge; its header says what each tag means. Maintainers may re-run a cell with private questions as a spot check, outside this repository.

**What this cannot do.** The runner cannot prevent forgery. Nothing in a submission proves the trials were really run, the environment fingerprint is self-reported and used only for grouping, and "independent" means different accounts, not different people. CI verifies format, hashes and arithmetic. The tags say how many submissions agree, nothing more. Results are automated and graded by program; nobody reviews grades by hand, and if you think one is wrong you appeal (below). Submissions are not edited after merge; to have one removed or corrected, open a "Submission problem" Issue.

The data you submit is published under CC BY-NC-SA 4.0, and the CLA above applies to it. `.github/PULL_REQUEST_TEMPLATE/submission.md` is the template for opening one by hand.

## Work you do not own

Only submit material you wrote yourself or have the right to submit. If a contribution contains material you do not own, say so in the pull request or Issue: name the material, where it comes from and its license. Do not include the text of third-party skills; links, commit hashes and your own questions are fine. Never include API keys or tokens in run records.

## Issues

- report runner bugs, or platforms where it fails to run;
- point out mislabeled queries in the question packs (should trigger / should not trigger);
- suggest skills worth testing next;
- if you are a skill author and disagree with a result, open an appeal (see below).

Each of these has an Issue template that asks for the details we need.

## Appeals

Results are automated and nobody reviews grades by hand, so appeals are how mistakes get fixed. An appeal can do two things:

- **Point at questions we got wrong.** Name the question ids and quote the part of the skill's description that shows the label is wrong. Questions are judged against the description as written. A question shown to be mislabeled is removed, the grade is recounted, and the change is recorded in the batch report.
- **Send your own questions, and your own run if you have one.** Attach a question set in the format of `step0/queries/<skill>/clause-1.json`, and optionally the run directory the CLI wrote (`.skillgauntlet/runs/<timestamp>/`). We run your questions ourselves under the batch's conditions before publishing a number, and show the result next to the independent sets as an "author-supplied set". It does not replace them: questions chosen by the skill's author measure a different thing from questions drafted independently from the description. A run you made yourself is shown as reported by you, not reproduced, because we cannot check how it was made.

Either way, the appeal and its outcome stay public. To report a security problem, do not open an Issue; follow [SECURITY.md](SECURITY.md).
