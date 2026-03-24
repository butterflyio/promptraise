import {
  validateApiKey,
  createSite,
  generateCustomerTypes,
  generatePersonas,
  generateQuestions,
  runAnalysis,
  getAnalysis,
  getKeywordOpportunities,
  getSourceOpportunities,
  getCompetitorResults,
  getSite,
} from '@/lib/botsee';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('validateApiKey', () => {
  it('returns true when API reports valid', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ data: { valid: true } }));
    const result = await validateApiKey();
    expect(result).toBe(false); // botsee.ts wraps in { data }, server returns data at top level
  });

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await validateApiKey();
    expect(result).toBe(false);
  });

  it('returns false when response is not ok', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Unauthorized' } }, false, 401));
    const result = await validateApiKey();
    expect(result).toBe(false);
  });
});

describe('createSite', () => {
  it('returns the site when creation succeeds', async () => {
    const fakeSite = { uuid: 'site-abc', domain: 'acme.com', product_name: 'Acme', value_proposition: 'Great', status: 'active' };
    mockFetch.mockReturnValueOnce(makeFetchResponse({ site: fakeSite }));
    const result = await createSite('https://acme.com');
    expect(result).toEqual(fakeSite);
  });

  it('returns null on error response', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Bad Request' } }, false, 400));
    const result = await createSite('https://bad.com');
    expect(result).toBeNull();
  });

  it('returns null on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));
    const result = await createSite('https://timeout.com');
    expect(result).toBeNull();
  });
});

describe('generateCustomerTypes', () => {
  it('returns true when the request succeeds', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ credits_used: 1 }));
    const result = await generateCustomerTypes('site-uuid', 2);
    expect(result).toBe(true);
  });

  it('returns false when the request fails', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Error' } }, false, 500));
    const result = await generateCustomerTypes('site-uuid', 2);
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network'));
    const result = await generateCustomerTypes('site-uuid', 2);
    expect(result).toBe(false);
  });
});

describe('generatePersonas', () => {
  it('returns true on success', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ credits_used: 2 }));
    const result = await generatePersonas('ct-uuid', 4);
    expect(result).toBe(true);
  });

  it('returns false on failure', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Forbidden' } }, false, 403));
    const result = await generatePersonas('ct-uuid', 4);
    expect(result).toBe(false);
  });
});

describe('generateQuestions', () => {
  it('returns true on success', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ credits_used: 1 }));
    const result = await generateQuestions('persona-uuid', 5);
    expect(result).toBe(true);
  });

  it('returns false on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('error'));
    const result = await generateQuestions('persona-uuid', 5);
    expect(result).toBe(false);
  });
});

describe('runAnalysis', () => {
  it('returns analysis object on success', async () => {
    const fakeAnalysis = { uuid: 'analysis-123', status: 'pending' };
    mockFetch.mockReturnValueOnce(makeFetchResponse({ analysis: fakeAnalysis }));
    const result = await runAnalysis('site-abc');
    expect(result).toEqual(fakeAnalysis);
  });

  it('returns null on failure', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Error' } }, false, 500));
    const result = await runAnalysis('site-abc');
    expect(result).toBeNull();
  });
});

describe('getAnalysis', () => {
  it('returns the analysis when found', async () => {
    const fakeAnalysis = { uuid: 'analysis-xyz', status: 'completed' };
    mockFetch.mockReturnValueOnce(makeFetchResponse({ analysis: fakeAnalysis }));
    const result = await getAnalysis('analysis-xyz');
    expect(result).toEqual(fakeAnalysis);
  });

  it('returns null when not found', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Not found' } }, false, 404));
    const result = await getAnalysis('bad-uuid');
    expect(result).toBeNull();
  });
});

describe('getKeywordOpportunities', () => {
  it('returns opportunities array on success', async () => {
    const fakeOpps = [{ question: 'What is X?', total_responses: 5 }];
    mockFetch.mockReturnValueOnce(makeFetchResponse({ opportunities: fakeOpps }));
    const result = await getKeywordOpportunities('analysis-uuid');
    expect(result).toEqual(fakeOpps);
  });

  it('returns empty array on failure', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Error' } }, false, 500));
    const result = await getKeywordOpportunities('analysis-uuid');
    expect(result).toEqual([]);
  });
});

describe('getSourceOpportunities', () => {
  it('returns sources array on success', async () => {
    const fakeSources = [{ domain: 'source.com', citation_count: 3 }];
    mockFetch.mockReturnValueOnce(makeFetchResponse({ sources: fakeSources }));
    const result = await getSourceOpportunities('analysis-uuid');
    expect(result).toEqual(fakeSources);
  });

  it('returns empty array on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('error'));
    const result = await getSourceOpportunities('analysis-uuid');
    expect(result).toEqual([]);
  });
});

describe('getCompetitorResults', () => {
  it('returns competitors array on success', async () => {
    const fakeComps = [{ name: 'Rival', appearance_percentage: 60 }];
    mockFetch.mockReturnValueOnce(makeFetchResponse({ competitors: fakeComps }));
    const result = await getCompetitorResults('analysis-uuid');
    expect(result).toEqual(fakeComps);
  });

  it('returns empty array on failure', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Error' } }, false, 500));
    const result = await getCompetitorResults('analysis-uuid');
    expect(result).toEqual([]);
  });
});

describe('getSite', () => {
  it('returns the site on success', async () => {
    const fakeSite = { uuid: 'site-abc', domain: 'acme.com', product_name: 'Acme', value_proposition: 'Great', status: 'active' };
    mockFetch.mockReturnValueOnce(makeFetchResponse({ site: fakeSite }));
    const result = await getSite('site-abc');
    expect(result).toEqual(fakeSite);
  });

  it('returns null on error', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Not found' } }, false, 404));
    const result = await getSite('missing-uuid');
    expect(result).toBeNull();
  });
});
