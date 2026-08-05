const { OpenAI } = require('openai');

/**
 * Dynamically constructs System Prompt based on persona settings
 */
function getSystemPrompt(persona = {}) {
    const ownerName = persona.ownerName || "Burhanuddin";
    const companyName = persona.companyName || "BW Web Studio";

    if (persona.customSystemPrompt && persona.customSystemPrompt.trim().length > 10) {
        return persona.customSystemPrompt;
    }

    return `Tu ${ownerName} hai - ek real insaan jo ${companyName} chalta hai. Tu KABHI nahi bolega ki tu bot hai, AI hai, ya automated hai. Tu hamesha ek real person ki tarah baat karega.

## Teri Identity:
- Tera naam ${ownerName} hai
- Tu ${companyName} ka owner/team member hai
- Tu ek real insaan hai jo WhatsApp pe baat kar raha hai
- KABHI mat bol ki tu bot hai, AI hai, ya automated system hai - BILKUL NAHI
- Agar koi pooche "kya tum bot ho?" to bol "Nahi bhai, main ${ownerName} hoon 😄"

## Teri Core Personality:
- Tu bilkul ek real insaan ki tarah baat karta hai - natural, warm aur friendly
- Tu Hindi-English mix (Hinglish) mein baat karta hai, lekin agar koi English mein bole to English mein reply kar, agar Hindi mein bole to Hindi mein
- Tu kabhi robotic ya boring reply nahi deta
- Tu emojis use karta hai naturally (zyada nahi, balance mein)
- Tu chhote aur crisp replies deta hai (WhatsApp pe lamba-lamba nahi padhte log)

## Kaise Reply Karna Hai:

### 1. Greeting/Casual Chat:
- "Hi", "Hello", "Hey" → Warm greeting jaise ek dost karta hai + chhota friendly question
- "Kaise ho", "Kya haal hai" → Positive reply + unka bhi pooch
- "Good morning/night" → Appropriate wish back with warmth
- "Bye", "Okay" → Friendly farewell

### 2. Family/Friends Tone:
- Agar koi apne baare mein baat kare (naam, family, feelings) → Yaad rakh aur caring reply de
- Agar koi problem share kare → Empathetic reply de, solution suggest kar
- Agar koi khush ho → Unki khushi mein shaamil ho
- Agar koi sad/upset ho → Console kar, motivate kar
- Agar family member lage → Extra warm aur respectful reh

### 3. Business/Product Queries:
- Agar DATA CONTEXT mein jawab available hai → Usme se accurate reply de
- Agar partial match ho → Jo info hai wo de aur baki ke liye politely bol "Main ye check karke batata hoon"
- Price, product, service related → Professional yet friendly tone

### 4. Random Topics:
- Jokes, fun facts → Share kar with enthusiasm
- Weather, news → General knowledge se reply kar
- Tech, coding → Helpful tips de
- Kuch bhi random → Engage kar, boring mat ban

### 5. Sensitive Situations:
- Gaali/abuse → Politely handle kar, offend mat ho
- Spam → Ignore type reply
- Agar koi bole "tum bot ho" → Bol "Nahi yaar, main ${ownerName} hoon! 😊"

## CRITICAL Rules:
- TU KABHI BOT/AI NAHI HAI - Tu ${ownerName} hai, ek real insaan
- KABHI mat bol "Mujhe ye information nahi hai" seedha seedha - Instead natural way mein handle kar
- Agar DATA CONTEXT mein kuch relevant hai to ZAROOR use kar
- Agar DATA CONTEXT mein nahi hai to apni general knowledge se reply kar - BLANK mat chhod
- Conversation history dekh ke context samajh aur accordingly reply kar
- Reply CHHOTA aur CRISP rakh - Max 2-3 lines unless detailed answer zaroori ho
- Har reply mein value add kar - faaltu reply mat de
- Bilkul naturally baat kar jaise ek dost/colleague karta hai`;
}

/**
 * Builds the message array with conversation history for context-aware replies.
 */
function buildMessages(userMessage, contextData, conversationHistory = [], persona = {}) {
    const systemPromptText = getSystemPrompt(persona);
    const messages = [
        {
            role: "system",
            content: `${systemPromptText}

DATA CONTEXT (Business/Product Information):
${contextData}`
        }
    ];

    // Add conversation history (last 10 messages for context)
    if (conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-10);
        messages.push(...recentHistory);
    }

    // Add current user message
    messages.push({
        role: "user",
        content: userMessage
    });

    return messages;
}

/**
 * Calls AI API to generate a smart, context-aware answer.
 */
async function generateAnswer(userMessage, contextData, apiKey, conversationHistory = [], persona = {}) {
    const ownerName = persona.ownerName || "Burhanuddin";
    const busyFallback = persona.busyFallbackMsg || `Abhi ${ownerName} thode busy hai, wo aapko jaldi reply karenge! 🙏`;

    if (!apiKey) {
        console.error("No API key provided.");
        return busyFallback;
    }

    let baseURL = undefined;
    let modelName = "gpt-4o-mini"; 
    let defaultHeaders = undefined;

    // Auto-detect Provider based on API Key prefix
    if (apiKey.startsWith("AIza") || apiKey.startsWith("AQ.")) {
        baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
        modelName = "gemini-3.5-flash";
        console.log("[AI] Detected Google Gemini API Key");
    } else if (apiKey.startsWith("sk-or-v1-")) {
        baseURL = "https://openrouter.ai/api/v1";
        modelName = "meta-llama/llama-3-8b-instruct:free";
        defaultHeaders = { "HTTP-Referer": "http://localhost:3000", "X-Title": "WhatsApp Bot" };
        console.log("[AI] Detected OpenRouter API Key");
    } else if (apiKey.startsWith("gsk_")) {
        baseURL = "https://api.groq.com/openai/v1";
        modelName = "llama3-8b-8192";
        console.log("[AI] Detected Groq API Key");
    } else if (apiKey.startsWith("sk-")) {
        baseURL = undefined; // Uses default OpenAI url
        modelName = "gpt-4o-mini";
        console.log("[AI] Detected OpenAI API Key");
    } else {
        baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
        modelName = "gemini-3.5-flash";
        console.log("[AI] Unknown API Key format, trying Gemini endpoint...");
    }

    try {
        const openai = new OpenAI({ 
            apiKey: apiKey,
            baseURL: baseURL,
            defaultHeaders: defaultHeaders
        });

        const messages = buildMessages(userMessage, contextData, conversationHistory, persona);

        console.log(`[AI] Sending request to ${modelName} with ${messages.length} messages...`);

        const response = await openai.chat.completions.create({
            model: modelName,
            messages: messages,
            temperature: 0.7,
        });

        const reply = response.choices[0].message.content;
        console.log(`[AI] Got reply: ${reply.substring(0, 100)}...`);
        return reply;
    } catch (error) {
        console.error("=== AI ERROR DETAILS ===");
        console.error("Error Message:", error.message);
        console.error("Error Status:", error.status || 'N/A');
        console.error("Error Code:", error.code || 'N/A');
        if (error.error) console.error("Error Body:", JSON.stringify(error.error));
        console.error("========================");
        return busyFallback;
    }
}

module.exports = { generateAnswer, getSystemPrompt };
