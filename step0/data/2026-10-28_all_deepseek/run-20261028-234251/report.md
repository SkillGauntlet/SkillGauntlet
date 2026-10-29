# Trigger test report 20261028-234251

- Host: Claude Code 2.1.303 (Claude Code); backend: api.deepseek.com; model: deepseek-v4-flash
- Runs per query: 3; total trials: 1700; runner v0.4.2; Windows 10 / Python 3.11.9
- Sampling: adaptive (should-not-trigger queries run once and go to the full count only if one triggered; should-trigger queries run one fewer and go to the full count only if their runs disagree). Rates are averages of per-query rates and CIs are sized by the number of queries, since repeat runs of one query are not independent
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (18, the background that can steal triggers): deep-research, design, design-sync, dataviz, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, claude-api, workflow-authoring, run, run-skill-generator, plugin-authoring
- Installed alongside lark-doc (same-family companions, invoking one counts as stolen): lark-drive, lark-shared
- Tools offered to the model: (26) Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, Glob, Grep, ListAgents, Monitor, NotebookEdit, PowerShell, PushNotification, Read, ReportFindings, ScheduleWakeup, SendMessage, Skill, Task, TaskStop, WebFetch, WebSearch, Workflow, Write
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| agent-browser | triggers poorly | 29% (18%–43%) | 0% (0%–16%) | 1 | 0 | rarely triggers; borderline, add runs |
| deploy-to-vercel | triggers poorly | 32% (19%–50%) | 8% (2%–28%) | 0 | 0 | rarely triggers; borderline, add runs |
| design-mobile-apps | triggers poorly | 32% (17%–52%) | 12% (4%–32%) | 0 | 0 | rarely triggers; borderline, add runs |
| diagnosing-bugs | triggers fair | 61% (42%–78%) | 0% (0%–16%) | 0 | 2 | borderline, add runs |
| doc-coauthoring | triggers well | 85% (71%–93%) | 0% (0%–16%) | 0 | 0 | borderline, add runs |
| domain-modeling | triggers poorly | 18% (8%–37%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| find-skills | triggers poorly | 43% (27%–60%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs; question sets disagree |
| frontend-design | triggers poorly | 35% (22%–50%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| hyperframes | triggers poorly | 37% (24%–52%) | 2% (0%–19%) | 1 | 0 | rarely triggers; borderline, add runs |
| lark-doc | triggers fair | 78% (61%–89%) | 8% (2%–28%) | 5 | 0 | borderline, add runs; question sets disagree |
| mcp-builder | triggers well | 100% (86%–100%) | 3% (0%–21%) | 2 | 0 | borderline, add runs |
| prototype | triggers poorly | 42% (22%–65%) | 0% (0%–18%) | 0 | 2 | rarely triggers; borderline, add runs; question sets disagree |
| skill-creator | triggers poorly | 21% (11%–36%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| tdd | triggers fair | 50% (34%–66%) | 0% (0%–16%) | 0 | 0 | borderline, add runs; question sets disagree |
| vercel-react-best-practices | triggers poorly | 5% (1%–16%) | 0% (0%–16%) | 1 | 11 | rarely triggers; borderline, add runs |
| web-design-guidelines | triggers poorly | 10% (4%–23%) | 8% (2%–28%) | 0 | 0 | rarely triggers; borderline, add runs |
| webapp-testing | triggers poorly | 38% (24%–53%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |
| xlsx | triggers poorly | 35% (22%–50%) | 0% (0%–16%) | 0 | 0 | rarely triggers; borderline, add runs |

## Tool behaviour

`no tool` = on a should-trigger trial the model answered without calling any tool at all. That is a property of the model and the harness, not of the skill's description, so read this before blaming a description: on a non-Anthropic backend it is often what a low recall actually reflects.

| Skill | No tool call (should-trigger) | First tool across all trials |
|---|---|---|
| agent-browser | 0/106 (0%) | Bash 62, Skill 34, PowerShell 22, WebSearch 3, Glob 3, WebFetch 2 |
| deploy-to-vercel | 0/69 (0%) | Bash 62, Skill 28, PowerShell 3 |
| design-mobile-apps | 0/50 (0%) | Bash 45, Skill 23, Glob 3, (no tool) 2, DesignSync 1, PowerShell 1, Write 1 |
| diagnosing-bugs | 0/54 (0%) | Skill 33, Bash 27, (no tool) 6, PowerShell 3, Grep 2, Glob 1, Read 1, Write 1 |
| doc-coauthoring | 1/87 (1%) | Skill 72, Bash 23, Read 7, (no tool) 3, PowerShell 1, Glob 1 |
| domain-modeling | 0/51 (0%) | Bash 32, Glob 20, Skill 10, Read 4, Grep 3, PowerShell 1, (no tool) 1 |
| find-skills | 10/69 (14%) | Bash 30, Skill 30, (no tool) 14, PowerShell 7, WebSearch 4, Glob 2, WebFetch 1, Read 1 |
| frontend-design | 1/86 (1%) | Bash 57, Skill 31, Glob 8, (no tool) 5, Read 4, Write 1 |
| hyperframes | 1/87 (1%) | Bash 69, Skill 35, Read 2, PowerShell 1, (no tool) 1, Glob 1 |
| lark-doc | 0/68 (0%) | Skill 62, Bash 21, WebFetch 5, PowerShell 2, Read 1, (no tool) 1 |
| mcp-builder | 0/48 (0%) | Skill 52, Bash 15, (no tool) 1, Write 1, PowerShell 1 |
| prototype | 0/36 (0%) | Bash 32, Skill 15, Glob 6, (no tool) 1 |
| skill-creator | 0/84 (0%) | Bash 70, Skill 18, Glob 8, Read 6, PowerShell 1, (no tool) 1 |
| tdd | 0/71 (0%) | Bash 49, Skill 36, Glob 2, (no tool) 2, Read 1, Grep 1 |
| vercel-react-best-practices | 0/82 (0%) | Bash 81, Glob 12, Skill 6, (no tool) 2, Grep 1 |
| web-design-guidelines | 0/82 (0%) | Glob 45, Bash 31, Skill 14, Read 12, (no tool) 3, WebFetch 1 |
| webapp-testing | 0/86 (0%) | Bash 67, Skill 33, (no tool) 3, PowerShell 2, Glob 1 |
| xlsx | 0/89 (0%) | Bash 71, Skill 32, Glob 3, (no tool) 3 |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| agent-browser | clause-1 | triggers poorly | 29% (15%–49%) | 0% (0%–28%) | 54 / 10 |
| agent-browser | clause-2 | triggers poorly | 29% (15%–49%) | 0% (0%–28%) | 52 / 10 |
| agent-browser | **spread** | | 0 points | | |
| deploy-to-vercel | clause-1 | triggers poorly | 29% (13%–54%) | 7% (1%–36%) | 33 / 12 |
| deploy-to-vercel | clause-2 | triggers poorly | 35% (17%–60%) | 10% (2%–40%) | 36 / 12 |
| deploy-to-vercel | **spread** | | 6 points | | |
| design-mobile-apps | clause-1 | triggers poorly | 33% (14%–61%) | 10% (2%–40%) | 24 / 12 |
| design-mobile-apps | clause-2 | triggers poorly | 31% (12%–58%) | 13% (3%–44%) | 26 / 14 |
| design-mobile-apps | **spread** | | 3 points | | |
| diagnosing-bugs | clause-1 | triggers fair | 64% (38%–84%) | 0% (0%–28%) | 27 / 10 |
| diagnosing-bugs | clause-2 | triggers fair | 58% (32%–81%) | 0% (0%–28%) | 27 / 10 |
| diagnosing-bugs | **spread** | | 6 points | | |
| doc-coauthoring | clause-1 | triggers well | 90% (70%–97%) | 0% (0%–28%) | 43 / 10 |
| doc-coauthoring | clause-2 | triggers well | 80% (58%–92%) | 0% (0%–28%) | 44 / 10 |
| doc-coauthoring | **spread** | | 10 points | | |
| domain-modeling | clause-1 | triggers poorly | 19% (6%–48%) | 0% (0%–28%) | 27 / 10 |
| domain-modeling | clause-2 | triggers poorly | 17% (5%–45%) | 0% (0%–28%) | 24 / 10 |
| domain-modeling | **spread** | | 3 points | | |
| find-skills | clause-1 | triggers fair | 52% (30%–74%) | 0% (0%–28%) | 35 / 10 |
| find-skills | clause-2 | triggers poorly | 33% (16%–58%) | 0% (0%–28%) | 34 / 10 |
| find-skills | **spread** | | 19 points | | |
| frontend-design | clause-1 | triggers poorly | 42% (23%–63%) | 0% (0%–28%) | 43 / 10 |
| frontend-design | clause-2 | triggers poorly | 28% (13%–50%) | 0% (0%–28%) | 43 / 10 |
| frontend-design | **spread** | | 13 points | | |
| hyperframes | clause-1 | triggers poorly | 30% (14%–52%) | 0% (0%–28%) | 43 / 10 |
| hyperframes | clause-2 | triggers poorly | 43% (24%–64%) | 3% (0%–32%) | 44 / 12 |
| hyperframes | **spread** | | 13 points | | |
| lark-doc | clause-1 | triggers well | 83% (59%–94%) | 10% (2%–40%) | 35 / 12 |
| lark-doc | clause-2 | triggers fair | 73% (48%–88%) | 7% (1%–36%) | 33 / 12 |
| lark-doc | **spread** | | 10 points | | |
| mcp-builder | clause-1 | triggers well | 100% (76%–100%) | 0% (0%–28%) | 24 / 10 |
| mcp-builder | clause-2 | triggers well | 100% (76%–100%) | 7% (1%–36%) | 24 / 12 |
| mcp-builder | **spread** | | 0 points | | |
| prototype | clause-1 | triggers fair | 54% (24%–81%) | 0% (0%–30%) | 17 / 9 |
| prototype | clause-2 | triggers poorly | 29% (9%–63%) | 0% (0%–30%) | 19 / 9 |
| prototype | **spread** | | 25 points | | |
| skill-creator | clause-1 | triggers poorly | 18% (7%–40%) | 0% (0%–28%) | 42 / 10 |
| skill-creator | clause-2 | triggers poorly | 23% (10%–45%) | 0% (0%–28%) | 42 / 10 |
| skill-creator | **spread** | | 5 points | | |
| tdd | clause-1 | triggers poorly | 44% (23%–67%) | 0% (0%–28%) | 37 / 10 |
| tdd | clause-2 | triggers fair | 56% (33%–77%) | 0% (0%–28%) | 34 / 10 |
| tdd | **spread** | | 12 points | | |
| vercel-react-best-practices | clause-1 | triggers poorly | 7% (1%–26%) | 0% (0%–28%) | 41 / 10 |
| vercel-react-best-practices | clause-2 | triggers poorly | 3% (0%–21%) | 0% (0%–28%) | 41 / 10 |
| vercel-react-best-practices | **spread** | | 3 points | | |
| web-design-guidelines | clause-1 | triggers poorly | 2% (0%–19%) | 7% (1%–36%) | 41 / 12 |
| web-design-guidelines | clause-2 | triggers poorly | 18% (7%–40%) | 10% (2%–40%) | 41 / 12 |
| web-design-guidelines | **spread** | | 17 points | | |
| webapp-testing | clause-1 | triggers poorly | 43% (24%–64%) | 0% (0%–28%) | 43 / 10 |
| webapp-testing | clause-2 | triggers poorly | 32% (16%–54%) | 0% (0%–28%) | 43 / 10 |
| webapp-testing | **spread** | | 12 points | | |
| xlsx | clause-1 | triggers poorly | 32% (16%–54%) | 0% (0%–28%) | 46 / 10 |
| xlsx | clause-2 | triggers poorly | 38% (21%–60%) | 0% (0%–28%) | 43 / 10 |
| xlsx | **spread** | | 7 points | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| agent-browser | 20% (9%–40%) | 37% (21%–57%) | 0% (0%–28%) | 0% (0%–28%) | 61 / 65 |  |
| deploy-to-vercel | 29% (13%–54%) | 35% (17%–60%) | 7% (1%–36%) | 10% (2%–40%) | 45 / 48 |  |
| design-mobile-apps | 33% (14%–61%) | 31% (12%–58%) | 26% (8%–58%) | 0% (0%–26%) | 39 / 37 |  |
| diagnosing-bugs | 72% (44%–90%) | 51% (27%–75%) | 0% (0%–30%) | 0% (0%–26%) | 34 / 40 |  |
| doc-coauthoring | 83% (62%–94%) | 87% (66%–96%) | 0% (0%–28%) | 0% (0%–28%) | 53 / 54 |  |
| domain-modeling | 18% (6%–45%) | 18% (5%–48%) | 0% (0%–26%) | 0% (0%–30%) | 38 / 33 |  |
| find-skills | 33% (16%–58%) | 52% (30%–74%) | 0% (0%–30%) | 0% (0%–26%) | 43 / 46 |  |
| frontend-design | 30% (14%–52%) | 40% (22%–61%) | 0% (0%–28%) | 0% (0%–28%) | 50 / 56 |  |
| hyperframes | 32% (16%–54%) | 42% (23%–63%) | 3% (0%–32%) | 0% (0%–28%) | 56 / 53 |  |
| lark-doc | 82% (60%–94%) | 72% (45%–89%) | 12% (3%–37%) | 0% (0%–39%) | 57 / 35 |  |
| mcp-builder | 100% (76%–100%) | 100% (76%–100%) | 0% (0%–26%) | 7% (1%–39%) | 35 / 35 |  |
| prototype | 46% (19%–76%) | 38% (14%–69%) | 0% (0%–35%) | 0% (0%–26%) | 25 / 29 |  |
| skill-creator | 22% (9%–43%) | 20% (8%–42%) | 0% (0%–28%) | 0% (0%–28%) | 51 / 53 |  |
| tdd | 56% (33%–77%) | 44% (23%–67%) | 0% (0%–32%) | 0% (0%–24%) | 43 / 48 |  |
| vercel-react-best-practices | 0% (0%–16%) | 10% (3%–30%) | 0% (0%–26%) | 0% (0%–30%) | 51 / 51 |  |
| web-design-guidelines | 12% (4%–32%) | 8% (2%–28%) | 0% (0%–32%) | 14% (4%–42%) | 49 / 57 |  |
| webapp-testing | 35% (18%–57%) | 40% (22%–61%) | 0% (0%–26%) | 0% (0%–30%) | 53 / 53 |  |
| xlsx | 37% (19%–58%) | 33% (17%–55%) | 0% (0%–30%) | 0% (0%–26%) | 52 / 57 |  |
| **All skills** | 39% (34%–45%) | 41% (35%–46%) | 3% (1%–6%) | 2% (1%–5%) | 835 / 850 |  |

## Recall by trigger clause

Clauses are the situations the skill's description says it should be used in. Near-miss negatives are tagged with the clause they imitate.

| Skill | Clause | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|
| agent-browser | AWS Bedrock AgentCore cloud browsers | 50% (22%–78%) | 0% (0%–56%) | 19 / 3 |
| agent-browser | Electron desktop app automation | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| agent-browser | Exploratory testing, dogfooding, QA | 29% (9%–63%) | 0% (0%–49%) | 17 / 4 |
| agent-browser | General website interaction and web automation | 62% (31%–86%) | 0% (0%–43%) | 18 / 5 |
| agent-browser | Slack tasks (unreads, send, search) | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| agent-browser | Vercel Sandbox microVM browser automation | 33% (11%–66%) | 0% (0%–66%) | 20 / 2 |
| deploy-to-vercel | Create a preview deployment | 25% (7%–59%) | 33% (9%–72%) | 20 / 9 |
| deploy-to-vercel | Deploy and give me the link | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| deploy-to-vercel | Deploy my app/website to Vercel | 92% (57%–99%) | 0% (0%–35%) | 17 / 7 |
| deploy-to-vercel | Push this live | 12% (2%–47%) | 0% (0%–49%) | 16 / 4 |
| design-mobile-apps | Design mobile app screens with Sleek | 92% (57%–99%) | 29% (8%–64%) | 17 / 11 |
| design-mobile-apps | Edit Sleek projects | 4% (0%–38%) | 0% (0%–39%) | 17 / 6 |
| design-mobile-apps | Implement Sleek designs in React Native or HTML | 0% (0%–32%) | 5% (0%–41%) | 16 / 9 |
| diagnosing-bugs | User explicitly asks to diagnose or debug | 79% (45%–95%) | 0% (0%–39%) | 18 / 6 |
| diagnosing-bugs | User reports something broken, throwing, or failing | 89% (56%–98%) | 0% (0%–32%) | 20 / 8 |
| diagnosing-bugs | User reports something slow or a performance regression | 12% (2%–47%) | 0% (0%–39%) | 16 / 6 |
| doc-coauthoring | Trigger on mentions of writing docs/drafting specs/similar documentation tasks | 88% (53%–98%) | 0% (0%–56%) | 16 / 3 |
| doc-coauthoring | Write decision docs / similar structured content | 79% (45%–95%) | 0% (0%–56%) | 18 / 3 |
| doc-coauthoring | Write documentation | 79% (45%–95%) | 0% (0%–39%) | 19 / 6 |
| doc-coauthoring | Write proposals | 96% (62%–100%) | 0% (0%–49%) | 17 / 4 |
| doc-coauthoring | Write technical specs | 83% (49%–96%) | 0% (0%–49%) | 17 / 4 |
| domain-modeling | Discussing codebase terminology | 54% (24%–81%) | 0% (0%–35%) | 19 / 7 |
| domain-modeling | Recording or editing an ADR | 0% (0%–32%) | 0% (0%–35%) | 16 / 7 |
| domain-modeling | Writing or editing GLOSSARY.md | 0% (0%–32%) | 0% (0%–39%) | 16 / 6 |
| find-skills | Explicit find-a-skill request | 96% (62%–100%) | 0% (0%–43%) | 17 / 5 |
| find-skills | How-do-I-do-X question | 12% (2%–47%) | 0% (0%–39%) | 16 / 6 |
| find-skills | Interest in extending capabilities | 33% (11%–66%) | 0% (0%–56%) | 19 / 3 |
| find-skills | Looking for installable functionality/tools/templates | 29% (9%–63%) | 0% (0%–39%) | 17 / 6 |
| frontend-design | Aesthetic direction and visual identity choices | 62% (31%–86%) | 0% (0%–49%) | 18 / 4 |
| frontend-design | Avoiding templated/default-looking design choices | 17% (4%–51%) | 0% (0%–49%) | 17 / 4 |
| frontend-design | Building new UI with distinctive visual design | 75% (41%–93%) | 0% (0%–49%) | 18 / 4 |
| frontend-design | Reshaping/redesigning an existing UI | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| frontend-design | Typography selection and type treatment | 21% (5%–55%) | 0% (0%–49%) | 17 / 4 |
| hyperframes | Animate video content | 12% (2%–47%) | 0% (0%–49%) | 16 / 4 |
| hyperframes | Edit an existing video | 29% (9%–63%) | 0% (0%–56%) | 18 / 3 |
| hyperframes | Make a new video | 88% (53%–98%) | 8% (1%–57%) | 18 / 6 |
| hyperframes | Render video to file | 33% (11%–66%) | 0% (0%–49%) | 17 / 4 |
| hyperframes | Specific video kinds (launch film, explainer, music video, chart, vertical clip, title card, caption, overlay) | 21% (5%–55%) | 0% (0%–43%) | 18 / 5 |
| lark-doc | 插入或下载图片附件素材 | 67% (34%–89%) | 0% (0%–43%) | 17 / 5 |
| lark-doc | 操作思维笔记 | 83% (49%–96%) | 0% (0%–56%) | 17 / 3 |
| lark-doc | 用户提供文档 URL/token 时(含 doubao.com /docx/ /wiki/) | 71% (37%–91%) | 0% (0%–56%) | 17 / 3 |
| lark-doc | 读取/创建/编辑飞书文档内容 | 92% (57%–99%) | 18% (5%–51%) | 17 / 13 |
| mcp-builder | Build MCP server in Node/TypeScript with MCP SDK | 100% (68%–100%) | 0% (0%–39%) | 16 / 6 |
| mcp-builder | Build MCP server in Python with FastMCP | 100% (68%–100%) | 11% (2%–51%) | 16 / 8 |
| mcp-builder | Build MCP server to integrate external API/service | 100% (68%–100%) | 0% (0%–32%) | 16 / 8 |
| prototype | Explore what a UI should look like | 33% (11%–66%) | 0% (0%–32%) | 18 / 8 |
| prototype | Sanity-check a state model or logic | 50% (22%–78%) | 0% (0%–28%) | 18 / 10 |
| skill-creator | Benchmark with variance analysis | 4% (0%–38%) | 0% (0%–49%) | 17 / 4 |
| skill-creator | Create skill from scratch | 79% (45%–95%) | 0% (0%–49%) | 17 / 4 |
| skill-creator | Edit/improve existing skill | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| skill-creator | Optimize skill description for triggering | 21% (5%–55%) | 0% (0%–49%) | 18 / 4 |
| skill-creator | Run evals to test a skill | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| tdd | Build features test-first | 67% (34%–89%) | 0% (0%–39%) | 17 / 6 |
| tdd | Fix bugs test-first | 46% (19%–76%) | 0% (0%–49%) | 19 / 4 |
| tdd | Red-green-refactor mentioned | 88% (53%–98%) | 0% (0%–49%) | 19 / 4 |
| tdd | Wants integration tests | 0% (0%–32%) | 0% (0%–39%) | 16 / 6 |
| vercel-react-best-practices | Implementing data fetching (client or server) | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| vercel-react-best-practices | Optimizing bundle size or load times | 12% (2%–47%) | 0% (0%–49%) | 16 / 4 |
| vercel-react-best-practices | Refactoring existing React/Next.js code | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| vercel-react-best-practices | Reviewing code for performance issues | 4% (0%–38%) | 0% (0%–49%) | 17 / 4 |
| vercel-react-best-practices | Writing React components or Next.js pages | 8% (1%–43%) | 0% (0%–43%) | 17 / 5 |
| web-design-guidelines | Audit design | 21% (5%–55%) | 42% (11%–80%) | 17 / 8 |
| web-design-guidelines | Check accessibility | 0% (0%–32%) | 0% (0%–43%) | 16 / 5 |
| web-design-guidelines | Check site against best practices | 29% (9%–63%) | 0% (0%–49%) | 17 / 4 |
| web-design-guidelines | Review UX | 0% (0%–32%) | 0% (0%–56%) | 16 / 3 |
| web-design-guidelines | Review my UI | 0% (0%–32%) | 0% (0%–49%) | 16 / 4 |
| webapp-testing | Capturing browser screenshots | 38% (14%–69%) | 0% (0%–49%) | 16 / 4 |
| webapp-testing | Debugging UI behavior | 29% (9%–63%) | 0% (0%–49%) | 17 / 4 |
| webapp-testing | Interacting with local web apps via Playwright | 58% (27%–84%) | 0% (0%–49%) | 17 / 4 |
| webapp-testing | Verifying frontend functionality | 25% (7%–59%) | 0% (0%–49%) | 20 / 4 |
| webapp-testing | Viewing browser logs | 38% (14%–69%) | 0% (0%–49%) | 16 / 4 |
| xlsx | Clean/restructure messy tabular data into spreadsheet | 4% (0%–38%) | 0% (0%–49%) | 17 / 4 |
| xlsx | Convert between tabular file formats | 38% (14%–69%) | 0% (0%–49%) | 20 / 4 |
| xlsx | Create new spreadsheet from scratch or data sources | 62% (31%–86%) | 0% (0%–49%) | 16 / 4 |
| xlsx | Open/edit/fix existing spreadsheet file | 50% (22%–78%) | 0% (0%–43%) | 18 / 5 |
| xlsx | Spreadsheet referenced by name/path casually | 21% (5%–55%) | 0% (0%–56%) | 18 / 3 |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### agent-browser
- `clause-1/q02` [should trigger] hits 0/2: 帮我登录 example.com 的后台,用户名 admin,然后把订单列表页的表格数据抓出来存成 orders.csv
- `clause-1/q04` [should trigger] hits 1/3: 用浏览器自动点一下我们官网的“立即购买”按钮,看看跳转到哪个页面
- `clause-1/q06` [should trigger] hits 0/2: 帮我对这个新做的 dashboard 做一轮探索性测试,看看有没有明显的 bug 或者体验问题
- `clause-1/q07` [should trigger] hits 0/2: do a QA pass on the checkout flow at localhost:5173, click through everything and note anything broken
- `clause-1/q08` [should trigger] hits 0/2: bug hunt 一下我们的 web app,评估一下整体质量,出个报告
- `clause-1/q09` [should trigger] hits 0/2: automate the VS Code desktop app: open the command palette and run 'Toggle Terminal'
- `clause-1/q10` [should trigger] hits 0/2: 帮我控制 Discord 桌面客户端,切换到第二个服务器并截个图
- `clause-1/q11` [should trigger] hits 0/2: I want to script the Notion desktop app to create a new page and type a title in it
- `clause-1/q12` [should trigger] hits 0/2: 用自动化的方式操作 Figma 桌面版,把当前画板的图层列表读出来
- `clause-1/q13` [should trigger] hits 0/2: check my slack unreads and summarize whatever's in #eng-alerts
- `clause-1/q14` [should trigger] hits 0/2: 帮我在 Slack 里给 #general 发一条消息:今晚 8 点发布,请大家注意
- `clause-1/q15` [should trigger] hits 0/2: search slack for conversations mentioning 'invoice 4821' from last week
- `clause-1/q16` [should trigger] hits 0/2: 看一下我 Slack 上有哪些未读的 DM,列个清单给我
- `clause-1/q17` [should trigger] hits 1/3: I need to run headless browser automation inside a Vercel Sandbox microVM, how do I set that up and run a page check?
- `clause-1/q19` [should trigger] hits 0/2: spin up a Vercel sandbox microVM and use a browser CLI in it to test my preview deployment
- `clause-1/q20` [should trigger] hits 1/3: 我的 Vercel 部署开了保护,怎么让浏览器自动化在沙箱里访问它?
- `clause-1/q23` [should trigger] hits 0/2: how do I connect browser automation to Bedrock AgentCore instead of a local Chrome?
- `clause-2/q01` [should trigger] hits 0/2: open https://news.ycombinator.com and grab the titles + links of the top 30 stories into hn.json
- `clause-2/q05` [should trigger] hits 1/3: can you dogfood our new checkout flow at localhost:3000 and write up every bug you hit
- `clause-2/q06` [should trigger] hits 0/2: 帮我对 localhost:5173 的后台管理系统做一轮探索性测试，找找有没有奇怪的bug，输出报告到 qa-report.md
- `clause-2/q07` [should trigger] hits 0/2: do a QA pass on our signup page, click around like a confused user and note anything that feels broken or janky
- `clause-2/q10` [should trigger] hits 0/2: automate the Discord desktop app - switch to the #general channel and screenshot the last few messages
- `clause-2/q11` [should trigger] hits 0/2: Figma 桌面客户端里帮我自动点开 'Design System' 文件然后导出第一个 frame
- `clause-2/q09` [should trigger] hits 0/2: 我想自动化操作本地的 VS Code 桌面版，帮我写个脚本打开命令面板并运行 'Format Document'
- `clause-2/q12` [should trigger] hits 0/2: need to script the Notion desktop app to create a new page called 'Weekly Notes' and paste in some text, how do i drive it
- `clause-2/q13` [should trigger] hits 0/2: check my slack unreads and give me a summary of what i missed
- `clause-2/q14` [should trigger] hits 0/2: 帮我在 slack 的 #dev-team 频道发一条消息：今晚部署推迟到明天上午
- `clause-2/q15` [should trigger] hits 0/2: search slack for any convo about the 'invoice-sync outage' last week and list who said what
- `clause-2/q16` [should trigger] hits 0/2: 看下 slack 里有没有人@我，有的话列出来是哪个频道的
- `clause-2/q18` [should trigger] hits 0/2: 在 Vercel Sandbox 里起一个 microVM，装好 chromium 然后跑个截图脚本，帮我写 sandbox.ts
- `clause-2/q19` [should trigger] hits 1/3: my preview deploy is behind Vercel protection, how can the headless browser inside the sandbox get past it to test the page
- `clause-2/q20` [should trigger] hits 0/2: 用 vercel sandbox 跑浏览器自动化，每次任务开一个新 microVM，跑完就销毁，怎么搭
- `clause-2/q22` [should trigger] hits 0/2: 怎么把浏览器自动化接到 AWS Bedrock AgentCore 的云浏览器上？我有 us-east-1 的权限
- `clause-2/q24` [should trigger] hits 0/2: 用 Bedrock AgentCore 的 browser tool 打开我们的后台页面并截图，帮我写 python 脚本调起会话
- Stolen by: {"claude-api": 1}

### deploy-to-vercel
- `clause-1/q05` [should trigger] hits 0/2: deploy this and give me the link when it's done
- `clause-1/q06` [should trigger] hits 0/2: 部署一下然后把链接发我
- `clause-1/q07` [should trigger] hits 0/2: i need a shareable url for this vite app, deploy it and send me the link
- `clause-1/q08` [should trigger] hits 0/2: 部署完给我个能访问的地址,我发给客户看看
- `clause-1/q09` [should trigger] hits 0/2: ok looks good, push this live
- `clause-1/q10` [should trigger] hits 0/2: 好了,直接上线吧
- `clause-1/q11` [should trigger] hits 0/2: psuh this live so my teammates can see it, the landing page is finished
- `clause-1/q12` [should trigger] hits 0/2: 把这个项目发布上线,现在就要能在公网访问
- `clause-1/q13` [should trigger] hits 0/2: create a preview deployment for my current branch
- `clause-1/q14` [should trigger] hits 0/2: 帮我建一个预览部署,我想先看看效果再决定上不上生产
- `clause-1/q16` [should trigger] hits 0/2: 我想出个 preview 版本给产品经理确认,别动生产环境
- `clause-1/q26` [should not trigger] hits 2/3: 帮我配置 Vercel 的环境变量,preview 环境和 production 环境用不同的数据库地址
- `clause-2/q04` [should trigger] hits 1/3: can u deploy this astro blog to vercel? never used it before
- `clause-2/q05` [should trigger] hits 0/2: 部署一下,完事把链接发我
- `clause-2/q06` [should trigger] hits 0/2: deploy this and send me the link so I can show my cofounder
- `clause-2/q07` [should trigger] hits 0/2: 帮我部署这个 demo,要一个能直接打开的网址给客户看
- `clause-2/q08` [should trigger] hits 0/2: ship it and gimme the url pls
- `clause-2/q09` [should trigger] hits 0/2: ok looks good, push this live
- `clause-2/q10` [should trigger] hits 0/2: 把这个站点上线吧,我想让别人能访问
- `clause-2/q12` [should trigger] hits 0/2: 项目搞完了,直接上线
- `clause-2/q13` [should trigger] hits 1/3: create a preview deployment for this branch so QA can look at it
- `clause-2/q15` [should trigger] hits 1/3: need a preview deploy of my feature branch w/o touching prod
- `clause-2/q16` [should trigger] hits 0/2: 给这个 PR 生成一个预览链接部署,我想在手机上看看效果
- `clause-2/q26` [should not trigger] hits 3/3: roll back production on vercel to the previous deployment, last release broke checkout

### design-mobile-apps
- `clause-1/q05` [should trigger] hits 0/2: 在我之前的 Sleek 项目里把底部导航栏换成圆角悬浮样式，其他页面不要动
- `clause-1/q06` [should trigger] hits 0/2: open my sleek project for the recipe app and change the home screen cards to a 2-column grid
- `clause-1/q07` [should trigger] hits 0/2: Sleek 里那个健身 app 项目的主色调改成深蓝，再重新出一下截图
- `clause-1/q08` [should trigger] hits 0/2: the settings screen in my sleek project looks cramped, add more spacing and a toggle for notifications pls
- `clause-1/q09` [should trigger] hits 0/2: 把 Sleek 上设计好的登录页用 React Native 实现出来，放到 src/screens/Login.tsx
- `clause-1/q11` [should trigger] hits 0/2: 把 sleek 项目里的首页导出成 HTML，我要放到 index.html 里预览
- `clause-1/q10` [should trigger] hits 0/2: pull the latest version of my Sleek design and build it out in Expo, make the tab navigation actually work
- `clause-1/q12` [should trigger] hits 0/2: turn the screens from my sleek project into plain html/css pages, keep the layout pixel-close
- `clause-1/q14` [should not trigger] hits 3/3: 帮我在 Figma 里画一个电商 App 的商品详情页
- `clause-2/q02` [should trigger] hits 1/3: use sleek to mock up onboarding screens for a meditation app, 3 screens, calm purple/blue vibe. show me screenshots when done
- `clause-2/q05` [should trigger] hits 0/2: 我 sleek 里那个旅行app的项目，把详情页的主按钮改成圆角胶囊的橙色，再加一个收藏图标
- `clause-2/q06` [should trigger] hits 1/3: in my existing sleek project (id V1StGXR8Z5j) change the tab bar to 4 tabs and drop the settings screen
- `clause-2/q07` [should trigger] hits 0/2: sleek项目里的设置页太挤了，帮我调下间距，字号大一点，然后把旧的测试项目删掉
- `clause-2/q08` [should trigger] hits 0/2: my sleek run seems stuck on the checkout screen revision, cancel it and retry with 'make the pay button sticky at bottom'
- `clause-2/q09` [should trigger] hits 0/2: 把 sleek 上做好的那个天气app设计用 React Native (expo) 实现出来，放到 src/screens 下面
- `clause-2/q10` [should trigger] hits 0/2: pull the latest version of my sleek design and turn the home screen into plain html+css, single file index.html is fine
- `clause-2/q11` [should trigger] hits 0/2: sleek 里的登录页设计已经好了，帮我在 RN 里还原，按钮要能点、表单要有校验，别只是静态的
- `clause-2/q12` [should trigger] hits 0/2: implement this sleek project as an expo app, then compare your render vs the sleek screenshot and fix any spacing diffs
- `clause-2/q13` [should not trigger] hits 3/3: 帮我用 Figma 设计一个电商app的商品详情页，要有组件库和 auto layout
- `clause-2/q22` [should not trigger] hits 1/3: 写个 Flutter 的底部导航栏组件，有四个tab，选中态带动画

### diagnosing-bugs
- `clause-1/q01` [should trigger] hits 0/2: diagnose why the nightly export job keeps producing duplicate rows
- `clause-1/q09` [should trigger] hits 1/3: the dashboard got way slower after we upgraded to React 19, initial load went from 1s to like 6s
- `clause-1/q11` [should trigger] hits 0/2: our API p95 latency doubled since the last release, no idea why. can you figure out what regressed?
- `clause-1/q12` [should trigger] hits 0/2: build_index.py 越跑越慢,处理10万条要20分钟,之前才3分钟
- `clause-1/q13` [should trigger] hits 0/2: app is super laggy when scrolling the feed list on android, used to be smooth, whats going on
- `clause-2/q09` [should trigger] hits 0/2: 我们的报表页面加载越来越慢了,上个版本大概2秒,现在要15秒左右,是 report_query.sql 那块吗
- `clause-2/q10` [should trigger] hits 0/2: ci pipeline went from 6 min to 25 min since last week, nothing obvious changed in the workflow file. why
- `clause-2/q11` [should trigger] hits 0/2: 这个 Python 脚本处理 10 万行 CSV 要跑快 40 分钟,之前才几分钟,内存也涨得厉害
- `clause-2/q12` [should trigger] hits 0/2: app feels laggy lately, scrolling the feed in FeedList.tsx drops frames badly on my phone, worse than v2.3

### doc-coauthoring
- `clause-1/q14` [should trigger] hits 0/2: 写一份决策文档,讨论我们是自建监控还是买Datadog,我有很多讨论记录
- `clause-2/q02` [should trigger] hits 1/3: need to write the onboarding docs for new backend hires, covers local setup, repo layout, deploy process. can we start?
- `clause-2/q03` [should trigger] hits 1/3: 帮我给 payments-sdk 写一份开发者文档,面向第三方接入方,我先把背景都倒给你
- `clause-2/q12` [should trigger] hits 0/2: can you help me spec out the webhook retry behavior? want a proper RFC-style technical spec w/ edge cases
- `clause-2/q19` [should trigger] hits 0/2: 帮我 write up 一下上季度的架构演进,整理成一份文档给新同事看

### domain-modeling
- `clause-1/q01` [should trigger] hits 1/3: 我们代码里 'account' 到底指 Customer 还是 User？感觉大家用得很乱，帮我理一下该叫什么
- `clause-1/q02` [should trigger] hits 1/3: in our repo 'cancellation' sometimes means whole order and sometimes just a line item. can we pin down what to call each?
- `clause-1/q05` [should trigger] hits 0/2: 帮我在 GLOSSARY.md 里加一个词条：'Refund' 指已完成的资金退回，不包括 chargeback
- `clause-1/q06` [should trigger] hits 0/2: add 'Backorder' to GLOSSARY.md, we just agreed it means an order line with no stock at placement time
- `clause-1/q07` [should trigger] hits 0/2: GLOSSARY.md 里 Customer 的定义过时了，现在 guest checkout 也算，改一下
- `clause-1/q08` [should trigger] hits 0/2: create a GLOSSARY.md for this repo, start with Order, Invoice and Ledger entry
- `clause-1/q09` [should trigger] hits 0/2: 我们决定订单用 event sourcing，帮我记一条 ADR 放到 docs/adr 里
- `clause-1/q10` [should trigger] hits 0/2: write an ADR for choosing postgres over dynamo for the write model, we weighed both for a week
- `clause-1/q11` [should trigger] hits 0/2: docs/adr/0002-postgres-for-write-model.md 要改一下，状态改成 superseded，补充新的原因
- `clause-1/q12` [should trigger] hits 0/2: can you update adr 0001 to mention we later dropped the snapshot idea and why
- `clause-2/q02` [should trigger] hits 0/2: in our repo 'order' and 'booking' seem to be used interchangeably, are they the same thing? i want to pick one canonical word before we keep building
- `clause-2/q03` [should trigger] hits 0/2: 我说的“取消”其实是部分取消，但你看看代码是不是只支持整单取消？帮我对一下术语和实现是否一致
- `clause-2/q05` [should trigger] hits 0/2: 把 'Shipment' 这个词的定义加到 GLOSSARY.md 里，就是一次发货包含多个包裹那种
- `clause-2/q06` [should trigger] hits 0/2: update GLOSSARY.md, we decided 'Tenant' replaces 'Organization' everywhere. fix the entry pls
- `clause-2/q07` [should trigger] hits 0/2: 项目根目录还没有 GLOSSARY.md，你根据我们刚定下来的 Invoice / Receipt 区别新建一个
- `clause-2/q08` [should trigger] hits 0/2: src/billing/GLOSSARY.md 里 'Refund' 的写法太像实现细节了，帮我改成纯业务定义
- `clause-2/q09` [should trigger] hits 0/2: 我们决定写操作用 Postgres 而不是 DynamoDB，权衡过了，帮我在 docs/adr 里记一条 ADR
- `clause-2/q10` [should trigger] hits 0/2: write up an adr for why we went event-sourced for orders. hard to undo and new ppl keep asking why
- `clause-2/q11` [should trigger] hits 0/2: docs/adr/0002-postgres-for-write-model.md 要改一下，后来我们加了读副本，状态也应该改成 superseded 之类的
- `clause-2/q12` [should trigger] hits 0/2: can you amend adr 0001, the alternatives section is missing the CRUD option we rejected

### find-skills
- `clause-1/q02` [should trigger] hits 0/2: 怎么才能自动生成 changelog?每次发版手写太烦了
- `clause-1/q04` [should trigger] hits 0/2: docker 镜像体积太大了,有什么现成的办法能帮我优化吗?
- `clause-1/q03` [should trigger] hits 0/2: how do i get better at reviewing PRs with you, is there a standard workflow for that
- `clause-1/q10` [should trigger] hits 0/2: 能不能让你变得更强?我想给你装点扩展能力
- `clause-1/q11` [should trigger] hits 1/3: what's the best way to give you new abilities for frontend design work
- `clause-1/q12` [should trigger] hits 0/2: 我想扩展一下 agent 的能力,有什么推荐的包吗
- `clause-1/q13` [should trigger] hits 1/3: any templates or ready-made workflows for CI/CD pipelines I can plug in? searching for tools
- `clause-1/q14` [should trigger] hits 0/2: 我想找一些做 UI 设计系统的模板和工作流工具
- `clause-2/q02` [should trigger] hits 0/2: 怎么给我的 Next.js 项目做 e2e 测试啊?有没有现成的做法
- `clause-2/q01` [should trigger] hits 0/2: how do i generate a changelog from my git commits automatically? doing it by hand every release is killing me
- `clause-2/q04` [should trigger] hits 0/2: 我想把项目的 API 文档自动生成出来,一般都怎么搞?
- `clause-2/q03` [should trigger] hits 0/2: how do I get better PR reviews on my team's repo? any standard workflow for this
- `clause-2/q11` [should trigger] hits 0/2: how can i make claude code more powerful for devops work? want to add new capabilities
- `clause-2/q12` [should trigger] hits 0/2: 想给 agent 加点新本事,尤其是 accessibility 检查这块,有什么办法
- `clause-2/q13` [should trigger] hits 0/2: looking for a good README template or workflow I can just install and reuse across repos
- `clause-2/q14` [should trigger] hits 0/2: 有没有现成的 CI/CD 工作流模板可以直接装来用?
- `clause-2/q15` [should trigger] hits 0/2: need a ready-made tool for design system tokens, anything installable out there?
- `clause-2/q16` [should trigger] hits 0/2: 想找个能自动化 git 工作流的工具或者模板,最好能一键装上

### frontend-design
- `clause-1/q05` [should trigger] hits 0/2: my pricing page in pricing.html looks so bland, can you redesign it so it has some personality
- `clause-1/q06` [should trigger] hits 0/2: 把 src/components/Header.vue 和整个首页的视觉风格重新做一遍，现在太普通了
- `clause-1/q07` [should trigger] hits 0/2: revamp the look of our settings screen, same functionality but it should feel way more intentional
- `clause-1/q08` [should trigger] hits 0/2: 现有的登录页视觉上很无聊，帮我整体改版，换个风格
- `clause-1/q09` [should trigger] hits 1/3: I have no idea what visual direction to take for my meditation app site, can you propose a look and feel and then build it
- `clause-1/q14` [should trigger] hits 0/2: 帮我给这个作品集页面挑字体搭配，标题要有设计感，设一套字号层级
- `clause-1/q15` [should trigger] hits 0/2: set up a type scale and font pairing for the hero section in index.css, body text should be comfy to read
- `clause-1/q16` [should trigger] hits 0/2: 正文行宽和行高感觉不对，衬线字体的文章页怎么排版才好看？直接改 article.css
- `clause-1/q17` [should trigger] hits 1/3: my generated site looks like every AI page, cream background and terracotta accent. make it feel less templated
- `clause-1/q18` [should trigger] hits 0/2: 这个页面一看就是AI生成的，卡片都一个样，还有一堆全大写小标签，帮我去掉这种味道
- `clause-1/q19` [should trigger] hits 0/2: everything on my site is identical rounded cards with soft shadows and 01/02/03 numbering. fix the generic look
- `clause-1/q20` [should trigger] hits 0/2: 首页动画每个板块都是淡入上滑，感觉很廉价，帮我换成更有设计意图的动效
- `clause-2/q03` [should trigger] hits 0/2: 做个给8到11岁女孩用的拼豆手工小程序首页,界面要有设计感,要贴合小朋友的世界,用 React 写
- `clause-2/q04` [should trigger] hits 1/3: need a dashboard for a marine biology lab tracking whale tagging data. new project, want it to look designed not like another admin panel. vue is ok
- `clause-2/q05` [should trigger] hits 0/2: 现在这个 pricing.html 太丑了,帮我整个重新设计一下视觉,结构可以大改,内容不变
- `clause-2/q06` [should trigger] hits 0/2: revamp the look of our settings page in src/pages/Settings.tsx, it feels dated. keep the features, change how it looks and is laid out
- `clause-2/q07` [should trigger] hits 0/2: 我们的 landing 首页 hero 区域想整体翻新,现在是左文右图的老样子,帮我重做成更有记忆点的版本
- `clause-2/q08` [should trigger] hits 0/2: can you give the old admin login screen a full visual refresh? current css is in login.css, nothing is sacred
- `clause-2/q09` [should trigger] hits 0/2: 我在做一个独立游戏的宣传站,还没想好整体什么调性,你帮我定一个视觉方向,配色和氛围先给方案
- `clause-2/q11` [should trigger] hits 0/2: 帮我给这个手作皮具品牌的网站定视觉识别,是偏复古工匠风还是现代极简?说说你的判断并给出色板
- `clause-2/q13` [should trigger] hits 0/2: 这个博客的字体选啥好?正文是长文章,标题想有点个性,帮我挑两个字体搭配并定字号层级
- `clause-2/q15` [should trigger] hits 0/2: 标题字想做成页面的主视觉,字重、字距、宽度这些帮我调出气势,文件是 hero.css
- `clause-2/q16` [should trigger] hits 0/2: my type scale feels random, h1 h2 h3 p all kinda same. can u set up a proper scale and weights in tokens.css
- `clause-2/q18` [should trigger] hits 0/2: everything i generate ends up as identical rounded cards with soft grey shadows and a gradient blob. how do i make this look less like a template? app is in components/Features.jsx
- `clause-2/q19` [should trigger] hits 0/2: 别再给我每个标题上面加一行大写小标签,还有 01 02 03 编号,这些一看就是模板味,帮我把 About 区块改得更像人设计的
- `clause-2/q20` [should trigger] hits 0/2: review my page for generic AI design tells (near-black bg + acid green accent, arrows on every button, fade-up on every section) and swap them for deliberate choices

### hyperframes
- `clause-1/q02` [should trigger] hits 1/3: make me a 20s video from this landing page, hyperframes init a new project and build the scenes
- `clause-1/q05` [should trigger] hits 0/2: compositions/intro.html 里的标题再晚 0.5 秒出现,另外把 index.html 的总时长改成 24 秒
- `clause-1/q07` [should trigger] hits 0/2: 第二个场景太长了,砍掉最后两秒,然后检查一下有没有 lint 报错
- `clause-1/q08` [should trigger] hits 0/2: the person edited my video in the studio, pls continue from where they left off and add one more scene at the end
- `clause-1/q09` [should trigger] hits 0/2: 给这个标题加一个逐字弹出的动画,用 GSAP timeline 做,别用 CSS transition
- `clause-1/q10` [should trigger] hits 0/2: animate the bars in my chart scene so they grow in one by one w/ a stagger, then hold for 2s
- `clause-1/q11` [should trigger] hits 0/2: 场景之间加个转场,从左边推进过来,要在 timeline 上精确到帧
- `clause-1/q12` [should trigger] hits 0/2: make the logo punch in with a little overshoot at 3s and fade the subtitle after it
- `clause-1/q13` [should trigger] hits 0/2: 预览没问题了,帮我渲染成 mp4 导出吧
- `clause-1/q14` [should trigger] hits 0/2: render the final video now, i approved the preview. output to out/launch.mp4
- `clause-1/q15` [should trigger] hits 0/2: 我要导出视频文件,直接跑渲染,不用再问我了
- `clause-1/q17` [should trigger] hits 1/3: 做一个竖屏 9:16 的抖音短视频,展示三个产品功能,带字幕
- `clause-1/q18` [should trigger] hits 1/3: make a music video for my track assets/song.mp3, lyrics should pop in sync w/ the beat
- `clause-1/q19` [should trigger] hits 0/2: 做个数据可视化视频,把 sales.csv 里的季度营收做成动态柱状图
- `clause-1/q20` [should trigger] hits 0/2: add lower-third overlays and word-by-word captions on top of my talking-head footage interview.mp4
- `clause-2/q06` [should trigger] hits 0/2: in compositions/intro.html the logo shows up too late, make the scene 2s shorter and shift everything after it
- `clause-2/q07` [should trigger] hits 0/2: 我在预览里改了几处颜色，你接着帮我把结尾那段的背景音乐换成 assets/calm.mp3
- `clause-2/q09` [should trigger] hits 0/2: 让这个HTML里的logo从左边滑进来，然后轻轻弹一下停住，用gsap时间轴做
- `clause-2/q11` [should trigger] hits 0/2: 场景之间加个转场，最好是那种墨水扩散的效果，看看 registry 里有没有现成的
- `clause-2/q12` [should trigger] hits 0/2: animate the numbers counting up from 0 to 12,400 over 3 seconds in my video scene, no Math.random pls
- `clause-2/q13` [should trigger] hits 0/2: 预览我看过了没问题，直接渲染成 mp4 吧
- `clause-2/q14` [should trigger] hits 0/2: render the final video to out/final.mp4, I'm done reviewing, no more questions
- `clause-2/q18` [should trigger] hits 0/2: make a 9:16 vertical clip for tiktok from my 3 product shots, punchy
- `clause-2/q19` [should trigger] hits 0/2: 给这段访谈口播视频加上逐字字幕，字幕放底部，黄色高亮当前词
- `clause-2/q20` [should trigger] hits 0/2: build an animated bar chart race video from data/sales.csv, 2019-2024
- `clause-2/q21` [should not trigger] hits 1/3: 帮我做一套 PPT 幻灯片，10页，讲季度复盘，要能导出 pptx
- Stolen by: {"dataviz": 1}

### lark-doc
- `clause-1/q02` [should trigger] hits 1/3: create a new feishu doc called 'Q3 weekly report' and write the contents of report.md into it
- `clause-1/q08` [should trigger] hits 1/3: upload screenshot.jpg into the lark doc doxcnShot55 so it shows up at the bottom
- `clause-1/q13` [should trigger] hits 0/2: https://team.doubao.com/docx/AbCdEf123 这个里面写了啥?
- `clause-1/q17` [should not trigger] hits 3/3: 帮我给这个文档加条评论,@张三 看一下 https://x.feishu.cn/docx/doxcnCm1
- `clause-2/q07` [should trigger] hits 0/2: 文档里那个 pdf 附件帮我下载下来,存到 D:\downloads
- `clause-2/q08` [should trigger] hits 0/2: can you preview the screenshot attached in the doc comments? want to see what it shows
- `clause-2/q12` [should trigger] hits 0/2: mindnote 里把 'backlog' 这个节点挪到 'Q4' 下面,再改个名叫 'Q4 backlog'
- `clause-2/q14` [should trigger] hits 0/2: look at https://www.doubao.com/docx/Zk39fLmQ and tell me the todo items in it
- `clause-2/q19` [should not trigger] hits 2/3: 给飞书文档第三段加一条评论,@张三 让他确认下
- Stolen by: {"lark-drive": 3, "lark-shared": 2}

### mcp-builder
- `clause-2/q18` [should not trigger] hits 2/3: write a python MCP client that connects to a server over stdio and calls the list_tools method
- Stolen by: {"claude-api": 2}

### prototype
- `clause-1/q01` [should trigger] hits 0/2: I've got an order lifecycle (pending → paid → shipped → refunded) in orders/state.ts and I'm not sure the transitions make sense. can you mock something up so I can click through weird cases like refund after partial ship?
- `clause-1/q04` [should trigger] hits 0/2: 帮我随手搭个一次性的东西,把审批流的状态流转跑一遍,看看有没有死状态或者绕不出去的情况,不用写正式代码
- `clause-1/q05` [should trigger] hits 0/2: not sure what the settings page in app/settings/page.tsx should look like. can you throw together a few totally different layouts I can flip between?
- `clause-1/q06` [should trigger] hits 1/3: dashboard 首页我还没想好长什么样,先做几个风格差别很大的版本让我对比一下看看哪个顺眼
- `clause-2/q03` [should trigger] hits 0/2: 购物车的优惠券叠加规则我老觉得哪里不对，写个临时的小东西把各种组合都跑一遍，让我直观看看逻辑对不对
- `clause-2/q04` [should trigger] hits 1/3: quick proto pls: i want to poke at the retry/backoff state logic in src/queue/worker.ts before i commit to it. does the model even hold up when a job fails mid-retry? dont need tests just something to play with
- `clause-2/q05` [should trigger] hits 0/2: 我们的设置页现在很丑，帮我出几个完全不同风格的设计方案，在同一个页面上能切换着对比看看
- `clause-2/q06` [should trigger] hits 0/2: not sure what the dashboard should look like. can you mock up like 3 different layouts in app/dashboard/page.tsx so i can flip between them and pick one
- `clause-2/q07` [should trigger] hits 1/3: 想看看用户资料卡片到底长什么样好，随便做几版不一样的出来我挑挑，不用太精致
- `clause-2/q08` [should trigger] hits 0/2: i need to figure out how the onboarding flow should look, give me a few wildly different takes i can toggle between with a url param, nothing production ready

### skill-creator
- `clause-1/q03` [should trigger] hits 1/3: turn what we just did into a skill pls, the whole git-bisect-then-write-regression-test routine
- `clause-1/q05` [should trigger] hits 0/2: my skills/pdf-extract/SKILL.md keeps ignoring tables, can you rewrite the instructions so it handles them better?
- `clause-1/q06` [should trigger] hits 0/2: 帮我改一下 skills/commit-helper/SKILL.md,现在太啰嗦了,精简一下并且加上 conventional commits 的说明
- `clause-1/q07` [should trigger] hits 0/2: the skill I wrote last week works but is kinda mediocre. iterate on it with me and make it better
- `clause-1/q08` [should trigger] hits 0/2: 我这个 skill 有个 bug,生成的报告老是漏掉结论部分,帮我优化下 skill 的写法
- `clause-1/q09` [should trigger] hits 0/2: can you run some test prompts against my docx-report skill and show me how it does vs no skill?
- `clause-1/q10` [should trigger] hits 0/2: 给我的 skill 写几个 eval 用例,然后跑一遍看看输出对不对
- `clause-1/q11` [should trigger] hits 0/2: set up evals/evals.json for my sql-formatter skill and add assertions
- `clause-1/q12` [should trigger] hits 0/2: 想测试一下我的 skill 到底有没有用,帮我跑评测并打开结果查看页面
- `clause-1/q13` [should trigger] hits 0/2: benchmark my skill across like 5 runs each and tell me the mean and stddev of pass rate, with and without the skill
- `clause-1/q14` [should trigger] hits 0/2: 对我的 skill 做个基准测试,多跑几次看看方差大不大,是不是结果不稳定
- `clause-1/q15` [should trigger] hits 0/2: compare token usage and time for old version vs new version of my skill, aggregate into a benchmark table
- `clause-1/q16` [should trigger] hits 0/2: 我的 skill 评测结果波动很大,帮我分析一下哪些用例是 flaky 的,出个 benchmark 汇总
- `clause-1/q17` [should trigger] hits 0/2: my skill never seems to get picked up by claude, can you tune the description so it triggers more reliably?
- `clause-1/q18` [should trigger] hits 0/2: 帮我优化 skill 的 description,现在触发率很低,想做个触发准确率测试
- `clause-1/q19` [should trigger] hits 0/2: run the description optimizer on skills/xlsx-cleaner, it fires on csv stuff when it shouldn't
- `clause-1/q20` [should trigger] hits 1/3: 写几条 should-trigger 和 should-not-trigger 的 query 来测我 skill 的 description 准不准
- `clause-2/q02` [should trigger] hits 0/2: turn what we just did into a skill — the whole flow of pulling the csv, cleaning columns and exporting to xlsx. start a new one called csv-cleaner
- `clause-2/q05` [should trigger] hits 0/2: 我的 pdf-fill skill 老是漏掉表单里的复选框，帮我改一下 skills/pdf-fill/SKILL.md 让它处理这种情况
- `clause-2/q06` [should trigger] hits 0/2: can you tighten up my deploy-helper skill? SKILL.md is like 700 lines and the model keeps ignoring the bottom half, split into references/
- `clause-2/q07` [should trigger] hits 0/2: 上次用户反馈说 changelog skill 输出格式太啰嗦，根据反馈把它重写一版，别太多 MUST 那种硬规则
- `clause-2/q08` [should trigger] hits 0/2: update my code-review skill so it also checks for missing tests, keep the rest as is
- `clause-2/q09` [should trigger] hits 0/2: 我写好了 resume-parser 这个 skill，帮我造 3 个测试 prompt 跑一下，看看带 skill 和不带 skill 输出差多少
- `clause-2/q10` [should trigger] hits 0/2: run the evals for my sql-lint skill and open the viewer so i can leave feedback on each output
- `clause-2/q11` [should trigger] hits 0/2: 帮我给 evals/evals.json 里的用例加断言，然后对 xlsx-report 这个 skill 跑一轮评测并打分
- `clause-2/q12` [should trigger] hits 0/2: test my new skill on a few realistic prompts and compare against the old version before i ship it
- `clause-2/q13` [should trigger] hits 0/2: 把 iteration-2 的结果聚合成 benchmark，我要看 pass rate 的均值和标准差，还有 token 和耗时对比
- `clause-2/q14` [should trigger] hits 0/2: each eval ran 3 times for my skill, which assertions are flaky or non-discriminating? do an analyst pass on the benchmark.json
- `clause-2/q15` [should trigger] hits 0/2: 对比 with_skill 和 baseline 的稳定性，多跑几次看方差，别只看一次结果
- `clause-2/q16` [should trigger] hits 1/3: benchmark my skill's performance — need pass_rate delta vs without_skill plus time/token tradeoff in a table
- `clause-2/q17` [should trigger] hits 0/2: 我这个 skill 老是不被触发，帮我优化一下 description，让它触发更准
- `clause-2/q19` [should trigger] hits 0/2: 帮我造一批 should-trigger 和 should-not-trigger 的查询，测一下 frontmatter 里 description 的触发率
- `clause-2/q20` [should trigger] hits 1/3: my skill's description is too vague, claude never picks it. make it pushier and test whether it fires on the right prompts

### tdd
- `clause-1/q01` [should trigger] hits 0/2: I need to add a coupon code feature to the cart. Let's do it test-first, write the failing test before any implementation.
- `clause-1/q03` [should trigger] hits 1/3: want to add pagination to src/api/orders.ts, tests first pls, one test at a time
- `clause-1/q04` [should trigger] hits 0/2: 新增一个导出CSV的功能,我想先写失败的测试,然后再写最小实现让它通过
- `clause-1/q05` [should trigger] hits 0/2: login keeps returning 500 when email has uppercase letters. reproduce it with a failing test first, then fix
- `clause-1/q13` [should trigger] hits 0/2: write integration tests for the checkout flow covering cart, payment and order creation
- `clause-1/q14` [should trigger] hits 0/2: 帮我给订单服务写集成测试,要覆盖下单到扣库存的整个流程
- `clause-1/q15` [should trigger] hits 0/2: we have no integration tests for the auth module, can you add some that go through the public API?
- `clause-1/q16` [should trigger] hits 0/2: 给 /api/users 这几个接口补一套集成测试,别 mock 内部模块
- `clause-2/q05` [should trigger] hits 0/2: users report parseDate() returns Invalid Date for '2024-02-30'. write a failing test that reproduces it first, then fix it
- `clause-2/q07` [should trigger] hits 1/3: login crashes when email has uppercase letters. fix it TDD style - repro test then patch
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
- `clause-1/q12` [should trigger] hits 1/3: audit my React app for performance anti-patterns, start with src/components/
- `clause-1/q13` [should trigger] hits 0/2: 把 UserList.jsx 重构一下,现在每次父组件更新都整个重渲染,组件里还嵌套定义了子组件
- `clause-1/q14` [should trigger] hits 0/2: refactor this class-heavy Next.js pages router code to be cleaner and faster, files in pages/ and components/
- `clause-1/q15` [should trigger] hits 0/2: 重构下 hooks/useSearch.ts,useEffect 里在同步 derived state,想改成更合理的写法
- `clause-1/q16` [should trigger] hits 0/2: clean up my React form component, it has like 6 useState and effects that depend on objects, refactor pls
- `clause-1/q17` [should trigger] hits 0/2: 我们 Next.js 项目首屏 JS 太大了,lucide-react 和 lodash 都是整包引入,帮忙优化 bundle
- `clause-1/q19` [should trigger] hits 0/2: 页面加载太慢,Google Analytics 和 Sentry 能不能延后到 hydration 之后再加载?
- `clause-1/q20` [should trigger] hits 0/2: my next build shows a 900kb first-load bundle for /home, help me cut it down
- `clause-2/q01` [should trigger] hits 0/2: 帮我写一个 Next.js 的商品详情页 app/products/[id]/page.tsx,要有图片轮播、价格、加入购物车按钮,用 App Router
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
- `clause-2/q17` [should trigger] hits 0/2: 我们 next 项目首屏 JS 有 1.2MB,帮我想办法把 bundle 体积降下来
- `clause-2/q18` [should trigger] hits 0/2: lighthouse says LCP is 4.5s on our landing page, how do i cut load time? mostly heavy chart libs and analytics scripts
- `clause-2/q19` [should trigger] hits 0/2: lodash 和 moment 好像把包撑得很大,帮我换成按需引入或者更轻的方案
- `clause-2/q20` [should trigger] hits 0/2: how do i code-split the admin panel so regular users dont download it? using next/dynamic maybe
- Stolen by: {"code-review": 1}

### web-design-guidelines
- `clause-1/q01` [should trigger] hits 0/2: review my UI in src/components/Navbar.tsx
- `clause-1/q02` [should trigger] hits 0/2: 帮我 review 一下 app/page.tsx 的界面代码,看看有没有问题
- `clause-1/q03` [should trigger] hits 0/2: can you look over my signup form component and tell me what's off with the UI? components/SignupForm.jsx
- `clause-1/q04` [should trigger] hits 0/2: 看下我这个 Dashboard.vue 的 UI 写得规不规范
- `clause-1/q05` [should trigger] hits 0/2: check accessibility on src/components/Modal.tsx
- `clause-1/q06` [should trigger] hits 0/2: 帮我检查一下 pages/index.html 的无障碍问题,比如 aria 和 label 有没有漏
- `clause-1/q07` [should trigger] hits 0/2: is my dropdown menu accessible? keyboard nav, focus states etc. in ui/Dropdown.tsx
- `clause-1/q08` [should trigger] hits 0/2: a11y 检查下 components/ 目录下所有的按钮和表单
- `clause-1/q09` [should trigger] hits 0/2: audit design of my landing page, files are in src/landing/*.tsx
- `clause-1/q10` [should trigger] hits 0/2: 帮我审计一下这个项目的设计实现,styles/ 和 components/ 下面的都看看
- `clause-1/q11` [should trigger] hits 0/2: do a design audit on pricing.html and its css, I want to know where it breaks interface conventions
- `clause-1/q13` [should trigger] hits 0/2: review UX of the onboarding flow in src/onboarding/Step1.tsx and Step2.tsx
- `clause-1/q12` [should trigger] hits 0/2: 设计审查一下 CheckoutPage.jsx,看有没有不符合界面规范的地方
- `clause-1/q15` [should trigger] hits 0/2: how's the UX of my login form? loading states, error messages, autofocus... LoginForm.vue
- `clause-1/q14` [should trigger] hits 0/2: 帮我 review 下这个设置页的 UX,代码在 SettingsPanel.tsx
- `clause-1/q16` [should trigger] hits 0/2: 用户体验方面帮我过一遍 components/Cart.tsx,有问题直接指出来
- `clause-1/q17` [should trigger] hits 0/2: check my site against best practices, code is in the web/ folder
- `clause-1/q18` [should trigger] hits 1/3: 帮我对照 web 最佳实践检查一下我的网站代码 src/app/layout.tsx
- `clause-1/q19` [should trigger] hits 0/2: does my site follow web interface best practices? look at index.html and main.css
- `clause-1/q20` [should trigger] hits 0/2: 我的个人网站有没有违反什么 best practice?文件在 site/ 目录,帮我扫一遍
- `clause-1/q24` [should not trigger] hits 2/3: design a new logo and color palette for my SaaS brand
- `clause-2/q01` [should trigger] hits 0/2: review my UI in src/components/Navbar.tsx, tell me what's off
- `clause-2/q02` [should trigger] hits 0/2: 帮我看看 components/ProductCard.vue 这个界面写得有没有问题,按 UI 规范过一遍
- `clause-2/q03` [should trigger] hits 0/2: can you review the UI code in app/dashboard/*.tsx before I ship it
- `clause-2/q04` [should trigger] hits 0/2: review一下我的登录页 UI,文件是 pages/login.jsx
- `clause-2/q05` [should trigger] hits 0/2: check accessibility on app/components/Modal.tsx pls
- `clause-2/q06` [should trigger] hits 0/2: 帮我检查一下 src/pages/Checkout.tsx 的无障碍问题,比如 aria 标签和键盘操作
- `clause-2/q07` [should trigger] hits 0/2: is my form accessible? look at components/forms/*.tsx for a11y issues
- `clause-2/q08` [should trigger] hits 0/2: 我这个下拉菜单屏幕阅读器读不出来,帮忙查下 Dropdown.jsx 的 a11y 合规性
- `clause-2/q10` [should trigger] hits 0/2: 帮我审计一下 src/components 下面的设计实现,看看间距、字体、颜色有没有不规范的地方
- `clause-2/q11` [should trigger] hits 0/2: do a design audit on pricing-section.tsx, i think the typography and layout are inconsistent
- `clause-2/q13` [should trigger] hits 0/2: review ux of the onboarding flow in src/onboarding/*.tsx
- `clause-2/q14` [should trigger] hits 0/2: 帮我 review 一下 SettingsPage.tsx 的用户体验,有没有交互上的坑,比如 focus 状态、loading 状态
- `clause-2/q15` [should trigger] hits 0/2: UX review pls: components/SearchBar.tsx, does it handle empty/error states and touch targets properly?
- `clause-2/q16` [should trigger] hits 0/2: 看下 CartDrawer.jsx 的 UX 细节有没有问题,按钮反馈、动画、表单提交体验这些
- `clause-2/q17` [should trigger] hits 0/2: check my site against best practices, code is in the web/ folder
- `clause-2/q20` [should trigger] hits 0/2: 按最佳实践帮我过一遍网站代码 pages/index.tsx,看哪些地方不合规
- `clause-2/q25` [should not trigger] hits 3/3: design a color palette and design tokens for my new SaaS brand from scratch

### webapp-testing
- `clause-1/q04` [should trigger] hits 0/2: start backend (python server.py, port 3000) and frontend (npm run dev, port 5173) together and run a playwright script against them
- `clause-1/q05` [should trigger] hits 0/2: 帮我测一下本地的待办事项应用，添加一条任务后列表里是不是真的出现了
- `clause-1/q07` [should trigger] hits 0/2: 我改完了搜索框的代码，跑一下浏览器确认输入关键字后结果能正常过滤
- `clause-1/q09` [should trigger] hits 0/2: 我的下拉菜单点了没反应，帮我在浏览器里复现一下看看到底哪里出问题
- `clause-1/q08` [should trigger] hits 1/3: verify the dark mode toggle in my react app still works after the refactor, app is running locally
- `clause-1/q11` [should trigger] hits 0/2: 页面加载完按钮是灰的，不知道是不是 JS 还没执行完，帮我看看渲染后的 DOM 是什么状态
- `clause-1/q12` [should trigger] hits 0/2: layout looks broken on the dashboard page when the sidebar collapses, need to see what's happening in the running app
- `clause-1/q15` [should trigger] hits 0/2: 帮我把 report.html 在浏览器里打开然后截图看看样式对不对
- `clause-1/q14` [should trigger] hits 0/2: take a screenshot of the pricing page in my running dev server after the login step
- `clause-1/q19` [should trigger] hits 0/2: 跑一下页面，把所有 console.warn 和网络请求失败的日志收集起来
- `clause-1/q20` [should trigger] hits 0/2: log everything the page prints to console while I click through the form, save to console.txt
- `clause-2/q02` [should trigger] hits 0/2: my vite dev server is on port 3000 and the api is on 8000, can you write a python script that starts both and then drives the page with playwright to add 3 items to the cart
- `clause-2/q03` [should trigger] hits 0/2: 我有个静态的 index.html 在 ./demo/ 下面，用 playwright 自动把表单里的输入框都填上再点提交
- `clause-2/q05` [should trigger] hits 0/2: 帮我跑一遍本地的结算流程，看看加入购物车 → 下单 → 支付成功页是不是都能正常走通
- `clause-2/q07` [should trigger] hits 0/2: 我刚改完 Todo 组件，帮我确认一下新增、删除、勾选完成这三个功能在浏览器里还正常
- `clause-2/q08` [should trigger] hits 1/3: verify the dark mode toggle in my react app really switches the theme and persists after a page reload. dev server is npm run dev
- `clause-2/q10` [should trigger] hits 0/2: the modal won't close when i click the X button, only on the settings page. can you open it up and figure out why
- `clause-2/q12` [should trigger] hits 0/2: sidebar collapses weirdly after i resize the window on my local app, pls repro and tell me which element/state is causing it
- `clause-2/q11` [should trigger] hits 1/3: 页面上那个按钮明明渲染出来了但是点不了，是不是被别的元素盖住了？帮我在真实页面里查一下
- `clause-2/q14` [should trigger] hits 0/2: take screenshots of my dashboard at the login page and after login, save them as login.png and dashboard.png
- `clause-2/q15` [should trigger] hits 0/2: 帮我把本地 report.html 渲染出来截一张图看看长什么样
- `clause-2/q16` [should trigger] hits 0/2: grab a screenshot of the pricing page on my dev server so i can paste it in the PR description
- `clause-2/q17` [should trigger] hits 0/2: 打开我本地的应用，把浏览器 console 里的所有输出都抓出来给我看看
- `clause-2/q19` [should trigger] hits 0/2: 我想看看点击'导出'按钮的时候浏览器控制台有没有报错，帮我记录下来
- `clause-2/q20` [should trigger] hits 0/2: run my app and dump the browser console log to console_output.txt while i navigate through the 3 main pages

### xlsx
- `clause-1/q01` [should trigger] hits 1/3: open sales_2025.xlsx and add a column that computes profit margin = (revenue-cost)/revenue, then bold the header row
- `clause-1/q03` [should trigger] hits 0/2: read inventory.xlsm and give me a bar chart of stock by warehouse inside the workbook, keep the macros pls
- `clause-1/q07` [should trigger] hits 0/2: take the numbers in this JSON api_dump.json and turn them into an excel file with one sheet per region
- `clause-1/q08` [should trigger] hits 0/2: 用这三个 csv 的数据生成一个汇总的 Excel 报表,每个 csv 一个 sheet,最后加一个合计页
- `clause-1/q09` [should trigger] hits 1/3: convert customers.csv to xlsx please
- `clause-1/q10` [should trigger] hits 1/3: 把 report.xlsx 导出成 tsv,只要第一个 sheet
- `clause-1/q12` [should trigger] hits 0/2: tsv 转成 xlsx,文件是 genes_list.tsv,第一行当表头冻结
- `clause-1/q13` [should trigger] hits 1/3: the xlsx in my downloads, can you sum up the totals column and put it at the bottom?
- `clause-1/q14` [should trigger] hits 0/2: 我桌面上那个报价单表格,帮我把税率那列改成 13% 然后重新算总价
- `clause-1/q15` [should trigger] hits 0/2: that excel file called Q3 forecast on my desktop - add a new tab w/ a pivot-like summary by product
- `clause-1/q16` [should trigger] hits 1/3: 下载文件夹里最新那个 xlsx,把重复行删掉再按金额从大到小排
- `clause-1/q17` [should trigger] hits 0/2: this export.csv is a mess: header is on row 4, some rows have extra commas, junk footer lines. clean it up into a proper xlsx
- `clause-1/q18` [should trigger] hits 0/2: raw_data.csv 里有很多乱码行、空行,表头位置也不对,帮我整理成规范的 Excel 表
- `clause-1/q19` [should trigger] hits 0/2: I pasted scraped stuff into scrape.tsv, columns are shifted and some cells have html junk. restructure it into a clean spreadsheet
- `clause-1/q20` [should trigger] hits 0/2: 老系统导出的 data.xls 格式很乱,合并单元格一堆,拆开整理成一张干净的 xlsx
- `clause-2/q01` [should trigger] hits 0/2: open budget_2025.xlsx and add a column that computes the monthly variance vs plan, then bold the header row
- `clause-2/q03` [should trigger] hits 0/2: 在 inventory.xlsm 的 Summary 表后面加一个柱状图,按仓库统计库存数量,别把宏弄丢了
- `clause-2/q07` [should trigger] hits 0/2: 把这段 JSON 接口返回的订单数据整理成一个 orders_summary.xlsx,按月份分 sheet,每个 sheet 底部加合计
- `clause-2/q11` [should trigger] hits 0/2: 我有个 data.tsv,想变成 Excel 文件,日期列要保持成日期格式不要变成数字
- `clause-2/q12` [should trigger] hits 0/2: turn old_ledger.xlsm into a plain .xlsx without the macros, keep all the sheets
- `clause-2/q13` [should trigger] hits 0/2: the xlsx in my downloads, can you sum up the revenue column and put the total at the bottom
- `clause-2/q15` [should trigger] hits 0/2: that excel file Sarah sent me yesterday (its in D:\work\tmp), make the dates look like YYYY-MM-DD and sort by date
- `clause-2/q16` [should trigger] hits 0/2: 我下载文件夹里最新那个csv,帮我按部门做个汇总表出来
- `clause-2/q17` [should trigger] hits 0/2: this export.csv is a mess - header is on row 4, there are blank rows and some junk footer lines. clean it up into a proper xlsx
- `clause-2/q18` [should trigger] hits 0/2: 这个 raw_dump.txt 是制表符分隔的,有些行列数对不上,还有重复表头混在中间,帮我整理成规整的 Excel 表
- `clause-2/q19` [should trigger] hits 1/3: messy_contacts.xlsx has names and phones all jammed in column A separated by random stuff, split into proper columns and dedupe, save as new clean xlsx
- `clause-2/q20` [should trigger] hits 0/2: 我从系统里导出的销售明细,合并单元格一堆,空行乱七八糟,帮我拍平成一张标准的明细表(xlsx)

