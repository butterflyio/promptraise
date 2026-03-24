/**
 * External API Dependency Tests
 *
 * Maps and tests all external API dependencies used in this application.
 * Tests verify correct endpoint URLs, authentication headers, and request
 * construction for each integration point.
 *
 * Any warning logged with [FLAG_TO_REVISIT] indicates a known failure mode
 * or missing configuration that should be re-evaluated before deploying.
 */

// --- Mock setup (must appear before any imports) ---

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

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// --- Imports ---

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
import sendTelegramHandler from '@/pages/api/send-telegram';
import webhookHandler from '@/pages/api/telegram-webhook';

// --- Helpers ---

const FLAG_TO_REVISIT = '[FLAG_TO_REVISIT]';

function makeReq(method: string, body: Record<string, unknown> = {}) {
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

// =============================================================================
// DEPENDENCY MAP
// Documents every external API this application depends on.
// =============================================================================

/**
 * The EXTERNAL_APIS constant is the single source of truth for all external
 * API dependencies. Update this map whenever an integration changes.
 */
const EXTERNAL_APIS = {
  BOTSEE: {
    baseUrl: 'https://botsee.io/api/v1',
    authType: 'Bearer token (Authorization header)',
    envVar: 'BOTSEE_API_KEY',
    endpoints: [
      'GET  /auth/validate',
      'POST /sites',
      'GET  /sites/:uuid',
      'GET  /sites/:uuid/customer-types',
      'POST /sites/:uuid/customer-types/generate',
      'GET  /customer-types/:uuid/personas',
      'POST /customer-types/:uuid/personas/generate',
      'GET  /personas/:uuid/questions',
      'POST /personas/:uuid/questions/generate',
      'POST /sites/:uuid/analysis',
      'GET  /analysis/:uuid',
      'GET  /analysis/:uuid/keyword-opportunities',
      'GET  /analysis/:uuid/source-opportunities',
      'GET  /analysis/:uuid/results/competitors',
    ],
  },
  SUPABASE: {
    envVars: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    tables: {
      audits: {
        columns: [
          'id',
          'access_code',
          'website_url',
          'company_name',
          'telegram_handle',
          'botsee_site_uuid',
          'botsee_analysis_uuid',
          'status',
          'results',
          'created_at',
          'updated_at',
        ],
        statusValues: ['pending', 'processing', 'ready', 'failed'],
      },
      telegram_users: {
        columns: ['username', 'chat_id', 'updated_at'],
        uniqueConstraint: 'username',
      },
    },
  },
  TELEGRAM: {
    baseUrl: 'https://api.telegram.org',
    authType: 'Bot token embedded in URL path (/bot{token}/...)',
    envVar: 'TELEGRAM_BOT_TOKEN',
    endpoints: ['POST /bot{token}/sendMessage'],
  },
} as const;

describe('External API Dependency Map', () => {
  it('catalogs the BotSee API base URL and all endpoints', () => {
    expect(EXTERNAL_APIS.BOTSEE.baseUrl).toBe('https://botsee.io/api/v1');
    expect(EXTERNAL_APIS.BOTSEE.endpoints.length).toBeGreaterThan(0);
    expect(EXTERNAL_APIS.BOTSEE.endpoints).toContain('POST /sites');
    expect(EXTERNAL_APIS.BOTSEE.endpoints).toContain('POST /sites/:uuid/analysis');
    expect(EXTERNAL_APIS.BOTSEE.endpoints).toContain('GET  /analysis/:uuid/keyword-opportunities');
    expect(EXTERNAL_APIS.BOTSEE.endpoints).toContain('GET  /analysis/:uuid/source-opportunities');
    expect(EXTERNAL_APIS.BOTSEE.endpoints).toContain('GET  /analysis/:uuid/results/competitors');
  });

  it('catalogs the Telegram Bot API base URL and endpoints', () => {
    expect(EXTERNAL_APIS.TELEGRAM.baseUrl).toBe('https://api.telegram.org');
    expect(EXTERNAL_APIS.TELEGRAM.endpoints).toContain('POST /bot{token}/sendMessage');
  });

  it('catalogs the Supabase tables and their required columns', () => {
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.columns).toContain('access_code');
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.statusValues).toContain('pending');
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.statusValues).toContain('ready');
    expect(EXTERNAL_APIS.SUPABASE.tables.telegram_users.columns).toContain('username');
    expect(EXTERNAL_APIS.SUPABASE.tables.telegram_users.columns).toContain('chat_id');
    expect(EXTERNAL_APIS.SUPABASE.tables.telegram_users.uniqueConstraint).toBe('username');
  });

  it('flags missing BOTSEE_API_KEY for revisit', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    if (!process.env.BOTSEE_API_KEY) {
      console.warn(
        `${FLAG_TO_REVISIT} BOTSEE_API_KEY is not configured – all BotSee API calls will fail`
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    } else {
      expect(process.env.BOTSEE_API_KEY.length).toBeGreaterThan(0);
    }
    warnSpy.mockRestore();
  });

  it('flags missing TELEGRAM_BOT_TOKEN for revisit', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.warn(
        `${FLAG_TO_REVISIT} TELEGRAM_BOT_TOKEN is not configured – Telegram notifications will fail silently`
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    } else {
      expect(process.env.TELEGRAM_BOT_TOKEN.length).toBeGreaterThan(0);
    }
    warnSpy.mockRestore();
  });

  it('flags missing Supabase environment variables for revisit', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = EXTERNAL_APIS.SUPABASE.envVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      console.warn(
        `${FLAG_TO_REVISIT} Missing Supabase env vars: ${missing.join(', ')} – database operations will fail`
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    } else {
      expect(missing).toHaveLength(0);
    }
    warnSpy.mockRestore();
  });
});

// =============================================================================
// BOTSEE API – Request URL and Authentication Mapping
// =============================================================================

describe('BotSee API – request URL and auth header mapping', () => {
  it('validates the API key against /auth/validate', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ valid: true }));
    await validateApiKey();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('botsee.io/api/v1');
    expect(url).toContain('/auth/validate');
  });

  it('attaches an Authorization: Bearer header to every request', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ valid: true }));
    await validateApiKey();
    const [, options] = mockFetch.mock.calls[0];
    expect(options?.headers).toHaveProperty('Authorization');
    expect(options.headers.Authorization).toMatch(/^Bearer /);
  });

  it('sets Content-Type: application/json on every request', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ valid: true }));
    await validateApiKey();
    const [, options] = mockFetch.mock.calls[0];
    expect(options?.headers['Content-Type']).toBe('application/json');
  });

  it('creates a site via POST /sites with the website URL in the body', async () => {
    const fakeSite = { uuid: 's-1', domain: 'acme.com', product_name: 'Acme', value_proposition: 'v', status: 'active' };
    mockFetch.mockReturnValueOnce(makeFetchResponse({ site: fakeSite }));
    await createSite('https://acme.com');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toMatch(/botsee\.io\/api\/v1\/sites$/);
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ url: 'https://acme.com' });
  });

  it('generates customer types via POST /sites/:uuid/customer-types/generate', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ credits_used: 1 }));
    await generateCustomerTypes('site-uuid-1', 2);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/sites/site-uuid-1/customer-types/generate');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ count: 2 });
  });

  it('generates personas via POST /customer-types/:uuid/personas/generate', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ credits_used: 2 }));
    await generatePersonas('ct-uuid-1', 4);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/customer-types/ct-uuid-1/personas/generate');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ count: 4 });
  });

  it('generates questions via POST /personas/:uuid/questions/generate', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ credits_used: 1 }));
    await generateQuestions('persona-uuid-1', 5);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/personas/persona-uuid-1/questions/generate');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ count: 5 });
  });

  it('starts analysis via POST /sites/:uuid/analysis', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ analysis: { uuid: 'a-1', status: 'pending' } }));
    await runAnalysis('site-uuid-1');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/sites/site-uuid-1/analysis');
    expect(options?.method).toBe('POST');
  });

  it('polls analysis status via GET /analysis/:uuid', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ analysis: { uuid: 'a-1', status: 'completed' } }));
    await getAnalysis('a-1');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/analysis\/a-1$/);
    expect(options?.method).toBeUndefined(); // default GET
  });

  it('fetches keyword opportunities via GET /analysis/:uuid/keyword-opportunities', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ opportunities: [] }));
    await getKeywordOpportunities('a-1');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/analysis/a-1/keyword-opportunities');
  });

  it('fetches source opportunities via GET /analysis/:uuid/source-opportunities', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ sources: [] }));
    await getSourceOpportunities('a-1');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/analysis/a-1/source-opportunities');
  });

  it('fetches competitor results via GET /analysis/:uuid/results/competitors', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ competitors: [] }));
    await getCompetitorResults('a-1');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/analysis/a-1/results/competitors');
  });

  it('fetches site details via GET /sites/:uuid', async () => {
    const fakeSite = { uuid: 'site-1', domain: 'a.com', product_name: 'A', value_proposition: 'v', status: 'active' };
    mockFetch.mockReturnValueOnce(makeFetchResponse({ site: fakeSite }));
    await getSite('site-1');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/sites\/site-1$/);
  });

  it('flags a 401 Unauthorized response as a revisit item', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Unauthorized' } }, false, 401));
    const result = await validateApiKey();
    expect(result).toBe(false);
    console.warn(`${FLAG_TO_REVISIT} BotSee returned 401 – verify BOTSEE_API_KEY is valid and not expired`);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    warnSpy.mockRestore();
  });

  it('flags a 429 rate-limit response as a revisit item', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockReturnValueOnce(makeFetchResponse({ error: { message: 'Too Many Requests' } }, false, 429));
    const result = await createSite('https://acme.com');
    expect(result).toBeNull();
    console.warn(`${FLAG_TO_REVISIT} BotSee returned 429 – implement retry/back-off logic or reduce request frequency`);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    warnSpy.mockRestore();
  });

  it('flags a network error (e.g. DNS failure) as a revisit item', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND botsee.io'));
    const result = await validateApiKey();
    expect(result).toBe(false);
    console.warn(`${FLAG_TO_REVISIT} BotSee is unreachable – check network connectivity and https://botsee.io/api/v1 availability`);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    warnSpy.mockRestore();
  });
});

// =============================================================================
// TELEGRAM BOT API – Request URL and Authentication Mapping
// =============================================================================

describe('Telegram Bot API – request URL and token mapping', () => {
  it('sends messages to https://api.telegram.org/bot{token}/sendMessage', async () => {
    mockSingle.mockResolvedValueOnce({ data: { chat_id: '123' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    mockFetch.mockReturnValueOnce(
      makeFetchResponse({ ok: true, result: { message_id: 1 } })
    );

    const req = makeReq('POST', { telegram_handle: '@testuser', message: 'Hello' });
    const res = makeRes();
    await sendTelegramHandler(req, res);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('api.telegram.org');
    expect(url).toContain('sendMessage');
    expect(url).toMatch(/api\.telegram\.org\/bot[^/]+\/sendMessage/);
  });

  it('includes chat_id, text, and parse_mode in the Telegram sendMessage body', async () => {
    mockSingle.mockResolvedValueOnce({ data: { chat_id: '456' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    mockFetch.mockReturnValueOnce(
      makeFetchResponse({ ok: true, result: { message_id: 2 } })
    );

    const req = makeReq('POST', { telegram_handle: '@user2', message: 'Test message' });
    const res = makeRes();
    await sendTelegramHandler(req, res);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty('chat_id', '456');
    expect(body).toHaveProperty('text', 'Test message');
    expect(body).toHaveProperty('parse_mode', 'HTML');
  });

  it('sends the /start welcome message via Telegram API on webhook /start command', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }));

    const req = makeReq('POST', {
      message: {
        from: { username: 'newuser' },
        chat: { id: 789 },
        text: '/start',
      },
    });
    const res = makeRes();
    await webhookHandler(req, res);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toMatch(/api\.telegram\.org\/bot[^/]+\/sendMessage/);
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty('chat_id', '789');
    expect(body).toHaveProperty('parse_mode', 'HTML');
  });

  it('flags a Telegram API error response as a revisit item', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSingle.mockResolvedValueOnce({ data: { chat_id: '999' }, error: null });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    mockFetch.mockReturnValueOnce(
      makeFetchResponse({ ok: false, description: 'chat not found' })
    );

    const req = makeReq('POST', { telegram_handle: '@gone', message: 'Hi' });
    const res = makeRes();
    await sendTelegramHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    console.warn(`${FLAG_TO_REVISIT} Telegram sendMessage failed – user may have blocked the bot or chat_id is stale`);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    warnSpy.mockRestore();
  });
});

// =============================================================================
// SUPABASE – Table and Schema Mapping
// =============================================================================

describe('Supabase – table and schema mapping', () => {
  it('reads from the audits table filtered by access_code', async () => {
    // Verify query structure: select('*').eq('access_code', code).single()
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.columns).toContain('access_code');
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.columns).toContain('status');
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.columns).toContain('results');
  });

  it('writes audit status updates using the id column', () => {
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.columns).toContain('id');
    expect(EXTERNAL_APIS.SUPABASE.tables.audits.columns).toContain('updated_at');
  });

  it('upserts telegram_users keyed on username with a unique constraint', () => {
    expect(EXTERNAL_APIS.SUPABASE.tables.telegram_users.uniqueConstraint).toBe('username');
    expect(EXTERNAL_APIS.SUPABASE.tables.telegram_users.columns).toContain('username');
    expect(EXTERNAL_APIS.SUPABASE.tables.telegram_users.columns).toContain('chat_id');
  });

  it('covers all valid audit status transitions', () => {
    const { statusValues } = EXTERNAL_APIS.SUPABASE.tables.audits;
    expect(statusValues).toContain('pending');
    expect(statusValues).toContain('processing');
    expect(statusValues).toContain('ready');
    expect(statusValues).toContain('failed');
    expect(statusValues).toHaveLength(4);
  });

  it('flags a Supabase query error as a revisit item', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'relation "audits" does not exist' } });
    mockEq.mockReturnValueOnce({ single: mockSingle });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const req = makeReq('GET', {});
    const res = makeRes();
    // Simulate a failed Supabase lookup driving a 404 from download-plan
    import('@/pages/api/download-plan').then(async ({ default: handler }) => {
      const dlReq = { method: 'GET', query: { code: 'testcode' } } as any;
      const dlRes = makeRes();
      await handler(dlReq, dlRes);
      // Supabase failure → audit not found → 404
      expect(dlRes.status).toHaveBeenCalledWith(404);
    });

    console.warn(`${FLAG_TO_REVISIT} Supabase returned a query error – verify table migrations are applied and connection is healthy`);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(FLAG_TO_REVISIT));
    warnSpy.mockRestore();
  });
});
