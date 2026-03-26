'use client';

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ReportDashboard from '@/components/ReportDashboard';
import LoadingState from '@/components/LoadingState';
import { Audit } from '@/lib/supabase';

export default function AuditReport() {
  const router = useRouter();
  const { code } = router.query;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  useEffect(() => {
    if (!code || typeof code !== 'string') return;

    async function fetchAudit() {
      try {
        const response = await fetch(`/api/audit?code=${code}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch audit');
        }

        if (data.audit) {
          setAudit(data.audit);

          if (data.audit.status === 'ready') {
            setLoading(false);
            setProgress(100);
            setProgressMessage('Report ready!');
            return;
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load audit');
        setLoading(false);
      }
    }

    fetchAudit();

    const messages = [
      { msg: 'Setting up audit...', delay: 0 },
      { msg: 'Generating customer types...', delay: 2000 },
      { msg: 'Creating personas...', delay: 4000 },
      { msg: 'Generating questions...', delay: 6000 },
      { msg: 'Running AI analysis...', delay: 8000 },
      { msg: 'Processing results...', delay: 28000 },
      { msg: 'Almost done...', delay: 32000 },
      { msg: 'Report ready!', delay: 35000 },
    ];

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 700);

    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      if (messageIndex < messages.length) {
        setProgressMessage(messages[messageIndex].msg);
        messageIndex++;
      } else {
        clearInterval(messageInterval);
      }
    }, 4000);

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/audit?code=${code}`);
        const data = await response.json();

        if (data.audit?.status === 'ready') {
          setAudit(data.audit);
          setLoading(false);
          setProgress(100);
          setProgressMessage('Report ready!');
          clearInterval(progressInterval);
          clearInterval(messageInterval);
          clearInterval(pollInterval);
        } else if (data.audit?.status === 'failed') {
          setError('Audit failed. Please try again.');
          setLoading(false);
          clearInterval(progressInterval);
          clearInterval(messageInterval);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 10000);

    const timer = setTimeout(() => {
      if (audit?.status !== 'ready') {
        setLoading(false);
      }
    }, 360000);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
      clearInterval(messageInterval);
      clearInterval(pollInterval);
    };
  }, [code, audit?.status]);

  return (
    <>
      <Head>
        <title>
          {audit 
            ? `${audit.company_name || audit.website_url} - AI Visibility Audit` 
            : 'Loading... - Promptraise'
          }
        </title>
        <meta name="description" content="AI Visibility Audit Report" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen">
        {loading ? (
          <LoadingState 
            message={progressMessage || "Starting audit..."}
            progress={progress}
          />
        ) : error ? (
          <div className="min-h-screen flex items-center justify-center px-6">
            <div className="glass-card p-10 text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold mb-2 text-white">Audit Not Found</h1>
              <p className="text-gray-400 mb-6">{error}</p>
              <a href="/" className="btn-primary inline-block">
                Go Back Home
              </a>
            </div>
          </div>
        ) : audit?.status === 'ready' && audit.results ? (
          <ReportDashboard audit={audit} />
        ) : null}
      </main>
    </>
  );
}
