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

    return `Tu ${companyName} (Owner: ${ownerName}) ka official smart AI Assistant hai.

## 🤖 IDENTITY RULES (MANDATORY):
1. Tera role: Tu ${companyName} ka intelligent AI Assistant hai.
2. Jab bhi baat kare ya greet kare, hamesha bata ki "Main ${companyName} ka AI Assistant aap se baat kar raha hoon."
3. User ko kabhi confuse mat kar. Respectful, polite, aur helpful tone mein baat kar.

## 🧠 SAMAJH KAR REPLY KARNA (NO DIRECT COPY-PASTING):
- **DO NOT COPY-PASTE RAW DATA**: DATA CONTEXT ya raw text ko waisa ka waisa direct copy-paste bilkul MAT kar.
- User ke question aur DATA CONTEXT ko pehle DHYAN SE SAMAJH (understand).
- Information ko summarize karke natural, clear, readable sentences mein samjha.
- Agar user ne greeting ki hai, to warm greeting aur introduction de. Agar koi specific service/price/detail pucha hai, to context samajh kar exact aur clear jawab de.
- Agar jankari DATA CONTEXT mein nahi hai, to bol: "Main ye detail check karke ${ownerName} sir / team se confirm karke aapko batata hoon 👍"

## 📜 CHAT ANALYSIS & DEEP MEMORY:
- Pehle ke poore conversation history ko dhyan se ANALYZE kar.
- Customer ke naam, business details, requirements, budget aur purane sawaalon ko yaad rakh kar contextually logical conversation aage badha.

## 📱 WHATSAPP CONVERSATIONAL STYLE:
- **Language**: User jis language (Hinglish / Hindi / English) mein baat kare, usi style mein jawab de.
- **Format**: Neat, short (2-4 lines), clear WhatsApp messages.
- **Emojis**: 1-2 natural emojis use kar (lekin over-use mat kar).`;
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

    // Add conversation history (up to last 20 messages for deep chat analysis)
    if (conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-20);
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
    const busyFallback = persona.busyFallbackMsg || `Abhi thode busy hai, main aapse jaldi baat karta hoon! 🙏`;

    if (!apiKey) {
        console.error("❌ [AI ERROR] No API Key provided in settings!");
        return busyFallback;
    }

    let baseURL = undefined;
    let modelName = "gpt-4o-mini"; 
    let defaultHeaders = undefined;

    // Auto-detect Provider based on API Key prefix
    if (apiKey.startsWith("AIza") || apiKey.startsWith("AQ.")) {
        baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
        modelName = "gemini-1.5-flash";
        console.log("[AI] 🔹 Detected Google Gemini API Key");
    } else if (apiKey.startsWith("sk-or-v1-")) {
        baseURL = "https://openrouter.ai/api/v1";
        modelName = "meta-llama/llama-3-8b-instruct:free";
        defaultHeaders = { "HTTP-Referer": "http://localhost:3000", "X-Title": "WhatsApp Bot" };
        console.log("[AI] 🔹 Detected OpenRouter API Key");
    } else if (apiKey.startsWith("gsk_")) {
        baseURL = "https://api.groq.com/openai/v1";
        modelName = "llama-3.1-8b-instant";
        console.log("[AI] 🔹 Detected Groq API Key");
    } else if (apiKey.startsWith("sk-")) {
        baseURL = undefined; // Uses default OpenAI url
        modelName = "gpt-4o-mini";
        console.log("[AI] 🔹 Detected OpenAI API Key");
    } else {
        baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
        modelName = "gemini-1.5-flash";
        console.log("[AI] 🔹 Unknown API Key format, trying Gemini endpoint...");
    }

    try {
        const openai = new OpenAI({ 
            apiKey: apiKey,
            baseURL: baseURL,
            defaultHeaders: defaultHeaders
        });

        const messages = buildMessages(userMessage, contextData, conversationHistory, persona);

        console.log(`[AI] 🧠 Analyzing chat history (${conversationHistory.length} msgs) & generating answer via ${modelName}...`);

        const response = await openai.chat.completions.create({
            model: modelName,
            messages: messages,
            temperature: 0.7,
            max_tokens: 350
        });

        const reply = response.choices[0].message.content.trim();
        console.log(`[AI] ✅ Reply generated: "${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}"`);
        return reply;
    } catch (error) {
        console.error("=== AI ERROR DETAILS ===");
        console.error("Error Message:", error.message);
        if (error.status) console.error("Error Status:", error.status);
        if (error.code) console.error("Error Code:", error.code);
        console.error("========================");
        return busyFallback;
    }
}

module.exports = { generateAnswer, getSystemPrompt };
