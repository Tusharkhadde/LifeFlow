import {
  saveKnowledgeItemSchema,
  searchKnowledgeVaultSchema,
} from "../src/lib/agent-tools";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("Assertion failed:", message);
    process.exit(1);
  }
}

console.log("Testing AI Second Brain Knowledge Tool Schemas...");

// 1. saveKnowledgeItem
const saveResult = saveKnowledgeItemSchema.safeParse({ input: "https://ui.shadcn.com" });
assert(saveResult.success, "saveKnowledgeItem schema validation failed");
assert(saveResult.data?.input === "https://ui.shadcn.com", "input mismatch");

// 2. searchKnowledgeVault
const searchResult = searchKnowledgeVaultSchema.safeParse({ query: "website components" });
assert(searchResult.success, "searchKnowledgeVault schema validation failed");
assert(searchResult.data?.query === "website components", "query mismatch");

console.log("All AI Second Brain Tool Schemas & Validation Passed! ✅");
