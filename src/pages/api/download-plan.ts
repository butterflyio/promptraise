import { createClient } from '@supabase/supabase-js';

const ACCESS_CODE_PATTERN = /^\d{8}$/;

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch {
    return null;
  }
}

function sanitizeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'GET');
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.query;

  if (!code || typeof code !== 'string' || !ACCESS_CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'Access code required' });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Server configuration is incomplete' });
    }

    const { data: audit, error: dbError } = await supabase
      .from('audits')
      .select('*')
      .eq('access_code', code)
      .single();

    if (dbError || !audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    if (audit.status !== 'ready' || !audit.results) {
      return res.status(400).json({ error: 'Audit not ready' });
    }

    const { generate90DayPlan, generateCSV } = await import('@/lib/generate90DayPlan');
    
    const auditData = {
      website_url: audit.website_url,
      company_name: audit.company_name || 'Unknown',
      results: audit.results
    };
    
    const { tasks } = generate90DayPlan(auditData);
    const csv = generateCSV(tasks, auditData.company_name || audit.website_url);

    const safeCompanyName = sanitizeFilePart(audit.company_name || '') || 'audit';
    const filename = `90-day-plan-${safeCompanyName}-${code}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);

  } catch (error) {
    console.error('Download plan error:', error);
    return res.status(500).json({ error: 'Failed to generate plan' });
  }
}
