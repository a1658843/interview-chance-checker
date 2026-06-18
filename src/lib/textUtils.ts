const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'to',
  'we',
  'with',
  'you',
]);

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ');
}

export function extractKeywords(value: string) {
  const normalized = normalizeText(value);
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  return Array.from(new Set(tokens));
}

export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
