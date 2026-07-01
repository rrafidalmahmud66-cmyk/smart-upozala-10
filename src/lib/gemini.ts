/**
 * Centralized AI proxy client interceptor.
 * Relies exclusively on the secure netlify/local proxy path for all interactions.
 * This completely prevents any API keys from leaking in standard client code.
 */

interface RequestOptions {
  model: string;
  contents: any;
  config?: any;
}

export const ai = {
  models: {
    async generateContent(options: RequestOptions): Promise<{ text: string }> {
      const response = await fetch("/.netlify/functions/gemini-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "generateContent",
          model: options.model,
          contents: options.contents,
          config: options.config
        })
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        throw new Error(errDetail.error || `Proxy error (HTTP ${response.status})`);
      }

      const responseBody = await response.json();
      return {
        text: responseBody.text
      };
    }
  },
  chats: {
    create(options: { model: string; config?: { systemInstruction?: string }; history?: any[] }) {
      const chatHistory = [...(options.history || [])];
      return {
        async sendMessage(args: { message: string }): Promise<{ text: string }> {
          const response = await fetch("/.netlify/functions/gemini-chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              type: "chat",
              model: options.model,
              systemInstruction: options.config?.systemInstruction,
              history: chatHistory,
              message: args.message
            })
          });

          if (!response.ok) {
            const errDetail = await response.json().catch(() => ({}));
            throw new Error(errDetail.error || `Proxy error (HTTP ${response.status})`);
          }

          const responseBody = await response.json();
          
          // Append user/model turns to maintain locally matching chat sessions
          chatHistory.push({
            role: "user",
            parts: [{ text: args.message }]
          });
          chatHistory.push({
            role: "model",
            parts: [{ text: responseBody.text }]
          });

          return {
            text: responseBody.text
          };
        }
      };
    }
  }
};

/**
 * Utility to extract JSON from model responses that might be wrapped in markdown code blocks.
 */
export function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/```\n?([\s\S]*?)\n?```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {
        throw new Error("Failed to parse JSON from model response even after stripping markdown.");
      }
    }
    throw e;
  }
}

