/**
 * Locale-aware display formatters — thin, pure wrappers over the `Intl` APIs,
 * keyed off a BCP-47 locale string (pass `i18n.language`). Centralising them
 * here means every number the Coach panel shows follows the active language's
 * decimal/grouping separators instead of the hard-coded `.`/`toFixed` rendering.
 *
 * Mirrors the host's `src/lib/i18n/format.ts`. Units (mph vs km/h) are a separate
 * axis owned by the caller — language localises number rendering only, it never
 * swaps units. The default locale is `en` so callers/tests that don't thread a
 * locale keep the canonical English rendering.
 */

/** Format a number with locale grouping/decimals and a fixed fraction-digit count. */
export function formatDecimal(value: number, locale = "en", fractionDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Format an integer with locale grouping (e.g. "1,200" / "1.200"). */
export function formatInteger(value: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/**
 * Format a number with locale separators, trimming trailing zeros up to
 * `maxFractionDigits` (so 12 → "12" but 12.5 → "12.5"). Used for setup values
 * whose precision varies (PSI, tyre sizes).
 */
export function formatNumber(value: number, locale = "en", maxFractionDigits = 3): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/**
 * Format a signed delta, localized: a leading "+" for positives, the locale's
 * minus for negatives, no sign on zero; trailing zeros trimmed up to 2 places
 * ("1" stays "1", "0.25" stays "0.25", "0,25" in comma-decimal locales).
 */
export function formatSignedDelta(value: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);
}
