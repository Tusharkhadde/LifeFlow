import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_USER_ID = "demo-user";

async function main() {
  console.log("Seeding database...");

  const user = await prisma.user.upsert({
    where: { email: "demo@lifeflow.ai" },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: "demo@lifeflow.ai",
      name: "Demo User",
      language: "en",
    },
  });

  console.log(`User: ${user.name} (${user.id})`);

  // Clear existing data
  await prisma.insight.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.reminder.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.goal.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.expense.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.document.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.task.deleteMany({ where: { userId: DEMO_USER_ID } });

  const now = new Date();
  const day = (n: number) => new Date(now.getTime() + n * 86400000);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const taskData = [
    { title: "Pay electricity bill", description: "MSEDCL bill for May 2026", category: "bill", urgency: "high", dueDate: day(2) },
    { title: "Renew car insurance", description: "Policy expires next month", category: "insurance", urgency: "high", dueDate: day(15) },
    { title: "Submit assignment", description: "CS301 - Data Structures", category: "education", urgency: "medium", dueDate: day(5) },
    { title: "Doctor appointment", description: "Annual health checkup", category: "health", urgency: "medium", dueDate: day(7) },
    { title: "Netflix subscription renewal", description: "₹649/month plan", category: "subscription", urgency: "low", dueDate: day(10) },
  ];
  for (const t of taskData) {
    await prisma.task.create({ data: { userId: DEMO_USER_ID, ...t } });
  }
  console.log(`Created ${taskData.length} tasks`);

  const expenseData = [
    { amount: 450, category: "food", description: "Swiggy order", date: daysAgo(1) },
    { amount: 2800, category: "utilities", description: "Electricity bill - April", date: daysAgo(5) },
    { amount: 1200, category: "subscriptions", description: "Netflix monthly", date: daysAgo(10) },
    { amount: 350, category: "transport", description: "Uber rides", date: daysAgo(3) },
    { amount: 890, category: "food", description: "Zomato orders", date: daysAgo(2) },
    { amount: 1500, category: "shopping", description: "Amazon - headphones", date: daysAgo(7) },
    { amount: 2100, category: "utilities", description: "Electricity bill - March", date: daysAgo(35) },
    { amount: 1200, category: "subscriptions", description: "Netflix - March", date: daysAgo(40) },
  ];
  for (const e of expenseData) {
    await prisma.expense.create({ data: { userId: DEMO_USER_ID, ...e, source: "manual" } });
  }
  console.log(`Created ${expenseData.length} expenses`);

  const goalData = [
    { title: "Read 12 books this year", description: "Mix of fiction and non-fiction", category: "education", target: 12, current: 5, unit: "books", deadline: new Date("2026-12-31") },
    { title: "Exercise 3x/week", description: "Gym or home workout", category: "health", target: 12, current: 8, unit: "sessions", deadline: new Date("2026-12-31") },
    { title: "Save ₹50,000", description: "Emergency fund", category: "finance", target: 50000, current: 22000, unit: "₹", deadline: new Date("2026-12-31") },
  ];
  for (const g of goalData) {
    await prisma.goal.create({ data: { userId: DEMO_USER_ID, ...g } });
  }
  console.log(`Created ${goalData.length} goals`);

  const reminderData = [
    { title: "Collect calculator before college", description: "Keep in bag tonight", datetime: day(1), category: "general", recurrence: null },
    { title: "Pay rent", description: "Monthly rent to landlord", datetime: day(3), category: "bill", recurrence: "monthly" },
  ];
  for (const r of reminderData) {
    await prisma.reminder.create({ data: { userId: DEMO_USER_ID, ...r } });
  }
  console.log(`Created ${reminderData.length} reminders`);

  const insightData = [
    { type: "budget", title: "Electricity bill increased 32%", description: "Your April bill (₹2,800) is 32% higher than March (₹2,100). Consider checking appliances.", severity: "warning" },
    { type: "subscription", title: "Potential duplicate subscription", description: "You have Netflix and another streaming service. Consider if both are needed.", severity: "info" },
    { type: "expiry", title: "Car insurance expires in 15 days", description: "Renew before June 3 to avoid lapse in coverage.", severity: "critical" },
    { type: "budget", title: "Food delivery spending up 40%", description: "This month's food delivery (₹1,340) is 40% higher than last month. Try cooking more.", severity: "warning" },
  ];
  for (const i of insightData) {
    await prisma.insight.create({ data: { userId: DEMO_USER_ID, ...i } });
  }
  console.log(`Created ${insightData.length} insights`);

  console.log("Seeding complete!");
  console.log("Note: Seed data is tied to 'demo-user' id. Sign in via Clerk to see your own data (starts empty).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
