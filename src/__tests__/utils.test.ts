import {
  generateAccessCode,
  formatDate,
  extractDomain,
  getStatusColor,
  getStatusBgColor,
  cn,
} from '@/lib/utils';

describe('generateAccessCode', () => {
  it('returns an 8-digit numeric string', () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^\d{8}$/);
  });

  it('returns a value between 10000000 and 99999999 (inclusive)', () => {
    const code = generateAccessCode();
    const num = parseInt(code, 10);
    expect(num).toBeGreaterThanOrEqual(10000000);
    expect(num).toBeLessThanOrEqual(99999999);
  });

  it('generates different codes on successive calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 10 }, generateAccessCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2024-01-15T00:00:00.000Z');
    expect(result).toMatch(/January 15, 2024/);
  });

  it('formats another valid date', () => {
    const result = formatDate('2023-06-30T12:00:00.000Z');
    expect(result).toMatch(/June/);
    expect(result).toMatch(/2023/);
  });
});

describe('extractDomain', () => {
  it('extracts domain from https URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  });

  it('extracts domain from http URL', () => {
    expect(extractDomain('http://example.com')).toBe('example.com');
  });

  it('strips www prefix', () => {
    expect(extractDomain('https://www.google.com')).toBe('google.com');
  });

  it('returns the input as-is for an invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });

  it('handles URL with subpath and query string', () => {
    expect(extractDomain('https://sub.example.org/page?q=1')).toBe('sub.example.org');
  });
});

describe('getStatusColor', () => {
  it('returns green for ready', () => {
    expect(getStatusColor('ready')).toBe('text-green-400');
  });

  it('returns yellow for processing', () => {
    expect(getStatusColor('processing')).toBe('text-yellow-400');
  });

  it('returns red for failed', () => {
    expect(getStatusColor('failed')).toBe('text-red-400');
  });

  it('returns gray for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('text-gray-400');
    expect(getStatusColor('')).toBe('text-gray-400');
  });
});

describe('getStatusBgColor', () => {
  it('returns green bg for ready', () => {
    expect(getStatusBgColor('ready')).toBe('bg-green-500/20 border-green-500/50');
  });

  it('returns yellow bg for processing', () => {
    expect(getStatusBgColor('processing')).toBe('bg-yellow-500/20 border-yellow-500/50');
  });

  it('returns red bg for failed', () => {
    expect(getStatusBgColor('failed')).toBe('bg-red-500/20 border-red-500/50');
  });

  it('returns gray bg for unknown status', () => {
    expect(getStatusBgColor('other')).toBe('bg-gray-500/20 border-gray-500/50');
  });
});

describe('cn', () => {
  it('joins class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', undefined, null, false, 'bar')).toBe('foo bar');
  });

  it('returns empty string when all values are falsy', () => {
    expect(cn(undefined, null, false)).toBe('');
  });

  it('works with a single class', () => {
    expect(cn('only')).toBe('only');
  });
});
