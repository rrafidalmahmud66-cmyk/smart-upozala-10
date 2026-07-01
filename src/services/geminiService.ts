import { Type } from "@google/genai";
import { ServiceItem } from "../types";
import { ai, extractJson } from "../lib/gemini";
import { ExploreItem } from "../data/exploreData";

export interface AiSearchResult {
  ids: string[];
  reason: {
    bn: string;
    en: string;
  };
}

export interface AiExploreResult extends AiSearchResult {
  aiExplanation?: {
    bn: string;
    en: string;
  };
}

export async function aiSearchServices(
  query: string, 
  services: ServiceItem[], 
  context?: { 
    userLocation?: [number, number] | null;
    activeCategory?: string;
  }
): Promise<AiSearchResult> {
  try {
    // We only send minimal info to save on tokens and improve accuracy
    const serviceInfo = services.map(s => ({
      id: s.id,
      name: s.name,
      bnName: s.bnName,
      description: s.description,
      category: s.category,
      lat: s.lat,
      lng: s.lng
    }));

    const locationContext = context?.userLocation 
      ? `The user is currently at coordinates: ${context.userLocation[0]}, ${context.userLocation[1]}. Prioritize services that are physically closer if it makes sense for the query.`
      : "";
    
    const categoryContext = context?.activeCategory && context.activeCategory !== 'ALL'
      ? `The user is specifically looking within the "${context.activeCategory}" category.`
      : "The user is searching across all categories.";

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Find the most relevant services for the search query: "${query}" from the provided list. 
                 ${locationContext}
                 ${categoryContext}
                 
                 Return a JSON object with:
                 1. "ids": array of the "id" strings of matching services, ordered by relevance.
                 2. "reason": an object with "bn" and "en" keys providing a 1-sentence explanation of why these were chosen (e.g., "Finding healthcare services near you for your fever symptoms").
                 
                 Think about semantic meaning - e.g., if someone searches for "ill" or "fever", show health services.
                 Only return IDs that are genuinely relevant. If nothing matches, return an empty "ids" array.
                 Respond ONLY with valid JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ids: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            reason: {
              type: Type.OBJECT,
              properties: {
                bn: { type: Type.STRING },
                en: { type: Type.STRING }
              }
            }
          }
        },
        systemInstruction: `You are an expert search engine for a local service directory app in Sreepur, Gazipur. 
          Analyze the user's search query for intent.
          - If the user uses a symptom (e.g., "জ্বর," "ব্যথা"), look for doctors/hospitals.
          - If the user describes a problem (e.g., "কল নষ্ট," "লাইন নেই"), look for plumbers/electricians.
          - If the user mentions a specific area, prioritize services in that area.
          The user might use natural language in both English and Bengali (including Romanized Bengali).
          Services: ${JSON.stringify(serviceInfo)}`
      },
    });

    const text = response.text;
    if (text) {
      return extractJson(text);
    }
    return { ids: [], reason: { bn: "কোনো ফলাফল পাওয়া যায়নি।", en: "No results found." } };
  } catch (error) {
    console.error("AI Search Error:", error);
    return { ids: [], reason: { bn: "সার্চ করার সময় সমস্যা হয়েছে।", en: "Error occurred during search." } };
  }
}

export async function aiSearchExploreItems(
  query: string,
  items: ExploreItem[],
  language: 'bn' | 'en' = 'bn'
): Promise<AiExploreResult> {
  try {
    // Only send essential fields to stay within token limits
    const itemSummaries = items.slice(0, 100).map(item => ({
      id: item.id,
      title: item.title,
      bnTitle: item.bengaliTitle,
      category: item.category,
      desc: item.shortDescription,
      tags: item.tags
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User is searching for: "${query}" in a local directory of Sreepur, Gazipur.
                 Available items (first 100): ${JSON.stringify(itemSummaries)}
                 
                 Provide:
                 1. "ids": Array of most relevant item IDs (up to 10).
                 2. "reason": A short 1-sentence summary of what was found.
                 3. "aiExplanation": A more detailed explanation or answer to the user's query based on the data.
                 
                 Return JSON format. Respond in both Bengali ("bn") and English ("en").
                 Think semantically. If they ask for "emergency" or "hospital", show those.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ids: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            reason: {
              type: Type.OBJECT,
              properties: {
                bn: { type: Type.STRING },
                en: { type: Type.STRING }
              }
            },
            aiExplanation: {
              type: Type.OBJECT,
              properties: {
                bn: { type: Type.STRING },
                en: { type: Type.STRING }
              }
            }
          }
        },
        systemInstruction: "You are a helpful local assistant for Sreepur, Gazipur. You help users find services such as hospitals, administrative offices, schools, and more. Use the provided data to answer exactly."
      },
    });

    const text = response.text;
    if (text) {
      return extractJson(text);
    }
    return { ids: [], reason: { bn: "কিছু পাওয়া যায়নি।", en: "Nothing found." } };
  } catch (error) {
    console.error("AI Explore Search Error:", error);
    return { ids: [], reason: { bn: "ত্রুটি হয়েছে।", en: "Error occurred." } };
  }
}
