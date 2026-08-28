/**
 * Nigerian context utilities (blueprint Phase 8).
 */

/** Nigerian states + FCT. */
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara',
] as const;

export const isValidNigerianState = (s: string): boolean =>
  (NIGERIAN_STATES as readonly string[]).includes(s);

/**
 * Normalize and validate a Nigerian phone number.
 * +2348012345678 → 08012345678. Throws on invalid input.
 */
export function normalizeNigerianPhone(value: string): string {
  if (!value) return value;
  let normalized = value.replace(/\s/g, '');
  if (normalized.startsWith('+234')) normalized = '0' + normalized.slice(4);
  else if (normalized.startsWith('234') && normalized.length === 13) normalized = '0' + normalized.slice(3);
  const nigerianRegex = /^(070|080|081|090|091)\d{8}$/;
  if (!nigerianRegex.test(normalized)) {
    throw new Error('Invalid Nigerian phone number');
  }
  return normalized;
}

/** Format an amount as Naira: 50000 → "₦50,000.00". */
export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
}
