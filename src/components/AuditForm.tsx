'use client';

import { useState } from 'react';

interface AuditFormProps {
  onSuccess: (accessCode: string, telegramHandle: string) => void;
}

export default function AuditForm({ onSuccess }: AuditFormProps) {
  const [companyName, setCompanyName] = useState('');
  const [url, setUrl] = useState('');
  const [telegram, setTelegram] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      setError('Please enter your company name');
      return;
    }

    if (!url.trim()) {
      setError('Please enter a website URL');
      return;
    }

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    if (!telegram.trim()) {
      setError('Please enter your Telegram username');
      return;
    }

    let telegramHandle = telegram.trim();
    if (!telegramHandle.startsWith('@')) {
      telegramHandle = '@' + telegramHandle;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website_url: normalizedUrl,
          company_name: companyName.trim(),
          telegram_handle: telegramHandle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start audit');
      }

      fetch('/api/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_handle: telegramHandle,
          message: `🔍 Your AI Visibility Audit has started!\n\n📍 Website: ${normalizedUrl}\n🔑 Access Code: ${data.access_code}\n\n⏱️ This takes about 20-25 minutes. We'll notify you when it's ready!`
        }),
      }).catch(console.error);

      onSuccess(data.access_code, telegramHandle);
    } catch (err: any) {
      setError(err.message || 'Failed to start audit');
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-8">
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="company" className="block text-sm font-medium text-gray-300 mb-2">
            Company Name
          </label>
          <input
            type="text"
            id="company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your Company Name"
            className="glass-input w-full"
            disabled={loading}
          />
        </div>

        <div className="mb-6">
          <label htmlFor="website" className="block text-sm font-medium text-gray-300 mb-2">
            Website URL
          </label>
          <input
            type="text"
            id="website"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourwebsite.com"
            className="glass-input w-full"
            disabled={loading}
          />
        </div>

        <div className="mb-6">
          <label htmlFor="telegram" className="block text-sm font-medium text-gray-300 mb-2">
            Telegram Username
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
            <input
              type="text"
              id="telegram"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="yourusername"
              className="glass-input w-full pl-8"
              disabled={loading}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">Get notified on Telegram when your audit is ready</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Starting Audit...
            </span>
          ) : (
            'Start AI Visibility Audit'
          )}
        </button>
      </form>

      <div className="mt-6 flex items-center gap-3 justify-center text-sm text-gray-400">
        <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>You'll receive a Telegram notification when ready</span>
      </div>
    </div>
  );
}
