// Mock audit data for testing
export const mockAudits: Record<string, any> = {
  '12345678': {
    id: 'mock-123',
    access_code: '12345678',
    website_url: 'https://example.com',
    company_name: 'Example Inc',
    status: 'ready',
    created_at: new Date().toISOString(),
    results: {
      total_mentions: 217,
      competitors: [
        { name: 'Wintermute', appearance_pct: 80, mentions: 24, avg_rank: 2.5, confidence: 77, color: '#005BF3' },
        { name: 'GSR', appearance_pct: 57, mentions: 17, avg_rank: 3.2, confidence: 68, color: '#00D9A5' },
        { name: 'Kairon Labs', appearance_pct: 53, mentions: 16, avg_rank: 4.1, confidence: 65, color: '#9B59B6' },
        { name: 'DWF Labs', appearance_pct: 43, mentions: 13, avg_rank: 4.8, confidence: 60, color: '#F39C12' },
        { name: 'Cumberland', appearance_pct: 40, mentions: 12, avg_rank: 5.1, confidence: 63, color: '#06B6D4' },
        { name: 'Keyrock', appearance_pct: 35, mentions: 10, avg_rank: 5.5, confidence: 58, color: '#EC4899' },
      ],
      sources: [
        { name: 'wintermute.com', url: 'https://wintermute.com', mentions: 10 },
        { name: 'gsr.io', url: 'https://gsr.io', mentions: 9 },
        { name: 'b2c2.com', url: 'https://b2c2.com', mentions: 8 },
        { name: 'cumberland.io', url: 'https://cumberland.io', mentions: 5 },
        { name: 'keyrock.eu', url: 'https://keyrock.eu', mentions: 4 },
        { name: 'flowtraders.com', url: 'https://flowtraders.com', mentions: 4 },
      ],
      llm_breakdown: {
        chatgpt: { mentions: 0, checks: 72, top_competitors: ['Wintermute', 'GSR'] },
        claude: { mentions: 0, checks: 72, top_competitors: ['Wintermute', 'GSR'] },
        gemini: { mentions: 0, checks: 73, top_competitors: ['Wintermute', 'GSR'] },
      },
      gap_analysis: [
        { ai_term: 'Market Making', evidence: '17 queries mentioning this term', priority: 'high' },
        { ai_term: 'Liquidity Provider', evidence: '12 queries mentioning this term', priority: 'high' },
        { ai_term: 'Algorithmic Trading', evidence: '8 queries mentioning this term', priority: 'medium' },
        { ai_term: 'OTC Desk', evidence: '6 queries mentioning this term', priority: 'medium' },
        { ai_term: 'TGE Support', evidence: '4 queries mentioning this term', priority: 'low' },
        { ai_term: 'Token Issuance', evidence: '3 queries mentioning this term', priority: 'low' },
      ],
      keywords: [
        { keyword: 'crypto market making', frequency: 24 },
        { keyword: 'defi liquidity', frequency: 18 },
        { keyword: 'token trading', frequency: 15 },
        { keyword: 'algorithmic trading', frequency: 12 },
        { keyword: 'institutional trading', frequency: 9 },
      ]
    }
  }
};

// Simulate getting an audit by code
export function getMockAudit(code: string) {
  return mockAudits[code] || null;
}

// Generate a random mock audit based on domain
export function generateMockAudit(domain: string, code: string) {
  const domainName = domain.replace(/https?:\/\//, '').replace(/www\./, '').split('.')[0];
  const companyName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
  
  return {
    id: `mock-${code}`,
    access_code: code,
    website_url: domain,
    company_name: companyName,
    status: 'ready',
    created_at: new Date().toISOString(),
    results: {
      total_mentions: Math.floor(Math.random() * 100) + 150,
      competitors: [
        { name: 'Wintermute', appearance_pct: 75 + Math.floor(Math.random() * 15), mentions: Math.floor(Math.random() * 15) + 20, avg_rank: 1 + Math.random() * 3, confidence: 70 + Math.floor(Math.random() * 20), color: '#005BF3' },
        { name: 'GSR', appearance_pct: 50 + Math.floor(Math.random() * 20), mentions: Math.floor(Math.random() * 12) + 15, avg_rank: 2 + Math.random() * 3, confidence: 60 + Math.floor(Math.random() * 25), color: '#00D9A5' },
        { name: 'Kairon Labs', appearance_pct: 40 + Math.floor(Math.random() * 25), mentions: Math.floor(Math.random() * 10) + 12, avg_rank: 3 + Math.random() * 3, confidence: 55 + Math.floor(Math.random() * 30), color: '#9B59B6' },
        { name: 'DWF Labs', appearance_pct: 35 + Math.floor(Math.random() * 20), mentions: Math.floor(Math.random() * 10) + 10, avg_rank: 4 + Math.random() * 3, confidence: 50 + Math.floor(Math.random() * 25), color: '#F39C12' },
        { name: 'Cumberland', appearance_pct: 30 + Math.floor(Math.random() * 20), mentions: Math.floor(Math.random() * 8) + 8, avg_rank: 4 + Math.random() * 3, confidence: 50 + Math.floor(Math.random() * 25), color: '#06B6D4' },
        { name: 'Keyrock', appearance_pct: 25 + Math.floor(Math.random() * 20), mentions: Math.floor(Math.random() * 6) + 6, avg_rank: 5 + Math.random() * 3, confidence: 45 + Math.floor(Math.random() * 25), color: '#EC4899' },
      ],
      sources: [
        { name: 'wintermute.com', url: 'https://wintermute.com', mentions: 8 + Math.floor(Math.random() * 5) },
        { name: 'gsr.io', url: 'https://gsr.io', mentions: 7 + Math.floor(Math.random() * 5) },
        { name: 'b2c2.com', url: 'https://b2c2.com', mentions: 6 + Math.floor(Math.random() * 5) },
        { name: 'cumberland.io', url: 'https://cumberland.io', mentions: 4 + Math.floor(Math.random() * 4) },
        { name: 'keyrock.eu', url: 'https://keyrock.eu', mentions: 3 + Math.floor(Math.random() * 3) },
        { name: 'flowtraders.com', url: 'https://flowtraders.com', mentions: 3 + Math.floor(Math.random() * 3) },
      ],
      llm_breakdown: {
        chatgpt: { mentions: 0, checks: 72, top_competitors: ['Wintermute', 'GSR'] },
        claude: { mentions: 0, checks: 72, top_competitors: ['Wintermute', 'GSR'] },
        gemini: { mentions: 0, checks: 73, top_competitors: ['Wintermute', 'GSR'] },
      },
      gap_analysis: [
        { ai_term: 'Market Making', evidence: `${10 + Math.floor(Math.random() * 15)} queries mentioning this term`, priority: 'high' },
        { ai_term: 'Liquidity Provider', evidence: `${8 + Math.floor(Math.random() * 12)} queries mentioning this term`, priority: 'high' },
        { ai_term: 'Algorithmic Trading', evidence: `${5 + Math.floor(Math.random() * 10)} queries mentioning this term`, priority: 'medium' },
        { ai_term: 'OTC Desk', evidence: `${4 + Math.floor(Math.random() * 8)} queries mentioning this term`, priority: 'medium' },
        { ai_term: 'TGE Support', evidence: `${2 + Math.floor(Math.random() * 5)} queries mentioning this term`, priority: 'low' },
        { ai_term: 'Token Issuance', evidence: `${2 + Math.floor(Math.random() * 4)} queries mentioning this term`, priority: 'low' },
      ],
      keywords: [
        { keyword: 'crypto market making', frequency: 15 + Math.floor(Math.random() * 20) },
        { keyword: 'defi liquidity', frequency: 10 + Math.floor(Math.random() * 15) },
        { keyword: 'token trading', frequency: 8 + Math.floor(Math.random() * 12) },
        { keyword: 'algorithmic trading', frequency: 6 + Math.floor(Math.random() * 10) },
        { keyword: 'institutional trading', frequency: 4 + Math.floor(Math.random() * 8) },
      ]
    }
  };
}
