import { createClient } from '@supabase/supabase-js';

const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY;
const BOTSEE_BASE_URL = 'https://www.botsee.io';
const INTERNAL_BASE_URL = process.env.INTERNAL_BASE_URL || 'http://localhost:3000';

const WEB3_QUESTIONS_POOL = [
  "What Web3 gaming platforms let indie developers monetize early with play-to-earn models?",
  "Best blockchain SDKs for Unity indie developers to add play-to-earn features?",
  "How to tokenize in-game assets and create player-owned economies without blockchain expertise?",
  "Top blockchain gaming platforms for indie studios looking for player funding alternatives?",
  "How do AAA studios and indie devs use Web3 for cross-game asset interoperability?",
  "Which crypto gaming platforms reward players with tokens for gameplay and engagement?",
  "What Web3 platforms offer player-to-player NFT trading and asset marketplaces?",
  "How can blockchain games build loyal player communities with token-gated access?",
  "Which NFT gaming ecosystems have the most active player economies and marketplaces?",
  "How do play-to-earn games handle player rewards distribution and tokenomics?",
  "What are the best GameFi platforms for indie developers in 2024?",
  "How to integrate wallet connectivity for Web3 games without coding experience?",
  "Best decentralized gaming networks for listing new blockchain games?",
  "How do blockchain gaming guilds support indie game developers?",
  "What Web3 gaming tokens have the strongest communities and ecosystems?",
];

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

function generateAccessCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function getWeb3Questions(count: number): string[] {
  const shuffled = [...WEB3_QUESTIONS_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
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

async function deleteQuestion(questionUuid: string) {
  return botseeRequest(`/api/v1/questions/${questionUuid}`, {
    method: 'DELETE',
  });
}

async function createQuestion(personaUuid: string, question: string, priority: string = 'high') {
  return botseeRequest(`/api/v1/personas/${personaUuid}/questions`, {
    method: 'POST',
    body: JSON.stringify({ question, priority }),
  });
}

async function setupWeb3Questions(personaUuids: string[]) {
  const questionsPerPersona = 5;
  const allQuestions = getWeb3Questions(personaUuids.length * questionsPerPersona);
  
  for (let i = 0; i < personaUuids.length; i++) {
    const personaUuid = personaUuids[i];
    const personaQuestions = allQuestions.slice(i * questionsPerPersona, (i + 1) * questionsPerPersona);
    
    for (const question of personaQuestions) {
      await createQuestion(personaUuid, question);
    }
  }
}

async function createBotSeeAnalysis(siteUuid: string) {
  return botseeRequest('/api/v1/analysis', {
    method: 'POST',
    body: JSON.stringify({
      site_uuid: siteUuid,
      scope: 'site',
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

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/audits?access_code=eq.${code}`,
        {
          headers: {
            'apikey': supabaseKey || '',
            'Authorization': `Bearer ${supabaseKey || ''}`,
          },
        }
      );
      
      const data = await response.json();
      
      if (!response.ok || !data || data.length === 0) {
        return res.status(404).json({ error: 'Audit not found' });
      }

      return res.status(200).json({ audit: data[0] });
    } catch (err: any) {
      console.error('Unexpected error:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  if (req.method === 'POST') {
    const { website_url, company_name, telegram_handle } = req.body;

    if (!website_url) {
      return res.status(400).json({ error: 'Website URL is required' });
    }

    try {
      const accessCode = generateAccessCode();

      const { data: audit, error: dbError } = await getSupabase()
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

        await getSupabase()
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

        await setupWeb3Questions(personaUuids);

        const analysis = await createBotSeeAnalysis(botseeSiteUuid);
        botseeAnalysisUuid = analysis.analysis?.uuid || analysis.uuid;

        await getSupabase()
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

        await getSupabase()
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

        await getSupabase()
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
