import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { validateAuditInput } from '../../lib/validation';
import { extractBotseeCreditsWithKey } from '../../lib/botsee-credits';

const BOTSEE_API = process.env.BOTSEE_API_URL || 'https://api.botsee.ai';
const BOTSEE_KEY = process.env.BOTSEE_API_KEY || process.env.BOTSEE_API_TOKEN;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

async function callBotsee(path: string, opts: RequestInit = {}) {
  if (!BOTSEE_KEY) throw new Error('BotSee API key not configured');
  const res = await fetch(`${BOTSEE_API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BOTSEE_KEY,
      ...(opts.headers || {}),
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, telegram } = req.body || {};
  const { normalized, errors } = validateAuditInput(url || '', telegram || '');
  if (errors.url || errors.telegram) {
    return res.status(400).json({ error: errors.url || errors.telegram });
  }

  const supabase = getSupabase();
  const auditInsert = {
    status: 'processing',
    credits_consumed: 0,
    failure_reason: null,
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  let metricRow: any = null;

  try {
    // Create or update audit_metrics row early for tracking
    const { data: inserted, error: insertErr } = await supabase
      .from('audit_metrics')
      .insert({
        ...auditInsert,
        url: normalized.url,
        telegram: normalized.telegram,
      })
      .select('*')
      .single();

    if (insertErr) throw insertErr;
    metricRow = inserted;

    // Step 1: Create or get site in BotSee (POST /sites with {"url": "..."})
    console.log('[Audit] Creating/getting BotSee site for:', normalized.url);
    const sitePayload = { url: normalized.url };
    const siteResp = await callBotsee('/sites', {
      method: 'POST',
      body: JSON.stringify(sitePayload),
    });
    const site = siteResp.site || siteResp || {};
    const siteUuid = site.uuid;
    if (!siteUuid) {
      throw new Error('BotSee did not return site UUID');
    }
    console.log('[Audit] BotSee site UUID:', siteUuid);

    // Step 2: Trigger analysis with site_uuid (POST /analysis with {"site_uuid": "..."})
    const analysisPayload = { site_uuid: siteUuid };
    console.log('[Audit] Starting BotSee analysis with payload:', analysisPayload);
    const botseeResp = await callBotsee('/analysis', {
      method: 'POST',
      body: JSON.stringify(analysisPayload),
    });

    const analysis = botseeResp.analysis || botseeResp || {};
    const { credits, key: credit_key } = extractBotseeCreditsWithKey(botseeResp);
    console.log('[Audit] Analysis response:', { uuid: analysis.uuid, credits, credit_key });

    // Update metrics row with success
    await supabase
      .from('audit_metrics')
      .update({
        status: 'success',
        botsee_site_uuid: siteUuid,
        botsee_analysis_uuid: analysis.uuid || null,
        credits_consumed: credits,
        completed_at: new Date().toISOString(),
        metadata: { credit_key },
      })
      .eq('id', metricRow.id);

    return res.status(200).json({ ok: true, analysis_uuid: analysis.uuid, site_uuid: siteUuid, credits, credit_key });
  } catch (error: any) {
    const message = error?.message || 'Audit failed';
    console.error('[Audit] Error:', message, error?.response || error);
    
    if (metricRow?.id) {
      await supabase
        .from('audit_metrics')
        .update({
          status: 'failed',
          failure_reason: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', metricRow.id);
    }

    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({ error: message, details: error?.response });
  }
}
