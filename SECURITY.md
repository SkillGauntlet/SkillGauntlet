# Security

SkillGauntlet runs code you did not write. Read this before running a test, and before you report a problem.

## What the runner executes

A trigger test (layer 1) starts a real agent CLI (`claude` or `codex`) with a third-party skill installed and sends it a model-written request. Two things you do not control are therefore in play:

- **The skill.** Its `SKILL.md` and every file in its directory are third-party content, fetched from the upstream repository at the pinned commit. The skill text is also shown to a model when question sets are drafted, so a hostile skill can try to steer the drafting.
- **The model.** The agent decides what to do with the request. A model can produce shell commands, and a hostile skill can try to make it produce harmful ones.

The static layer (layer 0) never runs the skill. It reads files and makes no model calls.

## What we do to contain it

These are the measures in the code today (`lib/trial.js`, `lib/codex.js`, `lib/gain.js`, `step0/trigger_test.py`).

- **A fresh, empty directory per trial.** Each trial runs in a new temporary directory that holds only the skill under test (and, for a gain task, that task's fixture files). The directory is deleted afterwards.
- **Anything that needs approval is refused.** Claude Code trials run with `--permission-mode dontAsk`, so a tool call that would normally ask for permission is denied rather than executed. Your user-level settings and permission allowlist are ignored (`--setting-sources project`), and no MCP servers are loaded (`--strict-mcp-config`).
- **The first decision ends the trial.** For the trigger test, the process is killed as soon as the model's first tool decision shows it: the skill was invoked, another skill was invoked, or another tool was chosen. The skill's own instructions are never followed through. The default budget allows no tool calls before that decision. The optional robustness check allows up to a few read-only calls (`Read`, `Glob`, `Grep`, `LS`), limited to the trial directory.
- **A timeout on every trial**, enforced by killing the whole process tree.
- **Codex runs in its own sandbox.** Codex trials use `--sandbox read-only` or `--approve-for-me` (workspace-write). We never use the flag that bypasses the sandbox.
- **Drafting has no tools.** The call that writes question sets runs with `--tools ''`, so the model can read the skill text but cannot act on it.

## What we do not do

Be clear-eyed about these.

- **No operating-system sandbox of our own for Claude Code.** The empty directory is a working directory, not a jail. The agent still runs as you, with your user permissions, and can name any path on your disk. What stops it is the permission mode above, not isolation. A flaw in the agent's permission handling would not be caught by us.
- **Your environment is passed through.** Trials inherit your environment variables, including any API keys you have set, because the agent needs them to authenticate. A skill that gets the agent to run a command could see them. Do not run tests with credentials you would not hand to the skill's author.
- **No network isolation.** Nothing blocks outbound traffic from a command the agent is allowed to run.
- **Layer 2 (gain) lets the agent do the task.** It exists to measure whether the skill helps, so the agent works on a fixture task with the skill installed. The same permission mode applies, but this layer exercises more of the agent than the trigger test does. After the run, a contract may execute a shell command from this repository's `contracts/` files against the resulting directory. Those commands are written by us, not by skill authors, but they run on files the model produced.
- **No review of the skills we test.** Layer 0 reports facts such as shipped code, network calls and instruction-hijacking phrases. It is a signal, not a guarantee that a skill is safe, and not finding something is not proof it is absent.
- **Fetching is git clone at the pinned ref.** We do not verify signatures on upstream repositories.

If this does not fit your risk tolerance, run the static layer only, or run the whole thing in a disposable virtual machine or container with throwaway credentials.

## Reporting a vulnerability

Please report privately and do not open a public issue.

Use GitHub's private vulnerability reporting for this repository: **Security** tab → **Report a vulnerability** (https://github.com/SkillGauntlet/SkillGauntlet/security/advisories/new). This is the only private channel; there is no email address.

Useful things to include:

- the version or commit, the host and the operating system;
- how a skill or a model output can make the runner do something outside the containment described above;
- steps to reproduce, with a minimal skill if one is needed.

What to expect: this is a small project maintained by one person, so there is no response-time guarantee and no bounty. We will read every report, tell you whether we consider it in scope, and credit you in the fix unless you prefer not to be named.

In scope: bypassing the measures listed under "What we do to contain it", leaking credentials or local files through the runner or its archives, and code execution from a crafted skill, question set or archive file.

Out of scope: the items under "What we do not do" as stated, vulnerabilities in a tested skill itself (report those to its authors), and vulnerabilities in `claude`, `codex` or Node. Not sure which side yours falls on? Report it anyway.

## Reporting something that is not a vulnerability

A wrong test result is not a security issue. See [CONTRIBUTING.md](CONTRIBUTING.md): open an Issue with the appeal template.
