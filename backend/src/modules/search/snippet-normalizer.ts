const COMMON_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#x2F;': '/',
};

function decodeHtmlEntities(value: string): string {
  let decoded = value;

  for (const [entity, replacement] of Object.entries(COMMON_ENTITY_MAP)) {
    decoded = decoded.split(entity).join(replacement);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_, codepoint: string) => {
    const parsed = Number.parseInt(codepoint, 10);
    return Number.isNaN(parsed) ? '' : String.fromCodePoint(parsed);
  });

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, codepoint: string) => {
    const parsed = Number.parseInt(codepoint, 16);
    return Number.isNaN(parsed) ? '' : String.fromCodePoint(parsed);
  });

  return decoded;
}

export function normalizeSnippet(snippet: string): string {
  const withLineBreaksNormalized = snippet.replace(/<(br|\/p|\/div)\s*\/?>/gi, ' ');
  const withoutTags = withLineBreaksNormalized.replace(/<[^>]*>/g, '');
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded.replace(/\s+/g, ' ').trim();
}
