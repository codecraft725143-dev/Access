/**
 * 💎 WP BROADCASTER PRO v3.5 (ADAPTIVE MULTI-ACCOUNT ROTATION & AUTO-BANNED GUARD)
 * Powered by LO & ENI
 * • Works with 1 Single Account OR Auto-Rotates 2, 3, 4+ Accounts dynamically!
 * • Auto-detects & skips banned/disconnected accounts mid-broadcast!
 * • Individual Account Logout & Management!
 */

'use strict';

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.TelegramBot || TelegramBotModule.default || TelegramBotModule;
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

// ─── GLOBAL ERROR GUARDS ────────────────────────────────────────────────────
process.on('uncaughtException', err => console.error('⚠️ Uncaught Exception:', err.message));
process.on('unhandledRejection', reason => console.error('⚠️ Unhandled Rejection:', reason?.message || reason));

// ─── HEALTH CHECK SERVER ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('⚡ WP Broadcaster Pro Adaptive Engine ONLINE 24/7!\n');
}).listen(PORT, () => {
    console.log(`🌐 Health check HTTP server listening on port ${PORT}`);
});

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8078235056:AAHBU4crgUOO0FbFAVjIYVGNN8Ed_eApW_E';
const TELEGRAM_ADMIN_ID  = process.env.TELEGRAM_ADMIN_ID  || '7507173935';

// Speed presets for broadcasting
const SPEEDS = {
    SAFE:   { msgDelay: [25000, 35000],  batchSize: 10, batchBreak: 120000, label: '🐢 SAFE   (~30s/msg | Batch 10, 2m break)' },
    MEDIUM: { msgDelay: [12000, 18000],  batchSize: 20, batchBreak: 60000,  label: '🚶 MEDIUM (~15s/msg | Batch 20, 1m break)' },
    FAST:   { msgDelay: [6000,  10000],  batchSize: 40, batchBreak: 30000,  label: '🏃 FAST   (~7s/msg | Batch 40, 30s break)' },
};

// ─── DIRECTORY PATHS ─────────────────────────────────────────────────────────
const baseFilesDir = path.join(__dirname, 'files');
const baseAuthDir  = path.join(__dirname, '.wwebjs_auth');
const dbFilePath   = path.join(__dirname, 'database.json');

[baseFilesDir, baseAuthDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

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

// ─── PERSISTENT JSON DATABASE SYSTEM ──────────────────────────────────────────
let db = {
    users: {
        [TELEGRAM_ADMIN_ID]: {
            role: 'ADMIN',
            credits: 999999,
            template: "Hello {Name}! Check out our special update 👇",
            attachment: null,
            speed: 'SAFE',
            accounts: {},
            stats: { totalBroadcasts: 0, sent: 0, failed: 0 }
        }
    }
};

function loadDatabase() {
    try {
        if (fs.existsSync(dbFilePath)) {
            const data = fs.readFileSync(dbFilePath, 'utf8');
            db = JSON.parse(data);
            if (!db.users) db.users = {};
            if (!db.users[TELEGRAM_ADMIN_ID]) {
                db.users[TELEGRAM_ADMIN_ID] = {
                    role: 'ADMIN',
                    credits: 999999,
                    template: "Hello {Name}! Check out our special update 👇",
                    attachment: null,
                    speed: 'SAFE',
                    accounts: {},
                    stats: { totalBroadcasts: 0, sent: 0, failed: 0 }
                };
            }
            console.log('💾 Broadcaster Database loaded successfully!');
        } else {
            saveDatabase();
        }
    } catch (err) {
        console.error('❌ Database load error:', err.message);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('❌ Database save error:', err.message);
    }
}

loadDatabase();

const defaultUserData = {
    role: 'USER',
    credits: 100,
    template: "Hello {Name}! Check out our special update 👇",
    attachment: null,
    speed: 'SAFE',
    accounts: {},
    stats: { totalBroadcasts: 0, sent: 0, failed: 0 }
};

function getUserData(tgId) {
    const idStr = String(tgId);
    return db.users[idStr] || null;
}

function initUserData(tgId) {
    const idStr = String(tgId);
    if (!db.users[idStr]) {
        db.users[idStr] = JSON.parse(JSON.stringify(defaultUserData));
        if (idStr === String(TELEGRAM_ADMIN_ID)) {
            db.users[idStr].role = 'ADMIN';
            db.users[idStr].credits = 999999;
        }
        saveDatabase();
    }
    return db.users[idStr];
}

function getUserFilesDir(tgId) {
    const dir = path.join(baseFilesDir, `user_${tgId}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getUserAuthDir(tgId, accId) {
    const dir = path.join(baseAuthDir, `user_${tgId}`, `acc_${accId}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// ─── ACTIVE MULTI-ACCOUNT USER SESSIONS STATE ──────────────────────────────
const activeSessions = new Map();

function getOrCreateUserSession(tgId) {
    const idStr = String(tgId);
    if (!activeSessions.has(idStr)) {
        activeSessions.set(idStr, {
            tgId: idStr,
            accounts: new Map(), // accId -> Account State Object
            broadcasting: false,
            stopBroadcast: false,
            broadcastStats: { sent: 0, failed: 0, skipped: 0, total: 0 },
            sessionStep: null,
            contacts: [],
            columns: [],
            filesDir: getUserFilesDir(idStr)
        });
    }
    return activeSessions.get(idStr);
}

// ─── TELEGRAM BOT CLIENT ─────────────────────────────────────────────────────
const tgBot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
    polling: { interval: 500, autoStart: true, params: { timeout: 10 } }
});

tgBot.on('polling_error', (err) => {
    if (!err.message.includes('EFATAL')) {
        console.error('⚠️ Telegram Polling Error:', err.message);
    }
});

function isAuthorized(tgId) {
    const idStr = String(tgId);
    return Boolean(getUserData(idStr));
}

function isAdmin(tgId) {
    const idStr = String(tgId);
    const u = getUserData(idStr);
    return u && u.role === 'ADMIN';
}

function tgSend(chatId, text, opts = {}) {
    return tgBot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts }).catch(err => {
        console.error(`Error sending TG message to ${chatId}:`, err.message);
    });
}

function tgEditOrSend(chatId, msgId, text, opts = {}) {
    if (msgId) {
        return tgBot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', ...opts }).catch(err => {
            if (!err.message.includes('message is not modified')) {
                return tgSend(chatId, text, opts);
            }
        });
    }
    return tgSend(chatId, text, opts);
}

function tgPhoto(chatId, buf, caption) {
    return tgBot.sendPhoto(chatId, buf, { caption, parse_mode: 'Markdown' }, { filename: 'qr.png', contentType: 'image/png' }).catch(err => {
        console.error(`Error sending TG photo to ${chatId}:`, err.message);
    });
}

// ─── INITIALIZE SPECIFIC WHATSAPP ACCOUNT ────────────────────────────────────
function startUserWhatsAppAccount(tgId, accId) {
    const idStr = String(tgId);
    const accKey = String(accId);
    const userSession = getOrCreateUserSession(idStr);
    
    if (userSession.accounts.has(accKey)) {
        const existingAcc = userSession.accounts.get(accKey);
        if (existingAcc.ready || existingAcc.status === 'CONNECTING') {
            return existingAcc;
        }
    }

    const authDir = getUserAuthDir(idStr, accKey);
    cleanLocks(authDir);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: accKey, dataPath: authDir }),
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

    const accState = {
        accId: accKey,
        client,
        qrString: null,
        ready: false,
        waNumber: 'NOT CONNECTED',
        status: 'CONNECTING',
        qrRequested: false
    };

    userSession.accounts.set(accKey, accState);

    client.on('qr', async (qr) => {
        accState.qrString = qr;
        accState.status = 'GENERATING_QR';

        if (accState.qrRequested) {
            console.log(`📲 [User ${idStr} - Account ${accKey}] Sending QR Code to Telegram...`);
            accState.qrRequested = false;
            try {
                const qrBuf = await QRCode.toBuffer(qr, { width: 400, margin: 2 });
                tgPhoto(idStr, qrBuf, `📲 *Account ${accKey} — Scan to link WhatsApp!*`);
            } catch (err) {
                console.error(`Error generating QR buffer for ${idStr}-${accKey}:`, err.message);
            }
        }
    });

    client.on('authenticated', () => {
        accState.status = 'AUTHENTICATED';
        const userData = getUserData(idStr);
        if (userData) {
            if (!userData.accounts) userData.accounts = {};
            if (!userData.accounts[accKey]) userData.accounts[accKey] = {};
            userData.accounts[accKey].waAuthenticated = true;
            saveDatabase();
        }
        console.log(`🔒 [User ${idStr} - Acc ${accKey}] WhatsApp Session Authenticated!`);
        tgSend(idStr, `🔒 *Account ${accKey} Authenticated Successfully!*`);
    });

    client.on('ready', () => {
        accState.ready = true;
        accState.status = 'CONNECTED';
        accState.waNumber = client.info?.wid?.user || 'CONNECTED';
        const userData = getUserData(idStr);
        if (userData) {
            if (!userData.accounts) userData.accounts = {};
            userData.accounts[accKey] = {
                waAuthenticated: true,
                waNumber: accState.waNumber
            };
            saveDatabase();
        }
        console.log(`🚀 [User ${idStr} - Acc ${accKey}] WhatsApp ONLINE (+${accState.waNumber})`);
        tgSend(idStr, `🚀 *Account ${accKey} (+${accState.waNumber}) is ONLINE!* 🟢`);
    });

    client.on('disconnected', (reason) => {
        accState.ready = false;
        accState.status = 'DISCONNECTED';
        accState.waNumber = 'DISCONNECTED';
        const userData = getUserData(idStr);
        if (userData && userData.accounts && userData.accounts[accKey]) {
            userData.accounts[accKey].waAuthenticated = false;
            saveDatabase();
        }
        console.log(`🔴 [User ${idStr} - Acc ${accKey}] WhatsApp Disconnected/Banned:`, reason);
        tgSend(idStr, `⚠️ *Account ${accKey} Disconnected/Banned:* ${reason}\n\n*Auto-Guard:* Bot will auto-skip this account and continue broadcast with remaining online accounts!`);
    });

    client.initialize().catch(async (err) => {
        if (err.message.includes('Execution context was destroyed')) {
            console.log(`🔄 [User ${idStr} - Acc ${accKey}] Service Worker context reloaded. Re-initializing session...`);
            try { await client.destroy(); } catch (_) {}
            await sleep(2000);
            userSession.accounts.delete(accKey);
            startUserWhatsAppAccount(tgId, accKey);
        } else {
            console.error(`❌ [User ${idStr} - Acc ${accKey}] Init error:`, err.message);
        }
    });

    return accState;
}

function sendQrOnDemand(chatId, accId = null) {
    const idStr = String(chatId);
    const userSession = getOrCreateUserSession(idStr);

    let targetAccId = accId;
    if (!targetAccId) {
        let maxAcc = 0;
        for (const k of userSession.accounts.keys()) {
            const num = parseInt(k, 10);
            if (!isNaN(num) && num > maxAcc) maxAcc = num;
        }
        targetAccId = String(maxAcc + 1);
    }

    const accState = startUserWhatsAppAccount(idStr, targetAccId);
    if (accState.ready) {
        tgSend(chatId, `🟢 *Account ${targetAccId} (+${accState.waNumber}) is already ONLINE!*`);
        return;
    }

    accState.qrRequested = true;
    tgSend(chatId, `⏳ *Generating fresh QR Code for Account ${targetAccId}...* Please wait 10 seconds.`);
}

// ─── GET ONLINE ACTIVE ACCOUNTS FOR USER ─────────────────────────────────────
function getOnlineUserAccounts(tgId) {
    const idStr = String(tgId);
    const userSession = getOrCreateUserSession(idStr);
    const online = [];
    for (const [accId, accState] of userSession.accounts.entries()) {
        if (accState.ready && accState.client && accState.status === 'CONNECTED') {
            online.push(accState);
        }
    }
    return online;
}

// ─── ADAPTIVE BROADCAST ENGINE WITH ROUND-ROBIN ROTATION & BANNED GUARD ────
function parseSpintax(text) {
    if (!text) return text;
    // Recursively resolve nested or consecutive spintax blocks {option1|option2}
    let res = text;
    while (/\{([^{}]+)\}/.test(res)) {
        let matches = res.match(/\{([^{}]+)\}/g);
        let replacedAny = false;
        for (const m of matches) {
            const inner = m.slice(1, -1);
            if (inner.includes('|')) {
                const options = inner.split('|');
                const picked = options[Math.floor(Math.random() * options.length)].trim();
                res = res.replace(m, picked);
                replacedAny = true;
            }
        }
        if (!replacedAny) break;
    }
    return res;
}

function applyTemplate(template, row) {
    let msg = template || '';
    
    // First run spintax on raw template text
    msg = parseSpintax(msg);

    if (!row) return msg;

    msg = msg.replace(/\(([^)]+)\}/g, '{$1}');

    for (const [key, val] of Object.entries(row)) {
        if (!key) continue;
        const valStr = (val !== undefined && val !== null) ? String(val) : '';
        
        msg = msg.split(`{${key}}`).join(valStr);

        const regexCI = new RegExp(`\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'gi');
        msg = msg.replace(regexCI, valStr);

        const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
        if (cleanKey.length > 0) {
            const regexFlex = new RegExp(`\\{\\s*${cleanKey.split('').join('\\s*')}\\s*\\}`, 'gi');
            msg = msg.replace(regexFlex, valStr);
        }
    }

    return parseSpintax(msg);
}

function normalizePhone(raw) {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits || digits.length < 7) return null;
    if (digits.length === 10 && digits[0] !== '0') return '91' + digits;
    if (digits.length >= 11) return digits;
    return null;
}

function parseContacts(buf, filename) {
    const ext  = path.extname(filename).toLowerCase();
    const text = buf.toString('utf-8');
    let contacts = [];

    if (ext === '.csv') {
        const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
        const phoneCol = Object.keys(rows[0] || {}).find(k => /phone|mobile|number|tel/i.test(k)) || Object.keys(rows[0] || {})[0];
        contacts = rows.map(r => {
            const phone = normalizePhone(r[phoneCol] || '');
            return phone ? { phone, ...r } : null;
        }).filter(Boolean);
    } else if (ext === '.txt') {
        contacts = text.split('\n').map(l => l.trim()).filter(l => /\d{7,}/.test(l)).map(l => ({ phone: normalizePhone(l) })).filter(c => c.phone);
    } else if (ext === '.vcf') {
        const tels = [...text.matchAll(/TEL[^:]*:([^\r\n]+)/g)].map(m => normalizePhone(m[1].trim())).filter(Boolean);
        contacts = tels.map(p => ({ phone: p }));
    } else if (ext === '.html' || ext === '.htm') {
        const waLinks = [...text.matchAll(/wa\.me\/(\d+)/g)].map(m => normalizePhone(m[1]));
        const bare    = [...text.matchAll(/(?<!\d)(\d{10,13})(?!\d)/g)].map(m => normalizePhone(m[1]));
        const all = [...new Set([...waLinks, ...bare])].filter(Boolean);
        contacts = all.map(p => ({ phone: p }));
    }
    return contacts;
}

async function runUserBroadcast(chatId) {
    const idStr = String(chatId);
    const u = getUserData(idStr);
    const session = getOrCreateUserSession(idStr);

    if (session.broadcasting) {
        tgSend(chatId, '⚠️ Broadcast already running! Send /stop to cancel.');
        return;
    }

    const onlineAccounts = getOnlineUserAccounts(idStr);
    if (onlineAccounts.length === 0) {
        tgSend(chatId, '❌ No connected WhatsApp accounts! Click *📱 Add WA Account* to link at least 1 WhatsApp number.');
        return;
    }

    if (session.contacts.length === 0) {
        tgSend(chatId, '❌ No contacts loaded! Upload a `.csv` or `.txt` file first.');
        return;
    }

    if (!u.template) {
        tgSend(chatId, '❌ No message template set! Click *✍️ Set Template* to write one.');
        return;
    }

    if (u.credits <= 0) {
        tgSend(chatId, '💰 *Your Credits are EXHAUSTED (0)!* Please contact Admin to recharge credits.');
        return;
    }

    session.broadcasting = true;
    session.stopBroadcast = false;
    session.broadcastStats = { sent: 0, failed: 0, skipped: 0, total: session.contacts.length };

    const speed = SPEEDS[u.speed] || SPEEDS.SAFE;
    const contacts = [...session.contacts];

    let statusMsg = await tgBot.sendMessage(chatId,
        `🚀 *Broadcast Started!* 🚀\n\n` +
        `• Progress: \`0/${contacts.length}\`\n` +
        `• Active Accounts: \`${onlineAccounts.length}\` (${onlineAccounts.map(a => 'Acc ' + a.accId).join(', ')})\n` +
        `• ✅ Sent: \`0\`  ❌ Failed: \`0\`  ⏭️ Skipped: \`0\`\n` +
        `• Speed: *${u.speed}*\n` +
        `• Credits: \`${u.credits}\``,
        { parse_mode: 'Markdown' }
    ).catch(() => null);

    const updateStatus = async (finalText = null) => {
        if (!statusMsg) return;
        const activeCount = getOnlineUserAccounts(idStr).length;
        const text = finalText || (
            `🚀 *Broadcast Progress...* 🚀\n\n` +
            `• Progress: \`${session.broadcastStats.sent + session.broadcastStats.failed + session.broadcastStats.skipped}/${contacts.length}\`\n` +
            `• Active Accounts Online: \`${activeCount}\`\n` +
            `• ✅ Sent: \`${session.broadcastStats.sent}\`  ❌ Failed: \`${session.broadcastStats.failed}\`  ⏭️ Skipped: \`${session.broadcastStats.skipped}\`\n` +
            `• Speed: *${u.speed}*\n` +
            `• Remaining Credits: \`${u.credits}\``
        );
        try {
            await tgBot.editMessageText(text, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            });
        } catch (_) {}
    };

    let rotationIndex = 0;

    for (let i = 0; i < contacts.length; i++) {
        if (session.stopBroadcast) {
            await updateStatus(`🛑 *Broadcast stopped by user.*`);
            break;
        }

        if (u.credits <= 0) {
            await updateStatus(`🛑 *Credits EXHAUSTED (0)!* Broadcast halted. Contact Admin to recharge.`);
            break;
        }

        // Get currently online accounts dynamically
        const currentOnline = getOnlineUserAccounts(idStr);
        if (currentOnline.length === 0) {
            await updateStatus(`🛑 *All linked WhatsApp accounts disconnected or banned!* Broadcast halted.`);
            break;
        }

        // Select account via Round-Robin Rotation
        const currentAcc = currentOnline[rotationIndex % currentOnline.length];
        rotationIndex++;

        const contact = contacts[i];
        const phone   = contact.phone;
        const jid     = `${phone}@c.us`;
        const textMsg = fingerprint(applyTemplate(u.template, contact));

        try {
            const isReg = await currentAcc.client.isRegisteredUser(jid).catch(() => false);
            if (!isReg) {
                console.log(`[User ${idStr} - Acc ${currentAcc.accId} - SKIP] ${phone} not on WhatsApp`);
                session.broadcastStats.skipped++;
                await updateStatus();
                continue;
            }

            try {
                const ch = await currentAcc.client.getChatById(jid);
                if (ch) { await ch.sendStateTyping(); }
            } catch (_) {}

            await sleep(rand(1200, 2500));

            // Send Text via rotated account
            await currentAcc.client.sendMessage(jid, textMsg);

            // Send Attachment if set
            if (u.attachment && fs.existsSync(path.join(session.filesDir, u.attachment))) {
                await sleep(rand(1000, 2000));
                const mediaPath = path.join(session.filesDir, u.attachment);
                const media = MessageMedia.fromFilePath(mediaPath);
                await currentAcc.client.sendMessage(jid, media);
            }

            // Deduct 1 credit & update stats
            u.credits = Math.max(0, u.credits - 1);
            u.stats.sent++;
            session.broadcastStats.sent++;
            saveDatabase();
            console.log(`[User ${idStr} - Acc ${currentAcc.accId}] [${i+1}/${contacts.length}] ✅ Sent to ${phone}`);

        } catch (err) {
            console.error(`[User ${idStr} - Acc ${currentAcc.accId}] [${i+1}/${contacts.length}] ❌ Failed ${phone}:`, err.message);
            session.broadcastStats.failed++;
            u.stats.failed++;
            saveDatabase();
        }

        // Edit status card live
        await updateStatus();

        // Batch Break Pause
        if ((i + 1) % speed.batchSize === 0 && i < contacts.length - 1) {
            const breakMs = speed.batchBreak + rand(-15000, 15000);
            await updateStatus(
                `☕ *Batch Break (${speed.batchSize} msgs sent)* — Resting ${Math.round(breakMs/60000)} min for WhatsApp safety...\n\n` +
                `• ✅ Sent: \`${session.broadcastStats.sent}\`  ❌ Failed: \`${session.broadcastStats.failed}\`\n` +
                `• 💰 Remaining Credits: \`${u.credits}\``
            );
            await sleep(breakMs);
        } else if (i < contacts.length - 1) {
            await sleep(rand(speed.msgDelay[0], speed.msgDelay[1]));
        }
    }

    session.broadcasting = false;
    u.stats.totalBroadcasts++;
    saveDatabase();

    await updateStatus(
        `🎉 *Broadcast Completed!* 🎉\n\n` +
        `• Total Contacts: \`${contacts.length}\`\n` +
        `• ✅ Sent:    \`${session.broadcastStats.sent}\`\n` +
        `• ❌ Failed:  \`${session.broadcastStats.failed}\`\n` +
        `• ⏭️ Skipped: \`${session.broadcastStats.skipped}\`\n` +
        `• 💰 Credits Left: \`${u.credits}\``
    );
}

// ─── TELEGRAM CARD RENDERERS ─────────────────────────────────────────────────
function getBroadcasterCardText(tgId) {
    const idStr = String(tgId);
    const u = getUserData(idStr) || initUserData(idStr);
    const session = getOrCreateUserSession(idStr);
    const onlineAccs = getOnlineUserAccounts(idStr);

    let waDisplay = '🔴 NO ACCOUNTS CONNECTED';
    if (onlineAccs.length > 0) {
        waDisplay = `🟢 ${onlineAccs.length} Account(s) ONLINE (${onlineAccs.map(a => 'Acc ' + a.accId + ': +' + a.waNumber).join(' | ')})`;
    }

    const contactsCount = session.contacts.length;
    const templateStatus = u.template ? '✅ Set' : '❌ Not set';
    const attachStatus = (u.attachment && fs.existsSync(path.join(session.filesDir, u.attachment)))
        ? `✅ Set (\`${u.attachment}\`)`
        : '❌ Not set';

    const creditStatus = u.credits > 0 ? `💰 Your Credits: *${u.credits}*` : `💰 Your Credits: *0 (EXHAUSTED 🛑)*`;

    return `💎 *WP BROADCASTER PRO — Reseller Panel* 💎\n\n` +
        `WhatsApp Status: *${waDisplay}*\n` +
        `Broadcast Status: ${session.broadcasting ? '▶️ BROADCAST RUNNING' : '⏸️ IDLE'}\n\n` +
        `${creditStatus}\n\n` +
        `📊 *Campaign Setup:*\n` +
        `📂 Contacts Loaded: *${contactsCount} numbers*\n` +
        `✍️ Template Text: ${templateStatus}\n` +
        `📎 Media Attachment: ${attachStatus}\n` +
        `⚡ Speed Mode: *${u.speed}*\n\n` +
        `📈 *Total Stats:* Broadcasts: *${u.stats.totalBroadcasts}* | Sent: *${u.stats.sent}*`;
}

function getBroadcasterKeyboard(tgId) {
    const idStr = String(tgId);
    const session = getOrCreateUserSession(idStr);

    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📱 Add WA Account', callback_data: 'ac_add' },
                    { text: '📜 Accounts List', callback_data: 'ac_list' }
                ],
                [
                    { text: '📂 Upload Contacts (.csv/.txt)', callback_data: 'input_contacts' },
                    { text: '✍️ Set Template Text', callback_data: 'input_template' }
                ],
                [
                    { text: '📎 Attach Media/APK/Video', callback_data: 'input_attachment' },
                    { text: '⚡ Speed Mode', callback_data: 'menu_speed' }
                ],
                [
                    { text: session.broadcasting ? '🛑 STOP BROADCAST' : '🚀 START BROADCAST', callback_data: session.broadcasting ? 'bc_stop' : 'bc_start' },
                    { text: '🔄 Live Status / Refresh', callback_data: 'live_refresh' }
                ],
                [
                    { text: '💰 Check Credits', callback_data: 'cr_check' },
                    { text: '🔄 Reset Stats', callback_data: 'reset_stats' }
                ],
                [
                    { text: '🗑️ Clear Setup', callback_data: 'clear_setup' }
                ]
            ]
        }
    };
}

function getAccountsListKeyboard(tgId) {
    const idStr = String(tgId);
    const userSession = getOrCreateUserSession(idStr);
    const keyboard = [];

    for (const [accId, accState] of userSession.accounts.entries()) {
        const label = accState.ready ? `🟢 Acc ${accId} (+${accState.waNumber})` : `🔴 Acc ${accId} (OFFLINE)`;
        keyboard.push([
            { text: label, callback_data: `acc_info_${accId}` },
            { text: `🚪 Logout Acc ${accId}`, callback_data: `ac_logout_${accId}` }
        ]);
    }

    keyboard.push([{ text: '➕ Link New Account', callback_data: 'ac_add' }]);
    keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_main' }]);

    return { reply_markup: { inline_keyboard: keyboard } };
}

function getSpeedKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🐢 SAFE (~30s/msg | Batch 10, 2m break)', callback_data: 'set_speed_SAFE' }],
                [{ text: '🚶 MEDIUM (~15s/msg | Batch 20, 1m break)', callback_data: 'set_speed_MEDIUM' }],
                [{ text: '🏃 FAST (~7s/msg | Batch 40, 30s break)', callback_data: 'set_speed_FAST' }],
                [{ text: '🔙 Back to Menu', callback_data: 'back_main' }]
            ]
        }
    };
}

// ─── TELEGRAM EVENT LISTENERS ────────────────────────────────────────────────
tgBot.onText(/\/start|\/menu/, (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    initUserData(msg.chat.id);
    tgSend(msg.chat.id, getBroadcasterCardText(msg.chat.id), getBroadcasterKeyboard(msg.chat.id));
});

// Admin Command: /adduser <tgId>
tgBot.onText(/\/adduser\s+(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const newId = match[1].trim();
    initUserData(newId);
    tgSend(msg.chat.id, `✅ User \`${newId}\` has been authorized! They can now send /start to use the bot.`);
    tgSend(newId, `🎉 *You have been authorized by Admin!* Send /start to access your Broadcaster Panel.`);
});

// Admin Command: /addcredits <tgId> <amount>
tgBot.onText(/\/addcredits\s+(\d+)\s+(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const targetId = match[1].trim();
    const amount = parseInt(match[2], 10);
    const u = initUserData(targetId);
    u.credits += amount;
    saveDatabase();
    tgSend(msg.chat.id, `✅ Added *${amount} credits* to User \`${targetId}\`. Total: *${u.credits}*`);
    tgSend(targetId, `💰 *Admin recharged your account with ${amount} Credits!* Total: *${u.credits}*`);
});

// Admin Command: /setcredits <tgId> <amount>
tgBot.onText(/\/setcredits\s+(\d+)\s+(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const targetId = match[1].trim();
    const amount = parseInt(match[2], 10);
    const u = initUserData(targetId);
    u.credits = amount;
    saveDatabase();
    tgSend(msg.chat.id, `✅ Set User \`${targetId}\` credits to *${amount}*.`);
    tgSend(targetId, `💰 *Your Credits balance was updated to ${amount} by Admin.*`);
});

// Admin Command: /users
tgBot.onText(/\/users/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const userList = Object.entries(db.users).map(([id, u]) => {
        return `• User \`${id}\` (${u.role}): *${u.credits} credits* | Broadcasts: ${u.stats.totalBroadcasts} | Sent: ${u.stats.sent}`;
    }).join('\n');
    tgSend(msg.chat.id, `👥 *Authorized Broadcaster Users (${Object.keys(db.users).length}):*\n\n${userList}`);
});

// Stop Command
tgBot.onText(/\/stop/, (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const session = getOrCreateUserSession(msg.chat.id);
    if (session.broadcasting) {
        session.stopBroadcast = true;
        tgSend(msg.chat.id, '🛑 *Stopping broadcast...* Please wait for current message to finish.');
    } else {
        tgSend(msg.chat.id, '⚠️ No broadcast running.');
    }
});

// Callback Query Handler
tgBot.on('callback_query', async (cq) => {
    const data = cq.data || '';
    if (!isAuthorized(cq.from.id)) return;
    const chatId = cq.message.chat.id;
    const idStr  = String(chatId);
    const u      = getUserData(idStr);
    const session = getOrCreateUserSession(idStr);

    tgBot.answerCallbackQuery(cq.id).catch(() => {});

    if (data === 'back_main') {
        tgEditOrSend(chatId, cq.message.message_id, getBroadcasterCardText(chatId), getBroadcasterKeyboard(chatId));
    }
    else if (data === 'live_refresh') {
        const total = session.contacts.length;
        const sent = session.sentCount || 0;
        const failed = session.failCount || 0;
        const remaining = Math.max(0, total - (sent + failed));
        const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
        const filled = Math.floor(pct / 10);
        const bar = "▓".repeat(filled) + "░".repeat(10 - filled);

        const liveText = `🔄 *LIVE BROADCAST STATUS DASHBOARD* 🔄\n━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Status: ${session.broadcasting ? '▶️ *BROADCAST RUNNING*' : '⏸️ *IDLE / PAUSED*'}\n\n` +
            `📊 *Progress:* ${bar} *${pct}%*\n` +
            `✅ Delivered: *${sent}*\n` +
            `❌ Failed: *${failed}*\n` +
            `⏳ Remaining: *${remaining}/${total}*\n\n` +
            `⚡ Speed Preset: *${u.speed}*\n` +
            `💰 Credits Left: *${u.credits}*\n\n` +
            `_Updated live at ${new Date().toLocaleTimeString("en-IN")}_`;

        tgEditOrSend(chatId, cq.message.message_id, liveText, getBroadcasterKeyboard(chatId));
    }
    else if (data === 'ac_add') {
        sendQrOnDemand(chatId);
    }
    else if (data === 'ac_list') {
        const text = `📜 *Your Linked WhatsApp Accounts:*`;
        tgEditOrSend(chatId, cq.message.message_id, text, getAccountsListKeyboard(chatId));
    }
    else if (data.startsWith('ac_logout_')) {
        const accId = data.replace('ac_logout_', '');
        tgEditOrSend(chatId, cq.message.message_id, `🚪 *Logging out Account ${accId}...* Please wait.`);
        if (session.accounts.has(accId)) {
            const accState = session.accounts.get(accId);
            if (accState.client) {
                try { await accState.client.logout(); } catch (_) {}
                try { await accState.client.destroy(); } catch (_) {}
            }
            session.accounts.delete(accId);
        }
        const authDir = getUserAuthDir(idStr, accId);
        if (fs.existsSync(authDir)) {
            try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (_) {}
        }
        if (u.accounts && u.accounts[accId]) {
            delete u.accounts[accId];
            saveDatabase();
        }
        tgEditOrSend(chatId, cq.message.message_id, `✅ *Account ${accId} logged out & removed!*`, getAccountsListKeyboard(chatId));
    }
    else if (data === 'input_contacts') {
        session.sessionStep = 'await_file';
        tgEditOrSend(chatId, cq.message.message_id, `📂 *Upload your Contact List File now...*\n\nAccepts: \`.csv\`, \`.txt\`, \`.vcf\`, \`.html\`\n(Send file as document in chat)`);
    }
    else if (data === 'input_template') {
        session.sessionStep = 'await_template';
        tgEditOrSend(chatId, cq.message.message_id, `✍️ *Send your Message Template Text now...*\n\nYou can use placeholders like:\n\`Hello {Name}, your order for {Item} is ready!\`\n\n(Send text message in chat)`);
    }
    else if (data === 'input_attachment') {
        session.sessionStep = 'await_attachment';
        tgEditOrSend(chatId, cq.message.message_id, `📎 *Send your Media Attachment now...*\n\nAccepts: Photo, Video (.mp4), PDF, Document, or .APK file\n(Send as file/document in chat)`);
    }
    else if (data === 'menu_speed') {
        tgEditOrSend(chatId, cq.message.message_id, `⚡ *Choose Broadcast Speed Preset:*\n\n• *SAFE:* ~30s/msg (Batch size 10, 2m break)\n• *MEDIUM:* ~15s/msg (Batch size 20, 1m break)\n• *FAST:* ~7s/msg (Batch size 40, 30s break)`, getSpeedKeyboard());
    }
    else if (data.startsWith('set_speed_')) {
        const speedKey = data.replace('set_speed_', '');
        if (SPEEDS[speedKey]) {
            u.speed = speedKey;
            saveDatabase();
            tgEditOrSend(chatId, cq.message.message_id, `✅ *Speed Mode set to ${SPEEDS[speedKey].label}!*`, getBroadcasterKeyboard(chatId));
        }
    }
    else if (data === 'bc_start') {
        runUserBroadcast(chatId);
    }
    else if (data === 'bc_stop') {
        session.stopBroadcast = true;
        tgEditOrSend(chatId, cq.message.message_id, '🛑 *Stopping broadcast...*');
    }
    else if (data === 'cr_check') {
        tgEditOrSend(chatId, cq.message.message_id, `💰 *Your Credits Balance*: \`${u.credits}\`\n\n• 1 broadcast message sent = 1 credit deduct.\n• Contact Admin to top up credits!`, getBroadcasterKeyboard(chatId));
    }
    else if (data === 'reset_stats') {
        u.stats = { totalBroadcasts: 0, sent: 0, failed: 0 };
        saveDatabase();
        tgEditOrSend(chatId, cq.message.message_id, `🔄 *Broadcast statistics reset to 0!*`, getBroadcasterKeyboard(chatId));
    }
    else if (data === 'clear_setup') {
        session.contacts = [];
        session.columns = [];
        session.sessionStep = null;
        u.template = null;
        u.attachment = null;
        saveDatabase();
        tgEditOrSend(chatId, cq.message.message_id, `🗑️ *Broadcast setup cleared!*`, getBroadcasterKeyboard(chatId));
    }
});

// Text Message Handler (Template Input)
tgBot.on('message', (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    const idStr  = String(chatId);
    const u      = getUserData(idStr);
    const session = getOrCreateUserSession(idStr);

    if (session.sessionStep === 'await_template') {
        u.template = msg.text.trim();
        saveDatabase();
        session.sessionStep = null;
        tgSend(chatId, `✅ *Message Template saved!*\n\nTemplate:\n\`\`\`\n${u.template}\n\`\`\``, getBroadcasterKeyboard(chatId));
    }
});

function deleteOldAttachment(sessionDir, oldFname) {
    if (!oldFname) return;
    try {
        const oldPath = path.join(sessionDir, oldFname);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch (_) {}
}

// Document Upload Handler (CSV, TXT, APK, PDF, Video)
tgBot.on('document', async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const chatId = msg.chat.id;
    const idStr  = String(chatId);
    const u      = getUserData(idStr);
    const session = getOrCreateUserSession(idStr);
    const doc    = msg.document;
    const fname  = doc.file_name || 'file';
    const ext    = path.extname(fname).toLowerCase();

    const fetchBuffer = async () => {
        const link = await tgBot.getFileLink(doc.file_id);
        const res  = await axios.get(link, { responseType: 'arraybuffer' });
        return Buffer.from(res.data);
    };

    if (['.csv', '.txt', '.vcf', '.html', '.htm'].includes(ext) || session.sessionStep === 'await_file') {
        tgSend(chatId, `⏳ Processing Contact List File \`${fname}\`...`);
        try {
            const buf = await fetchBuffer();
            const parsed = parseContacts(buf, fname);
            if (parsed.length === 0) {
                tgSend(chatId, '❌ Could not extract valid phone numbers from file. Make sure file contains valid phone numbers!');
                return;
            }
            session.contacts = parsed;
            session.columns  = Object.keys(parsed[0]).filter(k => k !== 'phone');
            session.sessionStep = null;
            const colInfo = session.columns.length ? `\nAvailable columns for template: \`{${session.columns.join('}, {')}}\`` : '';
            tgSend(chatId, `✅ *${parsed.length} contacts loaded* from \`${fname}\`!${colInfo}`, getBroadcasterKeyboard(chatId));
        } catch (err) {
            tgSend(chatId, `❌ Failed to parse contact list: ${err.message}`);
        }
    }
    else {
        tgSend(chatId, `⏳ Saving Media Attachment \`${fname}\`...`);
        try {
            const buf = await fetchBuffer();
            if (u.attachment && u.attachment !== fname) {
                deleteOldAttachment(session.filesDir, u.attachment);
            }
            fs.writeFileSync(path.join(session.filesDir, fname), buf);
            u.attachment = fname;
            saveDatabase();
            session.sessionStep = null;
            tgSend(chatId, `✅ *Attachment \`${fname}\` saved successfully! (Old attachment removed)*`, getBroadcasterKeyboard(chatId));
        } catch (err) {
            tgSend(chatId, `❌ Failed to save attachment: ${err.message}`);
        }
    }
});

// Photo Attachment Handler
tgBot.on('photo', async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const chatId = msg.chat.id;
    const idStr  = String(chatId);
    const u      = getUserData(idStr);
    const session = getOrCreateUserSession(idStr);

    tgSend(chatId, `⏳ Saving Photo Attachment...`);
    try {
        const photoArr = msg.photo;
        const highestRes = photoArr[photoArr.length - 1];
        const link = await tgBot.getFileLink(highestRes.file_id);
        const res  = await axios.get(link, { responseType: 'arraybuffer' });
        if (u.attachment && u.attachment !== 'attachment.jpg') {
            deleteOldAttachment(session.filesDir, u.attachment);
        }
        fs.writeFileSync(path.join(session.filesDir, 'attachment.jpg'), Buffer.from(res.data));
        u.attachment = 'attachment.jpg';
        saveDatabase();
        session.sessionStep = null;
        tgSend(chatId, `✅ *Photo Attachment saved! (Old attachment removed)*`, getBroadcasterKeyboard(chatId));
    } catch (err) {
        tgSend(chatId, `❌ Failed to save photo attachment: ${err.message}`);
    }
});

// Video Attachment Handler
tgBot.on('video', async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const chatId = msg.chat.id;
    const idStr  = String(chatId);
    const u      = getUserData(idStr);
    const session = getOrCreateUserSession(idStr);

    tgSend(chatId, `⏳ Saving Video Attachment...`);
    try {
        const link = await tgBot.getFileLink(msg.video.file_id);
        const res  = await axios.get(link, { responseType: 'arraybuffer' });
        if (u.attachment && u.attachment !== 'attachment.mp4') {
            deleteOldAttachment(session.filesDir, u.attachment);
        }
        fs.writeFileSync(path.join(session.filesDir, 'attachment.mp4'), Buffer.from(res.data));
        u.attachment = 'attachment.mp4';
        saveDatabase();
        session.sessionStep = null;
        tgSend(chatId, `✅ *Video Attachment (.mp4) saved! (Old attachment removed)*`, getBroadcasterKeyboard(chatId));
    } catch (err) {
        tgSend(chatId, `❌ Failed to save video attachment: ${err.message}`);
    }
});

console.log('🚀 WP Broadcaster Pro v3.5 Adaptive Engine Loaded!');

function hasValidSessionData(tgId, accKey) {
    const sessionSecretPath = path.join(baseAuthDir, `user_${tgId}`, `acc_${accKey}`, 'Default');
    return fs.existsSync(sessionSecretPath);
}

// ─── AUTO-RECONNECT VERIFIED WHATSAPP ACCOUNTS ON STARTUP ────────────────────
(async () => {
    console.log('🔍 Checking for existing saved Broadcaster sessions to auto-connect...');
    const userIds = Object.keys(db.users);
    for (const tgId of userIds) {
        const u = db.users[tgId];
        if (u && u.accounts) {
            for (const accKey of Object.keys(u.accounts)) {
                const accInfo = u.accounts[accKey];
                if (accInfo && accInfo.waAuthenticated === true && hasValidSessionData(tgId, accKey)) {
                    console.log(`⚡ Auto-starting verified WhatsApp account ${accKey} for Telegram ID: ${tgId}`);
                    try {
                        startUserWhatsAppAccount(tgId, accKey);
                        await sleep(2000);
                    } catch (err) {
                        console.error(`⚠️ Failed to auto-start account ${accKey} for ${tgId}:`, err.message);
                    }
                }
            }
        }
    }
})();
