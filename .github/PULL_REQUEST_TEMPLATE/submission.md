<!--
Use this template for a community submission. `npx skillgauntlet submit <run-dir>` fills the same
facts in for you; this version is for opening the pull request by hand.
A submission pull request may only ADD files under submissions/<skill>/<host>-<model>/<timestamp>-<your-github-login>/
(meta.json, raw.jsonl, summary.json, queries.json). Anything else fails the check.
-->

## Submission

- Skill (repo @ commit):
- Host and model:
- Run directory I submitted (the one the CLI printed):

## Before you open this

- [ ] I made the package with `skillgauntlet submit` (or ran `skillgauntlet submit <run-dir> --dry-run` and copied its output), so local paths and keys were scrubbed.
- [ ] I read the four files and found nothing I do not want to be public. This pull request and its files stay public.
- [ ] The skill commit above is pushed to a public repository, and SKILL.md has not changed since the run.
- [ ] I did not edit any file by hand after it was generated.

## I understand

- [ ] The runner cannot prove the trials were really run, and nobody claims it can. A merged submission starts as a "community single sample".
- [ ] The data is published under CC BY-NC-SA 4.0, and I will sign the CLA (CLA Assistant bot) on this pull request.
