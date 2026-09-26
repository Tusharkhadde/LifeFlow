import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { rememberPersonalFact } from "@/lib/personal-memory";
import { linkEntities } from "@/lib/context-graph";
import { publishAppEvent } from "@/lib/events";
import { enqueueJob } from "@/lib/job-queue";
import { transcribeAudio } from "@/lib/telegram-ai";
import { ensureProject, linkToProject } from "@/lib/projects";
import { createInboxItem } from "@/lib/inbox-actions";
import { trackedChatCompletion } from "@/lib/ai-telemetry";

export interface MeetingActionItem {
  title: string;
  owner?: string;
  dueInDays?: number | null;
  taskId?: string;
}

export interface MeetingResult {
  knowledgeItemId: string;
  title: string;
  summary: string;
  decisions: string[];
  actionItems: MeetingActionItem[];
  people: string[];
  projects: string[];
  memories: Array<{ key: string; value: string }>;
  followUpQuestions: string[];
}

interface MeetingExtraction {
  title: string;
  summary: string;
  decisions: string[];
  actionItems: Array<{ title: string; owner?: string; dueInDays?: number | null }>;
  people: string[];
  projects: string[];
  memories: Array<{ key: string; value: string }>;
  followUpQuestions: string[];
}

function heuristicExtraction(transcript: string, titleHint?: string): MeetingExtraction {
  const sentences = transcript
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8);

  const actionItems = sentences
    .filter((sentence) => /\b(will|should|need to|needs to|todo|action|follow up|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week))\b/i.test(sentence))
    .slice(0, 6)
    .map((sentence) => ({
      title: sentence.replace(/^(we|i|you|they)\s+/i, "").slice(0, 100),
      dueInDays: /tomorrow/i.test(sentence) ? 1 : /next week/i.test(sentence) ? 7 : 3,
    }));

  const decisions = sentences
    .filter((sentence) => /\b(decided|agreed|approved|finalized|we'll go with|conclusion)\b/i.test(sentence))
    .slice(0, 5);

  const people = Array.from(new Set(transcript.match(/\b[A-Z][a-z]{2,}\b/g) || []))
    .filter((word) => !/^(The|This|That|We|You|They|Meeting|Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday)$/.test(word))
    .slice(0, 6);

  return {
    title: titleHint || `Meeting notes ${new Date().toLocaleDateString()}`,
    summary: sentences.slice(0, 3).join(". ").slice(0, 400) || transcript.slice(0, 300),
    decisions,
    actionItems: actionItems.length ? actionItems : [{ title: "Review meeting notes and confirm next steps", dueInDays: 1 }],
    people,
    projects: [],
    memories: [],
    followUpQuestions: [],
  };
}

async function extractWithLLM(
  userId: string,
  transcript: string,
  titleHint?: string
): Promise<MeetingExtraction | null> {
  const config = getAIConfig();
  if (!config) return null;

  const prompt = `You are LifeFlow's meeting intelligence. Analyze this meeting transcript or notes and return JSON only:
{
  "title": "short meeting title",
  "summary": "3-5 sentence summary",
  "decisions": ["decision 1"],
  "actionItems": [{"title":"concrete task","owner":"name or null","dueInDays": 3}],
  "people": ["names mentioned"],
  "projects": ["projects, products, or clients mentioned"],
  "memories": [{"key":"short key","value":"durable fact worth remembering"}],
  "followUpQuestions": ["open question"]
}
Rules: max 8 action items, titles under 90 chars, dueInDays integer 0-30 or null. Only include facts actually in the text.
${titleHint ? `Title hint: ${titleHint}` : ""}

Transcript:
${transcript.slice(0, 14000)}`;

  try {
    const { data } = await trackedChatCompletion({
      userId,
      operation: "meeting_extract",
      modelClass: "fast",
      request: {
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      },
    });
    const raw = (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<MeetingExtraction>;
    if (!parsed.summary) return null;
    return {
      title: parsed.title || titleHint || "Meeting notes",
      summary: parsed.summary,
      decisions: parsed.decisions || [],
      actionItems: (parsed.actionItems || []).filter((item) => item?.title).slice(0, 8),
      people: parsed.people || [],
      projects: parsed.projects || [],
      memories: (parsed.memories || []).filter((item) => item?.key && item?.value).slice(0, 5),
      followUpQuestions: parsed.followUpQuestions || [],
    };
  } catch {
    return null;
  }
}

export async function processMeetingTranscript(
  userId: string,
  transcript: string,
  options: { title?: string; source?: string } = {}
): Promise<MeetingResult> {
  const cleanTranscript = transcript.trim();
  if (cleanTranscript.length < 20) throw new Error("Transcript is too short to analyze.");

  const extraction =
    (await extractWithLLM(userId, cleanTranscript, options.title)) ||
    heuristicExtraction(cleanTranscript, options.title);

  const knowledgeItem = await prisma.knowledgeItem.create({
    data: {
      userId,
      title: extraction.title,
      summary: extraction.summary,
      aiMemory: extraction.decisions[0]
        ? `Meeting decision: ${extraction.decisions[0]}`
        : `Meeting: ${extraction.summary.slice(0, 160)}`,
      type: "note",
      category: "Meeting",
      tags: ["meeting", ...extraction.projects.slice(0, 3).map((project) => project.toLowerCase())],
      content: cleanTranscript.slice(0, 50000),
      metadata: {
        kind: "meeting",
        source: options.source || "web",
        decisions: extraction.decisions,
        people: extraction.people,
        projects: extraction.projects,
        followUpQuestions: extraction.followUpQuestions,
      },
    },
  });
  await enqueueJob(
    "embedding.index",
    { itemId: knowledgeItem.id },
    { userId, idempotencyKey: `embedding:${knowledgeItem.id}` }
  );

  const actionItems: MeetingActionItem[] = [];
  for (const item of extraction.actionItems) {
    const dueAt =
      typeof item.dueInDays === "number"
        ? new Date(Date.now() + Math.max(0, Math.min(30, item.dueInDays)) * 86400000)
        : null;
    if (dueAt) dueAt.setHours(18, 0, 0, 0);
    const task = await prisma.task.create({
      data: {
        userId,
        title: item.owner ? `${item.title} (${item.owner})` : item.title,
        description: `From meeting: ${extraction.title}`,
        dueAt,
      },
    });
    await publishAppEvent(userId, "task_created", { id: task.id, title: task.title });
    await enqueueJob("calendar.sync", { type: "task", id: task.id }, { userId });
    actionItems.push({ ...item, taskId: task.id });
  }

  for (const memory of extraction.memories) {
    await rememberPersonalFact(userId, memory.key.toLowerCase(), memory.value, `meeting:${knowledgeItem.id}`).catch(() => {});
  }

  await linkEntities(
    userId,
    {
      entities: [
        { name: extraction.title, type: "meeting" },
        ...extraction.people.map((name) => ({ name, type: "person" })),
        ...extraction.projects.map((name) => ({ name, type: "project" })),
      ],
      relations: [
        ...extraction.people.map((name) => ({ from: name, to: extraction.title, relation: "attended" })),
        ...extraction.projects.map((name) => ({ from: extraction.title, to: name, relation: "discussed" })),
        ...extraction.actionItems
          .filter((item) => item.owner)
          .map((item) => ({ from: item.owner as string, to: item.title, relation: "owns" })),
      ],
    },
    `meeting:${knowledgeItem.id}`
  ).catch(() => {});

  for (const projectName of extraction.projects) {
    const project = await ensureProject(userId, projectName);
    await linkToProject(userId, project.id, "meeting", knowledgeItem.id);
    for (const action of actionItems) {
      if (action.taskId) await linkToProject(userId, project.id, "task", action.taskId);
    }
    const matchingPeople = await prisma.contextEntity.findMany({
      where: {
        userId,
        type: "person",
        name: { in: extraction.people },
      },
    });
    for (const person of matchingPeople) {
      await linkToProject(userId, project.id, "person", person.id, "contributes_to");
    }
  }

  await createInboxItem(userId, {
    source: "meeting",
    sourceRef: knowledgeItem.id,
    kind: "meeting",
    title: extraction.title,
    summary: extraction.summary,
    payload: {
      decisions: extraction.decisions,
      taskIds: actionItems.map((item) => item.taskId).filter(Boolean),
      knowledgeItemId: knowledgeItem.id,
    },
    alreadyMaterialized: true,
  });

  await publishAppEvent(userId, "meeting_processed", {
    id: knowledgeItem.id,
    title: extraction.title,
    taskCount: actionItems.length,
  });

  return {
    knowledgeItemId: knowledgeItem.id,
    title: extraction.title,
    summary: extraction.summary,
    decisions: extraction.decisions,
    actionItems,
    people: extraction.people,
    projects: extraction.projects,
    memories: extraction.memories,
    followUpQuestions: extraction.followUpQuestions,
  };
}

export async function processMeetingAudio(
  userId: string,
  audio: Buffer,
  options: { title?: string; fileName?: string; source?: string } = {}
) {
  const transcript = await transcribeAudio(audio, options.fileName || "meeting.mp3");
  if (!transcript) throw new Error("Could not transcribe the audio. Check the transcription model settings.");
  const result = await processMeetingTranscript(userId, transcript, options);
  return { transcript, ...result };
}

export async function listMeetings(userId: string, limit = 20) {
  return prisma.knowledgeItem.findMany({
    where: { userId, archived: false, category: "Meeting" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, summary: true, metadata: true, createdAt: true },
  });
}

export function formatMeetingForTelegram(result: MeetingResult) {
  const lines = [`*📝 ${result.title}*`, "", result.summary];
  if (result.decisions.length) {
    lines.push("", "*Decisions:*", ...result.decisions.map((item) => `• ${item}`));
  }
  if (result.actionItems.length) {
    lines.push("", `*Tasks created (${result.actionItems.length}):*`, ...result.actionItems.map((item) => `• ${item.title}${item.owner ? ` — ${item.owner}` : ""}`));
  }
  if (result.followUpQuestions.length) {
    lines.push("", "*Open questions:*", ...result.followUpQuestions.slice(0, 3).map((item) => `• ${item}`));
  }
  return lines.join("\n");
}
