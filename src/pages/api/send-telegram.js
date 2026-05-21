import { sendTelegramMessage } from '@/lib/telegram';

const TELEGRAM_HANDLE_PATTERN = /^@?[a-zA-Z0-9_]{4,32}$/;
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'POST');
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { telegram_handle, message } = req.body;

    if (!telegram_handle || !message) {
      return res.status(400).json({ error: 'Missing telegram_handle or message' });
    }

    if (typeof telegram_handle !== 'string' || !TELEGRAM_HANDLE_PATTERN.test(telegram_handle)) {
      return res.status(400).json({ error: 'Invalid telegram_handle format' });
    }

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message must be a non-empty string' });
    }

    if (message.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message is too long' });
    }

    const result = await sendTelegramMessage(telegram_handle.trim(), message.trim());

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
