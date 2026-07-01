import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Helper to enforce timeout per individual API request
  const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs = 12000): Promise<T> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("AI backend request timed out")), timeoutMs);
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
    initialModel: string,
    operationName = "AI Request"
  ): Promise<T> => {
    const fallbackChain = [
      initialModel,
      initialModel === "gemini-3.5-flash" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash",
      "gemini-3.1-flash-lite"
    ];

    const uniqueModels = Array.from(new Set(fallbackChain));
    let lastError: any = null;

    for (const currentModel of uniqueModels) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[LOCAL AI-RETRY-ENGINE] Attempting ${operationName} with model: ${currentModel} (Attempt ${attempt}/${maxRetries})`);
          return await apiFn(currentModel);
        } catch (err: any) {
          lastError = err;
          const errMsg = String(err.message || err);
          const isTimeout = errMsg.includes("timed out");
          const isTransient = 
            errMsg.includes("503") || 
            errMsg.includes("500") || 
            errMsg.includes("429") || 
            errMsg.includes("UNAVAILABLE") || 
            errMsg.includes("high demand") || 
            errMsg.includes("RESOURCE_EXHAUSTED") ||
            isTimeout;

          const modelMaxRetries = isTimeout ? 1 : maxRetries;

          if (isTransient && attempt < modelMaxRetries) {
            const backoffTime = Math.pow(2, attempt) * 800 + Math.random() * 400;
            const cleanMsg = errMsg.replace(/error/gi, "err");
            console.log(`[LOCAL AI-RETRY-ENGINE] Transient difficulty on ${currentModel}: ${cleanMsg}. Retrying in ${Math.round(backoffTime)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoffTime));
          } else if (isTransient) {
            console.log(`[LOCAL AI-RETRY-ENGINE] Limit reached for ${currentModel} (${isTimeout ? "due to timeout" : "due to retries"}). Trying fallback model if available...`);
            break; 
          } else {
            throw err;
          }
        }
      }
    }
    throw lastError;
  };

  // Error Handling middleware MUST be added LAST
  const setupErrorHandling = () => {
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error("Global Server Error:", err);
      res.status(500).json({ 
        success: false, 
        error: "Internal Server Error",
        details: process.env.NODE_ENV === 'production' ? undefined : err.message 
      });
    });
  };

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Serve uploads statically
  app.use("/uploads", express.static(uploadsDir));

  // Multer config
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });
  const upload = multer({ storage });

  // Upload API
  app.post("/api/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  });

  // Server-side Image Proxy for hotlink-protected sources like Wikimedia Commons
  app.get("/api/proxy-image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        return res.status(400).send("Parameter 'url' is required");
      }

      const parsedUrl = new URL(imageUrl);
      if (!parsedUrl.hostname.endsWith("wikimedia.org") && !parsedUrl.hostname.endsWith("wikipedia.org")) {
        return res.status(403).send("Host not allowed");
      }

      // Fetch server-side with compliant User-Agent to avoid 403 Forbidden blocks
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "UpazilaHelplineApp/1.0 (contact: rrafidalmahmud66@gmail.com; user: rrafidalmahmud)"
        }
      });

      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=604800"); // Cache for 7 days
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.send(buffer);
    } catch (err: any) {
      console.error("Error proxying image:", err);
      return res.status(500).send("Failed to load image");
    }
  });

  // Audio Transcription API using Gemini (extremely robust fallback for voice input in iframes)
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audio, mimeType, language } = req.body;
      if (!audio) {
        return res.status(400).json({ error: "Missing audio base64 data" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY is not defined in local .env.");
        return res.status(500).json({ error: "Gemini API key is not configured locally." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      let cleanMimeType = mimeType || "audio/webm";
      // Split by semicolon (e.g. "audio/webm;codecs=opus") to remove parameters since Gemini API only accepts clean standard mimeTypes
      if (cleanMimeType.includes(";")) {
        cleanMimeType = cleanMimeType.split(";")[0].trim();
      }

      // Map non-standard but common mobile recordings to standard audio types
      const lowerMime = cleanMimeType.toLowerCase();
      if (lowerMime.includes("m4a") || lowerMime.includes("x-m4a")) {
        cleanMimeType = "audio/m4a";
      } else if (lowerMime.includes("mp4")) {
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
        // Sane fallback if empty or unrecognizable
        cleanMimeType = "audio/webm";
      }
      
      console.log(`[TRANSCRIBE API] Processing audio transcription request. Cleaned mimeType: ${cleanMimeType}, Target language: ${language}`);

      const targetLang = language === 'en' ? 'en' : 'bn';
      const transcriptionPrompt = targetLang === 'bn'
        ? "You are an expert Bengali speech-to-text transcriber. Transcribe the spoken Bengali audio exactly into written Bengali script (বাংলা হরফ). If the speaker uses common English words mixed with Bengali (Code-switching), transcribe the English words in Bengali phonetics (e.g. 'মোবাইল', 'ক্যাবজ') or keep them in English if appropriate, but prioritize Bengali script. Do not translate the Bengali speech to English; output the transcribed text in Bengali. Return ONLY the transcription, without any punctuation corrections, explanations, markdown, or greetings. If the audio contains only background noise, silence, or no recognizable speech, reply with an empty string."
        : "You are an expert English speech-to-text transcriber. Transcribe the spoken English audio exactly as spoken. Return ONLY the transcribed English text, without any explanations, markdown, or greetings. If the audio contains only background noise, silence, or no recognizable speech, reply with an empty string.";

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
            transcriptionPrompt
          ]
        });
        return await runWithTimeout(apiCall, 15000);
      }, "gemini-3.5-flash", "transcribe");

      const transcription = response.text ? response.text.trim() : "";
      console.log(`[TRANSCRIBE API] Successfully transcribed: "${transcription}"`);
      return res.json({ text: transcription });
    } catch (err: any) {
      console.error("Transcribing audio error:", err);
      return res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  // Email Configuration
  const getTransporter = async () => {
    // If user provided real credentials
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    // Fallback: Ethereal Email for testing in preview
    const testAccount = await nodemailer.createTestAccount();
    console.log("Using Ethereal test account:", testAccount.user);
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  };

  // API Route for Sending Emails
  app.post("/api/send-email", async (req, res) => {
    try {
      const { to, subject, html } = req.body;
      const transporter = await getTransporter();

      const info = await transporter.sendMail({
        from: '"Upazila Helpline System" <no-reply@upazila-helpline.com>',
        to: to || process.env.ADMIN_EMAIL || "admin@example.com",
        subject,
        html,
      });

      console.log("Message sent: %s", info.messageId);
      // If it's a test account, log the URL to view the email
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log("Preview URL: %s", previewUrl);
      }

      res.json({ success: true, messageId: info.messageId, previewUrl });
    } catch (error: any) {
      console.error("Email error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Local development Netlify-proxy endpoint for client-side redirection
  app.post("/.netlify/functions/gemini-chat", async (req, res) => {
    try {
      const { type, model, contents, config, history, message, systemInstruction, audio, mimeType, language } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.warn("GEMINI_API_KEY environment variable is not defined in local .env.");
        return res.status(500).json({ error: "Gemini API key is not configured locally." });
      }

      const ai = new GoogleGenAI({ apiKey });

      let targetModel = model || "gemini-3.5-flash";
      if (targetModel === "gemini-3-flash-preview" || targetModel === "gemini-2.5-flash") {
        targetModel = "gemini-3.5-flash";
      }

      console.log(`[LOCAL AI-PROXY] Processing type: ${type}, targetModel: ${targetModel}`);

      if (type === "generateContent") {
        if (!contents) {
          return res.status(400).json({ error: "Missing 'contents' property for generateContent function" });
        }

        const response = await runWithRetryAndFallback(async (modelName) => {
          const apiCall = ai.models.generateContent({
            model: modelName,
            contents,
            config,
          });
          return await runWithTimeout(apiCall, 12000);
        }, targetModel, type);

        return res.json({ text: response.text });
      }

      if (type === "chat") {
        if (!message) {
          return res.status(400).json({ error: "Missing 'message' parameter for AI chat thread" });
        }

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
        }, targetModel, type);

        return res.json({ text: response.text });
      }

      if (type === "transcribe") {
        if (!audio) {
          return res.status(400).json({ error: "Missing audio base64 data" });
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

        const targetLang = language === 'en' ? 'en' : 'bn';
        const transcriptionPrompt = targetLang === 'bn'
          ? "You are an expert Bengali speech-to-text transcriber. Transcribe the spoken Bengali audio exactly into written Bengali script (বাংলা হরফ). If the speaker uses common English words mixed with Bengali (Code-switching), transcribe the English words in Bengali phonetics (e.g. 'মোবাইল', 'ক্যাবজ') or keep them in English if appropriate, but prioritize Bengali script. Do not translate the Bengali speech to English; output the transcribed text in Bengali. Return ONLY the transcription, without any punctuation corrections, explanations, markdown, or greetings. If the audio contains only background noise, silence, or no recognizable speech, reply with an empty string."
          : "You are an expert English speech-to-text transcriber. Transcribe the spoken English audio exactly as spoken. Return ONLY the transcribed English text, without any explanations, markdown, or greetings. If the audio contains only background noise, silence, or no recognizable speech, reply with an empty string.";

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
              transcriptionPrompt
            ]
          });
          return await runWithTimeout(apiCall, 15000);
        }, "gemini-3.5-flash", "transcribe");

        const transcription = response.text ? response.text.trim() : "";
        return res.json({ text: transcription });
      }

      return res.status(400).json({ error: `Invalid operation type: ${type}` });
    } catch (err: any) {
      console.error("[LOCAL AI-PROXY ERROR]:", err);
      return res.status(500).json({ error: err.message || "An error occurred in client proxy call" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  
  setupErrorHandling();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
