/**
 * Minimum PPV price in USD. Below this Stripe's per-transaction fee (~30¢
 * + 2.9%) eats almost the entire creator cut, making low-priced PPV nearly
 * worthless. Applies to both post PPV and chat-message PPV.
 */
export const MIN_PPV_USD = 4.99

export function isValidPpvPrice(usd: number | null | undefined): usd is number {
  return typeof usd === 'number' && Number.isFinite(usd) && usd >= MIN_PPV_USD
}
