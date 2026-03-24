import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Audit {
  id: string;
  access_code: string;
  website_url: string;
  company_name: string | null;
  telegram_handle: string | null;
  botsee_site_uuid: string | null;
  botsee_analysis_uuid: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  results: AuditResults | null;
  created_at: string;
  updated_at: string;
}

export interface AuditResults {
  total_mentions: number;
  competitors: Competitor[];
  sources: Source[];
  llm_breakdown: LLMBreakdown;
  keywords: KeywordOpportunity[];
  gap_analysis: GapAnalysis[];
}

export interface Competitor {
  name: string;
  appearance_pct: number;
  mentions: number;
  avg_rank: number;
  confidence: number;
  color: string;
}

export interface Source {
  name: string;
  url: string;
  mentions: number;
}

export interface LLMBreakdown {
  chatgpt: LLMStats;
  claude: LLMStats;
  gemini: LLMStats;
}

export interface LLMStats {
  mentions: number;
  checks: number;
  top_competitors: string[];
}

export interface KeywordOpportunity {
  keyword: string;
  frequency: number;
  competitors_ranking: string[];
}

export interface GapAnalysis {
  ai_term: string;
  evidence: string;
  priority: 'high' | 'medium' | 'low';
}

export async function getAuditByCode(code: string): Promise<Audit | null> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('access_code', code)
    .single();
  
  if (error) {
    console.error('Error fetching audit:', error);
    return null;
  }
  
  return data as Audit;
}

export async function createAudit(websiteUrl: string): Promise<{ code: string; id: string } | null> {
  // Generate access code (8 digits)
  const accessCode = String(Math.floor(10000000 + Math.random() * 90000000));
  
  const { data, error } = await supabase
    .from('audits')
    .insert({
      access_code: accessCode,
      website_url: websiteUrl,
      status: 'pending'
    })
    .select('id, access_code')
    .single();
  
  if (error) {
    console.error('Error creating audit:', error);
    return null;
  }
  
  return { code: data.access_code, id: data.id };
}

export async function updateAuditStatus(
  id: string,
  updates: Partial<Audit>
): Promise<boolean> {
  const { error } = await supabase
    .from('audits')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);
  
  if (error) {
    console.error('Error updating audit:', error);
    return false;
  }
  
  return true;
}
