import { Handler } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize the real Gemini SDK inside the secure backend
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Basic in-memory rate limiting map for basic protection
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per IP per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const userRecord = rateLimitMap.get(ip);

  if (!userRecord) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return false;
  }

  if (now - userRecord.lastReset > RATE_LIMIT_WINDOW_MS) {
    userRecord.count = 1;
    userRecord.lastReset = now;
    return false;
  }

  userRecord.count += 1;
  return userRecord.count > MAX_REQUESTS_PER_WINDOW;
}

export const handler: Handler = async (event, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Preflight support
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method Not Allowed - Only POST is supported" }),
    };
  }

  const clientIp = event.headers["client-ip"] || event.headers["x-forwarded-for"] || "unknown-ip";
  if (isRateLimited(clientIp)) {
    console.warn(`Rate limit triggered for IP: ${clientIp}`);
    return {
      statusCode: 429,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Too many AI requests. Please wait a minute and try again." }),
    };
  }

  if (!ai) {
    console.error("Critical: GEMINI_API_KEY is not defined in backend environment.");
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Gemini API key is not configured on the portal." }),
    };
  }

  try {
    const rawBody = event.body || "{}";
    const body = JSON.parse(rawBody);
    const { type, model, contents, config, history, message, systemInstruction, audio, mimeType } = body;

    if (!type || !model) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing required properties: 'type' and 'model'" }),
      };
    }

    // Map gemini-3-flash-preview or legacy models to valid active models
    let targetModel = model || "gemini-3.5-flash";
    if (targetModel === "gemini-3-flash-preview" || targetModel === "gemini-2.5-flash") {
      targetModel = "gemini-3.5-flash";
    }

    console.log(`[AI-PROXY] Processing type: ${type}, ip: ${clientIp}, targetModel: ${targetModel}`);

    // Helper to enforce timeout per individual API request
    const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs = 12000): Promise<T> => {
      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("AI backend generation request timed out")), timeoutMs);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    // Resilient runner with exponential backoff and model fallback chain
    const runWithRetryAndFallback = async <T>(
      apiFn: (modelName: string) => Promise<T>,
      initialModel: string
    ): Promise<T> => {
      const fallbackChain = [
        initialModel,
        initialModel === "gemini-3.5-flash" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash",
        "gemini-3.1-flash-lite"
      ];

      // Deduplicate fallback list
      const uniqueModels = Array.from(new Set(fallbackChain));
      let lastError: any = null;

      for (const currentModel of uniqueModels) {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[AI-RETRY-ENGINE] Attempting ${type} with model: ${currentModel} (Attempt ${attempt}/${maxRetries})`);
            return await apiFn(currentModel);
          } catch (err: any) {
            lastError = err;
            const errMsg = String(err.message || err);
            const isTransient = 
              errMsg.includes("503") || 
              errMsg.includes("500") || 
              errMsg.includes("429") || 
              errMsg.includes("UNAVAILABLE") || 
              errMsg.includes("high demand") || 
              errMsg.includes("RESOURCE_EXHAUSTED") ||
              errMsg.includes("timed out");

            if (isTransient && attempt < maxRetries) {
              const backoffTime = Math.pow(2, attempt) * 800 + Math.random() * 400;
              console.warn(`[AI-RETRY-ENGINE] Transient error on ${currentModel}: ${errMsg}. Retrying in ${Math.round(backoffTime)}ms...`);
              await new Promise((resolve) => setTimeout(resolve, backoffTime));
            } else if (isTransient) {
              console.warn(`[AI-RETRY-ENGINE] All attempts failed for ${currentModel}. Trying fallback model if available...`);
              break; // break retry loop, proceeds to next model in fallbackChain
            } else {
              // Non-transient error (e.g., programming error, bad credentials) - fail fast
              throw err;
            }
          }
        }
      }
      throw lastError;
    };

    if (type === "generateContent") {
      if (!contents) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing 'contents' property for generateContent function" }),
        };
      }

      const response = await runWithRetryAndFallback(async (modelName) => {
        const apiCall = ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        return await runWithTimeout(apiCall, 12000);
      }, targetModel);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ text: response.text }),
      };
    }

    if (type === "chat") {
      if (!message) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing 'message' parameter for AI chat thread" }),
        };
      }

      // Reformat history into structure expected by chats.create
      const formattedHistory = Array.isArray(history)
        ? history.map((item: any) => ({
            role: item.role,
            parts: Array.isArray(item.parts) ? item.parts : [{ text: item.text || item.parts }],
          }))
        : [];

      const response = await runWithRetryAndFallback(async (modelName) => {
        const chatInstance = ai.chats.create({
          model: modelName,
          config: systemInstruction ? { systemInstruction } : undefined,
          history: formattedHistory,
        });
        const apiCall = chatInstance.sendMessage({ message });
        return await runWithTimeout(apiCall, 12000);
      }, targetModel);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ text: response.text }),
      };
    }

    if (type === "transcribe") {
      if (!audio) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing 'audio' base64 data" }),
        };
      }

      let cleanMimeType = mimeType || "audio/webm";
      if (cleanMimeType.includes(";")) {
        cleanMimeType = cleanMimeType.split(";")[0].trim();
      }

      const lowerMime = cleanMimeType.toLowerCase();
      if (lowerMime.includes("m4a") || lowerMime.includes("x-m4a")) {
        cleanMimeType = "audio/m4a";
      } else if (lowerMime.includes("mp4") || lowerMime.includes("quicktime")) {
        cleanMimeType = "audio/mp4";
      } else if (lowerMime.includes("webm")) {
        cleanMimeType = "audio/webm";
      } else if (lowerMime.includes("aac")) {
        cleanMimeType = "audio/aac";
      } else if (lowerMime.includes("ogg")) {
        cleanMimeType = "audio/ogg";
      } else if (lowerMime.includes("wav") || lowerMime.includes("wave")) {
        cleanMimeType = "audio/wav";
      } else if (lowerMime.includes("mp3") || lowerMime.includes("mpeg")) {
        cleanMimeType = "audio/mp3";
      } else {
        cleanMimeType = "audio/webm";
      }

      console.log(`[TRANSCRIBE Netlify] MimeType: ${cleanMimeType} from original ${mimeType}`);

      const response = await runWithRetryAndFallback(async (modelName) => {
        const apiCall = ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: audio,
              }
            },
            "Please transcribe this audio recording exactly as spoken in Bengali or English. Return ONLY the transcribed text. Do not write any greetings, explanation, punctuation corrections, translation, metadata, or notes. If the audio is empty, has no spoken words, or is just background noise, reply with exactly an empty string."
          ]
        });
        return await runWithTimeout(apiCall, 15000);
      }, "gemini-3.5-flash");

      const transcription = response.text ? response.text.trim() : "";
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ text: transcription }),
      };
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Invalid operation type: ${type}` }),
    };

  } catch (error: any) {
    console.error("AI Proxy Execution Failure:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || "An error occurred while generating AI responses." }),
    };
  }
};
