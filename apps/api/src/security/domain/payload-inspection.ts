/**
 * Encoded/injected payload inspection (Bankr/Grok incident lesson).
 *
 * Agents and automations only ever produce structured TransactionIntents.
 * A payload that carries *instructions* — smuggled through hex/base64
 * encodings, invisible unicode, or prompt-injection phrases — is an
 * injection attempt and must be rejected at the ingestion boundary,
 * before any policy evaluation happens. This module evaluates intents
 * only: it never signs and never touches keys.
 *
 * Heuristic (applied to every string field of the intent):
 * 1. invisible-unicode — zero-width and bidi-override characters are never
 *    legitimate in structured fields; they smuggle text past naive filters.
 * 2. injection-phrase — well-known prompt-injection phrases in plain text
 *    ("ignore previous instructions" and friends).
 * 3. hex-encoded-instructions — long pure-hex values (0x-prefixed values
 *    are skipped: those are expected addresses/quantities) that decode to
 *    largely-printable text containing an instruction keyword.
 * 4. base64-encoded-instructions — long base64-shaped blobs that decode to
 *    largely-printable text containing an instruction keyword.
 *
 * Intentionally conservative: ordinary decimal amounts, 0x addresses and
 * `user`/`agent:<id>`/`automation:<id>` origins never trip it.
 */
import type { TransactionIntent } from '@kryptr/shared-types';

export interface PayloadInspectionResult {
  suspicious: boolean;
  reason: string | null;
}

// Intentionally matches ZWNJ/ZWJ and other invisible smugglers — the
// "misleading character class" ESLint warns about is exactly the target.
const INVISIBLE_UNICODE =
  // eslint-disable-next-line no-misleading-character-class
  /[\u180e\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;

const INJECTION_PHRASES = [
  'ignore previous',
  'ignore all prior',
  'ignore above',
  'ignore the above',
  'disregard previous',
  'disregard all prior',
  'disregard above',
  'system prompt',
  'new instructions',
  'override policy',
  'forget your rules',
];

const INSTRUCTION_KEYWORDS = [
  'send',
  'transfer',
  'approve',
  'execute',
  'sign',
  'ignore',
  'instruction',
  'system',
  'prompt',
  'wallet',
  'seed',
  'private key',
];

const PURE_HEX_RE = /^(?:[0-9a-fA-F]{2})+$/;
const BASE64_RE = /^[A-Za-z0-9+/]{40,}={0,2}$/;
const MIN_ENCODED_LEN = 16;

export function inspectIntentPayload(
  intent: TransactionIntent,
): PayloadInspectionResult {
  const fields: Array<[string, string]> = [
    ['id', intent.id],
    ['walletId', intent.walletId],
    ['origin', intent.origin],
    ['amount', intent.amount],
    ['createdAt', intent.createdAt],
    ['to', intent.to ?? ''],
    ['asset', intent.asset ?? ''],
  ];
  for (const [name, value] of fields) {
    if (value.length === 0) continue;
    if (INVISIBLE_UNICODE.test(value)) {
      return suspicious(`invisible-unicode in field "${name}"`);
    }
    const lower = value.toLowerCase();
    for (const phrase of INJECTION_PHRASES) {
      if (lower.includes(phrase)) {
        return suspicious(`injection-phrase in field "${name}"`);
      }
    }
    if (value.startsWith('0x')) continue;
    if (
      value.length >= MIN_ENCODED_LEN &&
      PURE_HEX_RE.test(value) &&
      decodesToInstructions(Buffer.from(value, 'hex').toString('utf8'))
    ) {
      return suspicious(`hex-encoded instructions in field "${name}"`);
    }
    if (
      BASE64_RE.test(value) &&
      decodesToInstructions(Buffer.from(value, 'base64').toString('utf8'))
    ) {
      return suspicious(`base64-encoded instructions in field "${name}"`);
    }
  }
  return { suspicious: false, reason: null };
}

function suspicious(reason: string): PayloadInspectionResult {
  return { suspicious: true, reason };
}

/**
 * Decoded text counts as smuggled instructions when it is largely
 * printable ASCII and mentions at least one transaction/injection keyword.
 */
function decodesToInstructions(decoded: string): boolean {
  const chars = [...decoded];
  if (chars.length < 8) return false;
  const printable = chars.filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (
      (code >= 32 && code < 127) || code === 9 || code === 10 || code === 13
    );
  }).length;
  if (printable / chars.length < 0.9) return false;
  const lower = decoded.toLowerCase();
  return INSTRUCTION_KEYWORDS.some((keyword) => lower.includes(keyword));
}
