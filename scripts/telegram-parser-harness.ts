import telegramAI from "@/lib/telegram-ai";
const { localExtract, parseDate, dueDate } = telegramAI;

const examples = [
  "Remind me to pay my OpenAI bill on June 30 at 5pm",
  "open ai due bill remind me at specific date and time",
  "Remind me to file taxes tomorrow at 9am",
  "Don't forget to call mom next week",
  "Pay rent on 15/07",
  "Schedule a meeting on 2026-07-01 at 2pm",
  "Remind me to drink water every morning",
];

for (const example of examples) {
  console.log("\n===", example, "===");
  console.log("parseDate:", parseDate(example));
  console.log("dueDate:", dueDate(example));
  console.log("localExtract:", JSON.stringify(localExtract(example), null, 2));
}
