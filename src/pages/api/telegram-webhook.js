import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;

    if (message && message.from && message.text) {
      const username = message.from.username;
      const chatId = message.chat.id.toString();
      const text = message.text.trim().toLowerCase();

      if (username) {
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

      if (text === '/start') {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '👋 Welcome to Promptraise AI Visibility Audit!\n\nYou will receive notifications here when your audit is ready.\n\nTo start an audit, visit: audit.promptraise.com',
            parse_mode: 'HTML',
          }),
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
