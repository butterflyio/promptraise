interface AuditData {
  website_url: string;
  company_name: string;
  results: {
    total_mentions: number;
    competitors: Competitor[];
    gap_analysis: GapItem[];
    keywords: KeywordItem[];
    sources: SourceItem[];
    llm_breakdown: LLMData;
  };
}

interface Competitor {
  name: string;
  appearance_pct: number;
  mentions: number;
  avg_rank: number;
  confidence: number;
  is_own?: boolean;
}

interface GapItem {
  ai_term: string;
  evidence: string;
  priority: 'high' | 'medium' | 'low';
}

interface KeywordItem {
  keyword: string;
  frequency: number;
  mentioned: boolean;
  competitors_ranking?: string[];
}

interface SourceItem {
  name: string;
  url: string;
  mentions: number;
}

interface LLMData {
  chatgpt: { mentions: number; checks: number; top_competitors: string[] };
  claude: { mentions: number; checks: number; top_competitors: string[] };
  gemini: { mentions: number; checks: number; top_competitors: string[] };
}

interface DayTask {
  week: number;
  phase: string;
  dayStart: number;
  dayEnd: number;
  action: string;
  details: string;
  priority: string;
  dataSource: string;
}

interface Phase90Day {
  phase: number;
  name: string;
  weekStart: number;
  weekEnd: number;
  focus: string;
  summary: string;
  keyActions: string[];
}

export function generate90DayPlan(audit: AuditData): { phases: Phase90Day[]; tasks: DayTask[] } {
  const { results } = audit;
  const companyName = audit.company_name || 'Your Company';
  
  const gapAnalysis = results?.gap_analysis || [];
  const keywords = results?.keywords || [];
  const competitors = results?.competitors || [];
  const sources = results?.sources || [];
  
  const ownBrand = competitors.find(c => c.is_own);
  const visibility = ownBrand ? ownBrand.appearance_pct : 0;
  const topCompetitors = competitors.filter(c => !c.is_own).slice(0, 5);
  const highPriorityGaps = gapAnalysis.filter(g => g.priority === 'high');
  const mediumPriorityGaps = gapAnalysis.filter(g => g.priority === 'medium');
  
  const topSources = sources.slice(0, 5);
  const missedKeywords = keywords.filter(k => !k.mentioned);
  
  const tasks: DayTask[] = [];
  
  if (highPriorityGaps.length > 0) {
    tasks.push({
      week: 1,
      phase: 'Quick Wins',
      dayStart: 1,
      dayEnd: 7,
      action: 'Address High-Priority Terminology Gaps',
      details: `Add or reinforce terminology: "${highPriorityGaps.map(g => g.ai_term).join('", "')}"`,
      priority: 'High',
      dataSource: 'Gap Analysis - High Priority'
    });
  }
  
  if (missedKeywords.length > 0) {
    tasks.push({
      week: 1,
      phase: 'Quick Wins',
      dayStart: 1,
      dayEnd: 7,
      action: 'Update Homepage Meta & Content',
      details: `Incorporate missed keywords: "${missedKeywords.slice(0, 3).map(k => k.keyword).join('", "')}"`,
      priority: 'High',
      dataSource: 'Keywords - Not Mentioned'
    });
  }
  
  if (ownBrand) {
    tasks.push({
      week: 2,
      phase: 'Content Development',
      dayStart: 8,
      dayEnd: 14,
      action: 'Create Competitor Comparison Content',
      details: `Position against: ${topCompetitors.map(c => c.name).join(', ')}`,
      priority: 'High',
      dataSource: 'Competitor Analysis'
    });
  }
  
  if (topSources.length > 0) {
    tasks.push({
      week: 2,
      phase: 'Content Development',
      dayStart: 8,
      dayEnd: 14,
      action: 'Begin Backlink Outreach',
      details: `Contact: ${topSources.map(s => s.name).join(', ')}`,
      priority: 'High',
      dataSource: 'Top Cited Sources'
    });
  }
  
  tasks.push({
    week: 3,
    phase: 'Content Development',
    dayStart: 15,
    dayEnd: 21,
    action: 'Develop Targeted Blog Posts',
    details: `Write content around: "${missedKeywords.slice(0, 5).map(k => k.keyword).join('", "')}"`,
    priority: 'Medium',
    dataSource: 'Keyword Analysis'
  });
  
  if (mediumPriorityGaps.length > 0) {
    tasks.push({
      week: 3,
      phase: 'Content Development',
      dayStart: 15,
      dayEnd: 21,
      action: 'Update Feature & Service Sections',
      details: `Address: "${mediumPriorityGaps.map(g => g.ai_term).join('", "')}"`,
      priority: 'Medium',
      dataSource: 'Gap Analysis - Medium Priority'
    });
  }
  
  tasks.push({
    week: 4,
    phase: 'Authority Building',
    dayStart: 22,
    dayEnd: 28,
    action: 'Publish Guest Posts & PR',
    details: `Target mentions alongside: ${topCompetitors.slice(0, 3).map(c => c.name).join(', ')}`,
    priority: 'Medium',
    dataSource: 'Competitor Context'
  });
  
  tasks.push({
    week: 5,
    phase: 'Authority Building',
    dayStart: 29,
      dayEnd: 35,
    action: 'Partnership Outreach',
    details: `Build relationships with sources that mention: ${topCompetitors[0]?.name || 'competitors'}`,
    priority: 'Medium',
    dataSource: 'Competitor Analysis'
  });
  
  tasks.push({
    week: 6,
    phase: 'Authority Building',
    dayStart: 36,
    dayEnd: 42,
    action: 'Social Proof & Testimonials',
    details: 'Collect and display client success stories, case studies',
    priority: 'Low',
    dataSource: 'General Best Practice'
  });
  
  tasks.push({
    week: 7,
    phase: 'Monitor & Optimize',
    dayStart: 43,
    dayEnd: 49,
    action: 'Content Performance Review',
    details: 'Analyze engagement on new content, adjust strategy based on data',
    priority: 'Medium',
    dataSource: 'Performance Metrics'
  });
  
  tasks.push({
    week: 8,
    phase: 'Monitor & Optimize',
    dayStart: 50,
    dayEnd: 56,
    action: 'Refine Keyword Targeting',
    details: `Focus on: "${missedKeywords.slice(0, 5).map(k => k.keyword).join('", "')}"`,
    priority: 'Medium',
    dataSource: 'Keyword Analysis'
  });
  
  tasks.push({
    week: 9,
    phase: 'Growth',
    dayStart: 57,
    dayEnd: 63,
    action: 'Expand Backlink Profile',
    details: `Target remaining sources: ${sources.slice(5, 10).map(s => s.name).join(', ')}`,
    priority: 'Medium',
    dataSource: 'Source Opportunities'
  });
  
  tasks.push({
    week: 10,
    phase: 'Growth',
    dayStart: 64,
    dayEnd: 70,
    action: 'Increase Share of Voice',
    details: `Outrank: ${topCompetitors.slice(0, 3).map(c => `${c.name} (currently ${c.appearance_pct}%)`).join(', ')}`,
    priority: 'High',
    dataSource: 'Competitor Visibility %'
  });
  
  tasks.push({
    week: 11,
    phase: 'Growth',
    dayStart: 71,
    dayEnd: 77,
    action: 'Industry Mentions Push',
    details: 'Seek mentions in industry publications, podcasts, interviews',
    priority: 'Medium',
    dataSource: 'General Best Practice'
  });
  
  tasks.push({
    week: 12,
    phase: 'Final Review',
    dayStart: 78,
    dayEnd: 84,
    action: 'Run Follow-up AI Visibility Audit',
    details: `Compare to baseline: ${visibility}% visibility`,
    priority: 'High',
    dataSource: 'Baseline Audit'
  });
  
  tasks.push({
    week: 12,
    phase: 'Final Review',
    dayStart: 78,
    dayEnd: 84,
    action: 'Document Improvements & ROI',
    details: 'Calculate visibility improvement, wins, and learnings',
    priority: 'High',
    dataSource: 'Comparison Analysis'
  });
  
  tasks.push({
    week: 13,
    phase: 'Final Review',
    dayStart: 85,
    dayEnd: 90,
    action: 'Plan Next Quarter',
    details: 'Set new targets, plan content calendar, continue improvement cycle',
    priority: 'Medium',
    dataSource: 'Strategic Planning'
  });
  
  const phases: Phase90Day[] = [
    {
      phase: 1,
      name: 'Quick Wins',
      weekStart: 1,
      weekEnd: 4,
      focus: 'Fix immediate terminology gaps and quick content updates',
      summary: `Address ${highPriorityGaps.length} high-priority gaps and update homepage content with missing keywords`,
      keyActions: highPriorityGaps.slice(0, 3).map(g => `• ${g.ai_term}: ${g.evidence}`)
    },
    {
      phase: 2,
      name: 'Content Development',
      weekStart: 5,
      weekEnd: 8,
      focus: 'Create targeted content and begin backlink outreach',
      summary: `Develop content around ${missedKeywords.length} missed keywords and start outreach to ${topSources.length} top sources`,
      keyActions: [
        `• Write content for: ${missedKeywords.slice(0, 3).map(k => k.keyword.split(' ').slice(0, 3).join(' ')).join(', ')}`,
        `• Begin outreach to: ${topSources.slice(0, 3).map(s => s.name).join(', ')}`,
        '• Update feature sections with gap terminology'
      ]
    },
    {
      phase: 3,
      name: 'Authority Building',
      weekStart: 9,
      weekEnd: 12,
      focus: 'Build authority through partnerships and PR',
      summary: `Build backlinks and partnerships to compete with ${topCompetitors[0]?.name || 'top competitors'}`,
      keyActions: [
        `• Position against: ${topCompetitors.slice(0, 3).map(c => c.name).join(', ')}`,
        '• Guest posts and PR mentions',
        '• Partnership and collaboration outreach'
      ]
    }
  ];
  
  return { phases, tasks };
}

export function generateCSV(tasks: DayTask[], companyName: string): string {
  const headers = ['Week', 'Phase', 'Days', 'Action', 'Details', 'Priority', 'Data Source'];
  const rows = tasks.map(task => [
    task.week.toString(),
    task.phase,
    `${task.dayStart}-${task.dayEnd}`,
    `"${task.action}"`,
    `"${task.details}"`,
    task.priority,
    `"${task.dataSource}"`
  ]);
  
  return [
    `Company: ${companyName}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
}

export function generateHighLevelSummary(audit: AuditData): { priorityActions: string[]; milestones: { week: string; target: string }[] } {
  const { results } = audit;
  const competitors = results?.competitors || [];
  const gapAnalysis = results?.gap_analysis || [];
  const keywords = results?.keywords || [];
  
  const ownBrand = competitors.find(c => c.is_own);
  const visibility = ownBrand ? ownBrand.appearance_pct : 0;
  const topCompetitor = competitors.find(c => !c.is_own);
  
  const priorityActions: string[] = [];
  
  if (gapAnalysis.length > 0) {
    const topGap = gapAnalysis.find(g => g.priority === 'high');
    if (topGap) {
      priorityActions.push(`🎯 Add "${topGap.ai_term}" to key pages`);
    }
  }
  
  if (topCompetitor) {
    priorityActions.push(`💡 Compete with ${topCompetitor.name} (${topCompetitor.appearance_pct}% visibility)`);
  }
  
  const missedCount = keywords.filter(k => !k.mentioned).length;
  if (missedCount > 0) {
    priorityActions.push(`📝 Target ${missedCount} missed keyword queries`);
  }
  
  if (ownBrand && ownBrand.avg_rank > 5) {
    priorityActions.push(`📈 Improve ranking position (current: ${ownBrand.avg_rank})`);
  }
  
  const milestones = [
    { week: 'Week 4', target: 'Address immediate gaps' },
    { week: 'Week 8', target: `Visibility +${Math.max(5, 20 - visibility).toFixed(0)}%` },
    { week: 'Week 12', target: 'Re-audit & compare' }
  ];
  
  return { priorityActions, milestones };
}
