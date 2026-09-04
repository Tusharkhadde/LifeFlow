export interface AIProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function getAIConfig(modelOverride?: string): AIProviderConfig | null {
  const apiKey = process.env.HF_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.HF_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const model = modelOverride || process.env.HF_MODEL || process.env.OPENAI_MODEL || "Qwen/Qwen2.5-7B-Instruct";
  return { baseUrl: baseUrl.replace(/\/$/, ""), model, apiKey };
}
