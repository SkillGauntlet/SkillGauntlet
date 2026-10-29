// Test-strength presets. The point of exposing these is that a user can spend one minute and
// a tenth of a cent before deciding whether the full run is worth it.
//
// Cost model, per trial:
//   Anthropic  via Claude Code  -> subscription quota, not cash; ~1% of a Pro week per ~120 trials
//   DeepSeek   via any host      -> ~0.04 CNY per trial (its endpoint ignores cache_control,
//                                   so the whole prompt is billed at the cache-miss price)
// Times assume 2 parallel trials at ~4 s each.
//
// Labels and hints live in lib/i18n.js (depthQuick, depthQuickHint, ...). No amount of money is shown
// to the user: the estimate was never accurate enough to print.

export const DEPTHS = {
  quick: {
    id: 'quick',
    sets: 1,
    perClause: 2,
    negatives: 10, // the grade needs at least 10 on each side, so fewer would make every quick result "too few"
    runs: 1,
    maxExplore: 0,
    layers: ['static', 'trigger'],
  },
  standard: {
    id: 'standard',
    sets: 2,
    perClause: 3,
    negatives: 10,
    runs: 3,
    maxExplore: 0,
    layers: ['static', 'trigger', 'gain'],
  },
  deep: {
    id: 'deep',
    sets: 3,
    perClause: 4,
    negatives: 10,
    runs: 3,
    maxExplore: 3,
    layers: ['static', 'trigger', 'gain', 'robustness'],
  },
};

export function estimate(depth, clauses = 3) {
  const d = DEPTHS[depth];
  const perSet = d.perClause * clauses + d.negatives;
  const queries = perSet * d.sets;
  const trials = queries * d.runs;
  return {
    ...d,
    clauses,
    queries,
    trials,
    minutes: Math.max(1, Math.round((trials * 4) / 2 / 60)),
  };
}

// Minutes for a number of trials, on the same assumption as estimate(): 2 in parallel at ~4 s each.
export const minutesFor = (trials) => Math.max(1, Math.round((trials * 4) / 2 / 60));
