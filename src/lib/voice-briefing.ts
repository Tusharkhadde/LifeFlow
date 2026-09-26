import { getEnhancedDailyBriefing } from "@/lib/proactive-intelligence";
import { getAIConfig } from "@/lib/ai-provider";
import { prisma } from "@/lib/db";

export async function generateSpeechFromText(text: string): Promise<Buffer | null> {
  const config = getAIConfig();
  if (!config) return null;

  const cleanText = text.replace(/[*_`[\]()]/g, "").slice(0, 4000);
  if (!cleanText.trim()) return null;

  try {
    const response = await fetch(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.TTS_MODEL || "tts-1",
        input: cleanText,
        voice: "nova",
      }),
    });

    if (!response.ok) {
      console.warn("[VoiceBriefing] TTS unavailable:", response.status);
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.warn("[VoiceBriefing] Failed:", err);
    return null;
  }
}

export async function generateVoiceBriefingAudio(userId: string): Promise<Buffer | null> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings && !settings.voiceBriefingEnabled) return null;

  const text = await getEnhancedDailyBriefing(userId);
  return generateSpeechFromText(text);
}
