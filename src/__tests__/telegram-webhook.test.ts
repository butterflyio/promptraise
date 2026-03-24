// Mock @supabase/supabase-js before importing the handler
const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });

const mockFrom = jest.fn(() => ({
  upsert: mockUpsert,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function makeFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);
}

import webhookHandler from '@/pages/api/telegram-webhook';

function makeReq(method: string, body: Record<string, any> = {}) {
  return { method, body } as any;
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: fetch for Telegram welcome message succeeds
  mockFetch.mockResolvedValue(makeFetchResponse({ ok: true }));
});

describe('telegram-webhook API handler', () => {
  it('returns 200 status:ok for GET requests', async () => {
    const req = makeReq('GET');
    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('returns 405 for PUT/DELETE methods', async () => {
    for (const method of ['PUT', 'DELETE']) {
      const req = makeReq(method);
      const res = makeRes();
      await webhookHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
    }
  });

  it('handles /start command and upserts user', async () => {
    const req = makeReq('POST', {
      message: {
        from: { username: 'testuser' },
        chat: { id: 123 },
        text: '/start',
      },
    });
    const res = makeRes();
    await webhookHandler(req, res);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        username: '@testuser',
        chat_id: '123',
      }),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles a POST with no message gracefully', async () => {
    const req = makeReq('POST', {});
    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles a message with no username (no upsert, still sends /start reply)', async () => {
    const req = makeReq('POST', {
      message: {
        from: {},
        chat: { id: 456 },
        text: '/start',
      },
    });
    const res = makeRes();
    await webhookHandler(req, res);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles unknown commands gracefully', async () => {
    const req = makeReq('POST', {
      message: {
        from: { username: 'user2' },
        chat: { id: 789 },
        text: '/unknowncommand',
      },
    });
    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on unexpected error', async () => {
    mockFrom.mockImplementationOnce(() => { throw new Error('DB crash'); });

    const req = makeReq('POST', {
      message: {
        from: { username: 'erruser' },
        chat: { id: 999 },
        text: '/start',
      },
    });
    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
