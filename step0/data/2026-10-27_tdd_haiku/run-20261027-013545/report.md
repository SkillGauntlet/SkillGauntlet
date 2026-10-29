# Trigger test report 20261027-013545

- Host: Claude Code 2.1.303 (Claude Code); model: claude-haiku-5-5
- Runs per query: 3; total trials: 60; runner v0.1.0; Windows 10 / Python 3.11.9
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (20, the background that can steal triggers): design, slides, design-sync, dataviz, artifact-diagramming, artifact-capabilities, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| tdd | triggers poorly | 40% (25%–58%) | 0% (0%–11%) | 0 | 0 | rarely triggers; borderline, add runs; one question set only |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| tdd | legacy | triggers poorly | 40% (25%–58%) | 0% (0%–11%) | 30 / 30 |
| tdd | **spread** | | — | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| tdd | 40% (20%–64%) | 40% (20%–64%) | 0% (0%–30%) | 0% (0%–16%) | 24 / 36 |  |
| **All skills** | 40% (20%–64%) | 40% (20%–64%) | 0% (0%–30%) | 0% (0%–16%) | 24 / 36 |  |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### tdd
- `q02` [should trigger] hits 0/3: fix the bug where discount codes get applied twice in cart.ts, write a failing test first then fix it
- `q03` [should trigger] hits 0/3: need integration tests for the payments flow in src/billing/, hit the real sqlite db not mocks pls
- `q04` [should trigger] hits 0/3: 帮我给 user_service.py 里的注册逻辑补一下集成测试，别mock数据库
- `q07` [should trigger] hits 0/3: the search ranking in src/search/rank.ts returns wrong order when scores tie, can you write a test that reproduces it first and then patch
- `q08` [should trigger] hits 0/3: 给 notification 模块写集成测试，覆盖邮件和短信两条发送链路
- `q10` [should trigger] hits 0/3: 新加的 retry 逻辑有个 off-by-one，先写个红的测试把它钉住，再改

