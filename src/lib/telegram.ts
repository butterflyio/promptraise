import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

export interface SendTelegramResult {
  success: boolean;
  message_id?: number;
  message?: string;
  instructions?: string;
  error?: string;
}

export async function sendTelegramMessage(
  telegramHandle: string,
  message: string
): Promise<SendTelegramResult> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  const username = telegramHandle.startsWith('@')
    ? telegramHandle
    : `@${telegramHandle}`;

  const { data: user } = await getSupabase()
    .from('telegram_users')
    .select('chat_id')
    .eq('username', username)
    .single();

  if (!user?.chat_id) {
    return {
      success: false,
      message: 'User has not started the bot',
      instructions: `Tell the user to message @PromptraiseBot first to enable notifications`,
    };
  }

  const sendMessageUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const response = await fetch(sendMessageUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: user.chat_id,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    return { success: false, error: data.description || 'Telegram API error' };
  }

  return { success: true, message_id: data.result.message_id };
}
