'use client';

import { useState } from 'react';
import Head from 'next/head';
import { validateAuditInput } from '../lib/validation';

export default function AuditFormPage() {
  const [url, setUrl] = useState('');
  const [telegram, setTelegram] = useState('');
  const [errors, setErrors] = useState<{ url?: string; telegram?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [analysisDetails, setAnalysisDetails] = useState<any>(null);
  const [analysisExtras, setAnalysisExtras] = useState<{ competitors?: any; keywords?: any; sources?: any }>({});

  const helperUrl = 'Enter a full URL; we will auto-add https:// and trim trailing slash.';
  const helperTelegram = 'Optional. Paste a @handle or https://t.me/ link; we normalize it.';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSuccess(null);
    setAnalysisId(null);
    setAnalysisStatus(null);
    setAnalysisDetails(null);
    setAnalysisExtras({});

    const { normalized, errors: validationErrors } = validateAuditInput(url, telegram);
    if (validationErrors.url || validationErrors.telegram) {
      setErrors(validationErrors);
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized.url, telegram: normalized.telegram }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      setAnalysisId(data.analysis_uuid || null);
      setAnalysisStatus('processing');
      setSuccess('Audit started. Tracking status below.');
      setUrl('');
      setTelegram('');
      pollStatus(data.analysis_uuid, true);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, form: err.message || 'Something went wrong' }));
    } finally {
      setSubmitting(false);
    }
  }

  async function pollStatus(uuid?: string | null, first?: boolean) {
    if (!uuid) return;
    try {
      const res = await fetch(`/api/audit-status?uuid=${uuid}&details=${first ? 'true' : 'false'}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch status');
      const status = data.analysis?.analysis?.status || data.analysis?.status;
      setAnalysisStatus(status || 'processing');
      setAnalysisDetails(data.analysis?.analysis || data.analysis || null);
      if (data.competitors || data.keywords || data.sources) {
        setAnalysisExtras({ competitors: data.competitors, keywords: data.keywords, sources: data.sources });
      }
      if (status === 'completed' || status === 'failed') {
        if (status === 'completed' && !data.competitors) {
          // Fetch details once on completion
          await pollStatus(uuid, true);
        }
        return;
      }
      setTimeout(() => pollStatus(uuid), 3000);
    } catch (err: any) {
      setAnalysisStatus('error');
      setErrors((prev) => ({ ...prev, form: err.message || 'Failed to fetch status' }));
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>AI Visibility Audit</title>
      </Head>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black mb-6">AI Visibility Audit</h1>
        <p className="text-gray-400 mb-8">Enter your website and (optionally) Telegram handle. We normalize inputs to avoid pattern errors.</p>

        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">Website URL</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">{helperUrl}</p>
            {errors.url && <p className="text-red-400 text-sm mt-1">{errors.url}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Telegram (optional)</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="@yourhandle or https://t.me/yourhandle"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">{helperTelegram}</p>
            {errors.telegram && <p className="text-red-400 text-sm mt-1">{errors.telegram}</p>}
          </div>

          {errors.form && <p className="text-red-400 text-sm">{errors.form}</p>}
          {success && <p className="text-green-400 text-sm">{success}</p>}

          {analysisId && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div>Analysis ID: <span className="text-blue-300">{analysisId}</span></div>
                <div className="capitalize">Status: <span className="font-semibold">{analysisStatus || 'processing'}</span></div>
              </div>
              {analysisDetails && (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-3 rounded border border-white/10 bg-white/5">
                      <div className="text-xs uppercase text-gray-400 mb-1">Summary</div>
                      <div className="text-sm text-white">{analysisDetails.summary || analysisDetails.status}</div>
                    </div>
                    <div className="p-3 rounded border border-white/10 bg-white/5">
                      <div className="text-xs uppercase text-gray-400 mb-1">Confidence Score</div>
                      <div className="text-2xl font-black text-blue-300">{analysisDetails.confidence_score ?? '—'}</div>
                      {analysisDetails.confidence_note && <div className="text-xs text-gray-400 mt-1">{analysisDetails.confidence_note}</div>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <SectionCard title="Top Competitors" items={formatCompetitors(analysisExtras?.competitors)} />
                    <SectionCard title="Top Keywords" items={formatKeywords(analysisExtras?.keywords)} />
                    <SectionCard title="Top Sources" items={formatSources(analysisExtras?.sources)} />
                  </div>

                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer text-gray-300">Raw details</summary>
                    <pre className="whitespace-pre-wrap text-[11px] text-gray-400 bg-black/50 p-2 rounded border border-white/5">{JSON.stringify({ analysisDetails, ...analysisExtras }, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-semibold transition disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Start Audit'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SectionCard({ title, items }: { title: string; items: { label: string; value?: string | number }[] }) {
  return (
    <div className="p-3 rounded border border-white/10 bg-white/5">
      <div className="text-xs uppercase text-gray-400 mb-2">{title}</div>
      {items.length === 0 && <div className="text-sm text-gray-500">No data</div>}
      <ul className="space-y-1 text-sm text-white">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`} className="flex justify-between gap-2">
            <span className="text-gray-200 truncate">{item.label}</span>
            {item.value !== undefined && <span className="text-gray-400">{item.value}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatCompetitors(data: any): { label: string; value?: string | number }[] {
  const list = data?.top_competitors || data?.competitors || [];
  if (Array.isArray(list)) {
    return list.slice(0, 5).map((c: any) => ({ label: c.name || c.title || 'Competitor', value: c.score || c.appearance || c.rank }));
  }
  return [];
}

function formatKeywords(data: any): { label: string; value?: string | number }[] {
  const list = data?.top_keywords || data?.keywords || [];
  if (Array.isArray(list)) {
    return list.slice(0, 5).map((k: any) => ({ label: k.keyword || k.term || 'Keyword', value: k.score || k.rank || k.count }));
  }
  return [];
}

function formatSources(data: any): { label: string; value?: string | number }[] {
  const list = data?.top_sources || data?.sources || [];
  if (Array.isArray(list)) {
    return list.slice(0, 5).map((s: any) => ({ label: s.source || s.title || 'Source', value: s.score || s.rank || s.count }));
  }
  return [];
}
