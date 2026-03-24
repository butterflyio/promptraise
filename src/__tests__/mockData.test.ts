import { getMockAudit, generateMockAudit, mockAudits } from '@/lib/mockData';

describe('getMockAudit', () => {
  it('returns the pre-seeded audit for code "12345678"', () => {
    const audit = getMockAudit('12345678');
    expect(audit).not.toBeNull();
    expect(audit?.access_code).toBe('12345678');
  });

  it('returns null for an unknown code', () => {
    expect(getMockAudit('00000000')).toBeNull();
    expect(getMockAudit('')).toBeNull();
  });

  it('returns correct fields for the seeded audit', () => {
    const audit = getMockAudit('12345678');
    expect(audit?.id).toBe('mock-123');
    expect(audit?.website_url).toBe('https://example.com');
    expect(audit?.company_name).toBe('Example Inc');
    expect(audit?.status).toBe('ready');
    expect(audit?.results).toBeDefined();
  });
});

describe('generateMockAudit', () => {
  it('creates an audit with the given code', () => {
    const audit = generateMockAudit('https://testcompany.com', '99887766');
    expect(audit.access_code).toBe('99887766');
  });

  it('derives the company name from the domain', () => {
    const audit = generateMockAudit('https://www.mysite.io', '11223344');
    expect(audit.company_name).toBe('Mysite');
  });

  it('sets status to ready', () => {
    const audit = generateMockAudit('https://example.com', '55667788');
    expect(audit.status).toBe('ready');
  });

  it('includes results with competitors, sources, and gap_analysis', () => {
    const audit = generateMockAudit('https://example.com', '55667788');
    expect(audit.results.competitors.length).toBeGreaterThan(0);
    expect(audit.results.sources.length).toBeGreaterThan(0);
    expect(audit.results.gap_analysis.length).toBeGreaterThan(0);
    expect(audit.results.keywords.length).toBeGreaterThan(0);
  });

  it('sets the website_url correctly', () => {
    const url = 'https://acme.org';
    const audit = generateMockAudit(url, '12341234');
    expect(audit.website_url).toBe(url);
  });

  it('generates a numeric id containing the code', () => {
    const audit = generateMockAudit('https://foo.com', '77665544');
    expect(audit.id).toBe('mock-77665544');
  });

  it('includes llm_breakdown with chatgpt, claude, gemini keys', () => {
    const audit = generateMockAudit('https://example.com', '12345678');
    expect(audit.results.llm_breakdown).toHaveProperty('chatgpt');
    expect(audit.results.llm_breakdown).toHaveProperty('claude');
    expect(audit.results.llm_breakdown).toHaveProperty('gemini');
  });

  it('total_mentions is a positive number', () => {
    const audit = generateMockAudit('https://example.com', '12345678');
    expect(audit.results.total_mentions).toBeGreaterThan(0);
  });
});

describe('mockAudits constant', () => {
  it('has the "12345678" key', () => {
    expect(mockAudits).toHaveProperty('12345678');
  });
});
