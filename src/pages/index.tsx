'use client';

import Head from 'next/head';
import { useState } from 'react';
import AuditForm from '@/components/AuditForm';

export default function Home() {
  const [submitted, setSubmitted] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [reportUrl, setReportUrl] = useState('');

  const handleAuditStarted = (code: string, telegram: string) => {
    setAccessCode(code);
    setTelegramHandle(telegram);
    setReportUrl(`/audit/${code}`);
    setSubmitted(true);
  };

  return (
    <>
      <Head>
        <title>AI Visibility Audit | Promptraise</title>
        <meta name="description" content="Discover how AI search engines see your product" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6 border-b border-white/5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://cdn.prod.website-files.com/66ccd4c4768b6f25bb80aa52/69b126b04284c4cc553ca908_Logo%20full%20white.png" 
                alt="Promptraise" 
                className="h-10"
              />
              <span className="text-gray-400 font-medium hidden sm:block">AI Visibility Audit</span>
            </div>
            <a 
              href="https://promptraise.com" 
              className="text-gray-400 hover:text-white text-sm transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              Back to promptraise.com
            </a>
          </div>
        </header>

        {/* Hero Section */}
        {!submitted ? (
          <section className="flex-1 flex items-center justify-center px-6 py-20">
            <div className="max-w-2xl mx-auto text-center">
              <div className="mb-8">
                <h1 className="text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                  AI VISIBILITY AUDIT
                </h1>
                <p className="text-xl text-gray-400 mb-4">
                  Discover how AI search engines see your product
                </p>
                <p className="text-gray-500">
                  Enter your website below to get a comprehensive analysis of your AI search visibility, 
                  competitive landscape, and actionable recommendations.
                </p>
              </div>

              <AuditForm onSuccess={handleAuditStarted} />
            </div>
          </section>
        ) : (
          <section className="flex-1 flex items-center justify-center px-6 py-20">
            <div className="max-w-lg mx-auto text-center">
              <div className="glass-card p-10 pulse-glow">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                
                <h2 className="text-2xl font-bold mb-4 text-white">Audit Started!</h2>
                <p className="text-gray-400 mb-4">
                  Your AI visibility audit is now processing. We'll notify you on Telegram when it's ready.
                </p>
                
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-6">
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-400">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <span>Notification sent to {telegramHandle}</span>
                  </div>
                </div>

                <div className="bg-black/30 rounded-xl p-6 mb-8">
                  <p className="text-sm text-gray-400 mb-2">Your Access Code:</p>
                  <p className="text-4xl font-black text-primary tracking-wider">{accessCode}</p>
                </div>

                <div className="space-y-4">
                  <a 
                    href={reportUrl}
                    className="btn-primary w-full block text-center"
                  >
                    View Report
                  </a>
                  <p className="text-sm text-gray-500">
                    Save your code to access the report later
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  setSubmitted(false);
                  setAccessCode('');
                  setReportUrl('');
                }}
                className="mt-6 text-gray-400 hover:text-white text-sm transition"
              >
                Start another audit
              </button>
            </div>
          </section>
        )}

        {/* Features Section */}
        <section className="px-6 py-16 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Competitive Analysis</h3>
                <p className="text-sm text-gray-400">See who dominates AI search for your category</p>
              </div>

              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Gap Analysis</h3>
                <p className="text-sm text-gray-400">Identify terminology gaps to fill</p>
              </div>

              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Source Insights</h3>
                <p className="text-sm text-gray-400">See where AI goes instead of you</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="p-6 border-t border-white/5 text-center">
          <p className="text-gray-500 text-sm">
            Powered by <a href="https://promptraise.com" className="text-gray-400 hover:text-white">Promptraise</a> & <a href="#" className="text-gray-400 hover:text-white">Cicada and OxD</a>
          </p>
        </footer>
      </main>
    </>
  );
}
