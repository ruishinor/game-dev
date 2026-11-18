// Public presentation/recipe eligibility only. Cooldown and collection execution are server-owned.
export const RECOVERY_MASTERY=3;
export function recoverySamples(raw){return Number.isSafeInteger(raw)&&raw>0?Math.min(RECOVERY_MASTERY,raw):0;}
export function recoveryRank(raw){return recoverySamples(raw)>=RECOVERY_MASTERY?2:1;}
