import { NextRequest, NextResponse } from "next/server";
import { resolveApiKeyAuth } from "@/lib/api-keys";
import { ALL_TOOLS_DEFINITIONS, TOOL_DISPATCH } from "@/lib/agent-tools";

/**
 * LifeFlow MCP server — Model Context Protocol over Streamable HTTP (stateless JSON mode).
 * Any MCP client (Cursor, Claude Desktop, etc.) can point at /api/mcp with
 * `Authorization: Bearer lf_live_...` and use the user's second brain as tools.
 */

export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "lifeflow-ai", version: "1.0.0" };

const MCP_TOOL_ALIASES: Record<string, string> = {
  search_vault: "searchKnowledgeVault",
  save_knowledge: "saveKnowledgeItem",
  create_task: "createTask",
  list_tasks: "listTasks",
  complete_task: "completeTask",
  create_reminder: "createReminder",
  log_expense: "logExpense",
  expense_summary: "getExpenseSummary",
  log_habit: "logHabit",
  today_overview: "getTodayOverview",
  run_morning: "runMorningOS",
  process_meeting: "processMeeting",
  remember_fact: "rememberFact",
};

const MCP_TOOL_SCOPES: Record<string, string> = {
  search_vault: "assistant:use",
  save_knowledge: "vault:write",
  create_task: "tasks:write",
  list_tasks: "tasks:read",
  complete_task: "tasks:write",
  create_reminder: "tasks:write",
  log_expense: "expenses:write",
  expense_summary: "expenses:read",
  log_habit: "tasks:write",
  today_overview: "assistant:use",
  run_morning: "morning:run",
  process_meeting: "meetings:write",
  remember_fact: "vault:write",
};

function mcpTools() {
  return Object.entries(MCP_TOOL_ALIASES).map(([mcpName, internalName]) => {
    const definition = ALL_TOOLS_DEFINITIONS.find((tool) => tool.function.name === internalName);
    return {
      name: mcpName,
      description: definition?.function.description || internalName,
      inputSchema: definition?.function.parameters || { type: "object", properties: {} },
    };
  });
}

function headers(request?: NextRequest) {
  const origin = request?.headers.get("origin");
  const appOrigin = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const allowedOrigin =
    !origin || origin === appOrigin || origin.startsWith("chrome-extension://") ? origin || appOrigin : "";
  return {
    "Content-Type": "application/json",
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
  };
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: headers() });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: headers() });
}

async function authenticate(request: NextRequest, scope?: string) {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  return resolveApiKeyAuth(token, scope);
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: headers(request) });
}

export function GET() {
  return NextResponse.json(
    {
      ...SERVER_INFO,
      protocolVersion: PROTOCOL_VERSION,
      transport: "streamable-http",
      auth: "Authorization: Bearer lf_live_...",
      tools: mcpTools().map((tool) => tool.name),
    },
    { headers: headers() }
  );
}

export function DELETE() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

export async function POST(request: NextRequest) {
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  const id = body.id ?? null;
  const method = body.method || "";
  const params = body.params || {};

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "LifeFlow AI is the user's personal OS: knowledge vault, tasks, reminders, expenses, habits, meetings, and Morning OS. Prefer search_vault for questions and today_overview for status.",
    });
  }

  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202, headers: headers() });
  }

  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") {
    return rpcResult(id, { tools: mcpTools() });
  }

  if (method === "tools/call") {
    const name = String(params.name || "");
    const authentication = await authenticate(request, MCP_TOOL_SCOPES[name]);
    if (!authentication) {
      return rpcError(id, -32001, "Unauthorized or API key lacks the required tool scope", 401);
    }
    const internalName = MCP_TOOL_ALIASES[name] || name;
    const handler = TOOL_DISPATCH[internalName];
    if (!handler) return rpcError(id, -32602, `Unknown tool: ${name}`);

    try {
      const result = await handler(authentication.userId, params.arguments || {});
      return rpcResult(id, {
        content: [{ type: "text", text: result.message }],
        isError: !result.success,
        structuredContent: result.data && typeof result.data === "object" ? sanitize(result.data) : undefined,
      });
    } catch (error) {
      return rpcResult(id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed" }],
        isError: true,
      });
    }
  }

  if (method === "resources/list") return rpcResult(id, { resources: [] });
  if (method === "prompts/list") return rpcResult(id, { prompts: [] });

  return rpcError(id, -32601, `Method not found: ${method}`);
}

function sanitize(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))
  );
}
