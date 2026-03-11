import type { SearchCapabilitiesDto, SearchPlanDto } from './dto.js';

export interface SearchPlanFeatures {
  plan: SearchPlanDto;
  deepSearchAvailable: boolean;
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
): SearchCapabilitiesDto {
  const features = resolveSearchPlanFeatures(plan);
  const deepSearchAllowed = features.deepSearchAvailable;

  return {
    plan: features.plan,
    deepSearchRequested,
    deepSearchAllowed,
    // Phase 1 only wires the contract; retrieval behavior remains unchanged until phase 2.
    deepSearchApplied: false,
  };
}
