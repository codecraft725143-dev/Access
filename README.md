# 🤖 DEMON WhatsApp Auto-Responder Bot (V2 Telegram Remote Control)

## 📌 Features
- **Telegram Remote Control**:
  - Receive WhatsApp QR Code directly on Telegram as an image photo!
  - Update `.apk` file by simply sending the file to your Telegram Bot.
  - Update Voice Note by sending `.mp3`/`.ogg` audio or voice message on Telegram.
  - Change auto-reply text using `/settext <message>` command.
- **Anti-Ban Human Delays**: Random typing (2s-4.5s) & recording (3s-6s) simulations.
- **Render 24/7 Cloud Ready**: Included `Dockerfile` with Chromium pre-installed for Puppeteer.

---

## 🛠️ Configuration Variables
Open [`index.js`](file:///c:/Users/rihan/Documents/antigravity/calm-mendeleev/whatsapp_bot/index.js) or set Environment Variables:
- `TELEGRAM_BOT_TOKEN`: Your Telegram Bot Token from BotFather.
- `TELEGRAM_ADMIN_ID`: Your Telegram Chat ID (`7507173935`).

---

## ☁️ Deployment on Render (24/7 Free Cloud)
1. Push `whatsapp_bot` folder to GitHub.
2. Go to [Render.com](https://render.com) -> New **Background Worker**.
3. Connect your GitHub Repo.
4. Select **Docker** environment.
5. Add Environment Variable:
   - `TELEGRAM_BOT_TOKEN` = `YOUR_BOT_TOKEN`
   - `TELEGRAM_ADMIN_ID` = `7507173935`
6. Click **Deploy**. The QR Code image will automatically arrive in your Telegram bot chat!
