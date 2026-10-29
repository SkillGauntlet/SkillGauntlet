# Trigger test report 20261028-215214

- Host: Claude Code 2.1.303 (Claude Code); backend: anthropic; model: claude-haiku-5-5 (requested as haiku)
- Runs per query: 3; total trials: 91; runner v0.4.2; Windows 10 / Python 3.11.9
- Sampling: adaptive (should-not-trigger queries run once and go to the full count only if one triggered; should-trigger queries run one fewer and go to the full count only if their runs disagree). Rates are averages of per-query rates and CIs are sized by the number of queries, since repeat runs of one query are not independent
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (17, the background that can steal triggers): design, design-sync, dataviz, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring
- Installed alongside lark-doc (same-family companions, invoking one counts as stolen): lark-drive, lark-shared
- Tools offered to the model: (27) Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, Glob, Grep, ListAgents, Monitor, NotebookEdit, PowerShell, PushNotification, Read, RemoteTrigger, ReportFindings, ScheduleWakeup, SendMessage, Skill, Task, TaskStop, ToolSearch, WebFetch, WebSearch, Write
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| lark-doc | triggers fair | 75% (58%–87%) | 7% (1%–26%) | 5 | 0 | borderline, add runs; question sets disagree |

## Tool behaviour

`no tool` = on a should-trigger trial the model answered without calling any tool at all. That is a property of the model and the harness, not of the skill's description, so read this before blaming a description: on a non-Anthropic backend it is often what a low recall actually reflects.

| Skill | No tool call (should-trigger) | First tool across all trials |
|---|---|---|
| lark-doc | 2/67 (3%) | Skill 59, Bash 16, Glob 8, (no tool) 4, ToolSearch 3, PowerShell 1 |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| lark-doc | clause-1 | triggers fair | 92% (69%–98%) | 13% (3%–44%) | 33 / 14 |
| lark-doc | clause-2 | triggers fair | 58% (35%–78%) | 0% (0%–28%) | 34 / 10 |
| lark-doc | **spread** | | 33 points | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| lark-doc | 79% (57%–92%) | 69% (42%–87%) | 2% (0%–25%) | 17% (3%–56%) | 57 / 34 |  |
| **All skills** | 79% (57%–92%) | 69% (42%–87%) | 2% (0%–25%) | 17% (3%–56%) | 57 / 34 |  |

## Recall by trigger clause

Clauses are the situations the skill's description says it should be used in. Near-miss negatives are tagged with the clause they imitate.

| Skill | Clause | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|
| lark-doc | 插入或下载图片附件素材 | 71% (37%–91%) | 0% (0%–43%) | 17 / 5 |
| lark-doc | 操作思维笔记 | 58% (27%–84%) | 0% (0%–56%) | 17 / 3 |
| lark-doc | 用户提供文档 URL/token 时(含 doubao.com /docx/ /wiki/) | 100% (68%–100%) | 0% (0%–56%) | 16 / 3 |
| lark-doc | 读取/创建/编辑飞书文档内容 | 71% (37%–91%) | 15% (3%–47%) | 17 / 13 |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### lark-doc
- `clause-1/q11` [should trigger] hits 0/2: update my existing mind note and add a child node 'Risks' under the root
- `clause-1/q17` [should not trigger] hits 1/3: 帮我给这个文档加条评论,@张三 看一下 https://x.feishu.cn/docx/doxcnCm1
- `clause-1/q18` [should not trigger] hits 3/3: copy this feishu doc as a backup copy: https://x.feishu.cn/docx/doxcnBak1
- `clause-2/q01` [should trigger] hits 0/2: 帮我把飞书文档里「Q3 复盘」那一节读出来,总结成五条要点
- `clause-2/q04` [should trigger] hits 0/2: pls fix the typos in my lark docx meeting notes and add an action items section at the bottom
- `clause-2/q07` [should trigger] hits 0/2: 文档里那个 pdf 附件帮我下载下来,存到 D:\downloads
- `clause-2/q08` [should trigger] hits 0/2: can you preview the screenshot attached in the doc comments? want to see what it shows
- `clause-2/q10` [should trigger] hits 0/2: add a child node 'risk review' under the 'Launch' branch in my mindnote
- `clause-2/q12` [should trigger] hits 0/2: mindnote 里把 'backlog' 这个节点挪到 'Q4' 下面,再改个名叫 'Q4 backlog'
- Stolen by: {"lark-drive": 5}

