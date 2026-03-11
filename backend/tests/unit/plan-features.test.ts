import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSearchCapabilities, resolveSearchPlanFeatures } from '../../src/modules/search/plan-features.js';

test('resolveSearchPlanFeatures exposes deep search only for pro', () => {
  assert.deepEqual(resolveSearchPlanFeatures('free'), {
    plan: 'free',
    deepSearchAvailable: false,
  });

  assert.deepEqual(resolveSearchPlanFeatures('pro'), {
    plan: 'pro',
    deepSearchAvailable: true,
  });
});

test('buildSearchCapabilities reports phase-1 deep search as not yet applied', () => {
  assert.deepEqual(buildSearchCapabilities('free', false), {
    plan: 'free',
    deepSearchRequested: false,
    deepSearchAllowed: false,
    deepSearchApplied: false,
  });

  assert.deepEqual(buildSearchCapabilities('pro', true), {
    plan: 'pro',
    deepSearchRequested: true,
    deepSearchAllowed: true,
    deepSearchApplied: false,
  });
});
