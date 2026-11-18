// Server-owned integer wallet. No operation trusts a client-supplied balance.
export const CREDIT_CAP=1_000_000_000;
export function sanitizeCredits(value){
 return Number.isSafeInteger(value)&&value>=0?Math.min(value,CREDIT_CAP):0;
}
// Calculate first so an inventory transaction can commit both changes together.
export function walletAfter(current,delta){
 if(!Number.isSafeInteger(current)||current<0||current>CREDIT_CAP||!Number.isSafeInteger(delta))return null;
 if(delta < -current || delta > CREDIT_CAP-current)return null;
 return current+delta;
}
