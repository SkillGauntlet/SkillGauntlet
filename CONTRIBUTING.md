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
