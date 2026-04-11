// ── Secret redaction for BitGN PAC agent ──────────────────────────
// Pure functions — no external dependencies, no imports from other project files.
//
// Scope: after reading file content via a tool call, scan the result text
// for high-entropy secret shapes and redact them with `[REDACTED:KIND]`
// before feeding into LLM context. Defense-in-depth: even if a task's
// malicious file embeds a fake API key, the LLM never sees the literal
// value and cannot echo it in report_completion.message or trace logs.
//
// Design principle: high precision, zero false positives. Each pattern is
// a well-known secret prefix with a fixed shape. Generic high-entropy
// strings are NOT redacted — we only hit known vendor formats. If a
// smoke test surfaces a false positive, the offending pattern is dropped,
// not loosened.

// ── Patterns ─────────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  re: RegExp;
}

/**
 * Each pattern is anchored on a vendor-specific prefix, so the false-positive
 * rate is near-zero. JWT pattern requires three dot-separated base64 segments.
 * PEM pattern matches the header line only (sufficient to redact the block
 * start; the surrounding content will still leak, so we also replace the full
 * block up to the END marker where possible).
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "ANTHROPIC_KEY", re: /sk-ant-api03-[A-Za-z0-9_-]{20,}/g },
  { name: "ANTHROPIC_KEY", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "OPENAI_KEY", re: /sk-proj-[A-Za-z0-9_-]{20,}/g },
  { name: "OPENAI_KEY", re: /sk-[A-Za-z0-9]{40,}/g },
  { name: "GITHUB_PAT", re: /ghp_[A-Za-z0-9]{30,}/g },
  { name: "GITHUB_PAT", re: /github_pat_[A-Za-z0-9_]{30,}/g },
  { name: "GITLAB_PAT", re: /glpat-[A-Za-z0-9_-]{20,}/g },
  { name: "AWS_ACCESS_KEY", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "AWS_SECRET", re: /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{30,}['"]?/g },
  { name: "SLACK_TOKEN", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "NPM_TOKEN", re: /npm_[A-Za-z0-9]{30,}/g },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

/**
 * PEM-block replacement: match from BEGIN header through END footer, replace
 * entire block. Handled separately because it's multiline.
 */
const PEM_BLOCK_RE =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?(?:PRIVATE KEY|CERTIFICATE)-----/g;

// ── Redaction ────────────────────────────────────────────────────────

export interface RedactionResult {
  text: string;
  hits: string[];
}

/**
 * Redacts known secret shapes in `input` by replacing them with
 * `[REDACTED:KIND]` markers. Returns the redacted text plus a list of which
 * kinds were hit (for logging).
 *
 * Safe to call on any string — no-op when no patterns match.
 */
export function redactSecrets(input: string): RedactionResult {
  if (!input) return { text: input, hits: [] };

  let output = input;
  const hits = new Set<string>();

  // PEM blocks first (multiline, highest priority).
  output = output.replace(PEM_BLOCK_RE, () => {
    hits.add("PEM");
    return "[REDACTED:PEM]";
  });

  // Vendor key patterns.
  for (const pat of SECRET_PATTERNS) {
    output = output.replace(pat.re, () => {
      hits.add(pat.name);
      return `[REDACTED:${pat.name}]`;
    });
  }

  return { text: output, hits: Array.from(hits) };
}
