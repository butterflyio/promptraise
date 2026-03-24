import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY;
const BOTSEE_BASE_URL = 'https://api.botsee.io';

function generateAccessCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

async function createBotSeeSite(url, companyName) {
  const response = await fetch(`${BOTSEE_BASE_URL}/v1/site`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BOTSEE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      name: companyName,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BotSee site creation failed: ${error}`);
  }

  return response.json();
}

async function createBotSeeAnalysis(siteUuid) {
  const response = await fetch(`${BOTSEE_BASE_URL}/v1/analysis`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BOTSEE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_uuid: siteUuid,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BotSee analysis creation failed: ${error}`);
  }

  return response.json();
}

async function getBotSeeAnalysis(analysisUuid) {
  const response = await fetch(`${BOTSEE_BASE_URL}/v1/analysis/${analysisUuid}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${BOTSEE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BotSee analysis fetch failed: ${error}`);
  }

  return response.json();
}

async function pollForResults(analysisUuid, onProgress) {
  const maxAttempts = 60;
  const delayMs = 30000;

  for (let i = 0; i < maxAttempts; i++) {
    const analysis = await getBotSeeAnalysis(analysisUuid);
    
    if (analysis.status === 'completed') {
      return analysis;
    }
    
    if (analysis.status === 'failed') {
      throw new Error('BotSee analysis failed');
    }

    if (onProgress) {
      onProgress(`Processing... (${i + 1}/${maxAttempts})`);
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Analysis timed out');
}

function transformBotSeeResults(botseeData) {
  const sources = botseeData.sources || [];
  const llmData = botseeData.llm_data || {};
  const competitors = botseeData.competitors || [];
  const gaps = botseeData.gaps || [];

  return {
    total_mentions: botseeData.total_mentions || 0,
    competitors: competitors.map((c, i) => ({
      name: c.name || `Competitor ${i + 1}`,
      appearance_pct: c.appearance_pct || 0,
      mentions: c.mentions || 0,
      avg_rank: c.avg_rank || 0,
      confidence: c.confidence || 0.5,
      color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][i % 5],
    })),
    sources: sources.slice(0, 10).map(s => ({
      name: s.name || 'Unknown Source',
      url: s.url || '',
      mentions: s.mentions || 0,
    })),
    llm_breakdown: {
      chatgpt: {
        mentions: llmData.chatgpt?.mentions || 0,
        checks: llmData.chatgpt?.checks || 0,
        top_competitors: llmData.chatgpt?.top_competitors || [],
      },
      claude: {
        mentions: llmData.claude?.mentions || 0,
        checks: llmData.claude?.checks || 0,
        top_competitors: llmData.claude?.top_competitors || [],
      },
      gemini: {
        mentions: llmData.gemini?.mentions || 0,
        checks: llmData.gemini?.checks || 0,
        top_competitors: llmData.gemini?.top_competitors || [],
      },
    },
    keywords: gaps.slice(0, 10).map(g => ({
      keyword: g.term || 'Unknown',
      frequency: g.frequency || 0,
      competitors_ranking: g.who_mentions || [],
    })),
    gap_analysis: gaps.slice(0, 5).map(g => ({
      ai_term: g.term || 'Unknown',
      evidence: g.evidence || '',
      priority: g.priority || 'medium',
    })),
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Access code required' });
    }

    const { data: audit, error: dbError } = await supabase
      .from('audits')
      .select('*')
      .eq('access_code', code)
      .single();

    if (dbError) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    return res.status(200).json({ audit });
  }

  if (req.method === 'POST') {
    const { website_url, company_name, telegram_handle } = req.body;

    if (!website_url) {
      return res.status(400).json({ error: 'Website URL is required' });
    }

    try {
      const accessCode = generateAccessCode();

      const { data: audit, error: dbError } = await supabase
        .from('audits')
        .insert({
          access_code: accessCode,
          website_url,
          company_name: company_name || null,
          telegram_handle: telegram_handle || null,
          status: 'processing',
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        return res.status(500).json({ error: 'Failed to create audit record' });
      }

    let botseeSiteUuid = null;
    let botseeAnalysisUuid = null;

    try {
      const site = await createBotSeeSite(website_url, company_name);
      botseeSiteUuid = site.uuid;

      await supabase
        .from('audits')
        .update({ botsee_site_uuid: botseeSiteUuid })
        .eq('id', audit.id);

      const analysis = await createBotSeeAnalysis(botseeSiteUuid);
      botseeAnalysisUuid = analysis.uuid;

      await supabase
        .from('audits')
        .update({ botsee_analysis_uuid: botseeAnalysisUuid })
        .eq('id', audit.id);

      const results = await pollForResults(botseeAnalysisUuid, () => {});
      const transformedResults = transformBotSeeResults(results);

      await supabase
        .from('audits')
        .update({
          status: 'ready',
          results: transformedResults,
        })
        .eq('id', audit.id);

      if (telegram_handle) {
        await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/send-telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_handle,
            message: `✅ Your AI Visibility Audit is ready!\n\n🔑 Access Code: ${accessCode}\n📊 View your report at: ${req.headers.origin || 'http://localhost:3000'}/audit/${accessCode}`,
          }),
        });
      }

      return res.status(200).json({
        success: true,
        access_code: accessCode,
        status: 'ready',
      });

    } catch (botseeError) {
      console.error('BotSee error:', botseeError);

      await supabase
        .from('audits')
        .update({ status: 'failed' })
        .eq('id', audit.id);

      return res.status(500).json({
        error: botseeError.message || 'BotSee API error',
        access_code: accessCode,
        status: 'failed',
      });
    }

    } catch (error) {
      console.error('Unexpected error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

