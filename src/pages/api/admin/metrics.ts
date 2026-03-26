import { createClient } from '@supabase/supabase-js';
// Helper to keep alignment with BotSee credit fields
import { extractBotseeCreditsWithKey } from '../../lib/botsee-credits';

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

    const baseQuery = supabase.from('audit_metrics');

    const { data: metrics, error } = await baseQuery
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: recent } = await baseQuery
      .select('status, credits_consumed, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const successCount = metrics?.filter(m => m.status === 'success').length || 0;
    const failedCount = metrics?.filter(m => m.status === 'failed').length || 0;
    const totalCredits = (metrics || []).reduce((sum, m) => sum + (Number(m.credits_consumed) || 0), 0);

    // Bucket recent metrics by day for simple charts
    const byDay: Record<string, { success: number; failed: number; credits: number }> = {};
    (recent || []).forEach((row) => {
      const day = row.created_at ? row.created_at.split('T')[0] : 'unknown';
      if (!byDay[day]) byDay[day] = { success: 0, failed: 0, credits: 0 };
      if (row.status === 'success') byDay[day].success += 1;
      if (row.status === 'failed') byDay[day].failed += 1;
      byDay[day].credits += Number(row.credits_consumed) || 0;
    });
    const timeline = Object.entries(byDay)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([date, values]) => ({ date, ...values }));

    res.status(200).json({
      metrics: metrics || [],
      summary: {
        success: successCount,
        failed: failedCount,
        credits_consumed: totalCredits,
      },
      timeline,
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}
