import type { CatalogEntry } from "@/shared/contracts";

/**
 * A family is a display grouping derived from catalog identifiers. It is never
 * the thing the user selects: selection is always an exact modelId and revision.
 */
export interface ModelFamily {
  /** Lower-case key, e.g. "qwen", "llama". Falls back to the publisher or the source. */
  key: string;
  /** Display name, cased the way the catalog spells it where possible. */
  name: string;
  publishers: string[];
  models: CatalogEntry[];
}

/** Generic words that open many model names without naming a family. */
const GENERIC_TOKENS = new Set(["all", "the", "text", "base", "model", "tiny", "small", "large", "open", "my", "llm", "gpt"]);

function splitModelId(modelId: string): { org: string | null; name: string } {
  const slash = modelId.indexOf("/");
  return slash === -1 ? { org: null, name: modelId } : { org: modelId.slice(0, slash), name: modelId.slice(slash + 1) };
}

/** First run of letters in a token, so "Qwen2.5" -> "Qwen" and "llama3" -> "llama". */
function leadingLetters(token: string): string {
  return token.match(/^[A-Za-z]+/)?.[0] ?? "";
}

/**
 * Derives a family from a catalog entry using only its identifiers.
 * Deterministic and pure: the same entry always maps to the same family.
 */
export function familyOf(entry: Pick<CatalogEntry, "ref">): { key: string; name: string } {
  const { modelId, publisher, source } = entry.ref;
  const { org, name } = splitModelId(modelId);
  for (const raw of name.split(/[-_.\s]+/)) {
    const letters = leadingLetters(raw);
    if (letters.length >= 2 && !GENERIC_TOKENS.has(letters.toLowerCase())) {
      return { key: letters.toLowerCase(), name: displayCase(letters) };
    }
  }
  const fallback = publisher ?? org ?? source;
  return { key: fallback.toLowerCase(), name: fallback };
}

/** Keeps catalog casing when it is mixed, otherwise title-cases: "gemma" -> "Gemma", "DeepSeek" stays. */
function displayCase(token: string): string {
  const mixed = token !== token.toLowerCase() && token !== token.toUpperCase();
  return mixed ? token : token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Groups a catalog page, keeping catalog order for families and for the models inside each. */
export function groupByFamily(items: CatalogEntry[]): ModelFamily[] {
  const families = new Map<string, ModelFamily>();
  for (const entry of items) {
    const { key, name } = familyOf(entry);
    let family = families.get(key);
    if (!family) {
      family = { key, name, publishers: [], models: [] };
      families.set(key, family);
    }
    family.models.push(entry);
    const publisher = entry.ref.publisher;
    if (publisher && !family.publishers.includes(publisher)) family.publishers.push(publisher);
  }
  return [...families.values()];
}
