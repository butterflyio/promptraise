const BOTSEE_API_BASE = 'https://botsee.io/api/v1';
const BOTSEE_API_KEY = process.env.BOTSEE_API_KEY || '';

interface BotSeeResponse<T> {
  data?: T;
  error?: string;
}

async function botseeRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<BotSeeResponse<T>> {
  try {
    const response = await fetch(`${BOTSEE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${BOTSEE_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error?.message || `API error: ${response.status}` };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface BotSeeSite {
  uuid: string;
  domain: string;
  product_name: string;
  value_proposition: string;
  status: string;
}

export interface BotSeeAnalysis {
  uuid: string;
  status: string;
  model_results?: {
    provider: string;
    status: string;
    responses_count: number;
  }[];
}

export async function validateApiKey(): Promise<boolean> {
  const result = await botseeRequest<{ valid: boolean }>('/auth/validate');
  return result.data?.valid || false;
}

export async function createSite(url: string): Promise<BotSeeSite | null> {
  const result = await botseeRequest<{ site: BotSeeSite }>('/sites', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

  return result.data?.site || null;
}

export async function generateCustomerTypes(siteUuid: string, count: number = 2): Promise<boolean> {
  const result = await botseeRequest<{ credits_used: number }>(
    `/sites/${siteUuid}/customer-types/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ count }),
    }
  );

  return !result.error;
}

export async function generatePersonas(customerTypeUuid: string, count: number = 4): Promise<boolean> {
  const result = await botseeRequest<{ credits_used: number }>(
    `/customer-types/${customerTypeUuid}/personas/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ count }),
    }
  );

  return !result.error;
}

export async function generateQuestions(personaUuid: string, count: number = 5): Promise<boolean> {
  const result = await botseeRequest<{ credits_used: number }>(
    `/personas/${personaUuid}/questions/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ count }),
    }
  );

  return !result.error;
}

export async function runAnalysis(siteUuid: string): Promise<BotSeeAnalysis | null> {
  const result = await botseeRequest<{ analysis: BotSeeAnalysis }>(
    `/sites/${siteUuid}/analysis`,
    { method: 'POST' }
  );

  return result.data?.analysis || null;
}

export async function getAnalysis(analysisUuid: string): Promise<BotSeeAnalysis | null> {
  const result = await botseeRequest<{ analysis: BotSeeAnalysis }>(
    `/analysis/${analysisUuid}`
  );

  return result.data?.analysis || null;
}

export async function getKeywordOpportunities(analysisUuid: string): Promise<any[]> {
  const result = await botseeRequest<{ opportunities: any[] }>(
    `/analysis/${analysisUuid}/keyword-opportunities`
  );

  return result.data?.opportunities || [];
}

export async function getSourceOpportunities(analysisUuid: string): Promise<any[]> {
  const result = await botseeRequest<{ sources: any[] }>(
    `/analysis/${analysisUuid}/source-opportunities`
  );

  return result.data?.sources || [];
}

export async function getCompetitorResults(analysisUuid: string): Promise<any[]> {
  const result = await botseeRequest<{ competitors: any[] }>(
    `/analysis/${analysisUuid}/results/competitors`
  );

  return result.data?.competitors || [];
}

export async function getSite(siteUuid: string): Promise<BotSeeSite | null> {
  const result = await botseeRequest<{ site: BotSeeSite }>(`/sites/${siteUuid}`);
  return result.data?.site || null;
}

export async function setupAndAnalyze(websiteUrl: string): Promise<{
  siteUuid: string;
  analysisUuid: string;
  companyName: string;
} | null> {
  // 1. Create site
  const site = await createSite(websiteUrl);
  if (!site) {
    console.error('Failed to create BotSee site');
    return null;
  }

  // 2. Get customer types
  const { data: customerTypes } = await botseeRequest<{ customer_types: any[] }>(
    `/sites/${site.uuid}/customer-types`
  );

  // If no customer types, generate them
  if (!customerTypes?.customer_types?.length) {
    await generateCustomerTypes(site.uuid, 2);
  }

  // Get updated customer types
  const { data: ctData } = await botseeRequest<{ customer_types: any[] }>(
    `/sites/${site.uuid}/customer-types`
  );

  const types = ctData?.customer_types || [];

  // 3. Generate personas for each customer type
  for (const ct of types) {
    const { data: personas } = await botseeRequest<{ personas: any[] }>(
      `/customer-types/${ct.uuid}/personas`
    );

    if (!personas?.personas?.length) {
      await generatePersonas(ct.uuid, 4);
    }
  }

  // Get all personas
  const allPersonas: any[] = [];
  for (const ct of types) {
    const { data: personas } = await botseeRequest<{ personas: any[] }>(
      `/customer-types/${ct.uuid}/personas`
    );
    if (personas?.personas) {
      allPersonas.push(...personas.personas);
    }
  }

  // 4. Generate questions for each persona
  for (const persona of allPersonas) {
    const { data: questions } = await botseeRequest<{ questions: any[] }>(
      `/personas/${persona.uuid}/questions`
    );

    if (!questions?.questions?.length) {
      await generateQuestions(persona.uuid, 5);
    }
  }

  // 5. Run analysis
  const analysis = await runAnalysis(site.uuid);
  if (!analysis) {
    console.error('Failed to start BotSee analysis');
    return null;
  }

  return {
    siteUuid: site.uuid,
    analysisUuid: analysis.uuid,
    companyName: site.product_name
  };
}
