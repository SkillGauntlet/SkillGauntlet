# Trigger test report 20261027-022446

- Host: Claude Code 2.1.303 (Claude Code); model: claude-haiku-5-5
- Runs per query: 3; total trials: 60; runner v0.2.2; Windows 10 / Python 3.11.9
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (20, the background that can steal triggers): design, slides, design-sync, dataviz, artifact-diagramming, artifact-capabilities, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| tdd | triggers poorly | 43% (27%–61%) | 0% (0%–11%) | 0 | 0 | rarely triggers; borderline, add runs; one question set only |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| tdd | legacy | triggers poorly | 43% (27%–61%) | 0% (0%–11%) | 30 / 30 |
| tdd | **spread** | | — | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| tdd | 50% (25%–75%) | 39% (20%–61%) | 0% (0%–24%) | 0% (0%–18%) | 24 / 36 |  |
| **All skills** | 50% (25%–75%) | 39% (20%–61%) | 0% (0%–24%) | 0% (0%–18%) | 24 / 36 |  |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### tdd
- `q01` [should trigger] hits 1/3: I need to add a coupon code feature to our checkout service. let's do it test-first, red-green style, starting with the percentage discount case
- `q03` [should trigger] hits 0/3: there's a bug where parseDuration('1h30m') returns 90 instead of 5400. can you write a failing test that reproduces it first and then fix it?
- `q04` [should trigger] hits 0/3: 我想给 orders 模块补集成测试,走真实的 HTTP 接口验证下单流程,别 mock 内部的 service
- `q07` [should trigger] hits 0/3: write integration tests for our /api/invoices endpoints in tests/integration/, hit the real db in docker
- `q09` [should trigger] hits 0/3: 我们新写的 UserRepository 单测老是在重构后挂掉,因为 mock 了一堆内部方法,帮我用 TDD 的思路重写这些测试,只测公共接口
- `q10` [should trigger] hits 0/3: Add a feature flag evaluator. Test first please — propose which seams to test before writing anything.

