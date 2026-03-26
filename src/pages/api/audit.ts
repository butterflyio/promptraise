import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY;
const BOTSEE_BASE_URL = 'https://www.botsee.io';
const INTERNAL_BASE_URL = process.env.INTERNAL_BASE_URL || 'http://localhost:3000';
function generateAccessCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

async function botseeRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BOTSEE_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${BOTSEE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `BotSee API error: ${JSON.stringify(data)}`);
  }

  return data;
}

async function createBotSeeSite(url: string, companyName: string) {
  return botseeRequest('/api/v1/sites', {
    method: 'POST',
    body: JSON.stringify({
      url,
      product_name: companyName || undefined,
    }),
  });
}

async function generateCustomerTypes(siteUuid: string, count = 1) {
  return botseeRequest(`/api/v1/sites/${siteUuid}/customer-types/generate`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

async function generatePersonas(customerTypeUuid: string, count = 2) {
  return botseeRequest(`/api/v1/customer-types/${customerTypeUuid}/personas/generate`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

async function generateQuestions(personaUuid: string, count = 5) {
  return botseeRequest(`/api/v1/personas/${personaUuid}/questions/generate`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

async function createBotSeeAnalysis(siteUuid: string) {
  return botseeRequest('/api/v1/analysis', {
    method: 'POST',
    body: JSON.stringify({
      site_uuid: siteUuid,
      scope: 'site',
      models: ['openai', 'claude', 'gemini'],
    }),
  });
}

async function getBotSeeAnalysis(analysisUuid: string) {
  return botseeRequest(`/api/v1/analysis/${analysisUuid}`, {
    method: 'GET',
  });
}

async function getBotSeeCompetitors(analysisUuid: string) {
  return botseeRequest(`/api/v1/analysis/${analysisUuid}/competitors`, {
    method: 'GET',
  });
}

async function getBotSeeKeywordOpportunities(analysisUuid: string) {
  return botseeRequest(`/api/v1/analysis/${analysisUuid}/keyword_opportunities`, {
    method: 'GET',
  });
}

async function getBotSeeSourceOpportunities(analysisUuid: string) {
  return botseeRequest(`/api/v1/analysis/${analysisUuid}/source_opportunities`, {
    method: 'GET',
  });
}

async function pollForResults(analysisUuid: string, onProgress: (msg: string) => void) {
  const maxAttempts = 60;
  const delayMs = 30000;

  for (let i = 0; i < maxAttempts; i++) {
    const analysis = await getBotSeeAnalysis(analysisUuid);
    
    if (analysis.analysis?.status === 'completed') {
      return analysis.analysis;
    }
    
    if (analysis.analysis?.status === 'failed') {
      throw new Error('BotSee analysis failed');
    }

    onProgress(`Processing... (${i + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Analysis timed out');
}

function transformBotSeeResults(
  analysisData: any,
  competitorsData: any,
  keywordsData: any,
  sourcesData: any
) {
  const competitors = competitorsData?.by_customer_type?.[0]?.competitors || [];
  const keywords = keywordsData?.opportunities || [];
  const sources = sourcesData?.source_opportunities || [];

  return {
    total_mentions: analysisData?.response_count || 0,
    competitors: competitors.slice(0, 10).map((c: any, i: number) => ({
      name: c.name || `Competitor ${i + 1}`,
      appearance_pct: c.appearance_percentage || 0,
      mentions: c.total_mentions || 0,
      avg_rank: c.avg_rank || 0,
      confidence: c.avg_confidence ? c.avg_confidence * 100 : 50,
      is_own: c.is_own || false,
      color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][i % 5],
    })),
    sources: sources.slice(0, 10).map((s: any) => ({
      name: s.domain || 'Unknown Source',
      url: s.url || '',
      mentions: s.citation_count || 0,
    })),
    llm_breakdown: {
      chatgpt: {
        mentions: 0,
        checks: 0,
        top_competitors: [],
      },
      claude: {
        mentions: 0,
        checks: 0,
        top_competitors: [],
      },
      gemini: {
        mentions: 0,
        checks: 0,
        top_competitors: [],
      },
    },
    keywords: keywords.slice(0, 10).map((k: any) => ({
      keyword: k.question || 'Unknown',
      frequency: k.total_responses || 0,
      competitors_ranking: k.by_model?.filter((m: any) => m.mentioned).map((m: any) => m.provider) || [],
      mentioned: k.by_model?.some((m: any) => m.mentioned) || false,
    })),
    gap_analysis: keywords.slice(0, 5).map((k: any) => ({
      ai_term: k.question || 'Unknown',
      evidence: `${k.total_responses || 0} responses`,
      priority: k.mentioned_count > 0 ? 'medium' : 'high',
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
        botseeSiteUuid = site.site?.uuid || site.uuid;

        await supabase
          .from('audits')
          .update({ botsee_site_uuid: botseeSiteUuid })
          .eq('id', audit.id);

        const customerTypes = await generateCustomerTypes(botseeSiteUuid, 1);
        const customerTypeUuid = customerTypes.customer_types?.[0]?.uuid;

        if (!customerTypeUuid) {
          throw new Error('Failed to generate customer type');
        }

        const personas = await generatePersonas(customerTypeUuid, 2);
        const personaUuids = personas.personas?.map((p: any) => p.uuid) || [];

        if (personaUuids.length === 0) {
          throw new Error('Failed to generate personas');
        }

        for (const personaUuid of personaUuids) {
          await generateQuestions(personaUuid, 5);
        }

        const analysis = await createBotSeeAnalysis(botseeSiteUuid);
        botseeAnalysisUuid = analysis.analysis?.uuid || analysis.uuid;

        await supabase
          .from('audits')
          .update({ botsee_analysis_uuid: botseeAnalysisUuid })
          .eq('id', audit.id);

        const results = await pollForResults(botseeAnalysisUuid, () => {});

        const [competitorsData, keywordsData, sourcesData] = await Promise.all([
          getBotSeeCompetitors(botseeAnalysisUuid),
          getBotSeeKeywordOpportunities(botseeAnalysisUuid),
          getBotSeeSourceOpportunities(botseeAnalysisUuid),
        ]);

        const transformedResults = transformBotSeeResults(
          results,
          competitorsData,
          keywordsData,
          sourcesData
        );

        await supabase
          .from('audits')
          .update({
            status: 'ready',
            results: transformedResults,
          })
          .eq('id', audit.id);

        if (telegram_handle) {
          await fetch(`${INTERNAL_BASE_URL}/api/send-telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telegram_handle,
              message: `✅ Your AI Visibility Audit is ready!\n\n🔑 Access Code: ${accessCode}\n📊 View your report at: ${INTERNAL_BASE_URL}/audit/${accessCode}`,
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
