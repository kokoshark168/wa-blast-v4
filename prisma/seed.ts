import { PrismaClient, SubscriptionTier, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Seeds the subscription catalogue and a bootstrap admin account.
 * Idempotent: safe to run repeatedly (upserts by unique keys).
 *
 * Admin credentials are taken from env (ADMIN_EMAIL / ADMIN_PASSWORD) and
 * fall back to development defaults — CHANGE THESE in production.
 */
async function main() {
  const plans = [
    { tier: SubscriptionTier.FREE, name: 'Free', price: 0, maxWallets: 3, maxAlerts: 5, apiCallsPerDay: 200, features: ['Overview', 'Basic screener'] },
    { tier: SubscriptionTier.BASIC, name: 'Basic', price: 29, maxWallets: 10, maxAlerts: 25, apiCallsPerDay: 2000, features: ['Smart Money', 'Whale alerts', 'Sentiment'] },
    { tier: SubscriptionTier.PRO, name: 'Pro', price: 99, maxWallets: 50, maxAlerts: 150, apiCallsPerDay: 20000, features: ['All Basic', 'Hyperliquid', 'Alpha Score', 'Backtesting'] },
    { tier: SubscriptionTier.ELITE, name: 'Elite', price: 299, maxWallets: 500, maxAlerts: 1000, apiCallsPerDay: 200000, features: ['All Pro', 'AI Research', 'Priority alerts', 'API access'] },
  ];

  for (const plan of plans) {
    const existing = await prisma.subscription.findFirst({ where: { tier: plan.tier } });
    if (existing) {
      await prisma.subscription.update({ where: { id: existing.id }, data: plan });
    } else {
      await prisma.subscription.create({ data: plan });
    }
  }
  console.log(`Seeded ${plans.length} subscription plans`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@alphaflow.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN, subscriptionTier: SubscriptionTier.ELITE },
    create: {
      email: adminEmail,
      username: 'admin',
      passwordHash,
      role: UserRole.ADMIN,
      subscriptionTier: SubscriptionTier.ELITE,
      emailVerified: true,
    },
  });
  console.log(`Seeded admin user: ${admin.email} (set ADMIN_EMAIL/ADMIN_PASSWORD to override)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
