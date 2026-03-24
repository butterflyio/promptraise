import {
  generate90DayPlan,
  generateCSV,
  generateHighLevelSummary,
} from '@/lib/generate90DayPlan';

const baseAudit = {
  website_url: 'https://acme.com',
  company_name: 'Acme Corp',
  results: {
    total_mentions: 100,
    competitors: [
      { name: 'Acme Corp', appearance_pct: 30, mentions: 9, avg_rank: 4, confidence: 60, is_own: true },
      { name: 'Rival A', appearance_pct: 70, mentions: 21, avg_rank: 2, confidence: 80 },
      { name: 'Rival B', appearance_pct: 50, mentions: 15, avg_rank: 3, confidence: 70 },
    ],
    gap_analysis: [
      { ai_term: 'Market Making', evidence: '17 queries', priority: 'high' as const },
      { ai_term: 'Liquidity Provider', evidence: '12 queries', priority: 'high' as const },
      { ai_term: 'OTC Desk', evidence: '6 queries', priority: 'medium' as const },
    ],
    keywords: [
      { keyword: 'crypto trading', frequency: 20, mentioned: false },
      { keyword: 'defi liquidity', frequency: 15, mentioned: true },
      { keyword: 'token issuance', frequency: 10, mentioned: false },
    ],
    sources: [
      { name: 'source1.com', url: 'https://source1.com', mentions: 10 },
      { name: 'source2.com', url: 'https://source2.com', mentions: 8 },
    ],
    llm_breakdown: {
      chatgpt: { mentions: 3, checks: 30, top_competitors: ['Rival A'] },
      claude: { mentions: 2, checks: 30, top_competitors: ['Rival B'] },
      gemini: { mentions: 4, checks: 30, top_competitors: ['Rival A'] },
    },
  },
};

describe('generate90DayPlan', () => {
  it('returns phases and tasks arrays', () => {
    const { phases, tasks } = generate90DayPlan(baseAudit);
    expect(Array.isArray(phases)).toBe(true);
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('returns 3 phases', () => {
    const { phases } = generate90DayPlan(baseAudit);
    expect(phases).toHaveLength(3);
  });

  it('phases have required fields', () => {
    const { phases } = generate90DayPlan(baseAudit);
    for (const phase of phases) {
      expect(phase).toHaveProperty('phase');
      expect(phase).toHaveProperty('name');
      expect(phase).toHaveProperty('weekStart');
      expect(phase).toHaveProperty('weekEnd');
      expect(phase).toHaveProperty('focus');
      expect(phase).toHaveProperty('summary');
      expect(phase).toHaveProperty('keyActions');
      expect(Array.isArray(phase.keyActions)).toBe(true);
    }
  });

  it('tasks include a high-priority gap task when high-priority gaps exist', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const gapTask = tasks.find(t => t.action === 'Address High-Priority Terminology Gaps');
    expect(gapTask).toBeDefined();
    expect(gapTask?.priority).toBe('High');
    expect(gapTask?.details).toContain('Market Making');
  });

  it('tasks include missed keyword task when missed keywords exist', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const kwTask = tasks.find(t => t.action === 'Update Homepage Meta & Content');
    expect(kwTask).toBeDefined();
    expect(kwTask?.details).toContain('crypto trading');
  });

  it('tasks include competitor comparison task when own brand present', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const compTask = tasks.find(t => t.action === 'Create Competitor Comparison Content');
    expect(compTask).toBeDefined();
  });

  it('tasks include backlink outreach when sources are present', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const backlinkTask = tasks.find(t => t.action === 'Begin Backlink Outreach');
    expect(backlinkTask).toBeDefined();
    expect(backlinkTask?.details).toContain('source1.com');
  });

  it('always includes standard tasks regardless of data', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const actionNames = tasks.map(t => t.action);
    expect(actionNames).toContain('Develop Targeted Blog Posts');
    expect(actionNames).toContain('Publish Guest Posts & PR');
    expect(actionNames).toContain('Partnership Outreach');
    expect(actionNames).toContain('Social Proof & Testimonials');
    expect(actionNames).toContain('Content Performance Review');
    expect(actionNames).toContain('Refine Keyword Targeting');
    expect(actionNames).toContain('Expand Backlink Profile');
    expect(actionNames).toContain('Increase Share of Voice');
    expect(actionNames).toContain('Industry Mentions Push');
    expect(actionNames).toContain('Run Follow-up AI Visibility Audit');
    expect(actionNames).toContain('Document Improvements & ROI');
    expect(actionNames).toContain('Plan Next Quarter');
  });

  it('tasks have required fields', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    for (const task of tasks) {
      expect(task).toHaveProperty('week');
      expect(task).toHaveProperty('phase');
      expect(task).toHaveProperty('dayStart');
      expect(task).toHaveProperty('dayEnd');
      expect(task).toHaveProperty('action');
      expect(task).toHaveProperty('details');
      expect(task).toHaveProperty('priority');
      expect(task).toHaveProperty('dataSource');
    }
  });

  it('works with empty results (no gaps, no keywords, no competitors)', () => {
    const minimalAudit = {
      website_url: 'https://empty.com',
      company_name: 'Empty',
      results: {
        total_mentions: 0,
        competitors: [],
        gap_analysis: [],
        keywords: [],
        sources: [],
        llm_breakdown: {
          chatgpt: { mentions: 0, checks: 0, top_competitors: [] },
          claude: { mentions: 0, checks: 0, top_competitors: [] },
          gemini: { mentions: 0, checks: 0, top_competitors: [] },
        },
      },
    };
    const { phases, tasks } = generate90DayPlan(minimalAudit);
    expect(phases).toHaveLength(3);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('falls back to "Your Company" when company_name is empty', () => {
    const auditNoName = { ...baseAudit, company_name: '' };
    // Should not throw
    const { tasks } = generate90DayPlan(auditNoName);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('does not add high-priority gap task when there are no high-priority gaps', () => {
    const noHighGaps = {
      ...baseAudit,
      results: {
        ...baseAudit.results,
        gap_analysis: [
          { ai_term: 'OTC Desk', evidence: '6 queries', priority: 'medium' as const },
        ],
      },
    };
    const { tasks } = generate90DayPlan(noHighGaps);
    expect(tasks.find(t => t.action === 'Address High-Priority Terminology Gaps')).toBeUndefined();
  });

  it('includes medium-priority gap task when medium gaps exist', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const mediumTask = tasks.find(t => t.action === 'Update Feature & Service Sections');
    expect(mediumTask).toBeDefined();
    expect(mediumTask?.details).toContain('OTC Desk');
  });
});

describe('generateCSV', () => {
  it('includes company name header', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const csv = generateCSV(tasks, 'Acme Corp');
    expect(csv).toContain('Company: Acme Corp');
  });

  it('includes a Generated timestamp', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const csv = generateCSV(tasks, 'Acme Corp');
    expect(csv).toContain('Generated:');
  });

  it('includes CSV headers', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const csv = generateCSV(tasks, 'Acme Corp');
    expect(csv).toContain('Week,Phase,Days,Action,Details,Priority,Data Source');
  });

  it('includes task data rows', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const csv = generateCSV(tasks, 'Acme Corp');
    const lines = csv.split('\n');
    // Header row (2 metadata lines + blank + column headers) = 4, then data rows
    expect(lines.length).toBeGreaterThan(5);
  });

  it('formats day ranges correctly (dayStart-dayEnd)', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const csv = generateCSV(tasks, 'Acme Corp');
    expect(csv).toMatch(/1-7/);
  });

  it('returns valid CSV with quoted fields', () => {
    const { tasks } = generate90DayPlan(baseAudit);
    const csv = generateCSV(tasks, 'Acme Corp');
    expect(csv).toMatch(/"[^"]+"/);
  });
});

describe('generateHighLevelSummary', () => {
  it('returns priorityActions and milestones', () => {
    const result = generateHighLevelSummary(baseAudit);
    expect(result).toHaveProperty('priorityActions');
    expect(result).toHaveProperty('milestones');
    expect(Array.isArray(result.priorityActions)).toBe(true);
    expect(Array.isArray(result.milestones)).toBe(true);
  });

  it('includes a high-priority gap action', () => {
    const { priorityActions } = generateHighLevelSummary(baseAudit);
    expect(priorityActions.some(a => a.includes('Market Making'))).toBe(true);
  });

  it('includes competitor action when competitors exist', () => {
    const { priorityActions } = generateHighLevelSummary(baseAudit);
    expect(priorityActions.some(a => a.includes('Rival A'))).toBe(true);
  });

  it('includes missed keyword count when keywords are missed', () => {
    const { priorityActions } = generateHighLevelSummary(baseAudit);
    expect(priorityActions.some(a => a.includes('missed keyword'))).toBe(true);
  });

  it('includes ranking improvement action when avg_rank > 5', () => {
    const highRankAudit = {
      ...baseAudit,
      results: {
        ...baseAudit.results,
        competitors: [
          { name: 'Acme Corp', appearance_pct: 20, mentions: 5, avg_rank: 7, confidence: 50, is_own: true },
          { name: 'Rival A', appearance_pct: 60, mentions: 18, avg_rank: 2, confidence: 75 },
        ],
      },
    };
    const { priorityActions } = generateHighLevelSummary(highRankAudit);
    expect(priorityActions.some(a => a.includes('Improve ranking'))).toBe(true);
  });

  it('returns 3 milestones', () => {
    const { milestones } = generateHighLevelSummary(baseAudit);
    expect(milestones).toHaveLength(3);
  });

  it('milestone weeks are Week 4, Week 8, Week 12', () => {
    const { milestones } = generateHighLevelSummary(baseAudit);
    expect(milestones[0].week).toBe('Week 4');
    expect(milestones[1].week).toBe('Week 8');
    expect(milestones[2].week).toBe('Week 12');
  });

  it('works with no data', () => {
    const emptyAudit = {
      website_url: 'https://x.com',
      company_name: 'X',
      results: {
        total_mentions: 0,
        competitors: [],
        gap_analysis: [],
        keywords: [],
        sources: [],
        llm_breakdown: {
          chatgpt: { mentions: 0, checks: 0, top_competitors: [] },
          claude: { mentions: 0, checks: 0, top_competitors: [] },
          gemini: { mentions: 0, checks: 0, top_competitors: [] },
        },
      },
    };
    const result = generateHighLevelSummary(emptyAudit);
    expect(result.priorityActions).toEqual([]);
    expect(result.milestones).toHaveLength(3);
  });
});
