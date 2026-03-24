// Mock @supabase/supabase-js before importing the handler
const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });

const mockFrom = jest.fn(() => ({
  select: mockSelect,
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

import sendTelegramHandler from '@/pages/api/send-telegram';

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
});

describe('send-telegram API handler', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = makeReq('GET');
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 when telegram_handle is missing', async () => {
    const req = makeReq('POST', { message: 'hello' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing telegram_handle or message' });
  });

  it('returns 400 when message is missing', async () => {
    const req = makeReq('POST', { telegram_handle: '@user' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with success=false when user has not started the bot', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('POST', { telegram_handle: '@unknownuser', message: 'hello' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('sends message and returns success when chat_id is found', async () => {
    mockSingle.mockResolvedValueOnce({ data: { chat_id: '999' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    mockFetch.mockReturnValueOnce(
      makeFetchResponse({ ok: true, result: { message_id: 42 } })
    );

    const req = makeReq('POST', { telegram_handle: '@testuser', message: 'Hello World' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message_id: 42 });
  });

  it('prepends @ when handle is provided without it', async () => {
    mockSingle.mockResolvedValueOnce({ data: { chat_id: '555' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    mockFetch.mockReturnValueOnce(
      makeFetchResponse({ ok: true, result: { message_id: 7 } })
    );

    const req = makeReq('POST', { telegram_handle: 'noatsign', message: 'Test' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 when Telegram API returns ok=false', async () => {
    mockSingle.mockResolvedValueOnce({ data: { chat_id: '123' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    mockFetch.mockReturnValueOnce(
      makeFetchResponse({ ok: false, description: 'Bad Request' })
    );

    const req = makeReq('POST', { telegram_handle: '@user', message: 'Hi' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 500 on unexpected error', async () => {
    mockFrom.mockImplementationOnce(() => { throw new Error('DB crash'); });

    const req = makeReq('POST', { telegram_handle: '@user', message: 'Hi' });
    const res = makeRes();
    await sendTelegramHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
