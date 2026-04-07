import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    data: {
      walletBalance: 0.0,
      ryda_points: 0,
    },
  });
  console.log(`Successfully cleared walletBalance and ryda_points for ${result.count} users!`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
