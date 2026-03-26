import type { NextApiRequest, NextApiResponse } from 'next';

const BOTSEE_API = process.env.BOTSEE_API_URL || 'https://api.botsee.ai';
const BOTSEE_KEY = process.env.BOTSEE_API_KEY || process.env.BOTSEE_API_TOKEN;

async function callBotsee(path: string) {
  if (!BOTSEE_KEY) throw new Error('BotSee API key not configured');
  const res = await fetch(`${BOTSEE_API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BOTSEE_KEY,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || `BotSee error (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.response = data;
    throw err;
  }
  return data;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uuid = (req.query.uuid || '').toString();
  const includeDetails = ((req.query.details || '') as string).toLowerCase() === 'true' || req.query.details === '1';
  if (!uuid) {
    return res.status(400).json({ error: 'Missing analysis uuid' });
  }

  try {
    const analysis = await callBotsee(`/analysis/${uuid}`);

    // If requested and completed, fetch supplemental data
    let competitors = null;
    let keywords = null;
    let sources = null;
    const status = analysis?.analysis?.status || analysis?.status;

    if (includeDetails && status === 'completed') {
      const fetchers = [
        callBotsee(`/analysis/${uuid}/competitors`).catch(() => null),
        callBotsee(`/analysis/${uuid}/keywords`).catch(() => null),
        callBotsee(`/analysis/${uuid}/sources`).catch(() => null),
      ];
      const [comp, kw, src] = await Promise.all(fetchers);
      competitors = comp;
      keywords = kw;
      sources = src;
    }

    return res.status(200).json({ analysis, competitors, keywords, sources });
  } catch (error: any) {
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'Failed to fetch analysis status', details: error?.response });
  }
}
