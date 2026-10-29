# Trigger test report 20261028-163738

- Host: Claude Code 2.1.303 (Claude Code); backend: anthropic; model: claude-haiku-5-5 (requested as haiku)
- Runs per query: 3; total trials: 1656; runner v0.4.1; Windows 10 / Python 3.11.9
- Sampling: adaptive (should-not-trigger queries run once and go to the full count only if one triggered; should-trigger queries run one fewer and go to the full count only if their runs disagree). Rates are averages of per-query rates and CIs are sized by the number of queries, since repeat runs of one query are not independent
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (17, the background that can steal triggers): design, design-sync, dataviz, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring
- Tools offered to the model: (27) Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, Glob, Grep, ListAgents, Monitor, NotebookEdit, PowerShell, PushNotification, Read, RemoteTrigger, ReportFindings, ScheduleWakeup, SendMessage, Skill, Task, TaskStop, ToolSearch, WebFetch, WebSearch, Write
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| agent-browser | triggers fair | 74% (60%–84%) | 0% (0%–16%) | 1 | 0 | borderline, add runs |
| deploy-to-vercel | triggers fair | 72% (55%–84%) | 0% (0%–16%) | 0 | 0 | borderline, add runs |
| design-mobile-apps | triggers well | 83% (64%–93%) | 0% (0%–16%) | 0 | 0 | borderline, add runs; question sets disagree |
| diagnosing-bugs | triggers poorly | 20% (9%–39%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs; question sets disagree |
| doc-coauthoring | triggers poorly | 12% (6%–26%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| domain-modeling | triggers poorly | 36% (20%–56%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| find-skills | triggers poorly | 20% (10%–36%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs; 57% of should-trigger trials called no tool at all (model or harness, not the description) |
| frontend-design | triggers poorly | 12% (6%–26%) | 0% (0%–16%) | 2 | 0 | rarely triggers; borderline, add runs |
| hyperframes | triggers fair | 68% (53%–81%) | 0% (0%–16%) | 1 | 0 | borderline, add runs |
| lark-doc | triggers fair | 73% (56%–85%) | 20% (8%–42%) | 0 | 0 | borderline, add runs; question sets disagree |
| mcp-builder | triggers fair | 54% (35%–72%) | 0% (0%–16%) | 1 | 0 | borderline, add runs |
| prototype | triggers fair | 52% (30%–74%) | 0% (0%–18%) | 0 | 0 | borderline, add runs; question sets disagree |
| skill-creator | triggers poorly | 16% (8%–30%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| tdd | triggers poorly | 33% (20%–51%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| vercel-react-best-practices | triggers poorly | 3% (1%–14%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| web-design-guidelines | triggers poorly | 32% (20%–48%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| webapp-testing | triggers poorly | 17% (8%–31%) | 0% (0%–16%) | 8 | 0 | rarely triggers; borderline, add runs |
| xlsx | triggers fair | 57% (41%–71%) | 0% (0%–16%) | 0 | 0 | borderline, add runs |

## Tool behaviour

`no tool` = on a should-trigger trial the model answered without calling any tool at all. That is a property of the model and the harness, not of the skill's description, so read this before blaming a description: on a non-Anthropic backend it is often what a low recall actually reflects.

| Skill | No tool call (should-trigger) | First tool across all trials |
|---|---|---|
| agent-browser | 6/105 (6%) | Skill 77, Bash 21, (no tool) 9, ToolSearch 7, Glob 7, Write 4 |
| deploy-to-vercel | 0/66 (0%) | Skill 47, Bash 35, Glob 3, PowerShell 1 |
| design-mobile-apps | 0/50 (0%) | Skill 41, Bash 12, Glob 6, ToolSearch 4, Write 3, (no tool) 3, Read 1 |
| diagnosing-bugs | 0/56 (0%) | Glob 23, Bash 20, Skill 13, Grep 10, (no tool) 7, Read 3 |
| doc-coauthoring | 27/84 (32%) | Glob 32, (no tool) 29, Bash 18, Skill 12, Read 7, Write 3, Grep 3 |
| domain-modeling | 0/51 (0%) | Grep 19, Skill 19, Glob 17, Bash 9, Read 5, (no tool) 2 |
| find-skills | 37/65 (57%) | (no tool) 43, Skill 13, Bash 11, Glob 5, ToolSearch 4, Read 3, WebSearch 2, Write 2, PowerShell 2 |
| frontend-design | 16/82 (20%) | Glob 29, Bash 27, (no tool) 21, Skill 13, Write 4, Read 4, Grep 4 |
| hyperframes | 2/86 (2%) | Skill 59, Bash 25, Glob 11, Read 4, (no tool) 2, PowerShell 2, ToolSearch 1, WebFetch 1, Write 1 |
| lark-doc | 3/67 (4%) | Skill 60, Bash 18, Glob 9, (no tool) 5, ToolSearch 3, PowerShell 1, Grep 1 |
| mcp-builder | 6/53 (11%) | Skill 29, Bash 22, (no tool) 10, Write 8, Glob 3, PowerShell 1 |
| prototype | 0/35 (0%) | Skill 18, Bash 16, Glob 10, Read 4, Grep 3, (no tool) 1, Write 1 |
| skill-creator | 4/82 (5%) | Glob 41, Bash 31, Skill 14, Read 7, (no tool) 5, Write 3, Grep 1 |
| tdd | 0/71 (0%) | Bash 33, Skill 25, Glob 19, Grep 7, Read 3, (no tool) 3, Write 1 |
| vercel-react-best-practices | 10/81 (12%) | Glob 45, Bash 29, (no tool) 16, Grep 4, Skill 3, Write 2, Read 2 |
| web-design-guidelines | 0/82 (0%) | Glob 41, Skill 27, Read 20, Bash 8, (no tool) 4, Grep 1, Write 1 |
| webapp-testing | 0/85 (0%) | Bash 49, Skill 24, Glob 20, Grep 4, (no tool) 4, Write 3, ToolSearch 1 |
| xlsx | 0/87 (0%) | Skill 49, Glob 29, Bash 19, PowerShell 5, (no tool) 3, Read 2 |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| agent-browser | clause-1 | triggers fair | 75% (55%–88%) | 0% (0%–28%) | 53 / 10 |
| agent-browser | clause-2 | triggers fair | 72% (52%–86%) | 0% (0%–28%) | 52 / 10 |
| agent-browser | **spread** | | 3 points | | |
| deploy-to-vercel | clause-1 | triggers fair | 75% (50%–90%) | 0% (0%–28%) | 34 / 10 |
| deploy-to-vercel | clause-2 | triggers fair | 69% (44%–86%) | 0% (0%–28%) | 32 / 10 |
| deploy-to-vercel | **spread** | | 6 points | | |
| design-mobile-apps | clause-1 | triggers fair | 75% (47%–91%) | 0% (0%–28%) | 26 / 10 |
| design-mobile-apps | clause-2 | triggers well | 92% (65%–98%) | 0% (0%–28%) | 24 / 10 |
| design-mobile-apps | **spread** | | 17 points | | |
| diagnosing-bugs | clause-1 | triggers poorly | 31% (13%–58%) | 0% (0%–28%) | 30 / 10 |
| diagnosing-bugs | clause-2 | triggers poorly | 8% (2%–35%) | 0% (0%–28%) | 26 / 10 |
| diagnosing-bugs | **spread** | | 22 points | | |
| doc-coauthoring | clause-1 | triggers poorly | 18% (7%–40%) | 0% (0%–28%) | 41 / 10 |
| doc-coauthoring | clause-2 | triggers poorly | 7% (1%–26%) | 0% (0%–28%) | 43 / 10 |
| doc-coauthoring | **spread** | | 12 points | | |
| domain-modeling | clause-1 | triggers poorly | 33% (14%–61%) | 0% (0%–28%) | 26 / 10 |
| domain-modeling | clause-2 | triggers poorly | 39% (17%–66%) | 0% (0%–28%) | 25 / 10 |
| domain-modeling | **spread** | | 6 points | | |
| find-skills | clause-1 | triggers poorly | 21% (8%–45%) | 0% (0%–28%) | 33 / 10 |
| find-skills | clause-2 | triggers poorly | 19% (7%–43%) | 0% (0%–28%) | 32 / 10 |
| find-skills | **spread** | | 2 points | | |
| frontend-design | clause-1 | triggers poorly | 10% (3%–30%) | 0% (0%–28%) | 40 / 10 |
| frontend-design | clause-2 | triggers poorly | 15% (5%–36%) | 0% (0%–28%) | 42 / 10 |
| frontend-design | **spread** | | 5 points | | |
| hyperframes | clause-1 | triggers fair | 67% (45%–83%) | 0% (0%–28%) | 42 / 10 |
| hyperframes | clause-2 | triggers fair | 70% (48%–86%) | 0% (0%–28%) | 44 / 10 |
| hyperframes | **spread** | | 3 points | | |
| lark-doc | clause-1 | triggers poorly | 88% (64%–96%) | 27% (9%–57%) | 34 / 16 |
| lark-doc | clause-2 | triggers fair | 58% (35%–78%) | 13% (3%–44%) | 33 / 14 |
| lark-doc | **spread** | | 29 points | | |
| mcp-builder | clause-1 | triggers fair | 56% (30%–79%) | 0% (0%–28%) | 26 / 10 |
| mcp-builder | clause-2 | triggers fair | 53% (28%–77%) | 0% (0%–28%) | 27 / 10 |
| mcp-builder | **spread** | | 3 points | | |
| prototype | clause-1 | triggers fair | 67% (34%–89%) | 0% (0%–30%) | 17 / 9 |
| prototype | clause-2 | triggers poorly | 38% (14%–69%) | 0% (0%–30%) | 18 / 9 |
| prototype | **spread** | | 29 points | | |
| skill-creator | clause-1 | triggers poorly | 18% (7%–40%) | 0% (0%–28%) | 41 / 10 |
| skill-creator | clause-2 | triggers poorly | 13% (4%–34%) | 0% (0%–28%) | 41 / 10 |
| skill-creator | **spread** | | 5 points | | |
| tdd | clause-1 | triggers poorly | 27% (12%–52%) | 0% (0%–28%) | 35 / 10 |
| tdd | clause-2 | triggers poorly | 40% (20%–63%) | 0% (0%–28%) | 36 / 10 |
| tdd | **spread** | | 12 points | | |
| vercel-react-best-practices | clause-1 | triggers poorly | 5% (1%–24%) | 0% (0%–28%) | 40 / 10 |
| vercel-react-best-practices | clause-2 | triggers poorly | 2% (0%–19%) | 0% (0%–28%) | 41 / 10 |
| vercel-react-best-practices | **spread** | | 3 points | | |
| web-design-guidelines | clause-1 | triggers poorly | 25% (11%–47%) | 0% (0%–28%) | 40 / 10 |
| web-design-guidelines | clause-2 | triggers poorly | 40% (22%–61%) | 0% (0%–28%) | 42 / 10 |
| web-design-guidelines | **spread** | | 15 points | | |
| webapp-testing | clause-1 | triggers poorly | 17% (6%–38%) | 0% (0%–28%) | 43 / 10 |
| webapp-testing | clause-2 | triggers poorly | 17% (6%–38%) | 0% (0%–28%) | 42 / 10 |
| webapp-testing | **spread** | | 0 points | | |
| xlsx | clause-1 | triggers fair | 55% (34%–74%) | 0% (0%–28%) | 42 / 10 |
| xlsx | clause-2 | triggers fair | 58% (37%–77%) | 0% (0%–28%) | 45 / 10 |
| xlsx | **spread** | | 3 points | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| agent-browser | 68% (48%–83%) | 79% (59%–90%) | 0% (0%–28%) | 0% (0%–28%) | 60 / 65 |  |
| deploy-to-vercel | 60% (37%–80%) | 83% (59%–94%) | 0% (0%–28%) | 0% (0%–28%) | 43 / 43 |  |
| design-mobile-apps | 83% (55%–95%) | 83% (55%–95%) | 0% (0%–30%) | 0% (0%–26%) | 33 / 37 |  |
| diagnosing-bugs | 14% (4%–42%) | 26% (10%–53%) | 0% (0%–30%) | 0% (0%–26%) | 35 / 41 |  |
| doc-coauthoring | 17% (6%–38%) | 8% (2%–28%) | 0% (0%–28%) | 0% (0%–28%) | 52 / 52 |  |
| domain-modeling | 49% (25%–73%) | 21% (7%–51%) | 0% (0%–26%) | 0% (0%–30%) | 38 / 33 |  |
| find-skills | 8% (2%–31%) | 31% (14%–56%) | 0% (0%–30%) | 0% (0%–26%) | 42 / 43 |  |
| frontend-design | 12% (4%–32%) | 13% (4%–34%) | 0% (0%–28%) | 0% (0%–28%) | 51 / 51 |  |
| hyperframes | 60% (39%–78%) | 77% (55%–90%) | 0% (0%–28%) | 0% (0%–28%) | 52 / 54 |  |
| lark-doc | 77% (55%–90%) | 67% (40%–86%) | 21% (8%–48%) | 17% (3%–56%) | 62 / 35 |  |
| mcp-builder | 64% (37%–84%) | 44% (21%–70%) | 0% (0%–26%) | 0% (0%–30%) | 37 / 36 |  |
| prototype | 42% (16%–73%) | 62% (31%–86%) | 0% (0%–35%) | 0% (0%–26%) | 24 / 29 |  |
| skill-creator | 10% (3%–30%) | 22% (9%–43%) | 0% (0%–28%) | 0% (0%–28%) | 50 / 52 |  |
| tdd | 33% (16%–58%) | 33% (16%–58%) | 0% (0%–32%) | 0% (0%–24%) | 46 / 45 |  |
| vercel-react-best-practices | 2% (0%–19%) | 5% (1%–24%) | 0% (0%–26%) | 0% (0%–30%) | 52 / 49 |  |
| web-design-guidelines | 10% (3%–30%) | 55% (34%–74%) | 0% (0%–32%) | 0% (0%–24%) | 50 / 52 | Chinese lower |
| webapp-testing | 7% (1%–26%) | 27% (12%–49%) | 0% (0%–26%) | 0% (0%–30%) | 53 / 52 |  |
| xlsx | 47% (27%–67%) | 67% (45%–83%) | 0% (0%–30%) | 0% (0%–26%) | 54 / 53 |  |
| **All skills** | 35% (30%–41%) | 44% (38%–50%) | 2% (1%–5%) | 1% (0%–3%) | 834 / 822 |  |

## Recall by trigger clause

Clauses are the situations the skill's description says it should be used in. Near-miss negatives are tagged with the clause they imitate.

| Skill | Clause | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|
| agent-browser | AWS Bedrock AgentCore cloud browsers | 88% (53%–98%) | 0% (0%–56%) | 19 / 3 |
| agent-browser | Electron desktop app automation | 83% (49%–96%) | 0% (0%–56%) | 17 / 3 |
| agent-browser | Exploratory testing, dogfooding, QA | 50% (22%–78%) | 0% (0%–49%) | 18 / 4 |
| agent-browser | General website interaction and web automation | 62% (31%–86%) | 0% (0%–43%) | 16 / 5 |
| agent-browser | Slack tasks (unreads, send, search) | 75% (41%–93%) | 0% (0%–56%) | 18 / 3 |
| agent-browser | Vercel Sandbox microVM browser automation | 83% (49%–96%) | 0% (0%–66%) | 17 / 2 |
| deploy-to-vercel | Create a preview deployment | 79% (45%–95%) | 0% (0%–43%) | 17 / 5 |
| deploy-to-vercel | Deploy and give me the link | 75% (41%–93%) | 0% (0%–49%) | 16 / 4 |
| deploy-to-vercel | Deploy my app/website to Vercel | 96% (62%–100%) | 0% (0%–35%) | 17 / 7 |
| deploy-to-vercel | Push this live | 38% (14%–69%) | 0% (0%–49%) | 16 / 4 |
| design-mobile-apps | Design mobile app screens with Sleek | 92% (57%–99%) | 0% (0%–35%) | 17 / 7 |
| design-mobile-apps | Edit Sleek projects | 75% (41%–93%) | 0% (0%–39%) | 16 / 6 |
| design-mobile-apps | Implement Sleek designs in React Native or HTML | 83% (49%–96%) | 0% (0%–35%) | 17 / 7 |
| diagnosing-bugs | User explicitly asks to diagnose or debug | 46% (19%–76%) | 0% (0%–39%) | 19 / 6 |
| diagnosing-bugs | User reports something broken, throwing, or failing | 4% (0%–35%) | 0% (0%–32%) | 19 / 8 |
| diagnosing-bugs | User reports something slow or a performance regression | 12% (2%–47%) | 0% (0%–39%) | 18 / 6 |
| doc-coauthoring | Trigger on mentions of writing docs/drafting specs/similar documentation tasks | 17% (4%–51%) | 0% (0%–56%) | 17 / 3 |
| doc-coauthoring | Write decision docs / similar structured content | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| doc-coauthoring | Write documentation | 12% (2%–47%) | 0% (0%–39%) | 16 / 6 |
| doc-coauthoring | Write proposals | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| doc-coauthoring | Write technical specs | 33% (11%–66%) | 0% (0%–49%) | 19 / 4 |
| domain-modeling | Discussing codebase terminology | 0% (0%–32%) | 0% (0%–35%) | 16 / 7 |
| domain-modeling | Recording or editing an ADR | 33% (11%–66%) | 0% (0%–35%) | 17 / 7 |
| domain-modeling | Writing or editing GLOSSARY.md | 75% (41%–93%) | 0% (0%–39%) | 18 / 6 |
| find-skills | Explicit find-a-skill request | 67% (34%–89%) | 0% (0%–43%) | 17 / 5 |
| find-skills | How-do-I-do-X question | 12% (2%–47%) | 0% (0%–39%) | 16 / 6 |
| find-skills | Interest in extending capabilities | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| find-skills | Looking for installable functionality/tools/templates | 0% (0%–32%) | 0% (0%–39%) | 16 / 6 |
| frontend-design | Aesthetic direction and visual identity choices | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| frontend-design | Avoiding templated/default-looking design choices | 12% (2%–47%) | 0% (0%–49%) | 18 / 4 |
| frontend-design | Building new UI with distinctive visual design | 50% (22%–78%) | 0% (0%–49%) | 16 / 4 |
| frontend-design | Reshaping/redesigning an existing UI | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| frontend-design | Typography selection and type treatment | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| hyperframes | Animate video content | 50% (22%–78%) | 0% (0%–49%) | 16 / 4 |
| hyperframes | Edit an existing video | 46% (19%–76%) | 0% (0%–56%) | 19 / 3 |
| hyperframes | Make a new video | 83% (49%–96%) | 0% (0%–49%) | 17 / 4 |
| hyperframes | Render video to file | 100% (68%–100%) | 0% (0%–49%) | 16 / 4 |
| hyperframes | Specific video kinds (launch film, explainer, music video, chart, vertical clip, title card, caption, overlay) | 62% (31%–86%) | 0% (0%–43%) | 18 / 5 |
| lark-doc | 插入或下载图片附件素材 | 75% (41%–93%) | 0% (0%–43%) | 16 / 5 |
| lark-doc | 操作思维笔记 | 54% (24%–81%) | 0% (0%–56%) | 17 / 3 |
| lark-doc | 用户提供文档 URL/token 时(含 doubao.com /docx/ /wiki/) | 100% (68%–100%) | 0% (0%–56%) | 16 / 3 |
| lark-doc | 读取/创建/编辑飞书文档内容 | 62% (31%–86%) | 44% (19%–73%) | 18 / 19 |
| mcp-builder | Build MCP server in Node/TypeScript with MCP SDK | 42% (16%–73%) | 0% (0%–39%) | 19 / 6 |
| mcp-builder | Build MCP server in Python with FastMCP | 42% (16%–73%) | 0% (0%–39%) | 17 / 6 |
| mcp-builder | Build MCP server to integrate external API/service | 79% (45%–95%) | 0% (0%–32%) | 17 / 8 |
| prototype | Explore what a UI should look like | 38% (14%–69%) | 0% (0%–32%) | 16 / 8 |
| prototype | Sanity-check a state model or logic | 67% (34%–89%) | 0% (0%–28%) | 19 / 10 |
| skill-creator | Benchmark with variance analysis | 38% (14%–69%) | 0% (0%–49%) | 16 / 4 |
| skill-creator | Create skill from scratch | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| skill-creator | Edit/improve existing skill | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| skill-creator | Optimize skill description for triggering | 21% (5%–55%) | 0% (0%–49%) | 17 / 4 |
| skill-creator | Run evals to test a skill | 21% (5%–55%) | 0% (0%–49%) | 17 / 4 |
| tdd | Build features test-first | 54% (24%–81%) | 0% (0%–39%) | 20 / 6 |
| tdd | Fix bugs test-first | 4% (0%–38%) | 0% (0%–49%) | 17 / 4 |
| tdd | Red-green-refactor mentioned | 75% (41%–93%) | 0% (0%–49%) | 18 / 4 |
| tdd | Wants integration tests | 0% (0%–32%) | 0% (0%–39%) | 16 / 6 |
| vercel-react-best-practices | Implementing data fetching (client or server) | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| vercel-react-best-practices | Optimizing bundle size or load times | 4% (0%–38%) | 0% (0%–49%) | 17 / 4 |
| vercel-react-best-practices | Refactoring existing React/Next.js code | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| vercel-react-best-practices | Reviewing code for performance issues | 12% (2%–47%) | 0% (0%–49%) | 16 / 4 |
| vercel-react-best-practices | Writing React components or Next.js pages | 0% (0%–32%) | 0% (0%–43%) | 16 / 5 |
| web-design-guidelines | Audit design | 25% (7%–59%) | 0% (0%–49%) | 16 / 4 |
| web-design-guidelines | Check accessibility | 25% (7%–59%) | 0% (0%–43%) | 16 / 5 |
| web-design-guidelines | Check site against best practices | 62% (31%–86%) | 0% (0%–49%) | 16 / 4 |
| web-design-guidelines | Review UX | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| web-design-guidelines | Review my UI | 50% (22%–78%) | 0% (0%–49%) | 18 / 4 |
| webapp-testing | Capturing browser screenshots | 12% (2%–47%) | 0% (0%–49%) | 18 / 4 |
| webapp-testing | Debugging UI behavior | 8% (1%–43%) | 0% (0%–49%) | 17 / 4 |
| webapp-testing | Interacting with local web apps via Playwright | 25% (7%–59%) | 0% (0%–49%) | 16 / 4 |
| webapp-testing | Verifying frontend functionality | 12% (2%–47%) | 0% (0%–49%) | 18 / 4 |
| webapp-testing | Viewing browser logs | 25% (7%–59%) | 0% (0%–49%) | 16 / 4 |
| xlsx | Clean/restructure messy tabular data into spreadsheet | 67% (34%–89%) | 0% (0%–49%) | 17 / 4 |
| xlsx | Convert between tabular file formats | 25% (7%–59%) | 0% (0%–49%) | 18 / 4 |
| xlsx | Create new spreadsheet from scratch or data sources | 62% (31%–86%) | 0% (0%–49%) | 16 / 4 |
| xlsx | Open/edit/fix existing spreadsheet file | 83% (49%–96%) | 0% (0%–43%) | 17 / 5 |
| xlsx | Spreadsheet referenced by name/path casually | 46% (19%–76%) | 0% (0%–56%) | 19 / 3 |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### agent-browser
- `clause-1/q02` [should trigger] hits 0/2: 帮我登录 example.com 的后台,用户名 admin,然后把订单列表页的表格数据抓出来存成 orders.csv
- `clause-1/q04` [should trigger] hits 0/2: 用浏览器自动点一下我们官网的“立即购买”按钮,看看跳转到哪个页面
- `clause-1/q06` [should trigger] hits 0/2: 帮我对这个新做的 dashboard 做一轮探索性测试,看看有没有明显的 bug 或者体验问题
- `clause-1/q07` [should trigger] hits 1/3: do a QA pass on the checkout flow at localhost:5173, click through everything and note anything broken
- `clause-1/q08` [should trigger] hits 0/2: bug hunt 一下我们的 web app,评估一下整体质量,出个报告
- `clause-2/q01` [should trigger] hits 0/2: open https://news.ycombinator.com and grab the titles + links of the top 30 stories into hn.json
- `clause-2/q07` [should trigger] hits 0/2: do a QA pass on our signup page, click around like a confused user and note anything that feels broken or janky
- `clause-2/q09` [should trigger] hits 0/2: 我想自动化操作本地的 VS Code 桌面版，帮我写个脚本打开命令面板并运行 'Format Document'
- `clause-2/q15` [should trigger] hits 1/3: search slack for any convo about the 'invoice-sync outage' last week and list who said what
- `clause-2/q16` [should trigger] hits 0/2: 看下 slack 里有没有人@我，有的话列出来是哪个频道的
- `clause-2/q19` [should trigger] hits 0/2: my preview deploy is behind Vercel protection, how can the headless browser inside the sandbox get past it to test the page
- Stolen by: {"claude-api": 1}

### deploy-to-vercel
- `clause-1/q10` [should trigger] hits 0/2: 好了,直接上线吧
- `clause-1/q12` [should trigger] hits 0/2: 把这个项目发布上线,现在就要能在公网访问
- `clause-1/q15` [should trigger] hits 1/3: spin up a preview deploy of the feature/checkout branch so QA can test
- `clause-1/q16` [should trigger] hits 0/2: 我想出个 preview 版本给产品经理确认,别动生产环境
- `clause-2/q07` [should trigger] hits 0/2: 帮我部署这个 demo,要一个能直接打开的网址给客户看
- `clause-2/q08` [should trigger] hits 0/2: ship it and gimme the url pls
- `clause-2/q10` [should trigger] hits 0/2: 把这个站点上线吧,我想让别人能访问
- `clause-2/q11` [should trigger] hits 0/2: pls make this site live, the landing page in /web is done
- `clause-2/q12` [should trigger] hits 0/2: 项目搞完了,直接上线

### design-mobile-apps
- `clause-1/q04` [should trigger] hits 1/3: can you mock up onboarding + login screens for a fintech app? dark theme, neon green accent
- `clause-1/q08` [should trigger] hits 0/2: the settings screen in my sleek project looks cramped, add more spacing and a toggle for notifications pls
- `clause-1/q11` [should trigger] hits 0/2: 把 sleek 项目里的首页导出成 HTML，我要放到 index.html 里预览
- `clause-2/q07` [should trigger] hits 0/2: sleek项目里的设置页太挤了，帮我调下间距，字号大一点，然后把旧的测试项目删掉

### diagnosing-bugs
- `clause-1/q02` [should trigger] hits 0/2: 帮我debug一下这个问题,用户列表分页到第3页就会重复显示第2页的数据
- `clause-1/q05` [should trigger] hits 0/2: the checkout page is broken, clicking Pay does nothing since yesterday's deploy
- `clause-1/q06` [should trigger] hits 0/2: 跑 pytest 一直报 KeyError: 'user_id',tests/test_auth.py 里三个用例全挂了
- `clause-1/q07` [should trigger] hits 0/2: my CI build is failing on main with 'ECONNRESET' during npm install, started randomly this morning
- `clause-1/q08` [should trigger] hits 0/2: 上传图片的接口 /api/upload 现在返回 500,日志里只有一句 Unhandled exception,不知道哪里炸了
- `clause-1/q09` [should trigger] hits 1/3: the dashboard got way slower after we upgraded to React 19, initial load went from 1s to like 6s
- `clause-1/q10` [should trigger] hits 1/3: 这个 SQL 查询以前 200ms,现在要跑 8 秒,是上周加了索引之后才变慢的
- `clause-1/q12` [should trigger] hits 0/2: build_index.py 越跑越慢,处理10万条要20分钟,之前才3分钟
- `clause-1/q13` [should trigger] hits 0/2: app is super laggy when scrolling the feed list on android, used to be smooth, whats going on
- `clause-2/q01` [should trigger] hits 0/2: 帮我 debug 一下 src/utils/dateParse.ts,跨时区的时候解析结果总是差一天,我没头绪
- `clause-2/q02` [should trigger] hits 0/2: can you diagnose why my websocket client in client.py silently drops reconnect attempts after the 3rd try? no errors, it just stops
- `clause-2/q03` [should trigger] hits 1/3: 诊断一下这个偶发问题:订单服务每隔几百次请求就会重复扣一次库存,我想先搞清楚根因再改
- `clause-2/q05` [should trigger] hits 0/2: npm run build 直接炸了,报 Cannot find module './config.prod',昨天还好好的
- `clause-2/q06` [should trigger] hits 0/2: my pytest suite started failing on CI after the merge, test_checkout.py::test_refund throws KeyError: 'currency' but passes locally
- `clause-2/q07` [should trigger] hits 0/2: 登录接口突然全部返回500,日志里只有一行 NullPointerException at AuthFilter.java:88,帮忙看看
- `clause-2/q08` [should trigger] hits 0/2: the dark mode toggle is just broken now, clicking it does nothing and console shows 'Uncaught TypeError: theme is undefined'
- `clause-2/q09` [should trigger] hits 0/2: 我们的报表页面加载越来越慢了,上个版本大概2秒,现在要15秒左右,是 report_query.sql 那块吗
- `clause-2/q10` [should trigger] hits 0/2: ci pipeline went from 6 min to 25 min since last week, nothing obvious changed in the workflow file. why
- `clause-2/q11` [should trigger] hits 0/2: 这个 Python 脚本处理 10 万行 CSV 要跑快 40 分钟,之前才几分钟,内存也涨得厉害
- `clause-2/q12` [should trigger] hits 0/2: app feels laggy lately, scrolling the feed in FeedList.tsx drops frames badly on my phone, worse than v2.3

### doc-coauthoring
- `clause-1/q01` [should trigger] hits 0/2: I need to write documentation for our internal deployment pipeline, can you help me put it together from scratch?
- `clause-1/q02` [should trigger] hits 0/2: 帮我写一份新员工入职的团队文档,内容我还没整理,想一步步来
- `clause-1/q03` [should trigger] hits 0/2: need to write up docs for our auth module before the release, where do we start
- `clause-1/q05` [should trigger] hits 0/2: I want to draft a proposal to move our team from Jenkins to GitHub Actions. Help me write it?
- `clause-1/q06` [should trigger] hits 0/2: 我要写一个关于引入代码评审机制的提案,给部门领导看的,帮我理一下
- `clause-1/q07` [should trigger] hits 0/2: creating a proposal for hiring 2 more SREs next quarter, i have a bunch of notes to dump
- `clause-1/q08` [should trigger] hits 0/2: 帮我起草一份预算申请的方案书,要说服财务部门,我边说背景你边问我
- `clause-1/q10` [should trigger] hits 0/2: 帮我写个技术规格文档,是关于消息队列迁移到Kafka的,写到 kafka-migration-spec.md
- `clause-1/q11` [should trigger] hits 0/2: drafting an RFC for the new plugin API, want to go section by section
- `clause-1/q13` [should trigger] hits 0/2: help me write a decision doc on whether we should use Postgres or DynamoDB for the orders service
- `clause-1/q14` [should trigger] hits 0/2: 写一份决策文档,讨论我们是自建监控还是买Datadog,我有很多讨论记录
- `clause-1/q15` [should trigger] hits 0/2: need a PRD for the notifications revamp. not sure what sections it needs tbh
- `clause-1/q16` [should trigger] hits 0/2: 帮我写个PRD,关于会员积分系统改版,先问我问题吧
- `clause-1/q17` [should trigger] hits 0/2: I'm about to start writing up a postmortem of last week's outage, it's gonna be a long one
- `clause-1/q18` [should trigger] hits 0/2: 想写一篇架构说明文档,发给其他团队看,怎么开始比较好?
- `clause-1/q19` [should trigger] hits 0/2: can you help me draft a runbook for on-call engineers? thinking of a full write up
- `clause-2/q01` [should trigger] hits 0/2: 我们的 CLI 工具还没有 README,帮我一起写一份完整的使用文档,包括安装、配置和常见问题
- `clause-2/q02` [should trigger] hits 0/2: need to write the onboarding docs for new backend hires, covers local setup, repo layout, deploy process. can we start?
- `clause-2/q03` [should trigger] hits 0/2: 帮我给 payments-sdk 写一份开发者文档,面向第三方接入方,我先把背景都倒给你
- `clause-2/q04` [should trigger] hits 0/2: i gotta write an internal wiki page documenting how our release pipeline works, never done one, walk me thru it
- `clause-2/q05` [should trigger] hits 0/2: 我想写一份提案,说服老板给团队买 Datadog 替换现在的自建监控,帮我理一下怎么写
- `clause-2/q06` [should trigger] hits 0/2: help me draft a proposal to migrate our CI from Jenkins to GitHub Actions, audience is the eng leads
- `clause-2/q07` [should trigger] hits 0/2: 要给客户写个项目方案书,做数据中台的,下周要交,我们一步步来写吧
- `clause-2/q08` [should trigger] hits 0/2: writing a proposal for a 4-day work week pilot at our startup, need to make it convincing for the CEO. where do we start
- `clause-2/q09` [should trigger] hits 0/2: 帮我起草一份技术规格说明书,是关于新的消息队列服务的接口和数据格式
- `clause-2/q10` [should trigger] hits 1/3: need a tech spec for our rate limiter rewrite, saving to docs/rate-limiter-spec.md. I have lots of context to dump
- `clause-2/q12` [should trigger] hits 0/2: can you help me spec out the webhook retry behavior? want a proper RFC-style technical spec w/ edge cases
- `clause-2/q13` [should trigger] hits 0/2: 我们在 Postgres 和 MongoDB 之间纠结了很久,想写一份决策文档把结论和理由记下来,给后面的人看
- `clause-2/q14` [should trigger] hits 0/2: help me write an ADR for why we chose Kafka over RabbitMQ, include the alternatives we rejected
- `clause-2/q15` [should trigger] hits 0/2: 帮我写一份 PRD,产品是团队的会议纪要自动总结功能,要结构化一点
- `clause-2/q16` [should trigger] hits 0/2: gotta put together a postmortem doc for last week's outage, structured w/ timeline, root cause, action items. help me write it up
- `clause-2/q17` [should trigger] hits 0/2: 我要写一篇文档,说明我们 monorepo 的目录规范,准备发到团队群里,帮我一起弄
- `clause-2/q18` [should trigger] hits 1/3: gonna draft a spec for the new search feature, can u help me get started
- `clause-2/q19` [should trigger] hits 0/2: 帮我 write up 一下上季度的架构演进,整理成一份文档给新同事看
- `clause-2/q20` [should trigger] hits 0/2: starting a doc on our caching strategy, my thoughts are all over the place, help me turn it into something readable

### domain-modeling
- `clause-1/q01` [should trigger] hits 0/2: 我们代码里 'account' 到底指 Customer 还是 User？感觉大家用得很乱，帮我理一下该叫什么
- `clause-1/q02` [should trigger] hits 0/2: in our repo 'cancellation' sometimes means whole order and sometimes just a line item. can we pin down what to call each?
- `clause-1/q03` [should trigger] hits 0/2: 团队里 'tenant'、'workspace'、'org' 混着用，我们先讨论下该统一成哪个词，边界在哪
- `clause-1/q04` [should trigger] hits 0/2: what should we even call a 'shipment' vs a 'delivery' in this codebase? i keep seeing both in src/fulfillment
- `clause-1/q06` [should trigger] hits 0/2: add 'Backorder' to GLOSSARY.md, we just agreed it means an order line with no stock at placement time
- `clause-1/q07` [should trigger] hits 1/3: GLOSSARY.md 里 Customer 的定义过时了，现在 guest checkout 也算，改一下
- `clause-1/q11` [should trigger] hits 0/2: docs/adr/0002-postgres-for-write-model.md 要改一下，状态改成 superseded，补充新的原因
- `clause-1/q12` [should trigger] hits 0/2: can you update adr 0001 to mention we later dropped the snapshot idea and why
- `clause-2/q01` [should trigger] hits 0/2: 我们代码里 'account' 到底指 Customer 还是 User？感觉大家用得很乱，帮我理一下该叫什么
- `clause-2/q02` [should trigger] hits 0/2: in our repo 'order' and 'booking' seem to be used interchangeably, are they the same thing? i want to pick one canonical word before we keep building
- `clause-2/q03` [should trigger] hits 0/2: 我说的“取消”其实是部分取消，但你看看代码是不是只支持整单取消？帮我对一下术语和实现是否一致
- `clause-2/q04` [should trigger] hits 0/2: what should we call a customer who has an expired subscription but still has data? 'lapsed' 'inactive' 'churned'? lets figure out the right term and test it w/ some edge cases
- `clause-2/q10` [should trigger] hits 0/2: write up an adr for why we went event-sourced for orders. hard to undo and new ppl keep asking why
- `clause-2/q11` [should trigger] hits 0/2: docs/adr/0002-postgres-for-write-model.md 要改一下，后来我们加了读副本，状态也应该改成 superseded 之类的
- `clause-2/q12` [should trigger] hits 0/2: can you amend adr 0001, the alternatives section is missing the CRUD option we rejected

### find-skills
- `clause-1/q02` [should trigger] hits 0/2: 怎么才能自动生成 changelog?每次发版手写太烦了
- `clause-1/q03` [should trigger] hits 0/2: how do i get better at reviewing PRs with you, is there a standard workflow for that
- `clause-1/q04` [should trigger] hits 0/2: docker 镜像体积太大了,有什么现成的办法能帮我优化吗?
- `clause-1/q06` [should trigger] hits 1/3: 有没有现成的 skill 可以帮我做 README 生成?
- `clause-1/q08` [should trigger] hits 0/2: 帮我搜一下 skills.sh 上有没有做无障碍检查 accessibility 的技能
- `clause-1/q09` [should trigger] hits 0/2: I want to extend what you can do. what add-ons or skills can I install?
- `clause-1/q10` [should trigger] hits 0/2: 能不能让你变得更强?我想给你装点扩展能力
- `clause-1/q11` [should trigger] hits 0/2: what's the best way to give you new abilities for frontend design work
- `clause-1/q12` [should trigger] hits 0/2: 我想扩展一下 agent 的能力,有什么推荐的包吗
- `clause-1/q13` [should trigger] hits 0/2: any templates or ready-made workflows for CI/CD pipelines I can plug in? searching for tools
- `clause-1/q14` [should trigger] hits 0/2: 我想找一些做 UI 设计系统的模板和工作流工具
- `clause-1/q15` [should trigger] hits 0/2: i wish i had help with deployment stuff, like vercel release automation. anything out there?
- `clause-1/q16` [should trigger] hits 0/2: 测试这块我一直想有个专门的帮手,有没有能装上的东西
- `clause-2/q01` [should trigger] hits 0/2: how do i generate a changelog from my git commits automatically? doing it by hand every release is killing me
- `clause-2/q02` [should trigger] hits 0/2: 怎么给我的 Next.js 项目做 e2e 测试啊?有没有现成的做法
- `clause-2/q03` [should trigger] hits 0/2: how do I get better PR reviews on my team's repo? any standard workflow for this
- `clause-2/q04` [should trigger] hits 0/2: 我想把项目的 API 文档自动生成出来,一般都怎么搞?
- `clause-2/q08` [should trigger] hits 0/2: 帮我搜一下 skills.sh 上有没有 kubernetes 部署相关的 skill
- `clause-2/q09` [should trigger] hits 0/2: I wish my agent were better at UI/UX design stuff, can it learn new abilities somehow?
- `clause-2/q10` [should trigger] hits 0/2: 你还能扩展什么能力吗?我想让你更会写前端
- `clause-2/q11` [should trigger] hits 0/2: how can i make claude code more powerful for devops work? want to add new capabilities
- `clause-2/q12` [should trigger] hits 0/2: 想给 agent 加点新本事,尤其是 accessibility 检查这块,有什么办法
- `clause-2/q13` [should trigger] hits 0/2: looking for a good README template or workflow I can just install and reuse across repos
- `clause-2/q14` [should trigger] hits 0/2: 有没有现成的 CI/CD 工作流模板可以直接装来用?
- `clause-2/q15` [should trigger] hits 0/2: need a ready-made tool for design system tokens, anything installable out there?
- `clause-2/q16` [should trigger] hits 0/2: 想找个能自动化 git 工作流的工具或者模板,最好能一键装上

### frontend-design
- `clause-1/q03` [should trigger] hits 0/2: design a dashboard for financial analysts in React, new project, want it to feel purpose-built not like another admin template
- `clause-1/q04` [should trigger] hits 0/2: 给我写一个儿童编程课程的宣传页，8到11岁女孩的，视觉上要有辨识度
- `clause-1/q05` [should trigger] hits 0/2: my pricing page in pricing.html looks so bland, can you redesign it so it has some personality
- `clause-1/q06` [should trigger] hits 0/2: 把 src/components/Header.vue 和整个首页的视觉风格重新做一遍，现在太普通了
- `clause-1/q07` [should trigger] hits 0/2: revamp the look of our settings screen, same functionality but it should feel way more intentional
- `clause-1/q08` [should trigger] hits 0/2: 现有的登录页视觉上很无聊，帮我整体改版，换个风格
- `clause-1/q09` [should trigger] hits 0/2: I have no idea what visual direction to take for my meditation app site, can you propose a look and feel and then build it
- `clause-1/q10` [should trigger] hits 0/2: 帮我想一个视觉方向：做一个独立音乐人的作品集网站，配色和整体风格怎么定
- `clause-1/q11` [should trigger] hits 0/2: come up with a color palette and layout concept for a museum exhibit microsite, then implement it
- `clause-1/q12` [should trigger] hits 0/2: 我想给我的摄影工作室网站定个整体设计风格，有什么大胆一点的想法，先出方案再写代码
- `clause-1/q13` [should trigger] hits 0/2: which fonts should I use for my magazine-style blog? want something with real character, headline treatment matters
- `clause-1/q14` [should trigger] hits 0/2: 帮我给这个作品集页面挑字体搭配，标题要有设计感，设一套字号层级
- `clause-1/q15` [should trigger] hits 0/2: set up a type scale and font pairing for the hero section in index.css, body text should be comfy to read
- `clause-1/q16` [should trigger] hits 0/2: 正文行宽和行高感觉不对，衬线字体的文章页怎么排版才好看？直接改 article.css
- `clause-1/q17` [should trigger] hits 0/2: my generated site looks like every AI page, cream background and terracotta accent. make it feel less templated
- `clause-1/q18` [should trigger] hits 0/2: 这个页面一看就是AI生成的，卡片都一个样，还有一堆全大写小标签，帮我去掉这种味道
- `clause-1/q19` [should trigger] hits 0/2: everything on my site is identical rounded cards with soft shadows and 01/02/03 numbering. fix the generic look
- `clause-1/q20` [should trigger] hits 0/2: 首页动画每个板块都是淡入上滑，感觉很廉价，帮我换成更有设计意图的动效
- `clause-2/q03` [should trigger] hits 0/2: 做个给8到11岁女孩用的拼豆手工小程序首页,界面要有设计感,要贴合小朋友的世界,用 React 写
- `clause-2/q04` [should trigger] hits 0/2: need a dashboard for a marine biology lab tracking whale tagging data. new project, want it to look designed not like another admin panel. vue is ok
- `clause-2/q05` [should trigger] hits 0/2: 现在这个 pricing.html 太丑了,帮我整个重新设计一下视觉,结构可以大改,内容不变
- `clause-2/q06` [should trigger] hits 0/2: revamp the look of our settings page in src/pages/Settings.tsx, it feels dated. keep the features, change how it looks and is laid out
- `clause-2/q07` [should trigger] hits 0/2: 我们的 landing 首页 hero 区域想整体翻新,现在是左文右图的老样子,帮我重做成更有记忆点的版本
- `clause-2/q08` [should trigger] hits 0/2: can you give the old admin login screen a full visual refresh? current css is in login.css, nothing is sacred
- `clause-2/q09` [should trigger] hits 0/2: 我在做一个独立游戏的宣传站,还没想好整体什么调性,你帮我定一个视觉方向,配色和氛围先给方案
- `clause-2/q10` [should trigger] hits 0/2: what visual direction would suit a funeral-planning startup? don't want it to feel morbid or corporate. give me a palette and mood before any code
- `clause-2/q11` [should trigger] hits 0/2: 帮我给这个手作皮具品牌的网站定视觉识别,是偏复古工匠风还是现代极简?说说你的判断并给出色板
- `clause-2/q12` [should trigger] hits 0/2: i need a design concept for a climbing gym site, like what should it feel like, colors, overall vibe. just the plan for now
- `clause-2/q13` [should trigger] hits 0/2: 这个博客的字体选啥好?正文是长文章,标题想有点个性,帮我挑两个字体搭配并定字号层级
- `clause-2/q14` [should trigger] hits 0/2: pick typefaces for my poetry magazine site. body text is long-form serif-ish, headings should feel like part of the design. also fix line length
- `clause-2/q15` [should trigger] hits 0/2: 标题字想做成页面的主视觉,字重、字距、宽度这些帮我调出气势,文件是 hero.css
- `clause-2/q16` [should trigger] hits 0/2: my type scale feels random, h1 h2 h3 p all kinda same. can u set up a proper scale and weights in tokens.css
- `clause-2/q17` [should trigger] hits 1/3: 我让AI生成的页面总是米色背景加衬线大标题加陶土色点缀,一眼就看出是AI做的,帮我避开这种套路重新选配色和风格
- `clause-2/q19` [should trigger] hits 0/2: 别再给我每个标题上面加一行大写小标签,还有 01 02 03 编号,这些一看就是模板味,帮我把 About 区块改得更像人设计的
- `clause-2/q20` [should trigger] hits 0/2: review my page for generic AI design tells (near-black bg + acid green accent, arrows on every button, fade-up on every section) and swap them for deliberate choices
- Stolen by: {"dataviz": 2}

### hyperframes
- `clause-1/q07` [should trigger] hits 0/2: 第二个场景太长了,砍掉最后两秒,然后检查一下有没有 lint 报错
- `clause-1/q08` [should trigger] hits 0/2: the person edited my video in the studio, pls continue from where they left off and add one more scene at the end
- `clause-1/q09` [should trigger] hits 0/2: 给这个标题加一个逐字弹出的动画,用 GSAP timeline 做,别用 CSS transition
- `clause-1/q10` [should trigger] hits 0/2: animate the bars in my chart scene so they grow in one by one w/ a stagger, then hold for 2s
- `clause-1/q12` [should trigger] hits 0/2: make the logo punch in with a little overshoot at 3s and fade the subtitle after it
- `clause-1/q19` [should trigger] hits 0/2: 做个数据可视化视频,把 sales.csv 里的季度营收做成动态柱状图
- `clause-2/q03` [should trigger] hits 0/2: 我想做个视频，主题是公司2025年度回顾，你先给我几个方案看看
- `clause-2/q05` [should trigger] hits 1/3: 打开我之前那个 hyperframes 项目，把第二个场景的标题改成“春季发布”，其他不动
- `clause-2/q07` [should trigger] hits 0/2: 我在预览里改了几处颜色，你接着帮我把结尾那段的背景音乐换成 assets/calm.mp3
- `clause-2/q09` [should trigger] hits 0/2: 让这个HTML里的logo从左边滑进来，然后轻轻弹一下停住，用gsap时间轴做
- `clause-2/q18` [should trigger] hits 1/3: make a 9:16 vertical clip for tiktok from my 3 product shots, punchy
- `clause-2/q19` [should trigger] hits 0/2: 给这段访谈口播视频加上逐字字幕，字幕放底部，黄色高亮当前词
- Stolen by: {"dataviz": 1}

### lark-doc
- `clause-1/q11` [should trigger] hits 0/2: update my existing mind note and add a child node 'Risks' under the root
- `clause-1/q12` [should trigger] hits 1/3: 帮我把思维笔记里的'测试'分支改名成'QA',再加两个子节点
- `clause-1/q17` [should not trigger] hits 3/3: 帮我给这个文档加条评论,@张三 看一下 https://x.feishu.cn/docx/doxcnCm1
- `clause-1/q18` [should not trigger] hits 3/3: copy this feishu doc as a backup copy: https://x.feishu.cn/docx/doxcnBak1
- `clause-1/q19` [should not trigger] hits 2/3: 把这个飞书文档导出成 PDF 存到本地
- `clause-2/q01` [should trigger] hits 0/2: 帮我把飞书文档里「Q3 复盘」那一节读出来,总结成五条要点
- `clause-2/q03` [should trigger] hits 1/3: 把我飞书文档里第二段改写得更正式一点,顺便把标题层级理一下
- `clause-2/q04` [should trigger] hits 0/2: pls fix the typos in my lark docx meeting notes and add an action items section at the bottom
- `clause-2/q07` [should trigger] hits 0/2: 文档里那个 pdf 附件帮我下载下来,存到 D:\downloads
- `clause-2/q08` [should trigger] hits 0/2: can you preview the screenshot attached in the doc comments? want to see what it shows
- `clause-2/q10` [should trigger] hits 0/2: add a child node 'risk review' under the 'Launch' branch in my mindnote
- `clause-2/q12` [should trigger] hits 0/2: mindnote 里把 'backlog' 这个节点挪到 'Q4' 下面,再改个名叫 'Q4 backlog'
- `clause-2/q18` [should not trigger] hits 2/3: 把飞书上那份合同文档复制一份,另存为副本
- `clause-2/q19` [should not trigger] hits 2/3: 给飞书文档第三段加一条评论,@张三 让他确认下

### mcp-builder
- `clause-1/q01` [should trigger] hits 1/3: I want to build an MCP server that wraps the Linear API so Claude can create and search issues. Where do I start?
- `clause-1/q04` [should trigger] hits 0/2: 我想让 Claude 能操作飞书文档,打算做个 MCP 服务来对接飞书开放平台 API,帮我设计一下工具列表和错误处理
- `clause-1/q05` [should trigger] hits 0/2: write me a FastMCP server in python that wraps the OpenWeather API, put it in weather_server.py
- `clause-1/q07` [should trigger] hits 0/2: how do i register tools with @mcp.tool in a python mcp server that talks to our internal REST api? starting from scratch
- `clause-1/q10` [should trigger] hits 1/3: 用 TypeScript 和 @modelcontextprotocol/sdk 写一个 MCP 服务器,对接我们的订单系统 REST 接口,用 server.registerTool 注册工具
- `clause-1/q11` [should trigger] hits 0/2: build a node mcp server for the Airtable API, need package.json, tsconfig and a tool to list records
- `clause-2/q05` [should trigger] hits 0/2: 用 FastMCP 写一个 server.py，里面放两个 @mcp.tool，一个算汇率一个查天气，pydantic 做参数校验
- `clause-2/q06` [should trigger] hits 1/3: write me a python mcp server w/ fastmcp that exposes my local sqlite notes.db as tools, stdio transport is fine
- `clause-2/q08` [should trigger] hits 0/2: scaffold a fastmcp project in python: server.py, pyproject.toml, one async tool that hits the OpenWeather endpoint with httpx
- `clause-2/q09` [should trigger] hits 0/2: 用 TypeScript 写个 MCP server，用官方 @modelcontextprotocol/sdk，zod 定义入参，registerTool 注册一个查询 Slack 频道的工具
- `clause-2/q10` [should trigger] hits 0/2: set up a node mcp server in ts, streamable http transport, stateless json, with src/index.ts and tsconfig. one tool for linear issues
- `clause-2/q11` [should trigger] hits 1/3: 帮我建个 npm 项目做 MCP 服务端，typescript，写完能用 npx @modelcontextprotocol/inspector 调试
- Stolen by: {"claude-api": 1}

### prototype
- `clause-1/q04` [should trigger] hits 1/3: 帮我随手搭个一次性的东西,把审批流的状态流转跑一遍,看看有没有死状态或者绕不出去的情况,不用写正式代码
- `clause-1/q05` [should trigger] hits 0/2: not sure what the settings page in app/settings/page.tsx should look like. can you throw together a few totally different layouts I can flip between?
- `clause-1/q06` [should trigger] hits 0/2: dashboard 首页我还没想好长什么样,先做几个风格差别很大的版本让我对比一下看看哪个顺眼
- `clause-2/q02` [should trigger] hits 1/3: can you throw together something I can click through to see if my subscription lifecycle (trial -> active -> past_due -> canceled) makes sense? my PM isn't technical so it should just open in a browser
- `clause-2/q03` [should trigger] hits 0/2: 购物车的优惠券叠加规则我老觉得哪里不对，写个临时的小东西把各种组合都跑一遍，让我直观看看逻辑对不对
- `clause-2/q05` [should trigger] hits 0/2: 我们的设置页现在很丑，帮我出几个完全不同风格的设计方案，在同一个页面上能切换着对比看看
- `clause-2/q06` [should trigger] hits 0/2: not sure what the dashboard should look like. can you mock up like 3 different layouts in app/dashboard/page.tsx so i can flip between them and pick one
- `clause-2/q07` [should trigger] hits 0/2: 想看看用户资料卡片到底长什么样好，随便做几版不一样的出来我挑挑，不用太精致

### skill-creator
- `clause-1/q01` [should trigger] hits 0/2: I want to make a skill that turns my meeting notes into action-item lists. can you help me set it up?
- `clause-1/q02` [should trigger] hits 0/2: 帮我从零写一个 skill,功能是把 PDF 发票里的金额和日期提取到 csv 里
- `clause-1/q03` [should trigger] hits 0/2: turn what we just did into a skill pls, the whole git-bisect-then-write-regression-test routine
- `clause-1/q04` [should trigger] hits 0/2: 我想做个新技能,用来按团队规范自动生成 changelog,从哪开始?
- `clause-1/q05` [should trigger] hits 0/2: my skills/pdf-extract/SKILL.md keeps ignoring tables, can you rewrite the instructions so it handles them better?
- `clause-1/q06` [should trigger] hits 0/2: 帮我改一下 skills/commit-helper/SKILL.md,现在太啰嗦了,精简一下并且加上 conventional commits 的说明
- `clause-1/q07` [should trigger] hits 0/2: the skill I wrote last week works but is kinda mediocre. iterate on it with me and make it better
- `clause-1/q08` [should trigger] hits 0/2: 我这个 skill 有个 bug,生成的报告老是漏掉结论部分,帮我优化下 skill 的写法
- `clause-1/q09` [should trigger] hits 0/2: can you run some test prompts against my docx-report skill and show me how it does vs no skill?
- `clause-1/q10` [should trigger] hits 0/2: 给我的 skill 写几个 eval 用例,然后跑一遍看看输出对不对
- `clause-1/q11` [should trigger] hits 0/2: set up evals/evals.json for my sql-formatter skill and add assertions
- `clause-1/q14` [should trigger] hits 0/2: 对我的 skill 做个基准测试,多跑几次看看方差大不大,是不是结果不稳定
- `clause-1/q15` [should trigger] hits 0/2: compare token usage and time for old version vs new version of my skill, aggregate into a benchmark table
- `clause-1/q17` [should trigger] hits 0/2: my skill never seems to get picked up by claude, can you tune the description so it triggers more reliably?
- `clause-1/q18` [should trigger] hits 0/2: 帮我优化 skill 的 description,现在触发率很低,想做个触发准确率测试
- `clause-1/q20` [should trigger] hits 0/2: 写几条 should-trigger 和 should-not-trigger 的 query 来测我 skill 的 description 准不准
- `clause-2/q01` [should trigger] hits 0/2: 我想做一个新的 skill，用来把每周的 git commit 自动整理成周报，你帮我从头搭一个吧
- `clause-2/q02` [should trigger] hits 0/2: turn what we just did into a skill — the whole flow of pulling the csv, cleaning columns and exporting to xlsx. start a new one called csv-cleaner
- `clause-2/q03` [should trigger] hits 0/2: 帮我写个 SKILL.md，功能是审查 PR 里的 SQL 迁移文件有没有风险，还没有任何现成文件
- `clause-2/q04` [should trigger] hits 0/2: i wanna make a skill for generating changelogs from conventional commits. can u interview me and then draft it?
- `clause-2/q05` [should trigger] hits 0/2: 我的 pdf-fill skill 老是漏掉表单里的复选框，帮我改一下 skills/pdf-fill/SKILL.md 让它处理这种情况
- `clause-2/q06` [should trigger] hits 0/2: can you tighten up my deploy-helper skill? SKILL.md is like 700 lines and the model keeps ignoring the bottom half, split into references/
- `clause-2/q07` [should trigger] hits 0/2: 上次用户反馈说 changelog skill 输出格式太啰嗦，根据反馈把它重写一版，别太多 MUST 那种硬规则
- `clause-2/q08` [should trigger] hits 0/2: update my code-review skill so it also checks for missing tests, keep the rest as is
- `clause-2/q09` [should trigger] hits 0/2: 我写好了 resume-parser 这个 skill，帮我造 3 个测试 prompt 跑一下，看看带 skill 和不带 skill 输出差多少
- `clause-2/q11` [should trigger] hits 0/2: 帮我给 evals/evals.json 里的用例加断言，然后对 xlsx-report 这个 skill 跑一轮评测并打分
- `clause-2/q12` [should trigger] hits 0/2: test my new skill on a few realistic prompts and compare against the old version before i ship it
- `clause-2/q13` [should trigger] hits 0/2: 把 iteration-2 的结果聚合成 benchmark，我要看 pass rate 的均值和标准差，还有 token 和耗时对比
- `clause-2/q14` [should trigger] hits 0/2: each eval ran 3 times for my skill, which assertions are flaky or non-discriminating? do an analyst pass on the benchmark.json
- `clause-2/q15` [should trigger] hits 0/2: 对比 with_skill 和 baseline 的稳定性，多跑几次看方差，别只看一次结果
- `clause-2/q17` [should trigger] hits 0/2: 我这个 skill 老是不被触发，帮我优化一下 description，让它触发更准
- `clause-2/q19` [should trigger] hits 0/2: 帮我造一批 should-trigger 和 should-not-trigger 的查询，测一下 frontmatter 里 description 的触发率
- `clause-2/q20` [should trigger] hits 0/2: my skill's description is too vague, claude never picks it. make it pushier and test whether it fires on the right prompts

### tdd
- `clause-1/q03` [should trigger] hits 0/2: want to add pagination to src/api/orders.ts, tests first pls, one test at a time
- `clause-1/q04` [should trigger] hits 0/2: 新增一个导出CSV的功能,我想先写失败的测试,然后再写最小实现让它通过
- `clause-1/q05` [should trigger] hits 0/2: login keeps returning 500 when email has uppercase letters. reproduce it with a failing test first, then fix
- `clause-1/q06` [should trigger] hits 1/3: 这个bug先别直接改,先写一个能复现的测试让它红,再修到绿 (utils/date.py 时区问题)
- `clause-1/q07` [should trigger] hits 0/2: fix the off-by-one in paginate() but do it TDD style so we have a regression test
- `clause-1/q08` [should trigger] hits 0/2: 购物车总价算错了,用TDD的方法修一下,先加个测试
- `clause-1/q11` [should trigger] hits 0/2: can you walk me through a red green refactor cycle on this FizzBuzz kata in kata/fizz.js?
- `clause-1/q12` [should trigger] hits 1/3: 红绿重构循环怎么用在 stack.go 这个小模块上?带我走一遍,边写边跑测试
- `clause-1/q13` [should trigger] hits 0/2: write integration tests for the checkout flow covering cart, payment and order creation
- `clause-1/q14` [should trigger] hits 0/2: 帮我给订单服务写集成测试,要覆盖下单到扣库存的整个流程
- `clause-1/q15` [should trigger] hits 0/2: we have no integration tests for the auth module, can you add some that go through the public API?
- `clause-1/q16` [should trigger] hits 0/2: 给 /api/users 这几个接口补一套集成测试,别 mock 内部模块
- `clause-2/q03` [should trigger] hits 1/3: need a rate limiter middleware for our express app, tests first pls, one behavior at a time
- `clause-2/q05` [should trigger] hits 0/2: users report parseDate() returns Invalid Date for '2024-02-30'. write a failing test that reproduces it first, then fix it
- `clause-2/q06` [should trigger] hits 0/2: 这个bug先别直接改,先写个能复现的失败测试,再改 order_service.py 里的金额舍入问题
- `clause-2/q07` [should trigger] hits 0/2: login crashes when email has uppercase letters. fix it TDD style - repro test then patch
- `clause-2/q08` [should trigger] hits 0/2: 修复 utils/pagination.js 最后一页多出一条数据的问题,用测试先锁住这个bug再修
- `clause-2/q13` [should trigger] hits 0/2: I need integration tests for the /orders API that hit a real test database, can you set that up?
- `clause-2/q14` [should trigger] hits 0/2: 给支付服务写集成测试,覆盖下单到回调的完整流程,别 mock 内部模块
- `clause-2/q15` [should trigger] hits 0/2: add integration tests for auth flow (signup -> login -> refresh token) in tests/integration/
- `clause-2/q16` [should trigger] hits 0/2: 我们的 API 只有单测,帮我补一套集成测试,通过公开接口验证行为

### vercel-react-best-practices
- `clause-1/q01` [should trigger] hits 0/2: 帮我写一个 Next.js 的商品列表页 app/products/page.tsx,带分页和筛选,用 server component
- `clause-1/q02` [should trigger] hits 0/2: write me a React <CommentThread /> component that renders nested replies and a reply box, TypeScript
- `clause-1/q03` [should trigger] hits 0/2: 新建一个 dashboard 页面,里面有几个图表卡片组件,用 Next.js app router 写
- `clause-1/q04` [should trigger] hits 0/2: need a new /settings route in my next app with a profile form component, can you scaffold it
- `clause-1/q05` [should trigger] hits 0/2: 我这个页面先 await 拿用户,再 await 拿订单,再拿推荐,好慢,帮我把 getServerSideProps 里的请求改好
- `clause-1/q06` [should trigger] hits 0/2: how should I fetch the notifications list on the client in React so multiple components don't fire duplicate requests?
- `clause-1/q07` [should trigger] hits 0/2: 写个 server action 提交订单,再在 RSC 里并行取商品和库存数据
- `clause-1/q08` [should trigger] hits 0/2: implement data loading for my Next.js blog: fetch posts and author info in page.tsx, want it fast with streaming
- `clause-1/q09` [should trigger] hits 0/2: 帮我 review 一下 components/Table.tsx,看看有没有性能问题,感觉输入的时候卡
- `clause-1/q10` [should trigger] hits 0/2: can u look over my Next.js app/feed/page.tsx for perf problems? it feels sluggish
- `clause-1/q11` [should trigger] hits 0/2: code review 这个 PR 里的 React hooks,重点看多余的 re-render 和 useEffect 用法
- `clause-1/q13` [should trigger] hits 0/2: 把 UserList.jsx 重构一下,现在每次父组件更新都整个重渲染,组件里还嵌套定义了子组件
- `clause-1/q14` [should trigger] hits 0/2: refactor this class-heavy Next.js pages router code to be cleaner and faster, files in pages/ and components/
- `clause-1/q15` [should trigger] hits 0/2: 重构下 hooks/useSearch.ts,useEffect 里在同步 derived state,想改成更合理的写法
- `clause-1/q16` [should trigger] hits 0/2: clean up my React form component, it has like 6 useState and effects that depend on objects, refactor pls
- `clause-1/q17` [should trigger] hits 0/2: 我们 Next.js 项目首屏 JS 太大了,lucide-react 和 lodash 都是整包引入,帮忙优化 bundle
- `clause-1/q18` [should trigger] hits 0/2: how do I lazy load a heavy chart component in Next.js so initial load time drops?
- `clause-1/q19` [should trigger] hits 0/2: 页面加载太慢,Google Analytics 和 Sentry 能不能延后到 hydration 之后再加载?
- `clause-1/q20` [should trigger] hits 0/2: my next build shows a 900kb first-load bundle for /home, help me cut it down
- `clause-2/q01` [should trigger] hits 0/2: 帮我写一个 Next.js 的商品详情页 app/products/[id]/page.tsx,要有图片轮播、价格、加入购物车按钮,用 App Router
- `clause-2/q02` [should trigger] hits 0/2: write me a React <DataTable /> component w/ sortable columns and sticky header, typescript pls
- `clause-2/q03` [should trigger] hits 0/2: 新建一个 Navbar 组件,移动端有汉堡菜单,桌面端横向排列,用 tailwind
- `clause-2/q04` [should trigger] hits 0/2: need a pricing page for our next.js site, 3 tiers, toggle monthly/yearly. put it in app/pricing/page.tsx
- `clause-2/q05` [should trigger] hits 0/2: 在 server component 里从 postgres 拉用户订单列表,还要拉每个订单的商品详情,帮我写这个取数逻辑
- `clause-2/q06` [should trigger] hits 0/2: how do i fetch /api/notifications on the client and keep it fresh every 30s? using swr or whatever is best
- `clause-2/q07` [should trigger] hits 0/2: 写个 server action 提交评论表单,提交后要重新拉取评论列表
- `clause-2/q08` [should trigger] hits 0/2: my dashboard needs to load user profile, stats and feed from 3 different endpoints in a route handler, pls implement the fetching part
- `clause-2/q09` [should trigger] hits 0/2: 帮我看看 components/Feed.tsx 为什么滚动的时候卡顿,有没有性能问题
- `clause-2/q10` [should trigger] hits 0/2: can you review this PR diff for perf problems? mostly worried about re-renders in the checkout form
- `clause-2/q11` [should trigger] hits 0/2: 审一下 app/dashboard/page.tsx 有没有请求瀑布或者不必要的重渲染,只要指出问题不用改
- `clause-2/q12` [should trigger] hits 0/2: audit my react app for perf antipatterns, things like useEffect misuse and expensive stuff in render. just list findings
- `clause-2/q13` [should trigger] hits 0/2: 这个 UserList 组件 800 行太乱了,帮我重构一下,拆成几个小组件,hooks 也抽出来
- `clause-2/q14` [should trigger] hits 0/2: refactor pages/ router stuff to the app router, we're on next 14, keep behavior same
- `clause-2/q15` [should trigger] hits 0/2: 把 class 组件都改成 function component + hooks,src/legacy 目录下那几个
- `clause-2/q16` [should trigger] hits 0/2: clean up this component, theres a ton of useEffect that just sync state from props, simplify it pls
- `clause-2/q17` [should trigger] hits 1/3: 我们 next 项目首屏 JS 有 1.2MB,帮我想办法把 bundle 体积降下来
- `clause-2/q18` [should trigger] hits 0/2: lighthouse says LCP is 4.5s on our landing page, how do i cut load time? mostly heavy chart libs and analytics scripts
- `clause-2/q19` [should trigger] hits 0/2: lodash 和 moment 好像把包撑得很大,帮我换成按需引入或者更轻的方案
- `clause-2/q20` [should trigger] hits 0/2: how do i code-split the admin panel so regular users dont download it? using next/dynamic maybe

### web-design-guidelines
- `clause-1/q02` [should trigger] hits 0/2: 帮我 review 一下 app/page.tsx 的界面代码,看看有没有问题
- `clause-1/q03` [should trigger] hits 0/2: can you look over my signup form component and tell me what's off with the UI? components/SignupForm.jsx
- `clause-1/q04` [should trigger] hits 0/2: 看下我这个 Dashboard.vue 的 UI 写得规不规范
- `clause-1/q06` [should trigger] hits 0/2: 帮我检查一下 pages/index.html 的无障碍问题,比如 aria 和 label 有没有漏
- `clause-1/q07` [should trigger] hits 0/2: is my dropdown menu accessible? keyboard nav, focus states etc. in ui/Dropdown.tsx
- `clause-1/q08` [should trigger] hits 0/2: a11y 检查下 components/ 目录下所有的按钮和表单
- `clause-1/q10` [should trigger] hits 0/2: 帮我审计一下这个项目的设计实现,styles/ 和 components/ 下面的都看看
- `clause-1/q11` [should trigger] hits 0/2: do a design audit on pricing.html and its css, I want to know where it breaks interface conventions
- `clause-1/q12` [should trigger] hits 0/2: 设计审查一下 CheckoutPage.jsx,看有没有不符合界面规范的地方
- `clause-1/q13` [should trigger] hits 0/2: review UX of the onboarding flow in src/onboarding/Step1.tsx and Step2.tsx
- `clause-1/q14` [should trigger] hits 0/2: 帮我 review 下这个设置页的 UX,代码在 SettingsPanel.tsx
- `clause-1/q15` [should trigger] hits 0/2: how's the UX of my login form? loading states, error messages, autofocus... LoginForm.vue
- `clause-1/q16` [should trigger] hits 0/2: 用户体验方面帮我过一遍 components/Cart.tsx,有问题直接指出来
- `clause-1/q18` [should trigger] hits 0/2: 帮我对照 web 最佳实践检查一下我的网站代码 src/app/layout.tsx
- `clause-1/q20` [should trigger] hits 0/2: 我的个人网站有没有违反什么 best practice?文件在 site/ 目录,帮我扫一遍
- `clause-2/q02` [should trigger] hits 1/3: 帮我看看 components/ProductCard.vue 这个界面写得有没有问题,按 UI 规范过一遍
- `clause-2/q06` [should trigger] hits 0/2: 帮我检查一下 src/pages/Checkout.tsx 的无障碍问题,比如 aria 标签和键盘操作
- `clause-2/q07` [should trigger] hits 0/2: is my form accessible? look at components/forms/*.tsx for a11y issues
- `clause-2/q08` [should trigger] hits 0/2: 我这个下拉菜单屏幕阅读器读不出来,帮忙查下 Dropdown.jsx 的 a11y 合规性
- `clause-2/q10` [should trigger] hits 0/2: 帮我审计一下 src/components 下面的设计实现,看看间距、字体、颜色有没有不规范的地方
- `clause-2/q11` [should trigger] hits 0/2: do a design audit on pricing-section.tsx, i think the typography and layout are inconsistent
- `clause-2/q12` [should trigger] hits 0/2: 设计审查一下 app/globals.css 和 layout.tsx,有没有违反界面规范的
- `clause-2/q13` [should trigger] hits 0/2: review ux of the onboarding flow in src/onboarding/*.tsx
- `clause-2/q14` [should trigger] hits 0/2: 帮我 review 一下 SettingsPage.tsx 的用户体验,有没有交互上的坑,比如 focus 状态、loading 状态
- `clause-2/q15` [should trigger] hits 0/2: UX review pls: components/SearchBar.tsx, does it handle empty/error states and touch targets properly?
- `clause-2/q16` [should trigger] hits 0/2: 看下 CartDrawer.jsx 的 UX 细节有没有问题,按钮反馈、动画、表单提交体验这些
- `clause-2/q20` [should trigger] hits 0/2: 按最佳实践帮我过一遍网站代码 pages/index.tsx,看哪些地方不合规

### webapp-testing
- `clause-1/q01` [should trigger] hits 0/2: 写个 playwright 脚本，打开 localhost:5173 点一下登录按钮，把用户名密码填进去提交
- `clause-1/q03` [should trigger] hits 0/2: 用 playwright 自动化操作一下本地的 index.html，列出页面上所有按钮和输入框
- `clause-1/q04` [should trigger] hits 0/2: start backend (python server.py, port 3000) and frontend (npm run dev, port 5173) together and run a playwright script against them
- `clause-1/q05` [should trigger] hits 0/2: 帮我测一下本地的待办事项应用，添加一条任务后列表里是不是真的出现了
- `clause-1/q06` [should trigger] hits 1/3: can you check that the checkout form on localhost:8080 actually validates empty email and shows the error message?
- `clause-1/q07` [should trigger] hits 0/2: 我改完了搜索框的代码，跑一下浏览器确认输入关键字后结果能正常过滤
- `clause-1/q08` [should trigger] hits 0/2: verify the dark mode toggle in my react app still works after the refactor, app is running locally
- `clause-1/q09` [should trigger] hits 0/2: 我的下拉菜单点了没反应，帮我在浏览器里复现一下看看到底哪里出问题
- `clause-1/q10` [should trigger] hits 0/2: the modal won't close when I click the X on localhost:4200, can you poke at it in a browser and figure out why
- `clause-1/q11` [should trigger] hits 0/2: 页面加载完按钮是灰的，不知道是不是 JS 还没执行完，帮我看看渲染后的 DOM 是什么状态
- `clause-1/q12` [should trigger] hits 0/2: layout looks broken on the dashboard page when the sidebar collapses, need to see what's happening in the running app
- `clause-1/q14` [should trigger] hits 0/2: take a screenshot of the pricing page in my running dev server after the login step
- `clause-1/q15` [should trigger] hits 0/2: 帮我把 report.html 在浏览器里打开然后截图看看样式对不对
- `clause-1/q16` [should trigger] hits 1/3: grab screenshots of the signup flow at each step so I can review them, app on port 3000
- `clause-1/q17` [should trigger] hits 0/2: 打开我本地的页面，把浏览器控制台的报错和 console.log 都抓出来给我
- `clause-1/q19` [should trigger] hits 0/2: 跑一下页面，把所有 console.warn 和网络请求失败的日志收集起来
- `clause-1/q20` [should trigger] hits 0/2: log everything the page prints to console while I click through the form, save to console.txt
- `clause-2/q01` [should trigger] hits 0/2: 写个 playwright 脚本，打开 localhost:5173，点一下登录按钮，填好用户名和密码然后提交
- `clause-2/q02` [should trigger] hits 0/2: my vite dev server is on port 3000 and the api is on 8000, can you write a python script that starts both and then drives the page with playwright to add 3 items to the cart
- `clause-2/q03` [should trigger] hits 0/2: 我有个静态的 index.html 在 ./demo/ 下面，用 playwright 自动把表单里的输入框都填上再点提交
- `clause-2/q05` [should trigger] hits 0/2: 帮我跑一遍本地的结算流程，看看加入购物车 → 下单 → 支付成功页是不是都能正常走通
- `clause-2/q07` [should trigger] hits 0/2: 我刚改完 Todo 组件，帮我确认一下新增、删除、勾选完成这三个功能在浏览器里还正常
- `clause-2/q08` [should trigger] hits 0/2: verify the dark mode toggle in my react app really switches the theme and persists after a page reload. dev server is npm run dev
- `clause-2/q10` [should trigger] hits 0/2: the modal won't close when i click the X button, only on the settings page. can you open it up and figure out why
- `clause-2/q11` [should trigger] hits 0/2: 页面上那个按钮明明渲染出来了但是点不了，是不是被别的元素盖住了？帮我在真实页面里查一下
- `clause-2/q12` [should trigger] hits 0/2: sidebar collapses weirdly after i resize the window on my local app, pls repro and tell me which element/state is causing it
- `clause-2/q13` [should trigger] hits 0/2: 给 localhost:3000 的首页截个全屏图，存到 /tmp/home.png
- `clause-2/q14` [should trigger] hits 0/2: take screenshots of my dashboard at the login page and after login, save them as login.png and dashboard.png
- `clause-2/q15` [should trigger] hits 0/2: 帮我把本地 report.html 渲染出来截一张图看看长什么样
- `clause-2/q16` [should trigger] hits 0/2: grab a screenshot of the pricing page on my dev server so i can paste it in the PR description
- `clause-2/q17` [should trigger] hits 0/2: 打开我本地的应用，把浏览器 console 里的所有输出都抓出来给我看看
- `clause-2/q19` [should trigger] hits 0/2: 我想看看点击'导出'按钮的时候浏览器控制台有没有报错，帮我记录下来
- `clause-2/q20` [should trigger] hits 0/2: run my app and dump the browser console log to console_output.txt while i navigate through the 3 main pages
- Stolen by: {"run": 8}

### xlsx
- `clause-1/q07` [should trigger] hits 0/2: take the numbers in this JSON api_dump.json and turn them into an excel file with one sheet per region
- `clause-1/q08` [should trigger] hits 0/2: 用这三个 csv 的数据生成一个汇总的 Excel 报表,每个 csv 一个 sheet,最后加一个合计页
- `clause-1/q09` [should trigger] hits 0/2: convert customers.csv to xlsx please
- `clause-1/q10` [should trigger] hits 0/2: 把 report.xlsx 导出成 tsv,只要第一个 sheet
- `clause-1/q11` [should trigger] hits 0/2: turn orders.xlsx into a csv with utf-8 encoding, one file per sheet
- `clause-1/q14` [should trigger] hits 0/2: 我桌面上那个报价单表格,帮我把税率那列改成 13% 然后重新算总价
- `clause-1/q16` [should trigger] hits 1/3: 下载文件夹里最新那个 xlsx,把重复行删掉再按金额从大到小排
- `clause-1/q19` [should trigger] hits 0/2: I pasted scraped stuff into scrape.tsv, columns are shifted and some cells have html junk. restructure it into a clean spreadsheet
- `clause-1/q20` [should trigger] hits 0/2: 老系统导出的 data.xls 格式很乱,合并单元格一堆,拆开整理成一张干净的 xlsx
- `clause-2/q03` [should trigger] hits 0/2: 在 inventory.xlsm 的 Summary 表后面加一个柱状图,按仓库统计库存数量,别把宏弄丢了
- `clause-2/q07` [should trigger] hits 0/2: 把这段 JSON 接口返回的订单数据整理成一个 orders_summary.xlsx,按月份分 sheet,每个 sheet 底部加合计
- `clause-2/q09` [should trigger] hits 1/3: 把 customers.csv 转成 xlsx,表头加粗并冻结首行
- `clause-2/q10` [should trigger] hits 0/2: convert report_q3.xlsx to csv, one file per sheet pls
- `clause-2/q11` [should trigger] hits 0/2: 我有个 data.tsv,想变成 Excel 文件,日期列要保持成日期格式不要变成数字
- `clause-2/q15` [should trigger] hits 0/2: that excel file Sarah sent me yesterday (its in D:\work\tmp), make the dates look like YYYY-MM-DD and sort by date
- `clause-2/q16` [should trigger] hits 0/2: 我下载文件夹里最新那个csv,帮我按部门做个汇总表出来
- `clause-2/q18` [should trigger] hits 1/3: 这个 raw_dump.txt 是制表符分隔的,有些行列数对不上,还有重复表头混在中间,帮我整理成规整的 Excel 表

