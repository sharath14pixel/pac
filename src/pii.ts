// ── PII / personal-info refusal layer for BitGN PAC agent ──────────
// Pure functions — no external dependencies, no imports from other project files.
//
// Scope: detect task instructions that ask the agent to look up or reveal
// personal information about real people (third parties). These are
// out-of-scope requests, NOT attacks — route to OUTCOME_NONE_UNSUPPORTED
// unless they also overlap with injection patterns (then security wins).
//
// Precedent: t06 and t15 in prior sessions were mis-routed to DENIED_SECURITY
// when they should have been NONE_UNSUPPORTED. Same logic applies here: the
// agent is a file-system task runner, not a contact-lookup service.
//
// Design principle: high precision, low false-positive. pac1-dev contains
// many tasks about "emails in /inbox/" and similar — we must NOT flag those.
// Patterns only match when the intent is clearly "reveal personal info about
// a person", typically via family-relation words, explicit "personal/private"
// qualifiers, or "home address" phrasings.

// ── Types ────────────────────────────────────────────────────────────

export type PiiCategory =
  | "family_relation_query"
  | "personal_contact_query"
  | "home_address_query"
  | "relationship_query";

export interface PiiDetectionResult {
  detected: boolean;
  /** Matched category — empty when not detected. */
  category: PiiCategory | "";
  /** Human-readable matched phrase (first hit only). */
  match: string;
}

// ── Patterns ─────────────────────────────────────────────────────────

/**
 * Family-relation + contact-info queries.
 * Matches: "what is my wife's email", "was ist die email meiner frau".
 *
 * Deliberately narrow — must contain BOTH a relation word AND a contact
 * noun in close proximity. Plain "email" or plain "wife" alone never trips.
 */
const FAMILY_RELATION_PATTERNS: readonly RegExp[] = [
  // English: "X's email/phone/address" where X is a relation
  /\b(?:wife|husband|spouse|partner|girlfriend|boyfriend|mother|father|mom|dad|sister|brother|daughter|son|child|kids)['’]?s?\s+(?:email|phone|mobile|cell|address|number|whereabouts|contact)\b/i,
  // English: "email of my wife"
  /\b(?:email|phone|mobile|cell|address|number)\s+of\s+(?:my|your|his|her|their)\s+(?:wife|husband|spouse|partner|girlfriend|boyfriend|mother|father|mom|dad|sister|brother|daughter|son|child|kids)\b/i,
  // German: "email/telefon/adresse/handy/mail (deiner|meiner|...) (frau|mann|...)"
  /\b(?:email|e-?mail|mail|telefon|telefonnummer|handy|handynummer|mobilnummer|adresse|anschrift|nummer|kontakt)\s+(?:von\s+)?(?:deiner|meiner|seiner|ihrer|deinem|meinem|seinem|ihrem|der|des)\s+(?:frau|mann|partnerin|partner|freundin|freund|mutter|vater|schwester|bruder|tochter|sohn|kindes|kindern|kind)\b/i,
  // German: "was ist die mail deiner frau" — verb-first construction
  /\bwas\s+ist\s+(?:die\s+|der\s+|das\s+)?(?:email|e-?mail|mail|telefon|telefonnummer|handy|handynummer|adresse|anschrift|nummer)\s+(?:von\s+)?(?:deiner|meiner|seiner|ihrer)\s+(?:frau|mann|partnerin|partner|freundin|freund|mutter|vater|schwester|bruder|tochter|sohn|kind)\b/i,
];

/**
 * Explicit personal/private contact-info queries.
 * Matches: "personal email of X", "private Telefonnummer von Y".
 */
const PERSONAL_CONTACT_PATTERNS: readonly RegExp[] = [
  /\b(?:personal|private)\s+(?:email|phone|mobile|cell|address|number|contact)\s+(?:of|for)\b/i,
  /\b(?:personal|private)\s+(?:email|phone|mobile|cell|address|number|contact)\s+(?:von|für)\b/i,
  /\b(?:private|persönliche)\s+(?:email|e-?mail|mail|telefon|telefonnummer|handy|handynummer|adresse|anschrift|nummer)\s+(?:von|für)\b/i,
];

/**
 * Home / physical-location queries. These are especially sensitive — no
 * legitimate automation task asks "where does X live".
 */
const HOME_ADDRESS_PATTERNS: readonly RegExp[] = [
  /\bhome\s+address\s+of\b/i,
  /\bwhere\s+does\s+[a-z]+(?:\s+[a-z]+)?\s+live\b/i,
  /\b(?:home|personal|private)\s+address\s+(?:of|for)\b/i,
  /\bwo\s+wohnt\s+[a-zäöüß]+/i,
  /\b(?:privatadresse|wohnadresse|heimatadresse)\s+(?:von|für)\b/i,
];

/**
 * Relationship-status queries — "who is married to X", "mit wem ist Y verheiratet".
 */
const RELATIONSHIP_PATTERNS: readonly RegExp[] = [
  /\bwho\s+is\s+[a-z]+(?:\s+[a-z]+)?\s+(?:married\s+to|dating|in\s+a\s+relationship\s+with)\b/i,
  /\bmit\s+wem\s+ist\s+[a-zäöüß]+(?:\s+[a-zäöüß]+)?\s+verheiratet\b/i,
  /\bwer\s+ist\s+[a-zäöüß]+(?:\s+[a-zäöüß]+)?['’]?s?\s+(?:frau|mann|partner|partnerin)\b/i,
];

// ── Detection ────────────────────────────────────────────────────────

function firstMatch(
  text: string,
  patterns: readonly RegExp[]
): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Scans text for personal-info-query patterns. Returns the first matching
 * category. Order of precedence when multiple match: family > home >
 * personal > relationship (reported to the caller via `category`).
 */
export function detectPersonalInfoQuery(text: string): PiiDetectionResult {
  if (!text) {
    return { detected: false, category: "", match: "" };
  }

  const family = firstMatch(text, FAMILY_RELATION_PATTERNS);
  if (family) {
    return { detected: true, category: "family_relation_query", match: family };
  }

  const home = firstMatch(text, HOME_ADDRESS_PATTERNS);
  if (home) {
    return { detected: true, category: "home_address_query", match: home };
  }

  const personal = firstMatch(text, PERSONAL_CONTACT_PATTERNS);
  if (personal) {
    return { detected: true, category: "personal_contact_query", match: personal };
  }

  const relationship = firstMatch(text, RELATIONSHIP_PATTERNS);
  if (relationship) {
    return { detected: true, category: "relationship_query", match: relationship };
  }

  return { detected: false, category: "", match: "" };
}

/**
 * Returns the recommended outcome for a detected PII query.
 *
 * - If the same text ALSO has injection patterns → security wins, return
 *   `OUTCOME_DENIED_SECURITY` (caller must check injection separately and
 *   override).
 * - Otherwise → `OUTCOME_NONE_UNSUPPORTED` (the agent is not a contact
 *   lookup service; this capability is out of scope).
 *
 * Caller is expected to do the injection-scan combination themselves —
 * this helper just reports the "no injection" default.
 */
export function recommendedPiiOutcome(
  detection: PiiDetectionResult
): "OUTCOME_NONE_UNSUPPORTED" | "OUTCOME_OK" {
  return detection.detected ? "OUTCOME_NONE_UNSUPPORTED" : "OUTCOME_OK";
}
