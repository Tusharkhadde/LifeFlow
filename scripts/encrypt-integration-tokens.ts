import { PrismaClient } from "@prisma/client";
import { encryptSecret, isEncryptedSecret } from "../src/lib/secrets";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required");
  }
  const integrations = await prisma.integration.findMany();
  let updated = 0;
  for (const integration of integrations) {
    if (
      isEncryptedSecret(integration.accessToken) &&
      (!integration.refreshToken || isEncryptedSecret(integration.refreshToken))
    ) {
      continue;
    }
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: encryptSecret(integration.accessToken) || "",
        refreshToken: encryptSecret(integration.refreshToken),
      },
    });
    updated++;
  }
  console.log(`Encrypted ${updated} integration credential record(s).`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
