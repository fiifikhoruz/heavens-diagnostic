/**
 * Formats an amount as Ghana cedis, e.g. 42 → "GH₵42.00".
 * Accepts number, string, or nullish input.
 */
export const formatGHS = (amount: number | string | null | undefined): string => {
  const n =
    typeof amount === 'string'
      ? parseFloat(amount)
      : typeof amount === 'number'
        ? amount
        : 0;
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
  }).format(safe);
};
