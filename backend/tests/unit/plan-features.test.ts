import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSearchCapabilities,
  resolveSearchExecutionPlan,
  resolveSearchPlanFeatures,
} from '../../src/modules/search/plan-features.js';

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

test('buildSearchCapabilities reflects whether deep search was actually applied', () => {
  assert.deepEqual(buildSearchCapabilities('free', false), {
    plan: 'free',
    deepSearchRequested: false,
    deepSearchAllowed: false,
    deepSearchApplied: false,
  });

  assert.deepEqual(buildSearchCapabilities('pro', true, true), {
    plan: 'pro',
    deepSearchRequested: true,
    deepSearchAllowed: true,
    deepSearchApplied: true,
  });
});

test('resolveSearchExecutionPlan increases provider count only for pro deep search', () => {
  assert.deepEqual(resolveSearchExecutionPlan('free', true, 10, 20), {
    features: {
      plan: 'free',
      deepSearchAvailable: false,
    },
    deepSearchRequested: true,
    deepSearchAllowed: false,
    deepSearchApplied: false,
    providerCount: 10,
  });

  assert.deepEqual(resolveSearchExecutionPlan('pro', true, 10, 20), {
    features: {
      plan: 'pro',
      deepSearchAvailable: true,
    },
    deepSearchRequested: true,
    deepSearchAllowed: true,
    deepSearchApplied: true,
    providerCount: 20,
  });
});
