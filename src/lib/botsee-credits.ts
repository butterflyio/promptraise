export type BotseeCreditPayload = Record<string, any> | null | undefined;

function firstPresent(values: any[]): any {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function extractBotseeCredits(payload: BotseeCreditPayload): number | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = firstPresent([
    payload.credits_used,
    payload.credit_usage,
    payload.credits,
    payload.analysis?.credits_used,
    payload.analysis?.credit_usage,
    payload.analysis?.credits,
  ]);

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractBotseeCreditsWithKey(payload: BotseeCreditPayload): { credits: number | null; key: string | null } {
  if (!payload || typeof payload !== 'object') return { credits: null, key: null };

  const pairs: [any, string][] = [
    [payload.credits_used, 'credits_used'],
    [payload.credit_usage, 'credit_usage'],
    [payload.credits, 'credits'],
    [payload.analysis?.credits_used, 'analysis.credits_used'],
    [payload.analysis?.credit_usage, 'analysis.credit_usage'],
    [payload.analysis?.credits, 'analysis.credits'],
  ];

  for (const [value, key] of pairs) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return { credits: parsed, key };
    }
  }

  return { credits: null, key: null };
}
