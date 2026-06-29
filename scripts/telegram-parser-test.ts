import telegramAI from "@/lib/telegram-ai";
const { localExtract, parseDate, dueDate } = telegramAI;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("Assertion failed:", message);
    process.exit(1);
  }
}

const tests = [
  {
    name: "reminder extraction",
    fn: () => {
      const result = localExtract("Remind me to pay my OpenAI bill on June 30 at 5pm");
      assert(result?.hasEntities === true, "expected reminder extraction to succeed");
      assert(result?.reminders?.length === 1, "expected one reminder");
      assert(result!.reminders[0].title.toLowerCase().includes("pay my openai bill"), "expected reminder title to include bill text");
      assert(result!.reminders[0].datetime?.includes("T17:00:00"), `expected time 17:00 got ${result!.reminders[0].datetime}`);
    },
  },
  {
    name: "date parsing for numeric date",
    fn: () => {
      const result = parseDate("Pay rent on 15/07 at 9am");
      assert(result.includes("T09:00:00"), `expected 09:00 but got ${result}`);
      assert(result.includes("-07-15"), `expected month-day 07-15 but got ${result}`);
    },
  },
  {
    name: "due date parsing",
    fn: () => {
      const result = dueDate("Complete report by tomorrow");
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const expected = tomorrow.toISOString().split("T")[0];
      assert(result === expected, `expected ${expected} but got ${result}`);
    },
  },
];

for (const test of tests) {
  process.stdout.write(`Running ${test.name}... `);
  test.fn();
  console.log("OK");
}

console.log("All parser tests passed.");
