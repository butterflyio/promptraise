import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminCode = process.env.ADMIN_ACCESS_CODE;
    const providedCode = (req.headers['x-admin-code'] || req.query.code || '').toString();

    if (!adminCode) {
      return res.status(500).json({ error: 'Admin access not configured' });
    }

    if (providedCode !== adminCode) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabase();

    const { data: metrics, error } = await supabase
      .from('audit_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = metrics || [];
    const headers = [
      'id',
      'audit_id',
      'botsee_site_uuid',
      'botsee_analysis_uuid',
      'status',
      'credits_consumed',
      'failure_reason',
      'started_at',
      'completed_at',
      'created_at',
      'metadata',
    ];

    const escape = (value: any) => {
      if (value === null || value === undefined) return '';
      const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csv = [headers.join(',')]
      .concat(
        rows.map((row) =>
          [
            row.id,
            row.audit_id,
            row.botsee_site_uuid,
            row.botsee_analysis_uuid,
            row.status,
            row.credits_consumed,
            row.failure_reason,
            row.started_at,
            row.completed_at,
            row.created_at,
            row.metadata,
          ].map(escape).join(',')
        )
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-metrics.csv"');
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting metrics CSV:', error);
    res.status(500).json({ error: 'Failed to export metrics' });
  }
}
