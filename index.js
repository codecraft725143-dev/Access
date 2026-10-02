/**
 * ⚡ MULTI-TENANT AUTO SPREADING BOT — MULTI-WHATSAPP & MULTI-REPLY AUTO-RESPONDER
 * Every Telegram User gets their OWN WhatsApp Client & QR Code!
 * Powered by LO & ENI ❤️
 */

'use strict';

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.TelegramBot || TelegramBotModule.default || TelegramBotModule;
const qrcodeTerm = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');

// ─── HEALTH CHECK SERVER (Render / VPS) ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('⚡ Multi-User Auto Spreading Bot Engine is ONLINE 24/7!\n');
}).listen(PORT, () => console.log(`🌐 Health check HTTP server listening on port ${PORT}`));

// ─── GLOBAL ERROR GUARDS ────────────────────────────────────────────────────
process.on('uncaughtException', err => console.error('⚠️ Uncaught Exception:', err.message));
process.on('unhandledRejection', reason => console.error('⚠️ Unhandled Rejection:', reason?.message || reason));

// ─── ENV & DIRECTORIES ───────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8651229823:AAGRRKTkf2fWGjXDxh57wLhrVFsHceIDdYQ";
const TELEGRAM_ADMIN_ID  = process.env.TELEGRAM_ADMIN_ID  || "7507173935";

const baseFilesDir = path.join(__dirname, 'files');
const baseAuthDir  = path.join(__dirname, '.wwebjs_auth');
const dbFilePath   = path.join(__dirname, 'database.json');

[baseFilesDir, baseAuthDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── PERSISTENT DATABASE MANAGEMENT ──────────────────────────────────────────
const defaultUserData = {
    botOn: true,
    reply2On: false,
    credits: 10, // 10 Free Trial Credits for all new users!
    banned: false,
    text1: "Hello! Welcome. Here is your requested info & file 👇",
    image1: null,
    video1: null,
    voice1: null,
    apk1: null,
    text2: null,
    r2_image1: null,
    r2_image2: null,
    speedMode: 'SAFE', // 'SAFE' (45-90s), 'MEDIUM' (20-40s), 'FAST' (6-14s)
    nightMode: true,   // Night Safeguard (10 PM - 7:30 AM IST extra delays)
    stats: { received: 0, sent: 0 },
    userStages: {}
};

let db = {
    users: {
        [TELEGRAM_ADMIN_ID]: {
            role: 'admin',
            credits: 999999,
            banned: false,
            ...defaultUserData
        }
    }
};

function loadDatabase() {
    try {
        if (fs.existsSync(dbFilePath)) {
            const data = fs.readFileSync(dbFilePath, 'utf8');
            db = JSON.parse(data);
            if (!db.users[TELEGRAM_ADMIN_ID]) {
                db.users[TELEGRAM_ADMIN_ID] = { role: 'admin', credits: 999999, banned: false, ...defaultUserData };
            }
            console.log('💾 Database loaded successfully!');
        } else {
            saveDatabase();
        }
    } catch (err) {
        console.error('⚠️ Error loading database.json, initializing fresh:', err.message);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ Error saving database.json:', err.message);
    }
}

loadDatabase();

function getUserData(tgId) {
    const idStr = String(tgId);
    if (!db.users[idStr]) return null;
    return db.users[idStr];
}

function initUserData(tgId, initialCredits = 10, role = 'user') {
    const idStr = String(tgId);
    if (!db.users[idStr]) {
        db.users[idStr] = {
            role: role,
            ...JSON.parse(JSON.stringify(defaultUserData))
        };
        if (idStr === String(TELEGRAM_ADMIN_ID)) {
            db.users[idStr].role = 'admin';
            db.users[idStr].credits = 999999;
        } else {
            db.users[idStr].credits = initialCredits;
        }
        saveDatabase();
    }
    return db.users[idStr];
}

function isBanned(tgId) {
    const idStr = String(tgId);
    const u = getUserData(idStr);
    return Boolean(u && u.banned === true);
}

function isAuthorized(id) {
    const idStr = String(id);
    if (isBanned(idStr)) return false;
    if (!db.users[idStr]) {
        initUserData(idStr);
    }
    return true;
}

function isAdmin(id) {
    const idStr = String(id);
    const u = getUserData(idStr);
    return (idStr === String(TELEGRAM_ADMIN_ID)) || (u && u.role === 'admin');
}

// ─── TELEGRAM BOT INITIALIZATION ──────────────────────────────────────────────
let tgBot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== "YOUR_TELEGRAM_BOT_TOKEN_HERE") {
    tgBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { 
        polling: {
            interval: 500,
            autoStart: true,
            params: { timeout: 10 }
        }
    });
}

if (tgBot) {
    tgBot.on('polling_error', err => {
        // Quietly suppress transient network fetch drops (ISPN/DNS timeouts)
        if (err?.message?.includes('EFATAL') || err?.message?.includes('fetch failed') || err?.message?.includes('ETIMEDOUT')) {
            return;
        }
        console.error(`⚠️ Telegram polling notice: ${err.message}`);
    });
    tgBot.on('error', err => console.error(`❌ Telegram bot error: ${err.message}`));
} else {
    console.warn('⚠️ Telegram bot is disabled: TELEGRAM_BOT_TOKEN is not configured.');
}

function tgSend(chatId, text, opts = {}) {
    if (!tgBot) return;
    return tgBot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts }).catch(() => {});
}

function tgEditOrSend(chatId, msgId, text, opts = {}) {
    if (!tgBot) return;
    if (msgId) {
        return tgBot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', ...opts }).catch(err => {
            if (!err.message || !err.message.includes('message is not modified')) {
                return tgSend(chatId, text, opts);
            }
        });
    }
    return tgSend(chatId, text, opts);
}

function tgPhoto(chatId, buf, caption) {
    if (!tgBot) return;
    return tgBot.sendPhoto(chatId, buf, { caption, parse_mode: 'Markdown' }, { filename: 'qr.png', contentType: 'image/png' }).catch(() => {});
}

function notifyAdmin(text, photoBuf = null) {
    if (!tgBot || !TELEGRAM_ADMIN_ID) return;
    if (photoBuf) tgPhoto(TELEGRAM_ADMIN_ID, photoBuf, text);
    else tgSend(TELEGRAM_ADMIN_ID, text);
}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const ZW_CHARS = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];

function spinMessage(text) {
    if (!text) return text;
    const words = text.split(/( |\n)/);
    const numInjections = 4 + Math.floor(Math.random() * 5);
    const positions = new Set();
    while (positions.size < Math.min(numInjections, Math.floor(words.length / 2))) {
        positions.add(Math.floor(Math.random() * words.length));
    }
    return words.map((w, i) => {
        if (!positions.has(i)) return w;
        const char = ZW_CHARS[Math.floor(Math.random() * ZW_CHARS.length)];
        if (w.length > 2 && Math.random() > 0.5) {
            const pos = 1 + Math.floor(Math.random() * (w.length - 1));
            return w.slice(0, pos) + char + w.slice(pos);
        }
        return w + char;
    }).join('');
}

function gaussianRandom(mean, stdDev) {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random() || 1e-10;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(mean * 0.35, Math.round(mean + z * stdDev));
}

function fingerprint(text) {
    return spinMessage(text);
}

function getChromePath() {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    const wins = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (fs.existsSync(wins)) return wins;
    return undefined;
}

function cleanLocks(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        fs.readdirSync(dir).forEach(f => {
            const fp = path.join(dir, f);
            if (f.startsWith('Singleton')) { try { fs.unlinkSync(fp); } catch (_) {} }
            else if (fs.statSync(fp).isDirectory()) cleanLocks(fp);
        });
    } catch (_) {}
}

cleanLocks(baseAuthDir);

// ─── MULTI-TENANT WHATSAPP SESSIONS MANAGER ───────────────────────────────────
// Key: tgId (string) -> Value: Session Object
const activeSessions = new Map();

function getUserFilesDir(tgId) {
    const dir = path.join(baseFilesDir, `user_${tgId}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getUserAuthDir(tgId) {
    const dir = path.join(baseAuthDir, `session_${tgId}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getOrCreateSession(tgId) {
    const idStr = String(tgId);
    if (activeSessions.has(idStr)) return activeSessions.get(idStr);

    const userAuthDir = getUserAuthDir(idStr);
    const userFilesDir = getUserFilesDir(idStr);
    cleanLocks(userAuthDir);

    const session = {
        tgId: idStr,
        client: null,
        status: 'DISCONNECTED', // DISCONNECTED | GENERATING_QR | AUTHENTICATED | CONNECTED
        waNumber: 'NOT CONNECTED',
        latestQrCode: null,
        qrRequested: false,
        awaitInput: null, // null | 'text1' | 'text2' | 'image1' | 'voice1' | 'apk1' | 'r2_image1' | 'r2_image2'
        userStages: new Map(),     // WhatsApp Chat JID -> stage (0, 1, 2)
        userLastActive: new Map(), // WhatsApp Chat JID -> timestamp
        filesDir: userFilesDir,
        authDir: userAuthDir
    };

    activeSessions.set(idStr, session);
    return session;
}

async function startWhatsAppClient(tgId) {
    const idStr = String(tgId);
    const session = getOrCreateSession(idStr);

    if (session.client && (session.status === 'CONNECTED' || session.status === 'AUTHENTICATED')) {
        return session;
    }

    if (session.client) {
        try { await session.client.destroy(); } catch (_) {}
        session.client = null;
    }

    session.status = 'GENERATING_QR';

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: `user_${idStr}`, dataPath: session.authDir }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018944880-alpha.html'
        },
        puppeteer: {
            executablePath: getChromePath(),
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--disable-gpu', '--disable-extensions', '--disable-component-update',
                '--disable-background-networking', '--disable-sync', '--disable-translate',
                '--disable-site-isolation-trials', '--metrics-recording-only', '--mute-audio',
                '--js-flags=--max-old-space-size=256'
            ]
        }
    });

    session.client = client;

    client.on('qr', async (qr) => {
        session.latestQrCode = qr;
        session.status = 'GENERATING_QR';

        if (session.qrRequested) {
            console.log(`📲 [User ${idStr}] Sending QR Code to Telegram for WhatsApp connection...`);
            session.qrRequested = false;
            try {
                const qrBuf = await QRCode.toBuffer(qr, { width: 400, margin: 2 });
                tgPhoto(idStr, qrBuf, `📲 *Scan this QR Code in your WhatsApp Linked Devices!*`);
            } catch (err) {
                console.error(`Error generating QR buffer for ${idStr}:`, err.message);
            }
        }
    });

    client.on('authenticated', () => {
        session.status = 'AUTHENTICATED';
        const userData = getUserData(idStr);
        if (userData) {
            userData.waAuthenticated = true;
                            await sleep(rand(3000, 5000)); // Piku gap
                        } catch (eM) { console.error(`⚠️ Lead inspector error for ${userId}:`, eM.message); }
                    }
                }
            } catch (errInsp) { console.error(`⚠️ Simple lead inspector error for ${idStr}:`, errInsp.message); }

            setTimeout(processSimpleLeadInspector, 8000);
        };

        setTimeout(processSimpleLeadInspector, 2000);
    });                 client.emit('message', customerMsg);
                            await sleep(rand(4000, 7000)); // Natural gap between replies
                        } catch (eM) { console.error(`⚠️ Guaranteed dispatch error for ${userId}:`, eM.message); }
                    }
                }
                if (dispatched === 0) {
                    console.log(`🧹 [User ${idStr}] GUARANTEED ENGINE: All ${chats.length} loaded inbox chats are already replied (Stage 1/2). Waiting for incoming leads...`);
                }
            } catch (errG) { console.error(`⚠️ Guaranteed engine error for ${idStr}:`, errG.message); }

            setTimeout(processGuaranteedResponder, 12000);
        };

        setTimeout(processGuaranteedResponder, 3000);
    });

    client.on('disconnected', (reason) => {
        session.status = 'DISCONNECTED';
        session.waNumber = 'DISCONNECTED';
        const userData = getUserData(idStr);
        if (userData) {
            userData.waAuthenticated = false;
            saveDatabase();
        }
        console.log(`🔴 [User ${idStr}] WhatsApp Disconnected:`, reason);
        tgSend(idStr, `🔴 *WhatsApp Disconnected:* ${reason}`);
    });

    // ─── AUTO-RESPONDER ENGINE PER USER WHATSAPP ────────────────────────────────
    client.on('message', async (msg) => {
        try {
            const userData = getUserData(idStr);
            if (!userData) return;

            if (
                msg.from.endsWith('@g.us') ||
                msg.from.endsWith('@newsletter') ||
                msg.from.includes('status') ||
                msg.from === 'status@broadcast'
            ) {
                return;
            }

            const chatId = msg.from;
            const senderNumber = chatId.split('@')[0];

            // 📩 Process all incoming leads (including pending unread backlog leads from today)
            // Stage tracking in database.json prevents duplicate messages to contacts who already got Reply 1
            const now = Date.now();

            userData.userStages = userData.userStages || {};
            const lastActive   = session.userLastActive.get(chatId) || 0;
            const currentStage = userData.userStages[chatId] || session.userStages.get(chatId) || 0;

            // Anti-spam 10s limit ONLY for Stage 1/2 contacts (Stage 0 leads get 0s instant reply!)
            if (currentStage > 0 && (now - lastActive < 10000)) {
                console.log(`⏳ [SKIP DEBUG] Message from ${senderNumber} skipped: Anti-spam 10s cooldown active (${Math.round((10000 - (now - lastActive))/1000)}s left).`);
                return;
            }

            userData.stats.received++;
            saveDatabase();
            session.userLastActive.set(chatId, now);

            if (!userData.botOn) {
                console.log(`⏸️ [SKIP DEBUG] Bot is OFF in settings. DM from ${senderNumber} ignored.`);
                return;
            }

            if (userData.credits <= 0) {
                console.log(`💰 [SKIP DEBUG] Credits EXHAUSTED (0). DM from ${senderNumber} skipped.`);
                tgSend(idStr, `🛑 *Auto-reply skipped for ${senderNumber}!* Your credits are EXHAUSTED (0). Contact Admin to recharge.`);
                return;
            }

            if (currentStage >= 2) {
                console.log(`ℹ️ [SKIP DEBUG] Contact ${senderNumber} already reached max Stage 2. DM ignored.`);
                return;
            }
            if (currentStage === 1 && !userData.reply2On) {
                console.log(`ℹ️ [SKIP DEBUG] Contact ${senderNumber} is at Stage 1, but Reply 2 is OFF in settings. DM ignored.`);
                return;
            }

            let chat = null;
            try { chat = await msg.getChat(); } catch (_) {}

            const sendReply = async (content, opts = {}) => {
                try {
                    if (chat) {
                        return await chat.sendMessage(content, opts);
                    }
                    return await client.sendMessage(chatId, content, opts);
                } catch (err) {
                    console.error(`⚠️ [User ${idStr}] Direct send failed for ${chatId}, falling back to msg.reply:`, err.message);
                    return await msg.reply(content, undefined, opts).catch(e => console.error(`❌ [User ${idStr}] msg.reply failed:`, e.message));
                }
            };

            // ⚡ EXACT PIKU ANTI-BAN DELAYS (1s-2.5s Read | 1.5s-3s Typing | 2s-4s Media Gaps)
            await sleep(rand(1000, 2500));
            if (chat) { try { await chat.sendSeen(); } catch (_) {} }
            await sleep(rand(1000, 2000));

            if (currentStage === 0) {
                // ─── REPLY 1 PIKU SPEED DISPATCH ───
                console.log(`📩 [User ${idStr}] [Reply 1 PIKU DM] From: ${senderNumber}`);
                userData.userStages[chatId] = 1;
                userData.userStages[senderNumber] = 1;
                session.userStages.set(chatId, 1);
                saveDatabase();

                // 1. Text 1 (Piku Typing 1.5s - 3s)
                if (userData.text1) {
                    if (chat) { try { await chat.sendStateTyping(); } catch (_) {} }
                    await sleep(rand(1500, 3000));
                    await sendReply(fingerprint(userData.text1));
                }

                // 2. Video 1 (Piku Media Gap 2s - 4s)
                if (userData.video1 && fs.existsSync(path.join(session.filesDir, userData.video1))) {
                    await sleep(rand(2000, 4000));
                    try {
                        const videoMedia = MessageMedia.fromFilePath(path.join(session.filesDir, userData.video1));
                        await sendReply(videoMedia);
                    } catch (e2) { console.error(`[User ${idStr}] Error sending video1:`, e2.message); }
                }

                // 3. Image 1 (Piku Media Gap 2s - 4s)
                if (userData.image1 && fs.existsSync(path.join(session.filesDir, userData.image1))) {
                    await sleep(rand(2000, 4000));
                    try {
                        const media = MessageMedia.fromFilePath(path.join(session.filesDir, userData.image1));
                        await sendReply(media);
                    } catch (e1) { console.error(`[User ${idStr}] Error sending image1:`, e1.message); }
                }

                // 4. Voice Note (Piku Recording 2s - 4s)
                if (userData.voice1 && fs.existsSync(path.join(session.filesDir, userData.voice1))) {
                    await sleep(rand(2000, 4000));
                    if (chat) { try { await chat.sendStateRecording(); } catch (_) {} }
                    await sleep(rand(2000, 4000));
                    try {
                        const voiceMedia = MessageMedia.fromFilePath(path.join(session.filesDir, userData.voice1));
                        await sendReply(voiceMedia, { sendAudioAsVoice: true });
                    } catch (e3) { console.error(`[User ${idStr}] Error sending voice1:`, e3.message); }
                }

                // 5. File / APK (Piku Media Gap 2s - 4s)
                if (userData.apk1 && fs.existsSync(path.join(session.filesDir, userData.apk1))) {
                    await sleep(rand(2000, 4000));
                    try {
                        const apkMedia = MessageMedia.fromFilePath(path.join(session.filesDir, userData.apk1));
                        await sendReply(apkMedia);
                    } catch (e4) { console.error(`[User ${idStr}] Error sending apk1:`, e4.message); }
                }

                if (chat) { try { await chat.clearState(); } catch (_) {} }

                userData.stats.sent++;
                userData.credits = Math.max(0, userData.credits - 1);
                saveDatabase();

            } else if (currentStage === 1 && userData.reply2On) {
                // ─── REPLY 2 PIKU SPEED DISPATCH ───
                console.log(`📩 [User ${idStr}] [Reply 2 PIKU DM] From: ${senderNumber}`);
                userData.userStages[chatId] = 2;
                userData.userStages[senderNumber] = 2;
                session.userStages.set(chatId, 2);
                saveDatabase();

                // 1. Text 2 (1.5s - 3s)
                if (userData.text2) {
                    if (chat) { try { await chat.sendStateTyping(); } catch (_) {} }
                    await sleep(rand(1500, 3000));
                    await sendReply(fingerprint(userData.text2));
                }

                // 2. R2 Image 1 (2s - 4s)
                if (userData.r2_image1 && fs.existsSync(path.join(session.filesDir, userData.r2_image1))) {
                    await sleep(rand(2000, 4000));
                    try {
                        const media = MessageMedia.fromFilePath(path.join(session.filesDir, userData.r2_image1));
                        await sendReply(media);
                    } catch (er1) { console.error(`[User ${idStr}] Error sending r2_image1:`, er1.message); }
                }

                // 3. R2 Image 2 (2s - 4s)
                if (userData.r2_image2 && fs.existsSync(path.join(session.filesDir, userData.r2_image2))) {
                    await sleep(rand(2000, 4000));
                    try {
                        const media = MessageMedia.fromFilePath(path.join(session.filesDir, userData.r2_image2));
                        await sendReply(media);
                    } catch (er2) { console.error(`[User ${idStr}] Error sending r2_image2:`, er2.message); }
                }

                if (chat) { try { await chat.clearState(); } catch (_) {} }

                userData.stats.sent++;
                userData.credits = Math.max(0, userData.credits - 1);
                saveDatabase();
            }
        } catch (err) {
            console.error(`❌ Error in WhatsApp message handler for ${idStr}:`, err.message);
        }
    });

    client.initialize();
    return session;
}

// ─── TELEGRAM CARD RENDERERS ─────────────────────────────────────────────────
function getReply1CardText(tgId) {
    const idStr = String(tgId);
    const u = getUserData(idStr) || initUserData(idStr);
    const session = activeSessions.get(idStr);
    const filesDir = getUserFilesDir(idStr);

    const waStatus = session ? session.status : 'NOT STARTED';
    const waNumDisplay = (session && session.waNumber !== 'NOT CONNECTED') ? ` (+${session.waNumber})` : '';

    const rate = u.stats.received > 0 
        ? ((u.stats.sent / u.stats.received) * 100).toFixed(1) + '%' 
        : '—';

    const textStatus   = u.text1 ? '✅ Set' : '❌ Not set';
    const imgStatus    = (u.image1 && fs.existsSync(path.join(filesDir, u.image1))) ? '✅ Set' : '❌ Not set';
    const videoStatus  = (u.video1 && fs.existsSync(path.join(filesDir, u.video1))) ? '✅ Set' : '❌ Not set';
    const voiceStatus  = (u.voice1 && fs.existsSync(path.join(filesDir, u.voice1))) ? '✅ Set' : '❌ Not set';
    const apkStatus    = (u.apk1 && fs.existsSync(path.join(filesDir, u.apk1))) ? '✅ Set' : '❌ Not set';

    return `⚡ *Auto Spreading Bot — Personal Control Panel* ⚡\n` +
        `WhatsApp Status: *${waStatus}${waNumDisplay}*\n` +
        `Auto-Responder Engine: ${u.botOn ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `${creditStatus}\n\n` +
        `📊 *Your Stats:*\n` +
        `📩 Messages received: *${u.stats.received}*\n` +
        `✅ Replies sent: *${u.stats.sent}*\n` +
        `📈 Reply rate: *${rate}*\n\n` +
        `*Your Reply 1 Content:*\n` +
        `✍️ Text: ${textStatus}\n` +
        `🖼️ Image: ${imgStatus}\n` +
        `🎥 Video: ${videoStatus}\n` +
        `🎙️ Voice Note: ${voiceStatus}\n` +
        `📎 File/APK: ${apkStatus}\n\n` +
        `_Jab ON hoga, aapke WhatsApp number pe aane wale har message par yeh auto-reply jayega._\n` +
        `_1 auto-reply = 1 credit deduct_`;
}

function getPricingCardText() {
    return `💰 *BUY CREDITS & UNLIMITED PLANS* 💎\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `📊 *LIMITED CREDIT PLANS:*\n` +
        `🥉 100 Messages → *$9*\n` +
        `🥈 500 Messages → *$42*\n` +
        `🥇 1,000 Messages → *$80*\n\n` +
        `🚀 *UNLIMITED PLANS:*\n` +
        `⚡ 1 Day Unlimited → *$20*\n` +
        `🔥 3 Days Unlimited → *$55*\n` +
        `👑 7 Days Unlimited → *$100*\n\n` +
        `💡 _1 credit = 1 auto-reply sent_\n\n` +
        `💳 *Payment via UPI / Crypto*\n` +
        `📩 *Contact Admin to Activate:*\n` +
        `👉 [Click to DM Admin (@demon\\_hu\\_samjha)](https://t.me/demon_hu_samjha)\n\n` +
        `⚡ _Every new user gets 10 Free Trial Credits on /start!_`;
}

function getAdminPanelCardText() {
    const totalUsers = Object.keys(db.users).length;
    const bannedUsers = Object.values(db.users).filter(u => u.banned).length;
    return `👑 *SUPER ADMIN CONTROL PANEL (AUTO-DM)* 👑\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👥 Registered Users: *${totalUsers}*\n` +
        `🚫 Banned Users: *${bannedUsers}*\n\n` +
        `*Available Admin Commands:*\n` +
        `• \`/tgbroadcast <text>\` — Send notification to ALL Auto-DM users\n` +
        `• \`/addcredits <tgId> <amount>\` — Give credits to user\n` +
        `• \`/deductcredits <tgId> <amount>\` — Deduct credits from user\n` +
        `• \`/setcredits <tgId> <amount>\` — Set exact credits for user\n` +
        `• \`/ban <tgId>\` — Ban user from bot\n` +
        `• \`/unban <tgId>\` — Unban user\n` +
        `• \`/users\` — View full registered users list`;
}

function getReply1Keyboard(tgId) {
    const idStr = String(tgId);
    const u = getUserData(idStr);
    const credits = u ? u.credits : 0;
    const botOn = u ? u.botOn : true;
    const adminMode = isAdmin(idStr);

    const speedMode = u?.speedMode || 'SAFE';
    const speedLabels = {
        SAFE: '🐢 SAFE (45-90s/msg • Anti-Ban Recommended)',
        MEDIUM: '⚡ MEDIUM (20-40s/msg)',
        FAST: '🏃 FAST (6-14s/msg • High Traffic)'
    };

    const keyboard = [
        [{ text: botOn ? '🟢 TURN ENGINE OFF' : '🔴 TURN ENGINE ON', callback_data: 'toggle_bot' }],
        [{ text: '✍️ Set Text 1', callback_data: 'input_text1' },   { text: u?.text1 ? '✏️ Edit Text' : '➕ Add Text', callback_data: 'input_text1' }],
        [{ text: '🖼️ Set Image 1', callback_data: 'input_image1' }, { text: u?.image1 ? '✏️ Change' : '➕ Add', callback_data: 'input_image1' }],
        [{ text: '🎥 Set Video', callback_data: 'input_video1' }, { text: u?.video1 ? '✏️ Change' : '➕ Add', callback_data: 'input_video1' }],
        [{ text: '🎙️ Set Voice Note', callback_data: 'input_voice1' }, { text: u?.voice1 ? '✏️ Change' : '➕ Add', callback_data: 'input_voice1' }],
        [{ text: '📎 Set File/APK', callback_data: 'input_apk1' },  { text: u?.apk1 ? '✏️ Change' : '➕ Add', callback_data: 'input_apk1' }],
        [{ text: '2️⃣ REPLY 2 SETTINGS', callback_data: 'menu_reply2' }],
        [{ text: '💎 Credit Pricing & Plans', callback_data: 'menu_price' }, { text: '📞 DM Admin (@demon_hu_samjha)', url: 'https://t.me/demon_hu_samjha' }],
        [{ text: `💰 Credits: ${credits}`, callback_data: 'check_credits' }, { text: '📲 Connect WhatsApp (QR)', callback_data: 'request_qr' }],
        [{ text: '🚪 Logout WhatsApp', callback_data: 'logout_num' }, { text: '🔄 Reset My Stats', callback_data: 'reset_stats' }],
        [{ text: '🗑️ Clear Content', callback_data: 'clear_all' }, { text: '◀️ REFRESH PANEL', callback_data: 'menu_main' }]
    ];

    if (adminMode) {
        keyboard.push([{ text: '👑 Super Admin Control Panel', callback_data: 'admin_panel' }]);
    }

    return { reply_markup: { inline_keyboard: keyboard } };
}

function getReply2CardText(tgId) {
    const idStr = String(tgId);
    const u = getUserData(idStr);
    const filesDir = getUserFilesDir(idStr);

    const textStatus  = u?.text2 ? '✅ Set' : '❌ Not set';
    const img1Status  = (u?.r2_image1 && fs.existsSync(path.join(filesDir, u.r2_image1))) ? '✅ Set' : '❌ Not set';
    const img2Status  = (u?.r2_image2 && fs.existsSync(path.join(filesDir, u.r2_image2))) ? '✅ Set' : '❌ Not set';

    return `2️⃣ *REPLY 2 SETTINGS — Follow-up Responder*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Status: ${u?.reply2On ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `_Jab koi contact Reply 1 milne ke baad WAPAS message bhejega, tab yeh Follow-up Message jayega._\n\n` +
        `📩 *Reply 2 Content:*\n` +
        `✍️ Text: ${textStatus}\n` +
        `🖼️ Image 1: ${img1Status}\n` +
        `🖼️ Image 2: ${img2Status}`;
}

function getReply2Keyboard(tgId) {
    const u = getUserData(String(tgId));
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: u?.reply2On ? '🔴 DISABLE REPLY 2' : '🟢 ENABLE REPLY 2', callback_data: 'toggle_reply2' }],
                [{ text: '✍️ Set Text 2', callback_data: 'input_text2' },    { text: u?.text2 ? '✏️ Edit' : '➕ Add', callback_data: 'input_text2' }],
                [{ text: '🖼️ Set R2 Image 1', callback_data: 'input_r2_img1' }, { text: u?.r2_image1 ? '✏️ Change' : '➕ Add', callback_data: 'input_r2_img1' }],
                [{ text: '🖼️ Set R2 Image 2', callback_data: 'input_r2_img2' }, { text: u?.r2_image2 ? '✏️ Change' : '➕ Add', callback_data: 'input_r2_img2' }],
                [{ text: '◀️ BACK TO MAIN PANEL', callback_data: 'menu_main' }]
            ]
        }
    };
}

// ─── TELEGRAM BOT CONTROLLER ──────────────────────────────────────────────────
if (tgBot) {

    // ─── ADMIN RESELLER COMMANDS ───
    tgBot.onText(/\/adduser\s+(\d+)\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1];
        const initialCredits = parseInt(match[2]);
        initUserData(targetId, initialCredits, 'user');
        db.users[targetId].credits = initialCredits;
        saveDatabase();
        tgSend(msg.chat.id, `✅ *User Telegram ID \`${targetId}\` added with ${initialCredits} Credits!*`);
    });

    tgBot.onText(/\/setcredits\s+(\d+)\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1];
        const newCredits = parseInt(match[2]);
        initUserData(targetId, newCredits, 'user');
        db.users[targetId].credits = newCredits;
        saveDatabase();
        tgSend(msg.chat.id, `✅ *Credits set to ${newCredits} for Telegram ID \`${targetId}\`!*`);
    });

    tgBot.onText(/\/addcredits\s+(\d+)\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1];
        const addAmount = parseInt(match[2]);
        initUserData(targetId, 0, 'user');
        db.users[targetId].credits += addAmount;
        saveDatabase();
        tgSend(msg.chat.id, `✅ *Added ${addAmount} credits to Telegram ID \`${targetId}\`!* New balance: \`${db.users[targetId].credits}\``);
    });

    tgBot.onText(/\/deluser\s+(\d+)|\/removeuser\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1] || match[2];
        if (db.users[targetId]) {
            delete db.users[targetId];
            saveDatabase();
            // Disconnect WhatsApp session if active
            const session = activeSessions.get(targetId);
            if (session?.client) {
                try { session.client.destroy(); } catch (_) {}
                activeSessions.delete(targetId);
            }
            tgSend(msg.chat.id, `🗑️ *User Telegram ID \`${targetId}\` removed!*`);
        } else {
            tgSend(msg.chat.id, `❌ Telegram ID \`${targetId}\` not found in database.`);
        }
    });

    // Admin Command: /deductcredits <tgId> <amount>
    tgBot.onText(/\/deductcredits\s+(\d+)\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1].trim();
        const amount = parseInt(match[2], 10);
        const u = initUserData(targetId);
        u.credits = Math.max(0, u.credits - amount);
        saveDatabase();
        tgSend(msg.chat.id, `✅ Deducted *${amount} credits* from User \`${targetId}\`. New total: *${u.credits}*`);
        tgSend(targetId, `💰 *${amount} Credits were deducted from your account by Admin.* Total: *${u.credits}*`);
    });

    // Admin Command: /ban <tgId>
    tgBot.onText(/\/ban\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1].trim();
        const u = initUserData(targetId);
        u.banned = true;
        saveDatabase();
        tgSend(msg.chat.id, `🚫 *User \`${targetId}\` has been BANNED from Auto-DM bot!*`);
        tgSend(targetId, `🛑 *Your account has been BANNED by Admin.* You can no longer use this bot.`);
    });

    // Admin Command: /unban <tgId>
    tgBot.onText(/\/unban\s+(\d+)/, (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const targetId = match[1].trim();
        const u = initUserData(targetId);
        u.banned = false;
        saveDatabase();
        tgSend(msg.chat.id, `✅ *User \`${targetId}\` has been UNBANNED!*`);
        tgSend(targetId, `🎉 *Your account has been UNBANNED by Admin!* Send /start to access your panel.`);
    });

    // Admin Command: /tgbroadcast <text>
    tgBot.onText(/\/tgbroadcast\s+(.+)/s, async (msg, match) => {
        if (!isAdmin(msg.chat.id)) return;
        const broadcastMsg = match[1].trim();
        const allUsers = Object.keys(db.users).filter(id => !isBanned(id));

        tgSend(msg.chat.id, `📢 *Starting Telegram Broadcast to ${allUsers.length} users...*`);
        let sent = 0;
        for (const uid of allUsers) {
            try {
                await tgSend(uid, `📢 *ADMIN ANNOUNCEMENT:*\n━━━━━━━━━━━━━━━━━━━━\n\n${broadcastMsg}`);
                sent++;
                await sleep(100);
            } catch (_) {}
        }
        tgSend(msg.chat.id, `🎉 *Broadcast completed! Sent to ${sent}/${allUsers.length} users.*`);
    });

    // Admin Command: /admin
    tgBot.onText(/\/admin/, (msg) => {
        if (!isAdmin(msg.chat.id)) return;
        tgSend(msg.chat.id, getAdminPanelCardText(), {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📢 TG Broadcast to Users', callback_data: 'adm_bc_prompt' }],
                    [{ text: '👥 List All Users', callback_data: 'adm_users' }],
                    [{ text: '◀️ Back to Main Menu', callback_data: 'back_main' }]
                ]
            }
        });
    });

    // Pricing Command: /price or /plans
    tgBot.onText(/\/price|\/plans|\/recharge/, (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        tgSend(msg.chat.id, getPricingCardText(), getReply1Keyboard(msg.chat.id));
    });

    tgBot.onText(/\/users/, (msg) => {
        if (!isAdmin(msg.chat.id)) return;
        let listText = `👥 *Registered Telegram Users & Credits:*\n━━━━━━━━━━━━━━━━━━━━\n`;
        const userEntries = Object.entries(db.users);
        if (userEntries.length === 0) listText += `_No users registered._`;
        else {
            userEntries.forEach(([id, u]) => {
                const session = activeSessions.get(id);
                const waStatus = session ? session.status : 'OFFLINE';
                const banStatus = u.banned ? ' 🚫 [BANNED]' : '';
                listText += `• ID: \`${id}\` | Credits: *${u.credits}*${banStatus} | WA: *${waStatus}*\n`;
            });
        }
        tgSend(msg.chat.id, listText);
    });

    tgBot.onText(/\/start|\/menu/, (msg) => {
        if (isBanned(msg.chat.id)) {
            tgSend(msg.chat.id, `🛑 *Your account has been BANNED from using this bot.* Contact Admin for assistance.`);
            return;
        }
        const isNew = !getUserData(msg.chat.id);
        const u = initUserData(msg.chat.id);
        if (isNew) {
            tgSend(msg.chat.id, `🎉 *Welcome to Auto Spreading Bot!* You have been granted *10 Free Trial Credits* to test our auto-responder engine! 🚀`);
        }
        const session = getOrCreateSession(String(msg.chat.id));
        session.awaitInput = null;
        tgSend(msg.chat.id, getReply1CardText(msg.chat.id), getReply1Keyboard(msg.chat.id));
    });

    async function sendQrOnDemand(chatId) {
        const idStr = String(chatId);
        const session = getOrCreateSession(idStr);

        if (session.client && (session.status === 'CONNECTED' || session.status === 'AUTHENTICATED')) {
            tgSend(chatId, `✅ *Your WhatsApp is ALREADY CONNECTED & ONLINE!* 🟢\nNumber: \`+${session.waNumber}\`\n\n_Agar doosra WhatsApp number link karna chahte ho, toh pehle '🚪 Logout My WhatsApp' button dabao!_`);
            return;
        }

        session.qrRequested = true;

        if (session.latestQrCode && session.status === 'GENERATING_QR') {
            try {
                session.qrRequested = false;
                const qrBuf = await QRCode.toBuffer(session.latestQrCode, { width: 400, margin: 2 });
                tgPhoto(chatId, qrBuf, "📲 *Scan this QR Code in your WhatsApp Linked Devices!*");
            } catch (err) {
                tgSend(chatId, `❌ Error generating QR image: ${err.message}`);
            }
        } else {
            tgSend(chatId, "⏳ *Initializing your isolated WhatsApp engine & generating fresh QR Code...* Please wait a few seconds.");
            startWhatsAppClient(idStr);
        }
    }

    tgBot.onText(/\/qr|\/getqr/, (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        sendQrOnDemand(msg.chat.id);
    });

    async function logoutNumber(chatId) {
        const idStr = String(chatId);
        const u = getUserData(idStr);
        if (u) {
            u.waAuthenticated = false;
            saveDatabase();
        }
        tgSend(chatId, "🚪 *Logging out your WhatsApp session...* Wiping auth files. Please wait 10 seconds.");

        const session = activeSessions.get(idStr);
        if (session) {
            try { if (session.client) await session.client.logout(); } catch (_) {}
            try { if (session.client) await session.client.destroy(); } catch (_) {}
            try {
                if (fs.existsSync(session.authDir)) {
                    fs.rmSync(session.authDir, { recursive: true, force: true });
                }
            } catch (_) {}
            session.status = 'DISCONNECTED';
            session.waNumber = 'NOT CONNECTED';
            session.client = null;
            session.latestQrCode = null;
            session.userStages.clear();
            session.userLastActive.clear();
        }
        tgSend(chatId, "✅ *Your WhatsApp session has been logged out!* Send /qr to link a new number.");
    }

    tgBot.onText(/\/logout|\/unpair/, (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        logoutNumber(msg.chat.id);
    });

    function wipeUserContent(chatId) {
        const idStr = String(chatId);
        const u = getUserData(idStr);
        if (!u) return;

        u.text1 = null;
        u.text2 = null;
        u.image1 = null;
        u.voice1 = null;
        u.apk1 = null;
        u.r2_image1 = null;
        u.r2_image2 = null;
        u.stats = { received: 0, sent: 0 };
        saveDatabase();

        const userFilesDir = getUserFilesDir(idStr);
        try {
            if (fs.existsSync(userFilesDir)) {
                fs.readdirSync(userFilesDir).forEach(file => {
                    try { fs.unlinkSync(path.join(userFilesDir, file)); } catch (_) {}
                });
            }
        } catch (_) {}

        tgSend(chatId, "🗑️ *ALL YOUR CONTENT & LOADED MEDIA WIPED!*", getReply1Keyboard(chatId));
    }

    tgBot.onText(/\/clearall|\/resetall/, (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        wipeUserContent(msg.chat.id);
    });

    // Telegram Callback Query Handler
    tgBot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const idStr  = String(chatId);

        if (!isAuthorized(chatId)) {
            try { await tgBot.answerCallbackQuery(query.id, { text: "❌ Access Denied!", show_alert: true }); } catch (_) {}
            return;
        }

        const u = getUserData(idStr) || initUserData(idStr);
        const session = getOrCreateSession(idStr);
        const data = query.data;

        try { await tgBot.answerCallbackQuery(query.id); } catch (_) {}

        if (data === 'menu_main' || data === 'back_main') {
            session.awaitInput = null;
            tgEditOrSend(chatId, query.message.message_id, getReply1CardText(chatId), getReply1Keyboard(chatId));
        }
        else if (data === 'menu_price') {
            tgEditOrSend(chatId, query.message.message_id, getPricingCardText(), getReply1Keyboard(chatId));
        }
        else if (data === 'admin_panel') {
            if (!isAdmin(chatId)) return;
            tgEditOrSend(chatId, query.message.message_id, getAdminPanelCardText(), {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 TG Broadcast to Users', callback_data: 'adm_bc_prompt' }],
                        [{ text: '👥 List All Users', callback_data: 'adm_users' }],
                        [{ text: '◀️ Back to Main Menu', callback_data: 'back_main' }]
                    ]
                }
            });
        }
        else if (data === 'adm_users') {
            if (!isAdmin(chatId)) return;
            let userList = `👥 *Registered Auto-DM Users (${Object.keys(db.users).length}):*\n\n`;
            userList += Object.entries(db.users).map(([id, userObj]) => {
                const banStatus = userObj.banned ? ' 🚫 [BANNED]' : '';
                return `• User \`${id}\` (${userObj.role}): *${userObj.credits} credits*${banStatus} | Recv: ${userObj.stats?.received || 0} | Sent: ${userObj.stats?.sent || 0}`;
            }).join('\n');
            tgEditOrSend(chatId, query.message.message_id, userList, {
                reply_markup: { inline_keyboard: [[{ text: '◀️ Admin Panel', callback_data: 'admin_panel' }]] }
            });
        }
        else if (data === 'adm_bc_prompt') {
            if (!isAdmin(chatId)) return;
            tgEditOrSend(chatId, query.message.message_id, `📢 *TELEGRAM BROADCAST TO ALL AUTO-DM USERS*\n\nTo send a broadcast message to all registered bot users, type:\n\`\`\`\n/tgbroadcast Your announcement text here...\n\`\`\``, {
                reply_markup: { inline_keyboard: [[{ text: '◀️ Admin Panel', callback_data: 'admin_panel' }]] }
            });
        }
        else if (data === 'menu_reply2') {
            session.awaitInput = null;
            tgEditOrSend(chatId, query.message.message_id, getReply2CardText(chatId), getReply2Keyboard(chatId));
        }
        else if (data === 'toggle_bot') {
            u.botOn = !u.botOn;
            saveDatabase();
            tgEditOrSend(chatId, query.message.message_id, getReply1CardText(chatId), getReply1Keyboard(chatId));
        }
        else if (data === 'toggle_speed') {
            const currentSpeed = u.speedMode || 'SAFE';
            if (currentSpeed === 'SAFE') u.speedMode = 'MEDIUM';
            else if (currentSpeed === 'MEDIUM') u.speedMode = 'FAST';
            else u.speedMode = 'SAFE';
            saveDatabase();
            tgEditOrSend(chatId, query.message.message_id, getReply1CardText(chatId), getReply1Keyboard(chatId));
        }
        else if (data === 'toggle_reply2') {
            u.reply2On = !u.reply2On;
            saveDatabase();
            tgEditOrSend(chatId, query.message.message_id, getReply2CardText(chatId), getReply2Keyboard(chatId));
        }
        else if (data === 'reset_stats') {
            u.stats = { received: 0, sent: 0 };
            saveDatabase();
            tgEditOrSend(chatId, query.message.message_id, `✅ *Your Stats reset to 0!*`, getReply1Keyboard(chatId));
        }
        else if (data === 'check_credits') {
            tgEditOrSend(chatId, query.message.message_id, `💰 *Your Credits Balance*: \`${u.credits}\`\n\n• Each auto-reply sent = 1 credit deduct.\n• Contact Admin to recharge!`, getReply1Keyboard(chatId));
        }
        else if (data === 'logout_num') {
            logoutNumber(chatId);
        }
        else if (data === 'request_qr') {
            sendQrOnDemand(chatId);
        }
        else if (data === 'clear_all') {
            wipeUserContent(chatId);
        }
        
        // Input switches
        else if (data === 'input_text1') {
            session.awaitInput = 'text1';
            tgEditOrSend(chatId, query.message.message_id, `✍️ *Send your Auto Reply Text for Reply 1 now...*\n\n(Type and send message in chat)`);
        }
        else if (data === 'input_text2') {
            session.awaitInput = 'text2';
            tgEditOrSend(chatId, query.message.message_id, `✍️ *Send your Auto Reply Text for Reply 2 now...*\n\n(Type and send message in chat)`);
        }
        else if (data === 'input_image1') {
            session.awaitInput = 'image1';
            tgEditOrSend(chatId, query.message.message_id, `🖼️ *Send Image Photo for Reply 1 now...*\n\n(Send photo in chat)`);
        }
        else if (data === 'input_video1') {
            session.awaitInput = 'video1';
            tgEditOrSend(chatId, query.message.message_id, `🎥 *Send Video File (.mp4) for Reply 1 now...*\n\n(Send video in chat)`);
        }
        else if (data === 'input_voice1') {
            session.awaitInput = 'voice1';
            tgEditOrSend(chatId, query.message.message_id, `🎙️ *Send Voice Note or Audio file for Reply 1 now...*\n\n(Send voice or .mp3 file in chat)`);
        }
        else if (data === 'input_apk1') {
            session.awaitInput = 'apk1';
            tgEditOrSend(chatId, query.message.message_id, `📎 *Send .APK File or Document for Reply 1 now...*\n\n(Send .apk document in chat)`);
        }
        else if (data === 'input_r2_img1') {
            session.awaitInput = 'r2_image1';
            tgEditOrSend(chatId, query.message.message_id, `🖼️ *Send Image 1 Photo for Reply 2 now...*\n\n(Send photo in chat)`);
        }
        else if (data === 'input_r2_img2') {
            session.awaitInput = 'r2_image2';
            tgEditOrSend(chatId, query.message.message_id, `🖼️ *Send Image 2 Photo for Reply 2 now...*\n\n(Send photo in chat)`);
        }
    });

    // Handle Text Input
    tgBot.on('message', async (msg) => {
        if (!isAuthorized(msg.chat.id) || !msg.text || msg.text.startsWith('/')) return;
        const chatId = msg.chat.id;
        const idStr  = String(chatId);
        const u = getUserData(idStr);
        const session = getOrCreateSession(idStr);

        if (session.awaitInput === 'text1') {
            u.text1 = msg.text.trim();
            saveDatabase();
            session.awaitInput = null;
            tgSend(chatId, `✅ *Text 1 saved!*`, getReply1Keyboard(chatId));
        }
        else if (session.awaitInput === 'text2') {
            u.text2 = msg.text.trim();
            saveDatabase();
            session.awaitInput = null;
            tgSend(chatId, `✅ *Text 2 saved!*`, getReply2Keyboard(chatId));
        }
    });

    // Handle Photo Uploads
    tgBot.on('photo', async (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        const chatId = msg.chat.id;
        const idStr  = String(chatId);
        const u = getUserData(idStr);
        const session = getOrCreateSession(idStr);
        const filesDir = getUserFilesDir(idStr);
        const photo  = msg.photo[msg.photo.length - 1];

        let saveAs = null;
        if (session.awaitInput === 'image1' || !u.image1) saveAs = 'image1.jpg';
        else if (session.awaitInput === 'r2_image1') saveAs = 'r2_image1.jpg';
        else if (session.awaitInput === 'r2_image2') saveAs = 'r2_image2.jpg';
        else saveAs = 'image1.jpg';

        tgSend(chatId, `⏳ Saving image as \`${saveAs}\`...`);
        try {
            const link = await tgBot.getFileLink(photo.file_id);
            const res  = await axios.get(link, { responseType: 'arraybuffer' });
            fs.writeFileSync(path.join(filesDir, saveAs), Buffer.from(res.data));

            if (saveAs === 'image1.jpg') u.image1 = saveAs;
            else if (saveAs === 'r2_image1.jpg') u.r2_image1 = saveAs;
            else if (saveAs === 'r2_image2.jpg') u.r2_image2 = saveAs;
            saveDatabase();

            session.awaitInput = null;
            tgSend(chatId, `✅ *Image saved!*`, saveAs.startsWith('r2') ? getReply2Keyboard(chatId) : getReply1Keyboard(chatId));
        } catch (err) {
            tgSend(chatId, `❌ Failed to save image: ${err.message}`);
        }
    });

    // Handle Document / File Uploads
    tgBot.on('document', async (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        const chatId = msg.chat.id;
        const idStr  = String(chatId);
        const u = getUserData(idStr);
        const session = getOrCreateSession(idStr);
        const filesDir = getUserFilesDir(idStr);

        const doc   = msg.document;
        const fname = doc.file_name || 'file';
        const ext   = path.extname(fname).toLowerCase();

        const fetchBuffer = async () => {
            const link = await tgBot.getFileLink(doc.file_id);
            const res  = await axios.get(link, { responseType: 'arraybuffer' });
            return Buffer.from(res.data);
        };

        if (ext === '.apk' || session.awaitInput === 'apk1') {
            const originalApkName = doc.file_name || 'app.apk';
            tgSend(chatId, `⏳ Saving APK as \`${originalApkName}\`...`);
            try {
                const buf = await fetchBuffer();
                fs.writeFileSync(path.join(filesDir, originalApkName), buf);
                u.apk1 = originalApkName;
                saveDatabase();
                session.awaitInput = null;
                tgSend(chatId, `✅ *APK File saved as ${originalApkName}!*`, getReply1Keyboard(chatId));
            } catch (err) {
                tgSend(chatId, `❌ Failed to save APK: ${err.message}`);
            }
        }
        else if (['.mp4', '.mov', '.mkv'].includes(ext) || session.awaitInput === 'video1') {
            tgSend(chatId, `⏳ Saving Video...`);
            try {
                const buf = await fetchBuffer();
                fs.writeFileSync(path.join(filesDir, 'video1.mp4'), buf);
                u.video1 = 'video1.mp4';
                saveDatabase();
                session.awaitInput = null;
                tgSend(chatId, `✅ *Video File saved!*`, getReply1Keyboard(chatId));
            } catch (err) {
                tgSend(chatId, `❌ Failed to save Video: ${err.message}`);
            }
        }
        else if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext) || session.awaitInput === 'voice1') {
            const voiceName = doc.file_name || 'voice.mp3';
            tgSend(chatId, `⏳ Saving Voice Note...`);
            try {
                const buf = await fetchBuffer();
                fs.writeFileSync(path.join(filesDir, 'voice.mp3'), buf);
                u.voice1 = 'voice.mp3';
                saveDatabase();
                session.awaitInput = null;
                tgSend(chatId, `✅ *Voice Note saved!*`, getReply1Keyboard(chatId));
            } catch (err) {
                tgSend(chatId, `❌ Failed to save Voice Note: ${err.message}`);
            }
        }
    });

    // Handle Voice Messages directly
    tgBot.on('voice', async (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        const chatId = msg.chat.id;
        const idStr  = String(chatId);
        const u = getUserData(idStr);
        const session = getOrCreateSession(idStr);
        const filesDir = getUserFilesDir(idStr);

        tgSend(chatId, `⏳ Saving Voice Note...`);
        try {
            const link = await tgBot.getFileLink(msg.voice.file_id);
            const res  = await axios.get(link, { responseType: 'arraybuffer' });
            fs.writeFileSync(path.join(filesDir, 'voice.mp3'), Buffer.from(res.data));
            u.voice1 = 'voice.mp3';
            saveDatabase();
            session.awaitInput = null;
            tgSend(chatId, `✅ *Voice Note saved!*`, getReply1Keyboard(chatId));
        } catch (err) {
            tgSend(chatId, `❌ Failed to save Voice Note: ${err.message}`);
        }
    });

    // Handle Video Messages directly
    tgBot.on('video', async (msg) => {
        if (!isAuthorized(msg.chat.id)) return;
        const chatId = msg.chat.id;
        const idStr  = String(chatId);
        const u = getUserData(idStr);
        const session = getOrCreateSession(idStr);
        const filesDir = getUserFilesDir(idStr);

        tgSend(chatId, `⏳ Saving Video...`);
        try {
            const link = await tgBot.getFileLink(msg.video.file_id);
            const res  = await axios.get(link, { responseType: 'arraybuffer' });
            fs.writeFileSync(path.join(filesDir, 'video1.mp4'), Buffer.from(res.data));
            u.video1 = 'video1.mp4';
            saveDatabase();
            session.awaitInput = null;
            tgSend(chatId, `✅ *Video File saved!*`, getReply1Keyboard(chatId));
        } catch (err) {
            tgSend(chatId, `❌ Failed to save Video: ${err.message}`);
        }
    });
}

console.log('🚀 Multi-Tenant WhatsApp Auto-Spreading Engine Loaded!');

// ─── AUTO-RECONNECT ALL SAVED SESSIONS ON STARTUP ─────────────────────────────
(async () => {
    console.log('🔍 Checking for existing saved WhatsApp sessions to auto-connect...');
    const userIds = Object.keys(db.users);
    for (const tgId of userIds) {
        const u = db.users[tgId];
        const userAuthDir = getUserAuthDir(tgId);
        // ONLY auto-start if user previously authenticated their WhatsApp number
        if (u && u.waAuthenticated === true && fs.existsSync(userAuthDir)) {
            console.log(`⚡ Auto-starting verified WhatsApp session for Telegram ID: ${tgId}`);
            try {
                startWhatsAppClient(tgId);
                await sleep(2000); // Stagger startup by 2s to prevent CPU spikes
            } catch (err) {
                console.error(`⚠️ Failed to auto-start session for ${tgId}:`, err.message);
            }
        }
    }
})();

