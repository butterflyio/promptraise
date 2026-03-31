import { sendTelegramMessage } from '@/lib/telegram';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { telegram_handle, message } = req.body;

    if (!telegram_handle || !message) {
      return res.status(400).json({ error: 'Missing telegram_handle or message' });
    }

    const result = await sendTelegramMessage(telegram_handle, message);

    if (!result.success) {
      if (result.message === 'User has not started the bot') {
        return res.status(200).json({
          success: false,
          message: result.message,
          instructions: result.instructions,
        });
      }
      return res.status(500).json({ error: result.error || 'Internal server error' });
    }

    return res.status(200).json({ success: true, message_id: result.message_id });
  } catch (error) {
    console.error('Telegram error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
