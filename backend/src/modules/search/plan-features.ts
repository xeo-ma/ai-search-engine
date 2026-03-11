import type { SearchCapabilitiesDto, SearchPlanDto } from './dto.js';

export interface SearchPlanFeatures {
  plan: SearchPlanDto;
  deepSearchAvailable: boolean;
}

export interface SearchExecutionPlan {
  features: SearchPlanFeatures;
  deepSearchRequested: boolean;
  deepSearchAllowed: boolean;
  deepSearchApplied: boolean;
  providerCount: number;
}

const PLAN_FEATURES: Record<SearchPlanDto, SearchPlanFeatures> = {
  free: {
    plan: 'free',
    deepSearchAvailable: false,
  },
  pro: {
    plan: 'pro',
    deepSearchAvailable: true,
  },
};

export function resolveSearchPlanFeatures(plan: SearchPlanDto): SearchPlanFeatures {
  return PLAN_FEATURES[plan];
}

export function buildSearchCapabilities(
  plan: SearchPlanDto,
  deepSearchRequested: boolean,
  deepSearchApplied = false,
): SearchCapabilitiesDto {
  const features = resolveSearchPlanFeatures(plan);
  const deepSearchAllowed = features.deepSearchAvailable;

  return {
    plan: features.plan,
    deepSearchRequested,
    deepSearchAllowed,
    deepSearchApplied,
  };
}

export function resolveSearchExecutionPlan(
  plan: SearchPlanDto,
  deepSearchRequested: boolean,
  requestedCount: number,
  maxProviderCount: number,
): SearchExecutionPlan {
  const features = resolveSearchPlanFeatures(plan);
  const deepSearchAllowed = features.deepSearchAvailable;
  const deepSearchApplied = deepSearchRequested && deepSearchAllowed;
  const providerCount = deepSearchApplied
    ? Math.min(maxProviderCount, Math.max(requestedCount * 2, requestedCount + 6))
    : requestedCount;

  return {
    features,
    deepSearchRequested,
    deepSearchAllowed,
    deepSearchApplied,
    providerCount,
  };
}
