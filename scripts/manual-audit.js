#!/usr/bin/env node

const https = require('https');
const readline = require('readline');

const BASE_URL = process.env.INTERNAL_BASE_URL || 'https://promptraiseaudit.vercel.app';
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(...args) {
  if (VERBOSE) console.log('[AUDIT]', ...args);
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createReadline();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function botseeRequest(endpoint, options = {}) {
  const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY;
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
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function generateWeb3Personas(productName, valueProposition, websiteUrl) {
  const baseContext = valueProposition || productName || 'Web3 product';
  
  const personas = [
    {
      name: 'Web3 Enthusiast & Early Adopter',
      description: `Tech-savvy individual aged 25-40 interested in blockchain gaming, NFTs, and crypto rewards. Actively searches for platforms that offer token-based incentives, play-to-earn models, and decentralized gaming experiences. Values ownership of digital assets and looks for games with real economic value.`,
    },
    {
      name: 'Gaming Industry Professional',
      description: `Game developer or gaming platform operator exploring Web3 integration. Seeks SDKs, infrastructure, and tools to add blockchain features (tokens, NFTs, wallets) to existing or new games. Interested in player engagement mechanics and new monetization channels through crypto.`,
    },
  ];

  return personas;
}

function generateWeb3Questions(personaName, websiteContext) {
  const web3Topics = [
    'play-to-earn gaming platforms',
    'blockchain SDK for game developers',
    'NFT gaming ecosystems',
    'crypto reward systems for players',
    'Web3 gaming infrastructure',
    'token-gated gaming communities',
    'decentralized gaming networks',
    'GameFi platforms for indie developers',
    'blockchain gaming monetization',
    'player-owned economies',
  ];

  const baseQuestions = {
    'Web3 Enthusiast & Early Adopter': [
      `What are the best ${web3Topics[0]} that reward players with tokens?`,
      `How do I find games where I can earn cryptocurrency while playing?`,
      `Which ${web3Topics[6]} have the most active player communities?`,
    ],
    'Gaming Industry Professional': [
      `What ${web3Topics[1]} should I use to add blockchain features to my Unity game?`,
      `How can ${web3Topics[3]} increase player retention in my platform?`,
      `What ${web3Topics[8]} strategies work best for mobile games?`,
    ],
  };

  return baseQuestions[personaName] || [
    `What are the best ${web3Topics[0]}?`,
    `How do ${web3Topics[3]} work in gaming?`,
    `What ${web3Topics[9]} platforms are most popular?`,
  ];
}

async function showApprovalSummary(websiteUrl, productName, valueProposition, personas, allQuestions) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 AUDIT APPROVAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n🌐 Website: ${websiteUrl}`);
  console.log(`🏢 Product: ${productName || 'Auto-detected'}\n`);
  
  console.log('-'.repeat(60));
  console.log('📊 CONFIGURATION');
  console.log('-'.repeat(60));
  console.log('Customer Type: Web3 Retail Buyer');
  console.log('Personas: 2');
  console.log('Questions: 3 per persona (6 total)');
  console.log('LLMs: ChatGPT, Claude, Perplexity, Gemini (4 total)\n');
  
  console.log('-'.repeat(60));
  console.log('🤖 PROPOSED PERSONAS & QUESTIONS');
  console.log('-'.repeat(60));
  
  let qIndex = 0;
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`\nPersona ${i + 1}: ${persona.name}`);
    console.log(`  Description: ${persona.description.substring(0, 100)}...`);
    console.log('  Questions:');
    
    const questions = allQuestions.slice(qIndex, qIndex + 3);
    questions.forEach((q, j) => {
      console.log(`    ${j + 1}. ${q}`);
    });
    qIndex += 3;
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log('🔍 ANALYSIS PLAN');
  console.log('-'.repeat(60));
  console.log('• Analyze across 4 AI search engines');
  console.log('• Pull keyword opportunities (where your brand is missing)');
  console.log('• Pull source opportunities (link-building targets)\n');
  
  console.log('-'.repeat(60));
  console.log('💰 ESTIMATED COST');
  console.log('-'.repeat(60));
  console.log('Credits: ~150-200');
  console.log('Time: ~3-5 minutes\n');
  
  console.log('⚠️ NOTE: Perplexity may fail on sites requiring screenshot analysis');
  console.log('   (Known BotSee limitation - analysis will continue with other LLMs)\n');
  
  console.log('='.repeat(60));
  
  const answer = await prompt('✅ READY TO PROCEED? (y/n): ');
  return answer === 'y' || answer === 'yes';
}

async function runAudit(websiteUrl, companyName = null, telegramHandle = null) {
  console.log('\n🚀 Starting Manual Audit (Approval-First Workflow)');
  console.log('='.repeat(60));
  console.log(`URL: ${websiteUrl}`);
  console.log(`Company: ${companyName || 'Auto-detected'}`);
  console.log(`Telegram: ${telegramHandle || 'Not provided'}`);
  console.log('='.repeat(60) + '\n');

  const accessCode = generateAccessCode();

  console.log('📝 Step 1: Creating BotSee site...');
  const site = await botseeRequest('/api/v1/sites', {
    method: 'POST',
    body: {
      url: websiteUrl,
      product_name: companyName || undefined,
    },
  });
  
  const botseeSiteUuid = site.site?.uuid || site.uuid;
  const productName = site.site?.product_name || companyName || 'Web3 Product';
  const valueProposition = site.site?.value_proposition || '';
  console.log(`✅ Site created (UUID: ${botseeSiteUuid})`);
  console.log(`   Product: ${productName}`);
  console.log(`   Value Prop: ${valueProposition.substring(0, 80)}...\n`);

  console.log('📝 Step 2: Generating personas based on website + Web3 context...');
  const personas = generateWeb3Personas(productName, valueProposition, websiteUrl);
  const allQuestions = personas.flatMap(p => generateWeb3Questions(p.name, valueProposition));
  
  console.log(`✅ Generated ${personas.length} personas with ${allQuestions.length} Web3-focused questions\n`);

  console.log('📝 Step 3: Awaiting approval for personas and questions...\n');
  const approved = await showApprovalSummary(websiteUrl, productName, valueProposition, personas, allQuestions);
  
  if (!approved) {
    console.log('\n❌ Audit cancelled by user.\n');
    return null;
  }

  console.log('\n✅ Approved! Creating personas and questions...\n');

  let createdPersonas = [];
  
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`📝 Creating Persona ${i + 1}: ${persona.name}`);
    
    const created = await botseeRequest(`/api/v1/sites/${botseeSiteUuid}/customer-types`, {
      method: 'POST',
      body: {
        name: 'Web3 Retail Buyer',
        description: 'Web3 and blockchain gaming focused customers',
      },
    });
    
    const customerTypeUuid = created.customer_type?.uuid;
    
    const personaCreated = await botseeRequest(`/api/v1/customer-types/${customerTypeUuid}/personas`, {
      method: 'POST',
      body: {
        name: persona.name,
        description: persona.description,
      },
    });
    
    const personaUuid = personaCreated.persona?.uuid;
    createdPersonas.push({ uuid: personaUuid, name: persona.name });
    console.log(`✅ Created persona: ${persona.name}\n`);
  }

  console.log('📝 Creating questions for each persona...\n');
  for (let i = 0; i < createdPersonas.length; i++) {
    const persona = createdPersonas[i];
    const questions = allQuestions.slice(i * 3, (i + 1) * 3);
    
    console.log(`Questions for ${persona.name}:`);
    for (const question of questions) {
      await botseeRequest(`/api/v1/personas/${persona.uuid}/questions`, {
        method: 'POST',
        body: { question, priority: 'high' },
      });
      console.log(`  ✓ ${question.substring(0, 60)}...`);
    }
    console.log('');
  }

  console.log('📝 Step 4: Creating audit record in database...');
  const audit = await supabaseRequest('POST', '/rest/v1/audits', {
    access_code: accessCode,
    website_url: websiteUrl,
    company_name: productName,
    telegram_handle: telegramHandle,
    botsee_site_uuid: botseeSiteUuid,
    status: 'processing',
  });
  
  const auditId = Array.isArray(audit) ? audit[0]?.id : audit?.id;
  if (!auditId) throw new Error('Failed to create audit record');
  console.log(`✅ Audit record created (ID: ${auditId}, Code: ${accessCode})\n`);

  console.log('📊 Step 5: Starting BotSee analysis across 4 LLMs...');
  console.log('   (This may take 3-5 minutes)\n');
  
  const analysis = await botseeRequest('/api/v1/analysis', {
    method: 'POST',
    body: {
      site_uuid: botseeSiteUuid,
      scope: 'site',
    },
  });
  
  const botseeAnalysisUuid = analysis.analysis?.uuid || analysis.uuid;
  console.log(`✅ Analysis started (UUID: ${botseeAnalysisUuid})\n`);

  await supabaseRequest('PATCH', `/rest/v1/audits?id=eq.${auditId}`, {
    botsee_analysis_uuid: botseeAnalysisUuid,
  });

  console.log('⏳ Step 6: Waiting for analysis to complete...');
  await waitForAnalysis(botseeAnalysisUuid, (msg) => {
    console.log(`  ${msg}`);
  });
  console.log('');

  console.log('📈 Step 7: Fetching results...');
  const [competitorsData, keywordsData, sourcesData] = await Promise.all([
    botseeRequest(`/api/v1/analysis/${botseeAnalysisUuid}/competitors`),
    botseeRequest(`/api/v1/analysis/${botseeAnalysisUuid}/keyword_opportunities`),
    botseeRequest(`/api/v1/analysis/${botseeAnalysisUuid}/source_opportunities`),
  ]);
  console.log('✅ Results fetched\n');

  console.log('💾 Step 8: Saving results...');
  const transformedResults = transformResults({}, competitorsData, keywordsData, sourcesData);
  
  await supabaseRequest('PATCH', `/rest/v1/audits?id=eq.${auditId}`, {
    status: 'ready',
    results: transformedResults,
  });
  console.log('✅ Results saved\n');

  const reportUrl = `${BASE_URL}/audit/${accessCode}`;
  
  console.log('='.repeat(60));
  console.log('✅ AUDIT COMPLETE!');
  console.log('='.repeat(60));
  console.log(`\n🔗 View your report:\n`);
  console.log(`   ${reportUrl}\n`);
  console.log(`🔑 Access Code: ${accessCode}\n`);
  console.log('='.repeat(60));

  return { accessCode, reportUrl };
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
🔍 Manual BotSee Audit Script (Approval-First)

Usage:
  node scripts/manual-audit.js <url> [options]

Arguments:
  url                 Website URL to audit (e.g., https://example.com)

Options:
  --name, -n          Company/product name
  --telegram, -t      Telegram handle
  --verbose, -v       Verbose output
  --help, -h          Show this help

Examples:
  node scripts/manual-audit.js https://qudo.io
  node scripts/manual-audit.js https://example.com --name "Example Inc"

Environment Variables:
  BOTSEE_API_KEY              BotSee API key (required)
  NEXT_PUBLIC_SUPABASE_URL    Supabase URL (required)
  SUPABASE_SERVICE_ROLE_KEY   Supabase service role key (required)
  INTERNAL_BASE_URL           Base URL for report links (optional)
`);
  process.exit(0);
}

const urlArg = args.find(a => !a.startsWith('--') && !a.startsWith('-'));
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

const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOTSEE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: BOTSEE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

runAudit(urlArg, companyName, telegramHandle)
  .then((result) => {
    if (result) {
      console.log('\n✅ Done!');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
