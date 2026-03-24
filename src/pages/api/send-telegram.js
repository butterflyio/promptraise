const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8612303827:AAH_WY9TQePiuxkq4cZ05dYqFoba3wKbrio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { telegram_handle, message } = req.body;

    if (!telegram_handle || !message) {
      return res.status(400).json({ error: 'Missing telegram_handle or message' });
    }

    // Get chat ID from username
    const username = telegram_handle.replace('@', '');
    
    // First, try to get updates to find the user's chat ID
    // In production, you'd store the chat ID when users start the bot
    // For now, we'll use the Telegram API to send to the username
    const sendMessageUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    
    // Note: To send to a username, the user needs to have started a chat with the bot first
    // This is a simplified version - in production, you'd:
    // 1. Have users start the bot with /start
    // 2. Store their chat_id
    // 3. Send messages using chat_id
    
    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${username}`,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();

    if (!data.ok) {
      // If user hasn't started the bot, return a helpful message
      if (data.description?.includes('chat not found')) {
        return res.status(200).json({ 
          success: false, 
          message: 'User needs to start the bot first',
          instructions: 'Tell the user to message @YourBotUsername first to enable notifications'
        });
      }
      return res.status(500).json({ error: data.description || 'Telegram API error' });
    }

    return res.status(200).json({ success: true, message_id: data.result.message_id });
  } catch (error) {
    console.error('Telegram error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
