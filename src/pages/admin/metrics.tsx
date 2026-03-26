'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface MetricRow {
  id: string;
  audit_id: string;
  botsee_site_uuid: string | null;
  botsee_analysis_uuid: string | null;
  status: 'processing' | 'success' | 'failed';
  credits_consumed: number | null;
  failure_reason?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [summary, setSummary] = useState({ success: 0, failed: 0, credits_consumed: 0 });
  const [timeline, setTimeline] = useState<{ date: string; success: number; failed: number; credits: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('adminCode') : '';
    if (saved) {
      setCode(saved);
      fetchData(saved, true);
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchData(providedCode?: string, fromLoad?: boolean) {
    const codeToUse = providedCode || code;
    if (!codeToUse) {
      setAuthError('Enter the 8-digit admin code');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/admin/metrics', {
        headers: {
          'x-admin-code': codeToUse,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load metrics');
      setMetrics(data.metrics || []);
      setSummary(data.summary || { success: 0, failed: 0, credits_consumed: 0 });
      setTimeline(data.timeline || []);
      setIsAuthorized(true);
      setAuthError(null);
      if (!fromLoad && typeof window !== 'undefined') {
        localStorage.setItem('adminCode', codeToUse);
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('unauthorized')) {
        setAuthError('Invalid admin code');
        setIsAuthorized(false);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    await fetchData(code);
  }

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminCode');
    }
    setIsAuthorized(false);
    setCode('');
    setMetrics([]);
    setSummary({ success: 0, failed: 0, credits_consumed: 0 });
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="glass-card p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-white">Admin Access</h1>
          <p className="text-sm text-gray-400 mb-6">Enter the 8-digit admin code to view metrics.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="8-digit code"
            />
            {authError && <p className="text-red-400 text-sm">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-semibold transition"
              disabled={loading}
            >
              {loading ? 'Checking…' : 'Access Metrics'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="glass-card p-8 text-center">
          <p className="text-red-400 mb-4">Error: {error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-blue-500 rounded-lg">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">← Back to App</Link>
            <span className="text-gray-600">|</span>
            <span className="font-bold">Admin: Audit Metrics</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/api/admin/metrics-csv?code=${encodeURIComponent(code)}`}
              className="text-sm text-blue-400 hover:text-white"
            >
              Download CSV
            </a>
            <button onClick={() => fetchData()} className="text-sm text-blue-400 hover:text-white">Refresh</button>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-white">Logout</button>
          </div>
        </div>
      </nav>

      <div className="pt-24 px-6 max-w-7xl mx-auto">
        <h1 className="text-4xl font-black mb-8">AUDIT <span className="text-blue-400">METRICS</span></h1>

        <div className="grid md:grid-cols-3 gap-4 mb-10">
          <div className="glass-card p-6 text-center">
            <div className="text-3xl font-black text-green-400">{summary.success}</div>
            <div className="text-gray-400 text-sm">Successful Audits</div>
          </div>
          <div className="glass-card p-6 text-center">
            <div className="text-3xl font-black text-red-400">{summary.failed}</div>
            <div className="text-gray-400 text-sm">Failed Audits</div>
          </div>
          <div className="glass-card p-6 text-center">
            <div className="text-3xl font-black text-blue-400">{summary.credits_consumed}</div>
            <div className="text-gray-400 text-sm">Credits Consumed</div>
          </div>
        </div>

        {timeline.length > 0 && (
          <div className="glass-card p-6 mb-10 overflow-x-auto">
            <h2 className="text-xl font-bold mb-4">Daily Trend</h2>
            <div className="flex flex-col gap-3">
              {timeline.map((t) => (
                <div key={t.date} className="flex items-center gap-4 text-sm text-gray-300">
                  <div className="w-24 text-white font-semibold">{t.date}</div>
                  <div className="flex-1 h-2 bg-white/10 rounded">
                    <div
                      className="h-2 bg-green-500 rounded"
                      style={{ width: `${Math.min(100, (t.success / Math.max(1, t.success + t.failed)) * 100)}%` }}
                      title={`Success: ${t.success}`}
                    />
                  </div>
                  <div className="flex-1 h-2 bg-white/10 rounded">
                    <div
                      className="h-2 bg-red-500 rounded"
                      style={{ width: `${Math.min(100, (t.failed / Math.max(1, t.success + t.failed)) * 100)}%` }}
                      title={`Failed: ${t.failed}`}
                    />
                  </div>
                  <div className="w-32 text-blue-300">Credits: {t.credits}</div>
                  <div className="text-gray-500">S/F: {t.success}/{t.failed}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-card p-6 overflow-x-auto">
          <h2 className="text-xl font-bold mb-4">Recent Runs</h2>
          <table className="w-full text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left py-2">Audit ID</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Credits</th>
                <th className="text-left py-2">Started</th>
                <th className="text-left py-2">Completed</th>
                <th className="text-left py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {metrics.map((m) => (
                <tr key={m.id} className="hover:bg-white/5">
                  <td className="py-3 text-blue-300 truncate max-w-[160px]" title={m.audit_id}>{m.audit_id}</td>
                  <td className={`py-3 capitalize font-semibold ${m.status === 'success' ? 'text-green-400' : m.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>{m.status}</td>
                  <td className="py-3">{m.credits_consumed ?? '—'}</td>
                  <td className="py-3 text-gray-400">{m.started_at ? new Date(m.started_at).toLocaleString() : '—'}</td>
                  <td className="py-3 text-gray-400">{m.completed_at ? new Date(m.completed_at).toLocaleString() : '—'}</td>
                  <td className="py-3">
                    {m.failure_reason ? (
                      <span
                        className="inline-block px-2 py-1 rounded-full bg-red-500/10 text-red-300 text-xs max-w-[220px] truncate"
                        title={m.failure_reason}
                      >
                        {m.failure_reason}
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
