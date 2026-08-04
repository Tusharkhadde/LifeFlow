import { queryKnowledgeVault } from "@/lib/knowledge-engine";

// ---- Model Registry ----

export interface ModelInfo {
  id: string;
  name: string;
  supportsVision: boolean;
  isFree: boolean;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B", supportsVision: false, isFree: true },
  { id: "meta-llama/llama-3.2-11b-vision-instruct:free", name: "Llama 3.2 Vision 11B", supportsVision: true, isFree: true },
  { id: "qwen/qwen2-vl-7b-instruct:free", name: "Qwen2-VL 7B", supportsVision: true, isFree: true },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", supportsVision: false, isFree: true },
];

export function getDefaultModel(): string {
  return process.env.OPENAI_MODEL || AVAILABLE_MODELS[0].id;
}

export function getDefaultVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || AVAILABLE_MODELS.find(m => m.supportsVision)?.id || getDefaultModel();
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId);
}

export function resolveVisionModel(preferredModel?: string): string {
  if (preferredModel && getModelInfo(preferredModel)?.supportsVision) return preferredModel;
  return getDefaultVisionModel();
}

// ---- AI call ----

export async function callAI(systemPrompt: string, userMessage: string, maxTokens: number, temperature: number, modelOverride?: string): Promise<string | null> {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = modelOverride || process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!baseUrl || !model || !apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow AI Second Brain",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function handleMessage(message: string, userId: string): Promise<string> {
  const result = await queryKnowledgeVault(userId, message);
  return result.reply;
}

// ---- Document/Image Analysis ----

export interface DocumentAnalysis {
  type: string;
  name: string;
  category: string;
  issueDate: string | null;
  expiryDate: string | null;
  otherDates: Array<{ label: string; date: string }>;
  keyInfo: Record<string, string>;
  confidence: number;
}

async function callVisionAI(imageBase64: string, mimeType: string, caption?: string, modelOverride?: string): Promise<string | null> {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = modelOverride || resolveVisionModel(process.env.OPENAI_MODEL);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!baseUrl || !model || !apiKey) {
    return null;
  }

  const prompt = caption
    ? `Analyze this document/image. User says: "${caption}". Extract: document type, name/title, key summary. Respond in JSON format only: { "type": string, "name": string, "category": string, "keyInfo": {string: string}, "confidence": number }.`
    : `Analyze this document/image. Extract: document type, name/title, key summary. Respond in JSON format only: { "type": string, "name": string, "category": string, "keyInfo": {string: string}, "confidence": number }.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function analyzeDocumentImage(imageBase64: string, mimeType: string, caption?: string, modelOverride?: string): Promise<DocumentAnalysis | null> {
  const raw = await callVisionAI(imageBase64, mimeType, caption, modelOverride);
  if (!raw) return null;

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    return {
      type: parsed.type || "unknown",
      name: parsed.name || "Unnamed Document",
      category: parsed.category || "uncategorized",
      issueDate: null,
      expiryDate: null,
      otherDates: [],
      keyInfo: parsed.keyInfo || {},
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
    };
  } catch {
    return null;
  }
}

const telegramAI = {
  analyzeDocumentImage,
  handleMessage,
  getDefaultModel,
  getDefaultVisionModel,
  getModelInfo,
  resolveVisionModel,
  callAI,
  AVAILABLE_MODELS,
};

export default telegramAI;
