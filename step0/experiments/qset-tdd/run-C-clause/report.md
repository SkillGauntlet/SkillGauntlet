# Trigger test report 20261027-022624

- Host: Claude Code 2.1.303 (Claude Code); model: claude-haiku-5-5
- Runs per query: 3; total trials: 66; runner v0.2.2; Windows 10 / Python 3.11.9
- Verdict rule: first tool decision only (skill-creator rule, headline)
- Other skills loaded in the environment (20, the background that can steal triggers): design, slides, design-sync, dataviz, artifact-diagramming, artifact-capabilities, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run, run-skill-generator, plugin-authoring
- Recall = share of should-trigger queries where the skill was actually invoked; false positives = share of should-not-trigger queries where it was invoked; 95% confidence intervals in parentheses.

| Skill | Grade | Recall | False positives | Stolen | Errors | Notes |
|---|---|---|---|---|---|---|
| tdd | triggers poorly | 39% (25%–55%) | 0% (0%–11%) | 0 | 0 | rarely triggers; borderline, add runs; one question set only |

## Question sets

Each skill is tested with independently AI-drafted question sets. The headline row above pools all sets; the spread is the largest recall difference between sets, flagged above 20 points or when sets get different grades.

| Skill | Set | Grade | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|---|
| tdd | legacy | triggers poorly | 39% (25%–55%) | 0% (0%–11%) | 36 / 30 |
| tdd | **spread** | | — | | |

## Chinese vs English queries

Language is detected per query (any CJK character counts as Chinese). A gap is flagged only when the two recall confidence intervals do not overlap.

| Skill | Recall (zh) | Recall (en) | False positives (zh) | False positives (en) | Trials zh / en | Gap |
|---|---|---|---|---|---|---|
| tdd | 33% (16%–56%) | 44% (25%–66%) | 0% (0%–24%) | 0% (0%–18%) | 30 / 36 |  |
| **All skills** | 33% (16%–56%) | 44% (25%–66%) | 0% (0%–24%) | 0% (0%–18%) | 30 / 36 |  |

## Recall by trigger clause

Clauses are the situations the skill's description says it should be used in. Near-miss negatives are tagged with the clause they imitate.

| Skill | Clause | Recall | False positives | Trials pos / neg |
|---|---|---|---|---|
| tdd | Build features test-first | 67% (35%–88%) | 0% (0%–30%) | 9 / 9 |
| tdd | Fix bugs test-first | 0% (0%–30%) | 0% (0%–39%) | 9 / 6 |
| tdd | Integration tests wanted | 0% (0%–30%) | 0% (0%–30%) | 9 / 9 |
| tdd | Red-green-refactor mention | 89% (56%–98%) | 0% (0%–39%) | 9 / 6 |

## Per-query anomalies (should trigger but mostly didn't / shouldn't trigger but did)

### tdd
- `q03` [should trigger] hits 0/3: need a new rate limiter in limiter.py, tests first pls, one behavior at a time
- `q04` [should trigger] hits 0/3: 登录接口偶尔返回500,先帮我写个能复现的失败测试,然后再修这个bug
- `q05` [should trigger] hits 0/3: Bug: parse_date('2024-02-30') doesn't raise. Fix it TDD style, regression test first.
- `q06` [should trigger] hits 0/3: 订单总价算错了(折扣叠加的时候),按先红后绿的思路修一下,先让测试挂掉
- `q10` [should trigger] hits 0/3: 给 /api/orders 这几个接口写集成测试,要真的打到数据库,不要mock内部模块
- `q11` [should trigger] hits 0/3: i need integration tests for the checkout flow, cart -> payment -> order creation, through the public API
- `q12` [should trigger] hits 0/3: 帮我加一套集成测试覆盖用户注册到发邮件的整条链路,测试文件放 tests/integration/

