import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const TELEGRAM_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'GET, POST');
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (TELEGRAM_SECRET) {
      const providedSecret = req.headers?.['x-telegram-bot-api-secret-token'];
      if (providedSecret !== TELEGRAM_SECRET) {
        return res.status(401).json({ error: 'Unauthorized webhook request' });
      }
    }

    const { message } = req.body;

    if (message && message.from && typeof message.text === 'string') {
      const username = message.from.username;
      const chatId = message.chat?.id?.toString();
      const text = message.text.trim().toLowerCase();

      if (username && chatId) {
        await supabase
          .from('telegram_users')
          .upsert({
            username: `@${username}`,
            chat_id: chatId,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'username',
          });
      }

      if (text === '/start' && chatId && process.env.TELEGRAM_BOT_TOKEN) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '👋 Welcome to Promptraise!\n\nI will notify you here when your AI Visibility Audit is ready.\n\nTo start an audit, visit: audit.promptraise.com\n\n📩 Questions? Let\'s chat!\nTelegram: @zk_uae',
              parse_mode: 'HTML',
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
