const socket = io({ autoConnect: false });
let token = '';

function login() {
    const pwd = document.getElementById('password').value;
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            token = pwd; 
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.getElementById('dashboard-section').classList.add('flex');
            
            socket.auth = { token };
            socket.connect();
            
            fetchSettings();
        } else {
            document.getElementById('login-error').classList.remove('hidden');
        }
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById(`btn-${tabId}`).classList.add('active');
}

function fetchSettings() {
    fetch('/api/settings', { headers: { 'Authorization': token } })
    .then(res => res.json())
    .then(data => {
        document.getElementById('ai-toggle').checked = data.aiEnabled;
        if(data.openAiApiKey) {
            document.getElementById('api-key').value = data.openAiApiKey;
        }
        if(data.businessHours) {
            document.getElementById('bh-toggle').checked = data.businessHours.enabled;
            document.getElementById('bh-start').value = data.businessHours.start;
            document.getElementById('bh-end').value = data.businessHours.end;
            document.getElementById('bh-msg').value = data.businessHours.offlineMessage;
        }
        if(data.botPersona) {
            document.getElementById('persona-owner-name').value = data.botPersona.ownerName || 'Burhanuddin';
            document.getElementById('persona-company-name').value = data.botPersona.companyName || 'BW Web Studio';
            document.getElementById('persona-busy-msg').value = data.botPersona.busyFallbackMsg || 'Abhi busy hai, baad mein reply karenge!';
            document.getElementById('persona-typing-toggle').checked = data.botPersona.typingEnabled !== false;
            document.getElementById('persona-typing-speed').value = data.botPersona.typingSpeed || 'normal';
            document.getElementById('persona-system-prompt').value = data.botPersona.customSystemPrompt || '';
        }
        renderKeywords(data.keywords);
        renderBlocked(data.blockedNumbers || []);
    });
}

// Bot Persona & Customization
function savePersonaSettings() {
    const ownerName = document.getElementById('persona-owner-name').value;
    const companyName = document.getElementById('persona-company-name').value;
    const busyFallbackMsg = document.getElementById('persona-busy-msg').value;
    const typingEnabled = document.getElementById('persona-typing-toggle').checked;
    const typingSpeed = document.getElementById('persona-typing-speed').value;
    const customSystemPrompt = document.getElementById('persona-system-prompt').value;

    fetch('/api/settings/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({
            ownerName,
            companyName,
            busyFallbackMsg,
            typingEnabled,
            typingSpeed,
            customSystemPrompt
        })
    }).then(res => res.json())
    .then(data => {
        if(data.success) {
            const el = document.getElementById('persona-success');
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 3000);
        }
    });
}

function applyPromptPreset(presetType) {
    const ownerName = document.getElementById('persona-owner-name').value || 'Burhanuddin';
    const companyName = document.getElementById('persona-company-name').value || 'BW Web Studio';
    const promptArea = document.getElementById('persona-system-prompt');

    if (presetType === 'human') {
        promptArea.value = ''; // Empty defaults to internal natural human prompt
        alert("Reset to Natural Human Persona! (Owner name & company will be dynamically inserted)");
    } else if (presetType === 'sales') {
        promptArea.value = `You are a high-performing sales executive representing ${companyName}.
Your name is ${ownerName}.
Your goal is to politely answer customer inquiries, highlight our key services/products from the data context, and encourage them to book a consultation or purchase.
Keep replies engaging, persuasive, concise, and professional. Use Hinglish or English naturally.`;
    } else if (presetType === 'support') {
        promptArea.value = `You are a patient customer support representative at ${companyName}.
Your name is ${ownerName}.
Answer customer questions accurately using the provided DATA CONTEXT. Be extremely polite, helpful, empathetic, and clear.
If a issue cannot be solved immediately, offer to escalation to technical support.`;
    }
}

// AI Settings
function toggleAI() {
    const isEnabled = document.getElementById('ai-toggle').checked;
    fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ aiEnabled: isEnabled })
    });
}

function changePassword() {
    const newPwd = document.getElementById('new-password').value;
    if(!newPwd) return alert("Please enter a new password");
    fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ password: newPwd })
    }).then(() => {
        document.getElementById('pwd-success').classList.remove('hidden');
        token = newPwd; // update token internally
        setTimeout(() => document.getElementById('pwd-success').classList.add('hidden'), 3000);
    });
}

function saveApiKey() {
    const key = document.getElementById('api-key').value;
    fetch('/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ apiKey: key })
    }).then(() => {
        document.getElementById('api-key-success').classList.remove('hidden');
        setTimeout(() => document.getElementById('api-key-success').classList.add('hidden'), 3000);
    });
}

// Business Hours
function saveBusinessHours() {
    const enabled = document.getElementById('bh-toggle').checked;
    const start = document.getElementById('bh-start').value;
    const end = document.getElementById('bh-end').value;
    const msg = document.getElementById('bh-msg').value;

    fetch('/api/settings/business-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ enabled, start, end, offlineMessage: msg })
    }).then(() => {
        document.getElementById('bh-success').classList.remove('hidden');
        setTimeout(() => document.getElementById('bh-success').classList.add('hidden'), 2000);
    });
}

// File Upload
function uploadExcel() {
    const fileInput = document.getElementById('excel-file');
    if(fileInput.files.length === 0) return alert("Select a file first!");
    
    const formData = new FormData();
    formData.append('excelFile', fileInput.files[0]);

    fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': token },
        body: formData
    }).then(res => res.json())
    .then(data => {
        if(data.success) {
            document.getElementById('upload-success').classList.remove('hidden');
            fileInput.value = ''; // clear
            setTimeout(() => document.getElementById('upload-success').classList.add('hidden'), 3000);
        }
    });
}

// Keywords
function renderKeywords(keywords) {
    const container = document.getElementById('keywords-list');
    container.innerHTML = '';
    keywords.forEach(kw => {
        container.innerHTML += `
            <div class="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-start">
                <div>
                    <div class="text-xs text-blue-400 font-bold mb-1">Triggers: ${kw.topics}</div>
                    <div class="text-sm whitespace-pre-wrap">${kw.reply}</div>
                </div>
                <button onclick="deleteKeyword('${kw.id}')" class="text-red-400 hover:text-red-300 ml-2"><i class="fas fa-trash"></i></button>
            </div>
        `;
    });
}

function addKeyword() {
    const topics = document.getElementById('new-topics').value;
    const reply = document.getElementById('new-reply').value;
    if(!topics || !reply) return alert("Fill both fields");

    fetch('/api/settings/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ topics, reply })
    }).then(() => {
        document.getElementById('new-topics').value = '';
        document.getElementById('new-reply').value = '';
        fetchSettings();
    });
}

function deleteKeyword(id) {
    fetch(`/api/settings/keywords/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
    }).then(() => fetchSettings());
}

// Blocked Numbers
function renderBlocked(numbers) {
    const container = document.getElementById('blocked-list');
    container.innerHTML = '';
    numbers.forEach(num => {
        container.innerHTML += `
            <span class="px-3 py-1 bg-red-900/50 text-red-200 rounded-full text-sm flex items-center gap-2 border border-red-700">
                ${num}
                <button onclick="removeBlocked('${num}')" class="hover:text-white"><i class="fas fa-times"></i></button>
            </span>
        `;
    });
}

function addBlocked() {
    const number = document.getElementById('new-blocked').value;
    if (!number) return;
    fetch('/api/settings/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ number })
    }).then(() => {
        document.getElementById('new-blocked').value = '';
        fetchSettings();
    });
}
function removeBlocked(number) {
    fetch(`/api/settings/blocked/${number}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
    }).then(() => fetchSettings());
}

// Reset WhatsApp Session & Regenerate QR
function resetSession() {
    if (!confirm('Do you want to regenerate QR / reset session?')) return;
    fetch('/api/reset-session', {
        method: 'POST',
        headers: { 'Authorization': token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Resetting session... Please wait a few seconds for new QR.');
        }
    });
}

// Request WhatsApp Pairing Code (OTP)
function requestPairingCode() {
    const numInput = document.getElementById('phone-number-input').value.trim();
    if (!numInput) return alert('Please enter a phone number with country code (e.g. 919876543210)');

    const display = document.getElementById('pairing-code-display');
    const codeText = document.getElementById('pairing-code-text');

    codeText.innerText = 'Generating...';
    display.classList.remove('hidden');

    fetch('/api/request-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ phoneNumber: numInput })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && data.code) {
            // Format code nicely (e.g. ABCD-EFGH)
            const raw = data.code;
            codeText.innerText = raw.length === 8 ? `${raw.slice(0,4)}-${raw.slice(4)}` : raw;
        } else {
            alert('Error generating pairing code: ' + (data.error || 'Please try again after QR code loads'));
            display.classList.add('hidden');
        }
    })
    .catch(err => {
        alert('Could not fetch pairing code: ' + err.message);
        display.classList.add('hidden');
    });
}

// Logs
function addLog(msg, type = 'info') {
    const logs = document.getElementById('logs');
    const colors = {
        'info': 'text-blue-300',
        'success': 'text-emerald-400',
        'warning': 'text-yellow-400',
        'error': 'text-red-400',
        'msg-in': 'text-white bg-slate-800 p-2 rounded',
        'msg-out': 'text-emerald-100 bg-emerald-900/50 p-2 rounded border border-emerald-800'
    };
    const time = new Date().toLocaleTimeString();
    logs.innerHTML += `<div class="${colors[type]}">[${time}] ${msg}</div>`;
    logs.scrollTop = logs.scrollHeight;
}
function clearLogs() {
    document.getElementById('logs').innerHTML = '';
}

// Socket Events
socket.on('log', data => addLog(data.msg, data.type));

socket.on('status', status => {
    const el = document.getElementById('bot-status');
    const mobEl = document.getElementById('bot-status-mobile');
    if (el) el.innerText = status;
    if (mobEl) mobEl.innerText = status;

    if(status === 'READY') {
        if (el) el.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full font-bold border border-emerald-500/50 block text-center';
        document.getElementById('qr-container').classList.add('hidden');
        document.getElementById('qr-success').classList.remove('hidden');
    }
});

socket.on('qr_image', dataUrl => {
    if(dataUrl) {
        document.getElementById('qr-container').innerHTML = `<img src="${dataUrl}" class="w-full h-full object-contain rounded">`;
        document.getElementById('qr-container').classList.remove('hidden');
        document.getElementById('qr-success').classList.add('hidden');
    }
});
