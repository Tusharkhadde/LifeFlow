import { getAppBaseUrl } from "@/lib/integrations/oauth-state";
import { getIntegration, markSynced } from "@/lib/integrations/store";
import { prisma } from "@/lib/db";
import { indexKnowledgeItemEmbedding } from "@/lib/hybrid-search";
import { ingestContext } from "@/lib/context-graph";

const NOTION_VERSION = "2022-06-28";

function getNotionCredentials() {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Notion OAuth not configured");
  return { clientId, clientSecret };
}

export function getNotionAuthUrl(state: string) {
  const { clientId } = getNotionCredentials();
  const redirectUri = `${getAppBaseUrl()}/api/integrations/notion/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params}`;
}

export async function exchangeNotionCode(code: string) {
  const { clientId, clientSecret } = getNotionCredentials();
  const redirectUri = `${getAppBaseUrl()}/api/integrations/notion/callback`;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`Notion token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    workspace_id: string;
    workspace_name?: string;
    bot_id: string;
  }>;
}

async function notionFetch(userId: string, path: string, options: RequestInit = {}) {
  const integration = await getIntegration(userId, "notion");
  if (!integration) throw new Error("Notion not connected");

  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) throw new Error(`Notion API error: ${await res.text()}`);
  return res.json();
}

function extractPlainText(richText: Array<{ plain_text?: string }> = []) {
  return richText.map((t) => t.plain_text || "").join("");
}

function getPageTitle(page: { properties?: Record<string, unknown> }): string {
  const props = page.properties || {};
  for (const prop of Object.values(props)) {
    const p = prop as { type?: string; title?: Array<{ plain_text?: string }> };
    if (p.type === "title" && p.title) return extractPlainText(p.title) || "Untitled Notion Page";
  }
  return "Untitled Notion Page";
}

async function fetchBlockText(userId: string, blockId: string, depth = 0): Promise<string> {
  if (depth > 4) return "";
  const data = await notionFetch(userId, `/blocks/${blockId}/children?page_size=100`);
  const lines: string[] = [];

  for (const block of data.results || []) {
    const type = block.type as string;
    const content = block[type];
    if (content?.rich_text) {
      const text = extractPlainText(content.rich_text);
      if (text) lines.push(text);
    }
    if (block.has_children) {
      lines.push(await fetchBlockText(userId, block.id, depth + 1));
    }
  }
  return lines.join("\n");
}

export async function importNotionPages(userId: string, limit = 25) {
  const integration = await getIntegration(userId, "notion");
  if (!integration?.syncEnabled) return { imported: 0, skipped: 0 };

  const search = await notionFetch(userId, "/search", {
    method: "POST",
    body: JSON.stringify({
      page_size: limit,
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
  });

  let imported = 0;
  let skipped = 0;

  for (const page of search.results || []) {
    const notionPageId = page.id as string;
    const notionUrl = (page.url as string) || `https://notion.so/${notionPageId.replace(/-/g, "")}`;

    const existing = await prisma.knowledgeItem.findFirst({
      where: {
        userId,
        metadata: { path: ["notionPageId"], equals: notionPageId },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const title = getPageTitle(page);
    let content = "";
    try {
      content = await fetchBlockText(userId, notionPageId);
    } catch {
      content = page.properties ? JSON.stringify(page.properties).slice(0, 2000) : "";
    }

    const item = await prisma.knowledgeItem.create({
      data: {
        userId,
        title,
        summary: content.slice(0, 300),
        aiMemory: `Imported from Notion: ${title}`,
        content: content.slice(0, 50000),
        type: "note",
        category: "Notion Import",
        tags: ["notion", "imported"],
        sourceUrl: notionUrl,
        metadata: { notionPageId, notionUrl, importedAt: new Date().toISOString() },
      },
    });

    await indexKnowledgeItemEmbedding(item.id);
    await ingestContext(userId, `${title}. ${content.slice(0, 200)}`, notionUrl);
    imported++;
  }

  await markSynced(userId, "notion");
  return { imported, skipped };
}

export async function exportKnowledgeToNotion(userId: string, itemId: string) {
  const integration = await getIntegration(userId, "notion");
  if (!integration) throw new Error("Notion not connected");

  const item = await prisma.knowledgeItem.findFirst({ where: { id: itemId, userId } });
  if (!item) throw new Error("Item not found");

  const metadata = integration.metadata as { parentPageId?: string } | null;
  const parent = metadata?.parentPageId
    ? { page_id: metadata.parentPageId }
    : { workspace: true };

  const page = await notionFetch(userId, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent,
      properties: {
        title: {
          title: [{ text: { content: item.title.slice(0, 2000) } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ text: { content: (item.aiMemory || item.summary || item.content || "").slice(0, 2000) } }],
          },
        },
      ],
    }),
  });

  return page;
}
