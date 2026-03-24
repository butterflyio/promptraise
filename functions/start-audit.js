const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const botseeApiKey = process.env.BOTSEE_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const BOTSEE_API_BASE = 'https://botsee.io/api/v1';

async function botseeRequest(endpoint, options = {}) {
  const response = await fetch(`${BOTSEE_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${botseeApiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response.json();
}

async function setupAndAnalyze(websiteUrl) {
  // 1. Create site
  const siteData = await botseeRequest('/sites', {
    method: 'POST',
    body: JSON.stringify({ url: websiteUrl }),
  });

  if (!siteData.site) {
    throw new Error(siteData.error?.message || 'Failed to create BotSee site');
  }

  const site = siteData.site;

  // 2. Get and generate customer types
  let ctData = await botseeRequest(`/sites/${site.uuid}/customer-types`);
  if (!ctData.customer_types?.length) {
    await botseeRequest(`/sites/${site.uuid}/customer-types/generate`, {
      method: 'POST',
      body: JSON.stringify({ count: 2 }),
    });
    ctData = await botseeRequest(`/sites/${site.uuid}/customer-types`);
  }

  // 3. Generate personas for each type
  for (const ct of ctData.customer_types || []) {
    let personasData = await botseeRequest(`/customer-types/${ct.uuid}/personas`);
    if (!personasData.personas?.length) {
      await botseeRequest(`/customer-types/${ct.uuid}/personas/generate`, {
        method: 'POST',
        body: JSON.stringify({ count: 4 }),
      });
    }
  }

  // 4. Generate questions for each persona
  for (const ct of ctData.customer_types || []) {
    const personasData = await botseeRequest(`/customer-types/${ct.uuid}/personas`);
    for (const persona of personasData.personas || []) {
      let questionsData = await botseeRequest(`/personas/${persona.uuid}/questions`);
      if (!questionsData.questions?.length) {
        await botseeRequest(`/personas/${persona.uuid}/questions/generate`, {
          method: 'POST',
          body: JSON.stringify({ count: 5 }),
        });
      }
    }
  }

  // 5. Run analysis
  const analysisData = await botseeRequest(`/sites/${site.uuid}/analysis`, {
    method: 'POST',
  });

  if (!analysisData.analysis) {
    throw new Error(analysisData.error?.message || 'Failed to start analysis');
  }

  return {
    siteUuid: site.uuid,
    analysisUuid: analysisData.analysis.uuid,
    companyName: site.product_name,
  };
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { website_url } = JSON.parse(event.body || '{}');

    if (!website_url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Website URL is required' }),
      };
    }

    // Normalize URL
    let normalizedUrl = website_url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Validate URL
    try {
      new URL(normalizedUrl);
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid URL format' }),
      };
    }

    // Generate access code
    const accessCode = String(Math.floor(10000000 + Math.random() * 90000000));

    // Create audit record in Supabase
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .insert({
        access_code: accessCode,
        website_url: normalizedUrl,
        status: 'processing',
      })
      .select('id')
      .single();

    if (auditError) {
      console.error('Supabase error:', auditError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create audit record' }),
      };
    }

    // Start BotSee analysis in background (don't await)
    setupAndAnalyze(normalizedUrl)
      .then(async (result) => {
        // Update audit with BotSee data
        await supabase
          .from('audits')
          .update({
            botsee_site_uuid: result.siteUuid,
            botsee_analysis_uuid: result.analysisUuid,
            company_name: result.companyName,
            status: 'processing',
          })
          .eq('id', audit.id);
      })
      .catch(async (error) => {
        console.error('BotSee error:', error);
        await supabase
          .from('audits')
          .update({
            status: 'failed',
          })
          .eq('id', audit.id);
      });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audit_id: audit.id,
        access_code: accessCode,
        report_url: `/audit/${accessCode}`,
        status: 'processing',
        message: 'Audit started. Check back in ~25 mins.',
      }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
