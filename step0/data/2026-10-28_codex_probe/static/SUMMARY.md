# Static layer: every skill in the manifest, layer 0 only

Regenerate with `node scripts/static-summary.mjs`. No model calls, no cost, and the same
directory always produces the same result.

| skill | SKILL.md tokens | package | code files | allowed-tools | desc chars | A | B | C | D | E | flagged |
|---|---|---|---|---|---|---|---|---|---|---|---|
| skill-creator | 8368 | 225 KB | 10 | none | 319 | A- B- C! D+ E+ | A1 B1 C2 C3 |
| doc-coauthoring | 4048 | 16 KB | 0 | none | 428 | A! B! C+ D+ E+ | A1 B1 |
| deploy-to-vercel | 3010 | 41 KB | 2 | none | 194 | A! B- C! D+ E+ | A1 B1 C1 |
| frontend-design | 2359 | 19 KB | 0 | none | 204 | A! B! C+ D+ E+ | A1 B1 |
| mcp-builder | 2324 | 122 KB | 2 | none | 277 | A! B- C+ D+ E+ | A1 B1 |
| diagnosing-bugs | 2200 | 10 KB | 1 | none | 156 | A! B- C+ D+ E+ | A1 B1 |
| xlsx | 2160 | 1100 KB | 12 | none | 950 | A! B- C! D+ E! | A1 A2 B1 C2 C3 E3 |
| design-mobile-apps | 2147 | 59 KB | 0 | none | 111 | A! B! C+ D! E! | A1 B1 D3 D5 E2 |
| vercel-react-best-practices | 1850 | 233 KB | 0 | none | 329 | A+ B! C+ D+ E! | B1 E5 |
| hyperframes | 1792 | 1115 KB | 6 | none | 288 | A+ B- C! D+ E! | B1 C2 C3 E2 E3 |
| find-skills | 1399 | 5 KB | 0 | none | 303 | A+ B! C+ D+ E+ | B1 |
| lark-doc | 1188 | 176 KB | 0 | none | 241 | A+ B! C+ D+ E! | B1 E2 |
| webapp-testing | 989 | 22 KB | 4 | none | 204 | A+ B- C! D+ E! | B1 C2 E2 |
| tdd | 915 | 7 KB | 0 | none | 149 | A+ B! C+ D+ E+ | B1 |
| agent-browser | 877 | 3 KB | 0 | declared | 925 | A! B+ C+ D+ E! | A2 E3 |
| domain-modeling | 824 | 8 KB | 0 | none | 151 | A+ B! C+ D+ E+ | B1 |
| prototype | 737 | 16 KB | 0 | none | 179 | A+ B! C+ D+ E+ | B1 |
| web-design-guidelines | 318 | 1 KB | 0 | none | 184 | A+ B! C+ D+ E+ | B1 |

A context cost, B permission surface, C code risk, D instruction hijacking, E description quality.
`+` pass, `!` warning, `-` failure. No composite score on purpose.

## Findings

1. **17 of 18 skills declare no `allowed-tools`.** The host grants each of them the default scope, and the user never sees what that scope is.
2. **7 of 18 ship executable code** (skill-creator 10, deploy-to-vercel 2, mcp-builder 2, diagnosing-bugs 1, xlsx 12, hyperframes 6, webapp-testing 4). Two of them make network calls.
3. **8 skills put more than 2,000 tokens of SKILL.md into the window every time they fire** (skill-creator 8368, doc-coauthoring 4048, deploy-to-vercel 3010, frontend-design 2359).
4. **2 packages exceed 1 MB** (xlsx 1100 KB, hyperframes 1115 KB) to deliver text instructions.

## What this layer cannot see

- Whether the skill helps. That needs paired tasks with verifiable outcomes (layer 2).
- Whether it triggers. That needs model calls (layer 1).
- Whether a declared scope is honoured at runtime: this reads declarations, not behaviour.

---

## Which host do you mainly use?

1) Claude Code　2) Codex　3) Other — reply with a single digit.

> Why ask: a trigger rate is only measurable on a host that exposes explicit skill invocation. Codex has no skill item in its event stream, so its column is empty rather than unmeasured. Which host a reader uses therefore decides who the report serves and which layer to build next. The answers are read as a signal, never as a proportion: whoever replies has selected themselves, so no ratio can be computed from it.
