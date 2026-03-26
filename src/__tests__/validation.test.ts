import { normalizeUrl, normalizeTelegram, validateAuditInput } from '../lib/validation';

describe('normalizeUrl', () => {
  it('adds https to bare domains', () => {
    const result = normalizeUrl('example.com');
    expect(result.value).toBe('https://example.com');
    expect(result.error).toBeUndefined();
  });

  it('rejects invalid urls', () => {
    const result = normalizeUrl('not a url');
    expect(result.error).toBeTruthy();
  });
});

describe('normalizeTelegram', () => {
  it('normalizes t.me links', () => {
    const result = normalizeTelegram('https://t.me/test_handle');
    expect(result.value).toBe('@test_handle');
    expect(result.error).toBeUndefined();
  });

  it('errors on short handles', () => {
    const result = normalizeTelegram('@abc');
    expect(result.error).toBeTruthy();
  });
});

describe('validateAuditInput', () => {
  it('returns errors when url invalid', () => {
    const res = validateAuditInput('bad', '');
    expect(res.errors.url).toBeTruthy();
  });

  it('normalizes both fields', () => {
    const res = validateAuditInput('example.com', 't.me/handle_ok');
    expect(res.errors.url).toBeUndefined();
    expect(res.errors.telegram).toBeUndefined();
    expect(res.normalized.url).toBe('https://example.com');
    expect(res.normalized.telegram).toBe('@handle_ok');
  });
});
