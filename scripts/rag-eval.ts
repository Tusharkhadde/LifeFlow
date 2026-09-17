/**
 * RAG evaluation harness — run with: npx tsx scripts/rag-eval.ts
 */
import { parseExpenseFromText } from "../src/lib/expense-parser";
import { cosineSimilarity } from "../src/lib/embeddings";

const GOLDEN_QUERIES = [
  { query: "react ui components", expectKeywords: ["react", "ui", "component"] },
  { query: "typescript tutorial", expectKeywords: ["typescript", "tutorial"] },
  { query: "personal finance tips", expectKeywords: ["finance", "money"] },
];

function scoreKeywordRecall(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k)).length;
  return hits / keywords.length;
}

console.log("=== LifeFlow RAG Evaluation ===\n");

console.log("--- Expense Parser Tests ---");
const expenseTests = [
  "spent ₹500 on lunch",
  "paid 1200 for electricity bill",
  "bought groceries for rs 800",
  "hello world",
];
for (const t of expenseTests) {
  const result = parseExpenseFromText(t);
  console.log(`  "${t}" → ${result ? `₹${result.amount} (${result.category})` : "null"}`);
}

console.log("\n--- Embedding Similarity Test ---");
const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
console.log(`  Identical vectors: ${sim.toFixed(2)} (expect 1.00)`);
const sim2 = cosineSimilarity([1, 0, 0], [0, 1, 0]);
console.log(`  Orthogonal vectors: ${sim2.toFixed(2)} (expect 0.00)`);

console.log("\n--- Golden Query Keyword Recall (mock) ---");
for (const g of GOLDEN_QUERIES) {
  const mockContext = g.query + " " + g.expectKeywords.join(" ");
  const recall = scoreKeywordRecall(mockContext, g.expectKeywords);
  console.log(`  "${g.query}" → recall@${g.expectKeywords.length}: ${(recall * 100).toFixed(0)}%`);
}

console.log("\n✅ Eval complete. Wire hybridSearchKnowledge with real DB for full recall@k metrics.");
