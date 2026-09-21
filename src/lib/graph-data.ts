import { prisma } from "@/lib/db";
import { listContextGraph } from "@/lib/context-graph";

export async function getGraphVisualizationData(userId: string) {
  const [relations, knowledgeItems, expenses, habits] = await Promise.all([
    listContextGraph(userId),
    prisma.knowledgeItem.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.expense.findMany({ where: { userId }, orderBy: { spentAt: "desc" }, take: 15 }),
    prisma.habit.findMany({ where: { userId, archived: false }, take: 10 }),
  ]);

  const nodes: Array<{ id: string; label: string; type: string; color?: string }> = [];
  const edges: Array<{ source: string; target: string; label: string }> = [];
  const seen = new Set<string>();

  function addNode(id: string, label: string, type: string, color?: string) {
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({ id, label, type, color });
    }
  }

  for (const rel of relations) {
    const fromId = `entity:${rel.fromEntity.id}`;
    const toId = `entity:${rel.toEntity.id}`;
    addNode(fromId, rel.fromEntity.name, "entity", "#6366f1");
    addNode(toId, rel.toEntity.name, "entity", "#6366f1");
    edges.push({ source: fromId, target: toId, label: rel.relation.replace("_", " ") });
  }

  for (const item of knowledgeItems.slice(0, 20)) {
    const id = `knowledge:${item.id}`;
    addNode(id, item.title.slice(0, 40), "knowledge", "#10b981");
    addNode(`cat:${item.category}`, item.category, "category", "#f59e0b");
    edges.push({ source: id, target: `cat:${item.category}`, label: "in category" });
  }

  for (const expense of expenses.slice(0, 8)) {
    const id = `expense:${expense.id}`;
    addNode(id, `₹${expense.amount} ${expense.merchant || expense.category}`, "expense", "#ef4444");
    addNode(`cat:${expense.category}`, expense.category, "category", "#f59e0b");
    edges.push({ source: id, target: `cat:${expense.category}`, label: "spent on" });
  }

  for (const habit of habits) {
    addNode(`habit:${habit.id}`, habit.name, "habit", "#8b5cf6");
  }

  return { nodes, edges, stats: { nodes: nodes.length, edges: edges.length } };
}
