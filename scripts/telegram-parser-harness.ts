import { isURL } from "../src/lib/knowledge-engine";

const examples = [
  "https://ui.shadcn.com",
  "ui.shadcn.com",
  "website components",
  "React component library for building modern websites",
];

for (const example of examples) {
  console.log("\n===", example, "===");
  console.log("isURL:", isURL(example));
}
