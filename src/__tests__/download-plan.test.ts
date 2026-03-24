// Mock @supabase/supabase-js before importing the handler
const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: () => ({ single: mockSingle }) }));
const mockUpdate = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }));

const mockFrom = jest.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import downloadPlanHandler from '@/pages/api/download-plan';

function makeReq(method: string, query: Record<string, string> = {}) {
  return { method, query } as any;
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

const readyAudit = {
  id: 'audit-1',
  access_code: '12345678',
  website_url: 'https://acme.com',
  company_name: 'Acme Corp',
  status: 'ready',
  results: {
    total_mentions: 100,
    competitors: [
      { name: 'Rival A', appearance_pct: 60, mentions: 18, avg_rank: 2, confidence: 75 },
    ],
    gap_analysis: [
      { ai_term: 'Market Making', evidence: '17 queries', priority: 'high' },
    ],
    keywords: [
      { keyword: 'crypto trading', frequency: 20, mentioned: false },
    ],
    sources: [
      { name: 'source1.com', url: 'https://source1.com', mentions: 10 },
    ],
    llm_breakdown: {
      chatgpt: { mentions: 0, checks: 30, top_competitors: [] },
      claude: { mentions: 0, checks: 30, top_competitors: [] },
      gemini: { mentions: 0, checks: 30, top_competitors: [] },
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('download-plan API handler', () => {
  it('returns 405 for non-GET methods', async () => {
    const req = makeReq('POST');
    const res = makeRes();
    await downloadPlanHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('returns 400 when code is missing', async () => {
    const req = makeReq('GET', {});
    const res = makeRes();
    await downloadPlanHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access code required' });
  });

  it('returns 404 when audit not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('GET', { code: '00000000' });
    const res = makeRes();
    await downloadPlanHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when audit is not ready', async () => {
    mockSingle.mockResolvedValueOnce({ data: { ...readyAudit, status: 'processing' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('GET', { code: '12345678' });
    const res = makeRes();
    await downloadPlanHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Audit not ready' });
  });

  it('returns 400 when audit has no results', async () => {
    mockSingle.mockResolvedValueOnce({ data: { ...readyAudit, results: null }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('GET', { code: '12345678' });
    const res = makeRes();
    await downloadPlanHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns CSV with correct headers for a ready audit', async () => {
    mockSingle.mockResolvedValueOnce({ data: readyAudit, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('GET', { code: '12345678' });
    const res = makeRes();
    await downloadPlanHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename=')
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const csvContent: string = res.send.mock.calls[0][0];
    expect(csvContent).toContain('Company: Acme Corp');
    expect(csvContent).toContain('Week,Phase,Days,Action,Details,Priority,Data Source');
  });

  it('uses website_url in filename when company_name is missing', async () => {
    const auditNoName = { ...readyAudit, company_name: null };
    mockSingle.mockResolvedValueOnce({ data: auditNoName, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('GET', { code: '12345678' });
    const res = makeRes();
    await downloadPlanHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('audit')
    );
  });
});
