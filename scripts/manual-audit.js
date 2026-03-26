#!/usr/bin/env node

const https = require('https');

const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.INTERNAL_BASE_URL || 'https://promptraiseaudit.vercel.app';

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(...args) {
  if (VERBOSE) console.log('[AUDIT]', ...args);
}

function botseeRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, 'https://www.botsee.io');
    const body = options.body ? JSON.stringify(options.body) : undefined;
    
    const headers = {
      'Authorization': `Bearer ${BOTSEE_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: options.method || 'GET',
      headers,
    };

    log(`BotSee ${reqOptions.method} ${url.pathname}`);

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function supabaseRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    
    const headers = {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };

    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers,
    };

    log(`Supabase ${method} ${url.pathname}`);

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function generateAccessCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForAnalysis(analysisUuid, onProgress) {
  const maxAttempts = 60;
  const delayMs = 30000;

  for (let i = 0; i < maxAttempts; i++) {
    log(`Checking analysis status (${i + 1}/${maxAttempts})...`);
    
    const analysis = await botseeRequest(`/api/v1/analysis/${analysisUuid}`);
    
    if (analysis.analysis?.status === 'completed') {
      log('Analysis completed!');
      return analysis.analysis;
    }
    
    if (analysis.analysis?.status === 'failed') {
      throw new Error('BotSee analysis failed');
    }

    onProgress(`Processing... (${i + 1}/${maxAttempts}) - Status: ${analysis.analysis?.status || 'unknown'}`);
    console.log(`  Waiting for analysis... (${i + 1}/${maxAttempts}) - ${analysis.analysis?.status || 'unknown'}`);
    await sleep(delayMs);
  }

  throw new Error('Analysis timed out after 30 minutes');
}

function transformResults(analysisData, competitorsData, keywordsData, sourcesData) {
  const competitors = competitorsData?.by_customer_type?.[0]?.competitors || [];
  const keywords = keywordsData?.opportunities || [];
  const sources = sourcesData?.source_opportunities || [];

  return {
    total_mentions: analysisData?.response_count || 0,
    competitors: competitors.slice(0, 10).map((c, i) => ({
      name: c.name || `Competitor ${i + 1}`,
      appearance_pct: c.appearance_percentage || 0,
      mentions: c.total_mentions || 0,
      avg_rank: c.avg_rank || 0,
      confidence: c.avg_confidence ? c.avg_confidence * 100 : 50,
      is_own: c.is_own || false,
      color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][i % 5],
    })),
    sources: sources.slice(0, 10).map(s => ({
      name: s.domain || 'Unknown Source',
      url: s.url || '',
      mentions: s.citation_count || 0,
    })),
    llm_breakdown: {
      chatgpt: { mentions: 0, checks: 0, top_competitors: [] },
      claude: { mentions: 0, checks: 0, top_competitors: [] },
      gemini: { mentions: 0, checks: 0, top_competitors: [] },
    },
    keywords: keywords.slice(0, 10).map(k => ({
      keyword: k.question || 'Unknown',
      frequency: k.total_responses || 0,
      competitors_ranking: k.by_model?.filter(m => m.mentioned).map(m => m.provider) || [],
      mentioned: k.by_model?.some(m => m.mentioned) || false,
    })),
    gap_analysis: keywords.slice(0, 5).map(k => ({
      ai_term: k.question || 'Unknown',
      evidence: `${k.total_responses || 0} responses`,
      priority: k.mentioned_count > 0 ? 'medium' : 'high',
    })),
  };
}

async function runAudit(websiteUrl, companyName = null, telegramHandle = null) {
  console.log('\n🚀 Starting Manual Audit');
  console.log('='.repeat(50));
  console.log(`URL: ${websiteUrl}`);
  console.log(`Company: ${companyName || 'Auto-detected'}`);
  console.log(`Telegram: ${telegramHandle || 'Not provided'}`);
  console.log('='.repeat(50) + '\n');

  const accessCode = generateAccessCode();

  // Step 1: Create audit record in Supabase
  console.log('📝 Creating audit record in database...');
  const audit = await supabaseRequest('POST', '/rest/v1/audits', {
    access_code: accessCode,
    website_url: websiteUrl,
    company_name: companyName,
    telegram_handle: telegramHandle,
    status: 'processing',
  });
  
  const auditId = Array.isArray(audit) ? audit[0]?.id : audit?.id;
  if (!auditId) throw new Error('Failed to create audit record');
  console.log(`✅ Audit record created (ID: ${auditId}, Code: ${accessCode})\n`);

  let botseeSiteUuid = null;
  let botseeAnalysisUuid = null;

  try {
    // Step 2: Create BotSee site
    console.log('🔍 Creating BotSee site...');
    const site = await botseeRequest('/api/v1/sites', {
      method: 'POST',
      body: {
        url: websiteUrl,
        product_name: companyName || undefined,
      },
    });
    botseeSiteUuid = site.site?.uuid || site.uuid;
    console.log(`✅ Site created (UUID: ${botseeSiteUuid})\n`);

    // Step 3: Generate customer type
    console.log('👥 Generating customer type...');
    const customerTypes = await botseeRequest(`/api/v1/sites/${botseeSiteUuid}/customer-types/generate`, {
      method: 'POST',
      body: { count: 1 },
    });
    const customerTypeUuid = customerTypes.customer_types?.[0]?.uuid;
    if (!customerTypeUuid) throw new Error('Failed to generate customer type');
    console.log(`✅ Customer type generated (UUID: ${customerTypeUuid})\n`);

    // Step 4: Generate personas
    console.log('🎭 Generating personas...');
    const personas = await botseeRequest(`/api/v1/customer-types/${customerTypeUuid}/personas/generate`, {
      method: 'POST',
      body: { count: 2 },
    });
    const personaUuids = personas.personas?.map(p => p.uuid) || [];
    if (personaUuids.length === 0) throw new Error('Failed to generate personas');
    console.log(`✅ Generated ${personaUuids.length} personas\n`);

    // Step 5: Generate questions for each persona
    for (const personaUuid of personaUuids) {
      console.log(`❓ Generating questions for persona ${personaUuid}...`);
      await botseeRequest(`/api/v1/personas/${personaUuid}/questions/generate`, {
        method: 'POST',
        body: { count: 5 },
      });
      console.log(`✅ Questions generated\n`);
    }

    // Update audit with site UUID
    await supabaseRequest('PATCH', `/rest/v1/audits?id=eq.${auditId}`, {
      botsee_site_uuid: botseeSiteUuid,
    });

    // Step 6: Start analysis
    console.log('📊 Starting BotSee analysis...');
    console.log('   (This may take 2-5 minutes)\n');
    const analysis = await botseeRequest('/api/v1/analysis', {
      method: 'POST',
      body: {
        site_uuid: botseeSiteUuid,
        scope: 'site',
      },
    });
    botseeAnalysisUuid = analysis.analysis?.uuid || analysis.uuid;
    console.log(`✅ Analysis started (UUID: ${botseeAnalysisUuid})\n`);

    // Update audit with analysis UUID
    await supabaseRequest('PATCH', `/rest/v1/audits?id=eq.${auditId}`, {
      botsee_analysis_uuid: botseeAnalysisUuid,
    });

    // Step 7: Wait for analysis to complete
    console.log('⏳ Waiting for analysis to complete...');
    await waitForAnalysis(botseeAnalysisUuid, (msg) => {
      console.log(`  ${msg}`);
    });
    console.log('');

    // Step 8: Fetch results
    console.log('📈 Fetching analysis results...');
    const [competitorsData, keywordsData, sourcesData] = await Promise.all([
      botseeRequest(`/api/v1/analysis/${botseeAnalysisUuid}/competitors`),
      botseeRequest(`/api/v1/analysis/${botseeAnalysisUuid}/keyword_opportunities`),
      botseeRequest(`/api/v1/analysis/${botseeAnalysisUuid}/source_opportunities`),
    ]);
    console.log('✅ Results fetched\n');

    // Step 9: Transform and save results
    console.log('💾 Saving results...');
    const transformedResults = transformResults({}, competitorsData, keywordsData, sourcesData);
    
    await supabaseRequest('PATCH', `/rest/v1/audits?id=eq.${auditId}`, {
      status: 'ready',
      results: transformedResults,
    });
    console.log('✅ Results saved\n');

    // Step 10: Report link
    const reportUrl = `${BASE_URL}/audit/${accessCode}`;
    
    console.log('='.repeat(50));
    console.log('✅ AUDIT COMPLETE!');
    console.log('='.repeat(50));
    console.log(`\n🔗 View your report:\n`);
    console.log(`   ${reportUrl}\n`);
    console.log(`🔑 Access Code: ${accessCode}\n`);
    console.log('='.repeat(50));

    return { accessCode, reportUrl };

  } catch (error) {
    console.error('\n❌ Error during audit:', error.message);
    
    // Update audit status to failed
    try {
      await supabaseRequest('PATCH', `/rest/v1/audits?id=eq.${auditId}`, {
        status: 'failed',
      });
    } catch (e) {
      console.error('Failed to update audit status:', e.message);
    }
    
    throw error;
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
🔍 Manual BotSee Audit Script

Usage:
  node scripts/manual-audit.js <url> [options]

Arguments:
  url                 Website URL to audit (e.g., https://example.com)

Options:
  --name, -n          Company name
  --telegram, -t      Telegram handle
  --verbose, -v       Verbose output
  --help, -h          Show this help

Examples:
  node scripts/manual-audit.js https://qudo.io
  node scripts/manual-audit.js https://qudo.io --name "Qudo" --verbose
  node scripts/manual-audit.js https://example.com -n "Example Inc" -t "@mybot"

Environment Variables:
  BOTSEE_API_KEY              BotSee API key (required)
  NEXT_PUBLIC_SUPABASE_URL    Supabase URL (required)
  SUPABASE_SERVICE_ROLE_KEY   Supabase service role key (required)
  INTERNAL_BASE_URL           Base URL for report links (optional)
`);
  process.exit(0);
}

const urlArg = args.find(a => !a.startsWith('--') && !a.startsWith('-'));
const nameArg = args.find(a => a === '--name' || a === '-n') 
  ? args[args.indexOf(nameArg) + 1] 
  : null;
const telegramArg = args.find(a => a === '--telegram' || a === '-t')
  ? args[args.indexOf(telegramArg) + 1]
  : null;

const companyName = args.includes('--name') || args.includes('-n')
  ? args[args.indexOf('--name') + 1] || args[args.indexOf('-n') + 1]
  : null;
const telegramHandle = args.includes('--telegram') || args.includes('-t')
  ? args[args.indexOf('--telegram') + 1] || args[args.indexOf('-t') + 1]
  : null;

if (!urlArg) {
  console.error('Error: URL is required');
  console.error('Usage: node scripts/manual-audit.js <url>');
  process.exit(1);
}

if (!BOTSEE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: BOTSEE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

runAudit(urlArg, companyName, telegramHandle)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
