# Trigger test report 20261028-225156

- Host: Claude Code 2.1.303 (Claude Code); backend: anthropic; model: claude-haiku-5-5 (requested as haiku)
- Runs per query: 3; total trials: 148; runner v0.4.2; Windows 10 / Python 3.11.9
- Sampling: adaptive (should-not-trigger queries run once and go to the full count only if one triggered; should-trigger queries run one fewer and go to the full count only if their runs disagree). Rates are averages of per-query rates and CIs are sized by the number of queries, since repeat runs of one query are not independent
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (17, the background that can steal triggers): design, design-sync, dataviz, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring
- Installed alongside lark-doc (same-family companions, invoking one counts as stolen): lark-drive, lark-shared
- Tools offered to the model: (27) Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, Glob, Grep, ListAgents, Monitor, NotebookEdit, PowerShell, PushNotification, Read, RemoteTrigger, ReportFindings, ScheduleWakeup, SendMessage, Skill, Task, TaskStop, ToolSearch, WebFetch, WebSearch, Write
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| design-mobile-apps | triggers well | 89% (61%–98%) | 0% (0%–28%) | 0 | 0 | borderline, add runs; one question set only |
| diagnosing-bugs | triggers poorly | 14% (4%–42%) | 0% (0%–28%) | 0 | 0 | rarely triggers; borderline, add runs; one question set only |
| lark-doc | triggers fair | 62% (39%–82%) | 17% (4%–48%) | 3 | 0 | borderline, add runs; one question set only |
| prototype | triggers poorly | 33% (11%–66%) | 0% (0%–32%) | 0 | 0 | rarely triggers; borderline, add runs; one question set only |

## Tool behaviour

`no tool` = on a should-trigger trial the model answered without calling any tool at all. That is a property of the model and the harness, not of the skill's description, so read this before blaming a description: on a non-Anthropic backend it is often what a low recall actually reflects.

| Skill | No tool call (should-trigger) | First tool across all trials |
|---|---|---|
| design-mobile-apps | 0/26 (0%) | Skill 22, Bash 4, Glob 3, (no tool) 2, ToolSearch 2, Write 1, WebSearch 1, Read 1 |
| diagnosing-bugs | 0/25 (0%) | Glob 15, Bash 7, Grep 6, Skill 4, (no tool) 3 |
| lark-doc | 4/36 (11%) | Skill 30, Bash 10, Glob 5, (no tool) 4, WebFetch 1 |
| prototype | 0/19 (0%) | Bash 9, Skill 7, Glob 5, Read 2, Grep 2, Write 1, (no tool) 1 |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| design-mobile-apps | clause-3 | triggers well | 89% (61%–98%) | 0% (0%–28%) | 26 / 10 |
| design-mobile-apps | **spread** | | — | | |
| diagnosing-bugs | clause-3 | triggers poorly | 14% (4%–42%) | 0% (0%–28%) | 25 / 10 |
| diagnosing-bugs | **spread** | | — | | |
| lark-doc | clause-3 | triggers fair | 62% (39%–82%) | 17% (4%–48%) | 36 / 14 |
| lark-doc | **spread** | | — | | |
| prototype | clause-3 | triggers poorly | 33% (11%–66%) | 0% (0%–32%) | 19 / 8 |
| prototype | **spread** | | — | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| design-mobile-apps | 100% (61%–100%) | 78% (39%–95%) | 0% (0%–39%) | 0% (0%–49%) | 18 / 18 |  |
| diagnosing-bugs | 11% (2%–51%) | 17% (3%–56%) | 0% (0%–49%) | 0% (0%–39%) | 17 / 18 |  |
| lark-doc | 53% (26%–79%) | 78% (39%–95%) | 11% (2%–51%) | 25% (5%–70%) | 31 / 19 |  |
| prototype | 58% (20%–89%) | 8% (1%–57%) | 0% (0%–49%) | 0% (0%–49%) | 14 / 13 |  |
| **All skills** | 55% (37%–72%) | 48% (29%–68%) | 3% (0%–21%) | 6% (1%–26%) | 80 / 68 |  |

## Recall by trigger clause

Clauses are the situations the skill's description says it should be used in. Near-miss negatives are tagged with the clause they imitate.

| Skill | Clause | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|
| design-mobile-apps | Design mobile app screens with Sleek | 100% (51%–100%) | 0% (0%–49%) | 8 / 4 |
| design-mobile-apps | Edit Sleek projects | 67% (24%–92%) | 0% (0%–56%) | 10 / 3 |
| design-mobile-apps | Implement Sleek designs in React Native or HTML | 100% (51%–100%) | 0% (0%–56%) | 8 / 3 |
| diagnosing-bugs | User explicitly asks to diagnose or debug | 42% (11%–80%) | 0% (0%–56%) | 9 / 3 |
| diagnosing-bugs | User reports something broken, throwing, or failing | 0% (0%–49%) | 0% (0%–49%) | 8 / 4 |
| diagnosing-bugs | User reports something slow or a performance regression | 0% (0%–49%) | 0% (0%–56%) | 8 / 3 |
| lark-doc | 插入或下载图片附件素材 | 8% (1%–57%) | 0% (0%–56%) | 9 / 3 |
| lark-doc | 操作思维笔记 | 75% (30%–95%) | 0% (0%–66%) | 8 / 2 |
| lark-doc | 用户提供文档 URL/token 时(含 doubao.com /docx/ /wiki/) | 100% (51%–100%) | 67% (9%–98%) | 8 / 3 |
| lark-doc | 读取/创建/编辑飞书文档内容 | 67% (24%–92%) | 25% (5%–70%) | 11 / 6 |
| prototype | Explore what a UI should look like | 25% (5%–70%) | 0% (0%–49%) | 10 / 4 |
| prototype | Sanity-check a state model or logic | 42% (11%–80%) | 0% (0%–49%) | 9 / 4 |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### design-mobile-apps
- `clause-3/q06` [should trigger] hits 1/3: list my sleek projects and delete the old 'todo-test' one, its just junk from last week
- `clause-3/q07` [should trigger] hits 1/3: in my existing sleek project, the login screen button is too small and the header is cramped. can u tweak it and re-render

### diagnosing-bugs
- `clause-3/q03` [should trigger] hits 0/2: diagnose why the cart total differs between the web and mobile clients for the same items
- `clause-3/q04` [should trigger] hits 0/2: 帮我debug一下这个函数,parse_invoice() 返回的税额跟财务给的数对不上
- `clause-3/q05` [should trigger] hits 0/2: ugh the build is failing again, npm run build dies with 'Cannot find module ./locale/zh' after I pulled main
- `clause-3/q06` [should trigger] hits 0/2: 登录接口突然全部返回500了,日志里是 NullPointerException at AuthService.java:88,刚才还好好的
- `clause-3/q07` [should trigger] hits 0/2: my jest tests in utils/date.test.js started failing on CI but pass locally?? timezone stuff maybe
- `clause-3/q08` [should trigger] hits 0/2: 上传图片的按钮点了没反应,控制台报 Uncaught TypeError: Cannot read properties of undefined (reading 'files')
- `clause-3/q09` [should trigger] hits 0/2: the dashboard page takes like 15 seconds to load since last week's release, it used to be instant
- `clause-3/q10` [should trigger] hits 0/2: 我的 pandas 脚本 process_logs.py 以前跑一分钟,现在要跑二十多分钟,什么都没改啊
- `clause-3/q11` [should trigger] hits 0/2: memory keeps climbing and API p99 latency went from 200ms to 3s after we bumped express to v5
- `clause-3/q12` [should trigger] hits 0/2: 这个 SQL 查询 users_report.sql 现在慢得要命,加了几万行数据之后就卡住了

### lark-doc
- `clause-3/q03` [should trigger] hits 1/3: 把我们飞书文档里第二段润色一下,语气正式点,顺便补一个风险提示小节
- `clause-3/q05` [should trigger] hits 0/2: 把本地的 arch-diagram.png 插到飞书文档最后面
- `clause-3/q06` [should trigger] hits 0/2: download all the images and attachments from that Lark doc to ./assets
- `clause-3/q07` [should trigger] hits 0/2: 文档里那张截图我想先预览一下,看看是不是旧版界面的图
- `clause-3/q08` [should trigger] hits 1/3: 把飞书文档的封面图换成 banner_v2.jpg,旧的那个删掉也行
- `clause-3/q12` [should trigger] hits 0/2: mindnote里把'Design'那个分支挪到'Engineering'下面,然后改个名叫 'Design Ops'
- `clause-3/q18` [should not trigger] hits 3/3: make a copy of our Lark design doc and save it as 'Design v2 (draft)'
- `clause-3/q26` [should not trigger] hits 2/3: 这个妙搭应用链接 https://xxx.feishu.cn/page/abc123 帮我看下页面里有什么
- Stolen by: {"lark-drive": 2, "lark-shared": 1}

### prototype
- `clause-3/q02` [should trigger] hits 0/2: not sure my seat-reservation hold/expire/confirm flow in booking/reservation.ts actually makes sense. can you whip up something my PM can click through to poke at the weird cases before i commit to it
- `clause-3/q04` [should trigger] hits 0/2: quick proto of the retry/backoff + circuit breaker states in src/net/breaker.py? i wanna see if the transitions feel right b4 i wire it up, throwaway is fine
- `clause-3/q05` [should trigger] hits 0/2: 我们的设置页现在太丑了,先别动正式代码,帮我做几个完全不同风格的版本,我想对比着看看长什么样比较好
- `clause-3/q06` [should trigger] hits 0/2: not sure how the dashboard in app/dashboard/page.tsx should be laid out. can u mock up like 3-4 totally different takes i can flip between?
- `clause-3/q08` [should trigger] hits 1/3: i need to figure out what the onboarding flow should look like, wizard vs single page vs checklist. throw together some options in the real app so i can eyeball them

