# Codex activation probe: 18 skills, each run once with and once without the skill

**Status: final.** This batch lists facts from single runs and rates no skill; there is nothing to grade.
Layer 0 (static) results do not depend on the host and are referenced below.

## What this batch is and is not

- Codex's event stream has no skill item, so whether a skill was used cannot be read from it.
  This batch therefore reports **no trigger measurement and no verdict** for Codex.
- For each skill the same request was run twice in an empty workspace: once with the skill
  installed at `.agents/skills/<skill>` and once with nothing installed. The tables below show the
  first action and the files each side produced.
- Each side was run **once**. The model is not deterministic, so a difference between the two sides of
  a pair can be nothing but run-to-run randomness; so can the absence of one. No pair here is
  evidence that a skill changed the behavior.

## Method (fixed, reproducible)

- Request per skill: the first query with `should_trigger: true` in `step0/queries/<skill>/clause-1.json`.
- Skill source: the commit pinned in `step0/skills.json`, shallow-fetched into `step0/.cache/` (not committed).
  Only the skill itself is installed; sibling skills in a family are not (so lark-doc runs without lark-drive/lark-shared).
- `codex exec --json --ignore-user-config --approve-for-me`, fresh temporary directory per run, `--skip-git-repo-check`.
- Codex: codex-cli 0.159.2; model: gpt-6-luna; reasoning effort: medium; timeout 300s per run.
- A run counts as complete if the turn completed with no error. First action = first command, tool call or file change;
  created files = filesystem diff of the workspace (excluding `.agents`).
- Records were edited in two ways before publishing: command output longer than 8,000 characters is cut with a marker (one agent listed the whole OS temp folder), and the local user name is replaced by `<user>`.
- Regenerate the tables: `node scripts/codex-probe-batch.mjs --report --out step0/data/2026-10-28_codex_probe`.

## Runs

- Runs recorded: 36 of 36; complete: 36; failed: 0.
- Pairs with both sides complete: 18.
- One run (agent-browser, skill installed) did not return within its timeout: the agent started a browser daemon that kept the output pipe open, and the batch script had no way to give up. That run was stopped by hand and repeated once; only the repeat is in `probe.jsonl`. The script now gives up on its own.

## Facts across complete pairs

- First action of the same kind (command / file change / ...) on both sides: 15 of 18.
- Identical set of created file names on both sides: 16 of 18 (15 of those created no file on either side).
- Skill-installed side ran at least one command whose text mentions `SKILL.md` or the skills directory: 16 of 18.

Command strings from two runs of the same request are never identical, so the kind of the first action is
the only comparison made automatically; everything else is shown for the reader to judge.

## Per skill

| skill | request | first action, skill installed | first action, none installed | files, skill installed | files, none installed | skill files mentioned in commands |
|---|---|---|---|---|---|---|
| find-skills | q01: how do I set up automated e2e tests for my Next.js app? feels like someone must… | command_execution: pwsh: "Get-Location; rg --files -g 'AGENTS.md' -g 'package.json' -g '… | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | (none) | (none) | 2 |
| tdd | q01: I need to add a coupon code feature to the cart. Let's do it test-first, write … | command_execution: pwsh: 'Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name' | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | (none) | (none) | 2 |
| diagnosing-bugs | q01: diagnose why the nightly export job keeps producing duplicate rows | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: "Get-Location; Get-Command pwsh -ErrorAction SilentlyContinue \|… | (none) | (none) | 0 |
| prototype | q01: I've got an order lifecycle (pending → paid → shipped → refunded) in orders/sta… | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | orders-state-prototype.html | (none) | 2 |
| domain-modeling | q01: 我们代码里 'account' 到底指 Customer 还是 User？感觉大家用得很乱，帮我理一下该叫什么 | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | (none) | (none) | 2 |
| agent-browser | q01: open https://news.ycombinator.com and take a screenshot of the front page, save… | command_execution: pwsh: 'Get-Location; Get-Command pwsh -ErrorAction SilentlyContinue \|… | command_execution: pwsh: 'Get-Location; Get-Command pwsh \| Select-Object -ExpandProperty… | (none) | (none) | 2 |
| hyperframes | q01: 帮我做一个 30 秒的新品发布短片,用 HyperFrames,1920x1080,要有产品截图和背景音乐 | command_execution: pwsh: 'Get-Location; Get-ChildItem -Force \| Select-Object Mode,Length… | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Length… | (none) | (none) | 4 |
| frontend-design | q01: build me a landing page for a small-batch coffee roaster in Portland, I want it… | command_execution: pwsh: 'Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name,L… | index.html | index.html | 2 |
| webapp-testing | q01: 写个 playwright 脚本，打开 localhost:5173 点一下登录按钮，把用户名密码填进去提交 | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object -First 30 N… | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | login.py | login.mjs | 2 |
| mcp-builder | q01: I want to build an MCP server that wraps the Linear API so Claude can create an… | (no action) | (no action) | (none) | (none) | 0 |
| doc-coauthoring | q01: I need to write documentation for our internal deployment pipeline, can you hel… | command_execution: pwsh: "Get-Content -Raw -Encoding utf8 'C:\\Users\\<user>\\AppData\\L… | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Length… | (none) | (none) | 2 |
| xlsx | q01: open sales_2025.xlsx and add a column that computes profit margin = (revenue-co… | command_execution: pwsh: "Get-Content -Raw 'C:/Users/<user>/AppData/Local/Temp/sg-codex-… | mcp_tool_call: codex_apps:codex_document_control.list_document_sessions | (none) | (none) | 2 |
| skill-creator | q01: I want to make a skill that turns my meeting notes into action-item lists. can … | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: 'Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | (none) | (none) | 2 |
| vercel-react-best-practices | q01: 帮我写一个 Next.js 的商品列表页 app/products/page.tsx,带分页和筛选,用 server component | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | (none) | (none) | 2 |
| web-design-guidelines | q01: review my UI in src/components/Navbar.tsx | command_execution: pwsh: "Get-Content -Raw 'C:/Users/<user>/AppData/Local/Temp/sg-codex-… | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object -First 30 N… | (none) | (none) | 2 |
| deploy-to-vercel | q01: deploy my app to vercel please, it's the Next.js project in this folder | command_execution: pwsh: "Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | command_execution: pwsh: 'Get-Location; Get-ChildItem -Force \| Select-Object Mode,Length… | (none) | (none) | 2 |
| design-mobile-apps | q01: design a mobile app for tracking my daily water intake, I want like 5 screens w… | command_execution: pwsh: 'Get-Location; Get-ChildItem -Force \| Select-Object Mode,Name; … | mcp_tool_call: codex_apps:canva.create-design | (none) | (none) | 4 |
| lark-doc | q01: 帮我读一下这个飞书文档并总结要点 https://example.feishu.cn/docx/doxcnAbC123xyz | command_execution: pwsh: "Get-Content -Raw -Encoding UTF8 'C:\\Users\\<user>\\AppData\\L… | web_search:  | (none) | (none) | 4 |

Final messages, token counts and the unparsed event streams are in `probe.jsonl` and `raw/`.

## Layer 0 (static)

Static checks read the skill files only, so they do not depend on the host. See `static/SUMMARY.md`
in this directory (regenerated from the same pinned commits, no model calls).

## Limits

- One run per side per skill; no repetition, so run-to-run variation is not measured.
- One request per skill; the choice follows a fixed rule rather than being tuned to the skill.
- Empty workspace: requests that assume an existing project (a bug to diagnose, a repo to review) get no such context on either side.
- The workspace-write sandbox has no network, so requests that need one end differently from a normal session on both sides.
- Codex only: nothing here is comparable with the Claude Code results in `2026-10-28_all_haiku`.
