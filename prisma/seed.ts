import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding AI Second Brain database...");

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@lifeflow.ai" },
    update: {},
    create: {
      id: "demo-user",
      email: "demo@lifeflow.ai",
      name: "Demo User",
      username: "demouser",
      language: "en",
    },
  });

  // Seed sample knowledge items
  await prisma.knowledgeItem.createMany({
    data: [
      {
        userId: demoUser.id,
        title: "shadcn/ui - Beautifully Designed Components",
        summary: "Accessible and customizable components that you can copy and paste into your apps. Built with Radix UI and Tailwind CSS.",
        aiMemory: "shadcn/ui is a React component library for website building built with Tailwind CSS.",
        type: "link",
        sourceUrl: "https://ui.shadcn.com",
        favicon: "https://ui.shadcn.com/favicon.ico",
        category: "Development",
        tags: ["react", "ui", "components", "website-building"],
        favorite: true,
      },
      {
        userId: demoUser.id,
        title: "Tailwind CSS - Rapidly Build Modern Websites",
        summary: "A utility-first CSS framework packed with classes that can be composed to build any design, directly in your markup.",
        aiMemory: "Tailwind CSS is a utility-first CSS framework for website building and styling.",
        type: "link",
        sourceUrl: "https://tailwindcss.com",
        favicon: "https://tailwindcss.com/favicon.ico",
        category: "Design",
        tags: ["css", "styling", "website-building"],
        favorite: true,
      },
    ],
  });

  console.log("Database seeded successfully! ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
