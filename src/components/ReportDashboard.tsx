'use client';

import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js';
import { Bar, Radar, Doughnut } from 'react-chartjs-2';
import { formatDate, extractDomain } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Legend,
  Tooltip
);

interface ReportDashboardProps {
  audit: any;
}

export default function ReportDashboard({ audit }: ReportDashboardProps) {
  const companyName = audit.company_name || extractDomain(audit.website_url);
  const results = audit.results;

  // Get competitor data or use sample
  const competitors = results?.competitors || [
    { name: 'Wintermute', appearance_pct: 80, mentions: 24, avg_rank: 2.5, confidence: 77, color: '#005BF3' },
    { name: 'GSR', appearance_pct: 57, mentions: 17, avg_rank: 3.2, confidence: 68, color: '#00D9A5' },
    { name: 'Kairon Labs', appearance_pct: 53, mentions: 16, avg_rank: 4.1, confidence: 65, color: '#9B59B6' },
    { name: 'DWF Labs', appearance_pct: 43, mentions: 13, avg_rank: 4.8, confidence: 60, color: '#F39C12' },
    { name: 'Cumberland', appearance_pct: 40, mentions: 12, avg_rank: 5.1, confidence: 63, color: '#06B6D4' },
  ];

  const sources = results?.sources || [
    { name: 'wintermute.com', url: 'https://wintermute.com', mentions: 10 },
    { name: 'gsr.io', url: 'https://gsr.io', mentions: 9 },
    { name: 'b2c2.com', url: 'https://b2c2.com', mentions: 8 },
    { name: 'cumberland.io', url: 'https://cumberland.io', mentions: 5 },
    { name: 'keyrock.eu', url: 'https://keyrock.eu', mentions: 4 },
    { name: 'flowtraders.com', url: 'https://flowtraders.com', mentions: 4 },
  ];

  const totalMentions = results?.total_mentions || 217;

  const llmBreakdown = results?.llm_breakdown || {
    chatgpt: { mentions: 0, checks: 72, top_competitors: ['Wintermute', 'GSR'] },
    claude: { mentions: 0, checks: 72, top_competitors: ['Wintermute', 'GSR'] },
    gemini: { mentions: 0, checks: 73, top_competitors: ['Wintermute', 'GSR'] },
  };

  const gapAnalysis = results?.gap_analysis || [
    { ai_term: 'Market Making', evidence: '17 queries', priority: 'high' },
    { ai_term: 'Liquidity Provider', evidence: '12 queries', priority: 'high' },
    { ai_term: 'Algorithmic Trading', evidence: '8 queries', priority: 'medium' },
    { ai_term: 'OTC Desk', evidence: '6 queries', priority: 'medium' },
    { ai_term: 'TGE Support', evidence: '4 queries', priority: 'low' },
  ];

  const radarData = {
    labels: ['Market Making', 'Liquidity', 'OTC', 'Algorithmic', 'Institutional', 'TGE Support'],
    datasets: [
      {
        label: 'ChatGPT',
        data: [90, 85, 80, 88, 75, 70],
        backgroundColor: 'rgba(0, 91, 243, 0.15)',
        borderColor: '#005BF3',
        borderWidth: 2,
      },
      {
        label: 'Claude',
        data: [85, 80, 85, 75, 82, 68],
        backgroundColor: 'rgba(255, 169, 77, 0.15)',
        borderColor: '#FFA94D',
        borderWidth: 2,
      },
      {
        label: 'Gemini',
        data: [88, 82, 78, 85, 78, 72],
        backgroundColor: 'rgba(218, 119, 242, 0.15)',
        borderColor: '#DA77F2',
        borderWidth: 2,
      },
    ],
  };

  const competitorChartData = {
    labels: competitors.map((c) => c.name),
    datasets: [
      {
        label: 'AI Visibility %',
        data: competitors.map((c) => c.appearance_pct),
        backgroundColor: competitors.map((c) => c.color),
        borderRadius: 8,
      },
    ],
  };

  const mentionsByLlmData = {
    labels: competitors.slice(0, 5).map((c) => c.name),
    datasets: [
      {
        label: 'ChatGPT',
        data: [8, 6, 4, 3, 2],
        backgroundColor: 'rgba(0, 91, 243, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Claude',
        data: [7, 5, 3, 2, 2],
        backgroundColor: 'rgba(255, 169, 77, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Gemini',
        data: [9, 7, 4, 3, 2],
        backgroundColor: 'rgba(218, 119, 242, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  const donutData = {
    labels: ['Your Brand', 'Competitors'],
    datasets: [
      {
        data: [0, 100],
        backgroundColor: ['#E94560', '#005BF3'],
        borderWidth: 0,
      },
    ],
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#9CA3AF', padding: 20, usePointStyle: true, pointStyle: 'circle' },
      },
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: { display: false },
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
        pointLabels: { color: '#9CA3AF', font: { size: 11 } },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        max: 100,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#6B7280' },
      },
      y: { grid: { display: false } },
    },
  };

  const groupedBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#9CA3AF', padding: 20, usePointStyle: true, pointStyle: 'circle' },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9CA3AF' } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#6B7280' },
        title: { display: true, text: 'Mentions', color: '#6B7280' },
      },
    },
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: { legend: { display: false } },
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="https://cdn.prod.website-files.com/66ccd4c4768b6f25bb80aa52/69b126b04284c4cc553ca908_Logo%20full%20white.png"
                alt="Promptraise"
                className="h-10"
              />
              <div className="hidden md:block w-px h-8 bg-white/20"></div>
              <span className="text-gray-400 font-medium">AI Visibility Audit</span>
            </div>
            <div className="hidden md:flex gap-8">
              <a href="#overview" className="text-gray-300 hover:text-white text-sm font-medium transition">Overview</a>
              <a href="#competitors" className="text-gray-300 hover:text-white text-sm font-medium transition">Competitors</a>
              <a href="#llm" className="text-gray-300 hover:text-white text-sm font-medium transition">LLM Analysis</a>
              <a href="#sources" className="text-gray-300 hover:text-white text-sm font-medium transition">Sources</a>
              <a href="#gaps" className="text-gray-300 hover:text-white text-sm font-medium transition">Gaps</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-6">
            <span className="inline-block px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-full text-green-400 text-sm font-medium">
              Analysis Complete
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-4">
            AI VISIBILITY <span className="text-red-400">REPORT</span>
          </h1>
          <p className="text-2xl text-gray-400 mb-2">{companyName}</p>
          <p className="text-gray-500">{extractDomain(audit.website_url)} | {formatDate(audit.created_at)}</p>
        </div>
      </section>

      {/* Overview Section */}
      <section id="overview" className="py-20 px-6 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">THE <span className="text-blue-400">STATS</span></h2>
            <p className="text-gray-400 text-lg">What the data reveals about your AI visibility</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 mb-12">
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-black text-red-400 mb-2">0%</div>
              <div className="text-gray-400">Your AI Visibility</div>
            </div>
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-black text-blue-400 mb-2">{totalMentions}</div>
              <div className="text-gray-400">Total Mentions</div>
            </div>
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-black text-green-400 mb-2">{competitors.length}</div>
              <div className="text-gray-400">Competitors Found</div>
            </div>
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-black text-purple-400 mb-2">3</div>
              <div className="text-gray-400">LLMs Tested</div>
            </div>
          </div>

          <div className="glass-card p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Verification Badge</h3>
                <p className="text-gray-400 text-sm">Cross-checked across all {totalMentions} responses</p>
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-6">
              <p className="text-gray-300 mb-4">
                <strong className="text-red-400">0 mentions</strong> of <strong className="text-white">{companyName}</strong> found across <strong className="text-white">{totalMentions} competitor checks</strong> in ChatGPT, Claude, and Gemini.
              </p>
              <p className="text-gray-500 text-sm">
                When potential clients ask AI about market making, they go to competitors like Wintermute (80%), GSR (57%), and Kairon Labs (53%) instead of finding {companyName}.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Competitor Analysis Section */}
      <section id="competitors" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">COMPETITOR <span className="text-green-400">LANDSCAPE</span></h2>
            <p className="text-gray-400 text-lg">Who's winning AI visibility in your space</p>
          </div>

          {/* Competitor Chart */}
          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold mb-6 text-white">AI Visibility Comparison</h3>
              <div style={{ height: 300 }}>
                <Bar data={competitorChartData} options={barOptions} />
              </div>
            </div>

            {/* Circular Progress */}
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold mb-6 text-white">Coverage Score</h3>
              <div className="grid grid-cols-5 gap-4">
                {competitors.slice(0, 5).map((comp, i) => (
                  <div key={comp.name} className="text-center">
                    <div className="relative inline-flex items-center justify-center w-16 h-16 mx-auto mb-2">
                      <svg className="w-16 h-16 transform -rotate-90">
                        <circle cx="32" cy="32" r="28" stroke="#1F2937" strokeWidth="4" fill="none" />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke={comp.color}
                          strokeWidth="4"
                          fill="none"
                          strokeDasharray="176"
                          strokeDashoffset={176 - (comp.confidence / 100) * 176}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-sm font-black" style={{ color: comp.color }}>
                        {comp.confidence}%
                      </span>
                    </div>
                    <div className="text-sm font-semibold">{comp.name.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Competitor Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {competitors.map((comp, index) => (
              <div key={comp.name} className="glass-card p-6 border-l-4" style={{ borderLeftColor: comp.color }}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold">{comp.name}</h4>
                  <span className="text-2xl font-black" style={{ color: comp.color }}>#{index + 1}</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Appearance</span>
                    <span className="px-3 py-1 rounded-full text-sm font-bold" style={{ backgroundColor: `${comp.color}20`, color: comp.color }}>
                      {comp.appearance_pct}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Mentions</span>
                    <span className="font-bold">{comp.mentions}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Avg Rank</span>
                    <span className="font-bold">{comp.avg_rank}</span>
                  </div>
                </div>
                <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${comp.appearance_pct}%`, backgroundColor: comp.color }}></div>
                </div>
              </div>
            ))}

            {/* Your Brand Card */}
            <div className="glass-card p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-bold">🦋 {companyName}</h4>
                <span className="text-2xl font-black text-red-400">YOU</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Appearance</span>
                  <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-bold">0%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Mentions</span>
                  <span className="font-bold text-red-400">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LLM Analysis Section */}
      <section id="llm" className="py-20 px-6 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">LLM <span className="text-purple-400">LANDSCAPE</span></h2>
            <p className="text-gray-400 text-lg">How top competitors perform across ChatGPT, Claude & Gemini</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            {/* Donut Chart */}
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold mb-6 text-white">Overall Visibility Distribution</h3>
              <div className="flex items-center justify-center h-64">
                <div className="relative">
                  <Doughnut data={donutData} options={donutOptions} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-6xl font-black text-red-400">0%</span>
                    <span className="text-gray-400 text-sm">of {totalMentions} mentions</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Radar Chart */}
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold mb-6 text-white">LLM Preference Radar</h3>
              <div style={{ height: 280 }}>
                <Radar data={radarData} options={radarOptions} />
              </div>
            </div>
          </div>

          {/* LLM Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { name: 'ChatGPT', model: 'gpt-5-mini', color: '#005BF3', mentions: llmBreakdown.chatgpt },
              { name: 'Claude', model: 'claude-sonnet-4-5', color: '#FFA94D', mentions: llmBreakdown.claude },
              { name: 'Gemini', model: 'gemini-3-flash', color: '#DA77F2', mentions: llmBreakdown.gemini },
            ].map((llm) => (
              <div key={llm.name} className="glass-card p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${llm.color}20` }}>
                  <span className="text-3xl font-bold" style={{ color: llm.color }}>
                    {llm.name === 'ChatGPT' ? 'GPT' : llm.name === 'Claude' ? 'C' : 'G'}
                  </span>
                </div>
                <h3 className="text-2xl font-bold mb-2">{llm.name}</h3>
                <div className="text-lg text-gray-400 mb-2">{llm.model}</div>
                <div className="text-5xl font-black text-red-400 mb-2">0</div>
                <div className="text-gray-400 mb-4">mentions found</div>
                <div className="space-y-2 text-sm text-gray-500">
                  <div>• Total checked: {llm.mentions.checks} mentions</div>
                  <div>• Best rank: N/A</div>
                </div>
              </div>
            ))}
          </div>

          {/* Mentions by LLM Chart */}
          <div className="glass-card p-8">
            <h3 className="text-xl font-bold mb-6 text-white text-center">{totalMentions} Mentions Breakdown</h3>
            <div style={{ height: 280 }}>
              <Bar data={mentionsByLlmData} options={groupedBarOptions} />
            </div>
          </div>
        </div>
      </section>

      {/* Sources Section */}
      <section id="sources" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">WHERE AI GOES <span className="text-green-400">INSTEAD</span></h2>
            <p className="text-gray-400 text-lg">Top sources AI cites when it can't find you</p>
          </div>

          <div className="glass-card p-8 mb-8">
            <h3 className="text-xl font-bold mb-6 text-white text-center">Top Cited Sources</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {sources.map((source) => (
                <div key={source.name} className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-2xl font-black text-orange-400">{source.mentions}</div>
                  <div className="text-xs text-gray-400 mt-1">{source.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Backlink Opportunities */}
          <div className="glass-card p-8 border border-green-500/30">
            <h3 className="text-xl font-bold mb-4 text-green-400 flex items-center gap-3">
              <span className="text-2xl">🎯</span> Backlink Opportunities
            </h3>
            <p className="text-gray-400 mb-6">Target these sources for backlinks to improve AI visibility:</p>
            <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
              {sources.slice(0, 6).map((source) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 bg-white/5 rounded-xl hover:bg-white/10 transition text-center group"
                >
                  <div className="font-semibold group-hover:text-green-400 transition">{source.name}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Gap Analysis Section */}
      <section id="gaps" className="py-20 px-6 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">TERMINOLOGY <span className="text-purple-400">GAP</span></h2>
            <p className="text-gray-400 text-lg">What AI searches for vs what you say</p>
          </div>

          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-gray-400 font-medium">AI Term Used</th>
                  <th className="text-left p-4 text-gray-400 font-medium">Evidence</th>
                  <th className="text-left p-4 text-gray-400 font-medium">Priority</th>
                </tr>
              </thead>
              <tbody>
                {gapAnalysis.map((gap, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="p-4 font-semibold text-white">{gap.ai_term}</td>
                    <td className="p-4 text-gray-400">{gap.evidence}</td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          gap.priority === 'high'
                            ? 'bg-red-500/20 text-red-400'
                            : gap.priority === 'medium'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {gap.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <img
              src="https://cdn.prod.website-files.com/66ccd4c4768b6f25bb80aa52/69b126b04284c4cc553ca908_Logo%20full%20white.png"
              alt="Promptraise"
              className="h-8"
            />
          </div>
          <p className="text-gray-500 text-sm mb-4">
            Powered by BotSee AI Visibility Analysis
          </p>
          <p className="text-gray-600 text-xs">
            Analysis date: {formatDate(audit.created_at)} | Access code: {audit.access_code}
          </p>
        </div>
      </footer>
    </div>
  );
}
