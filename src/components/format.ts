export function formatPrice(price: number, currency?: string) {
  try {
    if (currency) return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
  } catch {
    // unknown currency code — fall through
  }
  return `$${price.toFixed(2)}`;
}

export function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} wk ago`;
  if (days < 730) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

export const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > 120 * 86400000;
