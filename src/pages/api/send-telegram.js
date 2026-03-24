import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { telegram_handle, message } = req.body;

    if (!telegram_handle || !message) {
      return res.status(400).json({ error: 'Missing telegram_handle or message' });
    }

    const username = telegram_handle.startsWith('@') 
      ? telegram_handle 
      : `@${telegram_handle}`;

    let chatId = null;

    const { data: user } = await supabase
      .from('telegram_users')
      .select('chat_id')
      .eq('username', username)
      .single();

    if (user?.chat_id) {
      chatId = user.chat_id;
    }

    if (!chatId) {
      return res.status(200).json({
        success: false,
        message: 'User has not started the bot',
        instructions: `Tell the user to message @PromptraiseBot first to enable notifications`
      });
    }

    const sendMessageUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram API error:', data);
      return res.status(500).json({ error: data.description || 'Telegram API error' });
    }

    return res.status(200).json({ success: true, message_id: data.result.message_id });
  } catch (error) {
    console.error('Telegram error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
