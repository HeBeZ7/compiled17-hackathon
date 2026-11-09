// Pure rules for R-028 and the price display. No Playwright import, so tests/integration can pin them down.

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-퟿]/;

/** Abbreviations whose period does not end a sentence. */
const ABBREVIATIONS = new Set(["e.g.", "i.e.", "vs."]);

/** A token containing a slash is a URL, path or model identifier, where punctuation is data. */
const isTechnicalToken = (token: string) => token.includes("/") || token.includes("\\");

export function copyViolations(text: string): string[] {
  const problems: string[] = [];
  if (HANGUL.test(text)) problems.push(`hangul: ${text}`);
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^["'‘“(\[]+/, "").replace(/["'’”)\]]+$/, "");
    if (!token.endsWith(".") || token.length === 1) continue;
    if (isTechnicalToken(token) || ABBREVIATIONS.has(token.toLowerCase())) continue;
    problems.push(`period: "${token}" in "${text}"`);
  }
  return problems;
}

/**
 * Text that would present an unknown price as free. "not free" and "does not mean free" are the
 * product's required disclaimers. A real zero price is covered by U-cases with a real value, not here.
 */
export const FREE =
  /(?<!\bnot )(?<!\bnot mean )\bfree\b|₩\s*0(?![\d.,])|\$\s*0(?:\.0+)?(?![\d.,])|\bUSD\s*0(?:\.0+)?(?![\d.,])|(?<![\d.,])0(?:\.0+)?\s*USD\b/i;
