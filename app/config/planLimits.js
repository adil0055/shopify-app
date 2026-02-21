/**
 * Plan limits for each subscription tier.
 * -1 means unlimited.
 */
export const PLAN_LIMITS = {
    FREE: {
        vtoGenerationsPerMonth: 50,
        maxProducts: 10,
        label: "Free",
    },
    PRO: {
        vtoGenerationsPerMonth: 500,
        maxProducts: -1,
        label: "Pro",
    },
    ENTERPRISE: {
        vtoGenerationsPerMonth: -1,
        maxProducts: -1,
        label: "Enterprise",
    },
};

export function getPlanLimit(planTier) {
    return PLAN_LIMITS[planTier] || PLAN_LIMITS.FREE;
}
