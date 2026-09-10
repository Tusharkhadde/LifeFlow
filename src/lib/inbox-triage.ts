import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { createReminder, formatUserDate } from "@/lib/productivity-actions";

interface TriageResult {
  summary: string;
  reminderText: string | null;
  reminderWhen: string | null;
  memoryKey: string | null;
  memoryValue: string | null;
}

function parseResult(raw: string): TriageResult | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const value = JSON.parse(match ? match[0] : raw);
    return {
      summary: typeof value.summary === "string" ? value.summary : "",
      reminderText: typeof value.reminderText === "string" ? value.reminderText : null,
      reminderWhen: typeof value.reminderWhen === "string" ? value.reminderWhen : null,
      memoryKey: typeof value.memoryKey === "string" ? value.memoryKey : null,
      memoryValue: typeof value.memoryValue === "string" ? value.memoryValue : null,
    };
  } catch {
    return null;
  }
}

export async function triageInbox(text: string): Promise<TriageResult | null> {
  const config = getAIConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [{ role: "user", content: `Classify this personal inbox message. Return JSON only with exactly these fields: summary (string), reminderText (string|null), reminderWhen (string|null), memoryKey (string|null), memoryValue (string|null). Only set reminder fields when the user explicitly asks to be reminded. Only set memory fields for stable personal facts or preferences. Message: ${text}` }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return parseResult(data.choices?.[0]?.message?.content || "");
  } catch {
    return null;
  }
}

export async function proposeReminder(userId: string, telegramChatId: number, source: string, text: string, when: string) {
  const existing = await prisma.pendingAction.findUnique({ where: { userId_telegramChatId: { userId, telegramChatId: BigInt(telegramChatId) } } });
  if (existing) await prisma.pendingAction.delete({ where: { id: existing.id } });
  return prisma.pendingAction.create({
    data: { userId, telegramChatId: BigInt(telegramChatId), action: "create_reminder", payload: { text, when }, source, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
}

export async function resolvePendingAction(userId: string, telegramChatId: number, approved: boolean) {
  const pending = await prisma.pendingAction.findUnique({ where: { userId_telegramChatId: { userId, telegramChatId: BigInt(telegramChatId) } } });
  if (!pending || pending.expiresAt < new Date()) {
    if (pending) await prisma.pendingAction.delete({ where: { id: pending.id } });
    return { message: "There is no pending action to confirm." };
  }
  await prisma.pendingAction.delete({ where: { id: pending.id } });
  if (!approved) return { message: "Okay, I won't do that." };
  if (pending.action === "create_reminder") {
    const payload = pending.payload as { text: string; when: string };
    const reminder = await createReminder(userId, payload.text, payload.when);
    return { message: `✅ Reminder set for ${await formatUserDate(userId, reminder.remindAt)}: *${reminder.text}*` };
  }
  return { message: "I couldn't complete that action." };
}