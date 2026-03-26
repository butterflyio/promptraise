export type NormalizedInput = {
  url: string;
  telegram?: string;
};

const urlPattern = /^https?:\/\//i;
const domainLike = /^[\w.-]+\.[A-Za-z]{2,}(?:\/.*)?$/;

export function normalizeUrl(input: string): { value: string; error?: string } {
  if (!input) return { value: '', error: 'Website is required' };
  let candidate = input.trim();
  
  // Strip common prefixes people paste
  candidate = candidate.replace(/^https?:\/\//i, '');
  candidate = candidate.replace(/^www\./i, '');
  
  // Remove trailing slash and paths for now - just domain
  candidate = candidate.split('/')[0];
  
  // Add https:// back
  candidate = `https://${candidate}`;
  
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { value: candidate, error: 'Use http or https' };
    }
    // Return clean URL with protocol, no trailing slash, no path
    return { value: `${url.protocol}//${url.host}` };
  } catch (e) {
    return { value: candidate, error: 'Enter a valid URL (e.g., https://example.com)' };
  }
}

export function normalizeTelegram(input: string): { value: string; error?: string } {
  if (!input) return { value: '' };
  const cleaned = input.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, '');
  const handle = `@${cleaned}`;
  if (!/^@[A-Za-z0-9_]{5,64}$/.test(handle)) {
    return { value: handle, error: 'Telegram handle should be 5-64 chars (letters, numbers, underscore)' };
  }
  return { value: handle };
}

export function validateAuditInput(urlInput: string, telegramInput: string): { normalized: NormalizedInput; errors: { url?: string; telegram?: string } } {
  const urlResult = normalizeUrl(urlInput);
  const tgResult = normalizeTelegram(telegramInput);
  const errors: { url?: string; telegram?: string } = {};
  if (urlResult.error) errors.url = urlResult.error;
  if (tgResult.error) errors.telegram = tgResult.error;
  return {
    normalized: { url: urlResult.value, telegram: tgResult.value || undefined },
    errors,
  };
}
