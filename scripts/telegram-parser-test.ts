import { isURL } from "../src/lib/knowledge-engine";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("Assertion failed:", message);
    process.exit(1);
  }
}

console.log("Testing Knowledge Engine URL detector...");

assert(isURL("https://ui.shadcn.com") === true, "expected URL detection for https://ui.shadcn.com");
assert(isURL("ui.shadcn.com") === true, "expected URL detection for ui.shadcn.com");
assert(isURL("website components") === false, "expected false for query text");

console.log("All Knowledge Engine tests passed! ✅");
