const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fileUpload = require('express-fileupload');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const os = require('os');
const { getExcelDataAsString } = require('./data');
const { generateAnswer } = require('./ai');

// Helper for human-like delay (e.g. 2 to 4 seconds)
const randomDelay = (minSec, maxSec) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000));

// ==========================================
// CONVERSATION MEMORY SYSTEM FOR CHAT ANALYSIS
// Stores last 20 messages per user for context analysis
// ==========================================
const conversationMemory = new Map();
const MAX_HISTORY = 20;

function getConversationHistory(userId) {
    return conversationMemory.get(userId) || [];
}

function addToConversationHistory(userId, role, content) {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, []);
    }
    const history = conversationMemory.get(userId);
    history.push({ role, content });
    if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
    }
}

// Clean up old conversations every 6 hours
setInterval(() => {
    for (const [key, value] of conversationMemory) {
        if (value.length === 0) {
            conversationMemory.delete(key);
        }
    }
    console.log(`[MEMORY] Cleanup done. Active conversations: ${conversationMemory.size}`);
}, 6 * 60 * 60 * 1000);

/**
 * Sends typing indicator and waits based on reply length & persona settings
 * Makes it look like a real person is typing on WhatsApp
 */
async function sendTypingIndicator(chat, replyText) {
    const persona = settings.botPersona || {};
    if (persona.typingEnabled === false) {
        return;
    }

    try {
        if (chat && typeof chat.sendStateTyping === 'function') {
            await chat.sendStateTyping();
        }
        
        // Calculate typing duration based on reply length & speed setting
        const charCount = replyText ? replyText.length : 40;
        let speedMultiplier = 1; // normal
        if (persona.typingSpeed === 'fast') speedMultiplier = 0.5;
        if (persona.typingSpeed === 'slow') speedMultiplier = 1.6;

        const baseSeconds = Math.max(1.5, Math.min(6, Math.ceil((charCount / 35) * speedMultiplier)));
        const variance = (Math.random() * 1.2) - 0.6;
        const typingSeconds = Math.max(1.2, baseSeconds + variance);
        
        console.log(`[TYPING] Showing typing status for ${typingSeconds.toFixed(1)}s...`);
        await new Promise(res => setTimeout(res, typingSeconds * 1000));
    } catch (err) {
        console.log('[TYPING] Could not send typing indicator:', err.message);
        await randomDelay(1, 3);
    }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const EXCEL_FILE = path.join(__dirname, 'data.xlsx');

let settings = { password: 'admin', aiEnabled: true, openAiApiKey: '', keywords: [], blockedNumbers: [], businessHours: {}, botPersona: {} };
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    } catch(e) {
        console.error('Error parsing settings.json:', e.message);
    }
}
if (!settings.blockedNumbers) settings.blockedNumbers = [];
if (!settings.openAiApiKey) {
    settings.openAiApiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.API_KEY || '';
}
if (process.env.ADMIN_PASSWORD) {
    settings.password = process.env.ADMIN_PASSWORD;
}
if (!settings.businessHours) {
    settings.businessHours = { enabled: false, start: '07:00', end: '21:00', offlineMessage: 'We are closed.' };
}
if (!settings.botPersona) {
    settings.botPersona = {
        ownerName: 'Burhanuddin',
        companyName: 'BW Web Studio',
        busyFallbackMsg: 'Abhi thode busy hai, main aapse jaldi baat karta hoon! 🙏',
        customSystemPrompt: '',
        typingEnabled: true,
        typingSpeed: 'normal'
    };
}
function saveSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Authentication Middleware for API
function auth(req, res, next) {
    if (req.headers.authorization !== settings.password) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// API Routes
app.post('/api/login', (req, res) => {
    console.log(`[LOGIN ATTEMPT] Received password check`);
    if (req.body.password === settings.password) res.json({ success: true });
    else res.json({ success: false });
});

app.get('/api/settings', auth, (req, res) => {
    res.json({ 
        aiEnabled: settings.aiEnabled, 
        openAiApiKey: settings.openAiApiKey,
        keywords: settings.keywords || [],
        blockedNumbers: settings.blockedNumbers || [],
        businessHours: settings.businessHours,
        botPersona: settings.botPersona
    });
});

app.post('/api/settings/persona', auth, (req, res) => {
    settings.botPersona = {
        ownerName: req.body.ownerName || 'Burhanuddin',
        companyName: req.body.companyName || 'BW Web Studio',
        busyFallbackMsg: req.body.busyFallbackMsg || 'Abhi busy hai, baad mein reply karenge!',
        customSystemPrompt: req.body.customSystemPrompt || '',
        typingEnabled: req.body.typingEnabled !== undefined ? req.body.typingEnabled : true,
        typingSpeed: req.body.typingSpeed || 'normal'
    };
    saveSettings();
    res.json({ success: true });
});

app.post('/api/settings/business-hours', auth, (req, res) => {
    settings.businessHours = req.body;
    saveSettings();
    res.json({ success: true });
});

app.post('/api/settings/ai', auth, (req, res) => {
    settings.aiEnabled = req.body.aiEnabled;
    saveSettings();
    res.json({ success: true });
});

app.post('/api/settings/password', auth, (req, res) => {
    settings.password = req.body.password;
    saveSettings();
    res.json({ success: true });
});

app.post('/api/settings/apikey', auth, (req, res) => {
    settings.openAiApiKey = req.body.apiKey;
    saveSettings();
    res.json({ success: true });
});

app.post('/api/settings/keywords', auth, (req, res) => {
    if (!settings.keywords) settings.keywords = [];
    settings.keywords.push({
        id: Date.now().toString(),
        topics: req.body.topics.toLowerCase(),
        reply: req.body.reply
    });
    saveSettings();
    res.json({ success: true });
});

app.delete('/api/settings/keywords/:id', auth, (req, res) => {
    if (settings.keywords) {
        settings.keywords = settings.keywords.filter(k => k.id !== req.params.id);
        saveSettings();
    }
    res.json({ success: true });
});

app.post('/api/settings/blocked', auth, (req, res) => {
    let num = req.body.number.replace(/\D/g, ''); 
    if (!settings.blockedNumbers.includes(num)) {
        settings.blockedNumbers.push(num);
        saveSettings();
    }
    res.json({ success: true });
});

app.delete('/api/settings/blocked/:num', auth, (req, res) => {
    settings.blockedNumbers = settings.blockedNumbers.filter(n => n !== req.params.num);
    saveSettings();
    res.json({ success: true });
});

// Request Pairing Code API
app.post('/api/request-pairing-code', auth, async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });
        
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        if (cleanNumber.length < 10) return res.status(400).json({ error: 'Invalid phone number format' });

        emitLog(`Generating Pairing Code for +${cleanNumber}...`, 'info');
        const code = await client.requestPairingCode(cleanNumber);
        emitLog(`Pairing Code generated: ${code}`, 'success');
        res.json({ success: true, code });
    } catch (err) {
        console.error('Error requesting pairing code:', err);
        emitLog(`Pairing Code error: ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// Manual Reset Session API
app.post('/api/reset-session', auth, async (req, res) => {
    try {
        emitLog('Resetting WhatsApp session and generating new QR...', 'warning');
        botStatus = 'RESTARTING...';
        io.emit('status', botStatus);
        
        await client.destroy();
        client.initialize();
        res.json({ success: true });
    } catch(err) {
        console.error('Error resetting session:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Excel Upload
app.post('/api/upload', auth, (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }
    let excelFile = req.files.excelFile;
    excelFile.mv(EXCEL_FILE, function(err) {
        if (err) return res.status(500).send(err);
        res.json({ success: true });
    });
});

let botStatus = 'INITIALIZING';
let lastQrData = null;

// Socket Auth
io.use((socket, next) => {
    if (socket.handshake.auth.token === settings.password) next();
    else next(new Error('Unauthorized'));
});

io.on('connection', (socket) => {
    socket.emit('status', botStatus);
    if (lastQrData && botStatus === 'WAITING FOR QR') {
        socket.emit('qr_image', lastQrData);
    }
});

function emitLog(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    io.emit('log', { msg, type });
}

function isWithinBusinessHours() {
    if (!settings.businessHours || !settings.businessHours.enabled) return true;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = (settings.businessHours.start || '00:00').split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    
    const [endH, endM] = (settings.businessHours.end || '23:59').split(':').map(Number);
    const endMinutes = endH * 60 + endM;
    
    if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
}

// WhatsApp Bot Logic & Puppeteer Config
let puppeteerOptions = { 
    headless: true,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-accelerated-2d-canvas', 
        '--no-first-run', 
        '--no-zygote', 
        '--single-process',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-features=IsolateOrigins,site-per-process,Translate,BackForwardCache,MediaRouter',
        '--disable-site-isolation-trials',
        '--disable-background-networking',
        '--disable-sync',
        '--mute-audio',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding'
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
};

// Smart Chromium Binary Detection (Supports Windows, Linux, Docker, Termux/Android)
function findChromiumPath() {
    const candidatePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN,
        '/data/data/com.termux/files/usr/bin/chromium',
        '/data/data/com.termux/files/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ];

    for (const p of candidatePaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

const detectedChrome = findChromiumPath();
if (detectedChrome) {
    puppeteerOptions.executablePath = detectedChrome;
    console.log(`[PUPPETEER] Using Chromium binary: ${detectedChrome}`);
} else if (os.platform() === 'android' || process.env.TERMUX_VERSION) {
    console.warn('\n==================================================');
    console.warn('⚠️  TERMUX CHROMIUM NOT FOUND!');
    console.warn('👉  Run in Termux: pkg install chromium -y');
    console.warn('==================================================\n');
}

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014587000-alpha.html'
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: puppeteerOptions
});

client.on('qr', async (qr) => {
    console.log('\n=========================================');
    console.log('📱 QR CODE GENERATED - SCAN ON WHATSAPP:');
    console.log('=========================================\n');
    
    // Print ASCII QR Code directly in Termux terminal console!
    try {
        qrcodeTerminal.generate(qr, { small: true });
    } catch (e) {
        console.log('[QR TERMINAL ERROR]', e.message);
    }

    try {
        const qrImage = await qrcode.toDataURL(qr);
        botStatus = 'WAITING FOR QR';
        lastQrData = qrImage;
        io.emit('qr_image', qrImage);
        io.emit('status', botStatus);
        emitLog('New QR Code generated. Scan terminal QR above or from Web Dashboard.', 'warning');
    } catch(err) {
        console.error('Error generating QR code image', err);
    }
});

client.on('loading_screen', (percent, message) => {
    if (botStatus === 'READY') return;
    botStatus = `SYNCING (${percent}%)`;
    emitLog(`WhatsApp Loading: ${percent}% - ${message}`, 'info');
    io.emit('status', botStatus);
});

client.on('authenticated', () => {
    if (botStatus === 'READY') return;
    botStatus = 'AUTHENTICATING';
    emitLog('WhatsApp Authenticated! Syncing messages...', 'info');
    io.emit('status', 'SYNCING...');
});

client.on('auth_failure', msg => {
    emitLog('Authentication failure: ' + msg, 'error');
    botStatus = 'AUTH FAILURE';
    io.emit('status', botStatus);
});

client.on('disconnected', async (reason) => {
    emitLog('WhatsApp Disconnected: ' + reason + '. Reconnecting in 5 seconds...', 'error');
    botStatus = 'RECONNECTING...';
    io.emit('status', botStatus);
    try {
        await client.destroy();
    } catch (e) {
        console.log('[DEBUG] Error destroying client on disconnect:', e.message);
    }
    setTimeout(() => {
        client.initialize().catch(err => console.error('[RECONNECT ERROR]', err));
    }, 5000);
});

client.on('ready', () => {
    botStatus = 'READY';
    lastQrData = null;
    emitLog('WhatsApp Client is READY and ACTIVE!', 'success');
    console.log('\n=========================================');
    console.log('✅ WHATSAPP BOT IS LIVE AND LISTENING FOR ALL MESSAGES!');
    console.log('=========================================\n');
    io.emit('status', botStatus);
    io.emit('qr_image', null);
});

// ==========================================
// INCOMING MESSAGE HANDLER ENGINE
// Deduplicates messages & handles audio/image/text
// ==========================================
const processedMessageIds = new Set();
setInterval(() => {
    if (processedMessageIds.size > 1000) {
        processedMessageIds.clear();
    }
}, 30 * 60 * 1000);

async function handleIncomingMessage(message) {
    if (!message) return;
    
    // Extract message ID safely (handles string IDs or object IDs)
    const msgId = typeof message.id === 'string' 
        ? message.id 
        : (message.id && (message.id._serialized || message.id.id)) || (message.from + '_' + (message.timestamp || Date.now()));

    if (!msgId) return;
    if (processedMessageIds.has(msgId)) return;
    processedMessageIds.add(msgId);

    // Ignore messages sent by the bot itself
    if (message.fromMe) return;

    // Skip group messages, status updates, and broadcast lists
    if (message.isGroupMsg || message.isStatus || message.from === 'status@broadcast' || message.from.includes('@g.us')) {
        return;
    }

    const rawSender = message.from.split('@')[0];
    const senderNumber = rawSender.split(':')[0];

    if (settings.blockedNumbers.includes(senderNumber)) {
        emitLog(`Blocked number ${senderNumber} sent a message. Ignored.`, 'warning');
        return;
    }

    // Get chat & send seen status (Blue tick simulation)
    let chat;
    try {
        chat = await message.getChat();
        if (chat && typeof chat.sendSeen === 'function') {
            await chat.sendSeen();
        }
    } catch(e) {
        console.log('[DEBUG] Could not get chat object or sendSeen:', e.message);
    }

    // Handle non-chat media types gracefully
    if (message.type === 'audio' || message.type === 'ptt') {
        const voiceReply = "Bhai voice note / audio abhi sun nahi pa raha hoon, please text mein likh ke bata do na! 🙏";
        emitLog(`Voice note from ${senderNumber}`, 'msg-in');
        if (chat) await sendTypingIndicator(chat, voiceReply);
        await message.reply(voiceReply);
        emitLog(`Replied to voice note from ${senderNumber}`, 'msg-out');
        return;
    }

    if (message.type === 'image') {
        const imageReply = "Bhai photo mili! Lekin text mein bata do kya detail chahiye 👍";
        emitLog(`Image from ${senderNumber}`, 'msg-in');
        if (chat) await sendTypingIndicator(chat, imageReply);
        await message.reply(imageReply);
        emitLog(`Replied to image from ${senderNumber}`, 'msg-out');
        return;
    }

    if (message.type === 'document') {
        const docReply = "Bhai file receive ho gayi hai! Text mein requirement share kar do please 👍";
        emitLog(`Document from ${senderNumber}`, 'msg-in');
        if (chat) await sendTypingIndicator(chat, docReply);
        await message.reply(docReply);
        emitLog(`Replied to document from ${senderNumber}`, 'msg-out');
        return;
    }

    if (message.type === 'sticker') {
        const stickerReply = "Haha mast sticker hai bhai! 😄 Batao kaise help karoon?";
        emitLog(`Sticker from ${senderNumber}`, 'msg-in');
        if (chat) await sendTypingIndicator(chat, stickerReply);
        await message.reply(stickerReply);
        return;
    }

    // Skip non-chat types or empty messages
    if (message.type !== 'chat' || !message.body || message.body.trim() === '') {
        return;
    }

    console.log(`\n--------------------------------------------------`);
    console.log(`📩 [INCOMING MSG] From: ${senderNumber} | Text: "${message.body}"`);
    console.log(`--------------------------------------------------`);
    emitLog(`From ${senderNumber}: ${message.body}`, 'msg-in');

    if (!isWithinBusinessHours()) {
        emitLog(`Outside business hours. Sending offline message.`, 'warning');
        const offlineMsg = settings.businessHours.offlineMessage || 'We are offline.';
        if (chat) await sendTypingIndicator(chat, offlineMsg);
        await message.reply(offlineMsg);
        return;
    }

    // Keyword Match Check
    const text = message.body.toLowerCase();
    let staticReply = null;
    for (let kw of (settings.keywords || [])) {
        if (!kw.topics) continue;
        const topics = kw.topics.split(',').map(t => t.trim());
        if (topics.some(topic => topic && text.includes(topic))) {
            staticReply = kw.reply;
            break;
        }
    }

    if (staticReply) {
        emitLog(`Keyword Matched. Sending static reply.`, 'info');
        if (chat) await sendTypingIndicator(chat, staticReply);
        await message.reply(staticReply);
        emitLog(`Reply sent: ${staticReply}`, 'msg-out');
        return;
    }

    // AI Generation with Chat Analysis
    if (settings.aiEnabled) {
        emitLog('🧠 Brain is analyzing chat history & context...', 'warning');
        
        // Pass a clean clone of past conversation history for chat analysis
        const pastHistory = [...getConversationHistory(senderNumber)];
        
        const contextData = getExcelDataAsString(EXCEL_FILE);
        const reply = await generateAnswer(message.body, contextData, settings.openAiApiKey, pastHistory, settings.botPersona);
        
        // Save current user query & AI reply to conversation history
        addToConversationHistory(senderNumber, 'user', message.body);
        addToConversationHistory(senderNumber, 'assistant', reply);
        
        emitLog(`✍️ Typing simulation...`, 'info');
        if (chat) {
            await sendTypingIndicator(chat, reply);
        } else {
            await randomDelay(2, 4);
        }
        
        try {
            await message.reply(reply);
            console.log(`✅ [AI REPLY SENT] To: ${senderNumber} | Text: "${reply}"`);
            emitLog(`🤖 AI Reply sent: ${reply}`, 'msg-out');
        } catch(e) {
            console.error('❌ [REPLY ERROR]', e.message);
        }
    } else {
        emitLog('No keyword match and AI is disabled. Ignored.', 'info');
    }
}

// Bind incoming message events (both message_create and message for high reliability)
client.on('message_create', handleIncomingMessage);
client.on('message', handleIncomingMessage);

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

client.initialize();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
    console.log(`=========================================\n`);
});
