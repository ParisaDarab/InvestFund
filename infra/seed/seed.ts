/**
 * Database seed (`pnpm seed`): idempotent, clearly synthetic demo data for local development and
 * demos. Never run against production (refused when NODE_ENV=production).
 *
 * Every seeded person uses an `@demo.investfund.test` address and a "(demo)" display name; every
 * startup description ends with a synthetic-data notice. Re-running adds nothing new.
 *
 * Optional:
 * - `SEED_ADMIN_EMAIL=<email>`: also grants `admin` to that (existing or new) account. Explicit
 *   development configuration only.
 * - `MOCK_GOOGLE_URL=http://localhost:4020`: registers the demo users in infra/mocks/google with
 *   matching `sub` values, so you can sign in as them (`/login?as=<email>` in development).
 */
import { ConfigError, loadConfig } from '../../apps/api/src/core/config/config.js';
import { createPrismaClient, type PrismaClient } from '../../apps/api/src/core/db/prisma.js';
import { newId } from '../../apps/api/src/core/ids/index.js';
import { createLogger } from '../../apps/api/src/core/logger/logger.js';
import { PENDING_SUB_PREFIX } from '../../apps/api/src/modules/auth/auth.service.js';
import { checkFundingPlan } from '../../packages/shared/src/domain/funding-rules.js';

const DOMAIN = 'demo.investfund.test';
const NOTICE = '\n\nSynthetic demo data: this organisation does not exist.';

interface DemoUser {
  key: string;
  name: string;
  role: 'founder' | 'supporter';
  profile: Record<string, unknown>;
}

const USERS: DemoUser[] = [
  {
    key: 'fay',
    name: 'Fay Okafor (demo)',
    role: 'founder',
    profile: {
      headline: 'Electrical engineer building solar kits',
      country: 'GB',
      bio: 'Former grid engineer. Synthetic demo profile.',
    },
  },
  {
    key: 'raj',
    name: 'Raj Patel (demo)',
    role: 'founder',
    profile: {
      headline: 'Learning scientist',
      country: 'GB',
      bio: 'Builds reading tools for children. Synthetic demo profile.',
    },
  },
  {
    key: 'lena',
    name: 'Lena Fischer (demo)',
    role: 'founder',
    profile: {
      headline: 'Biomedical engineer',
      country: 'DE',
      bio: 'Low-cost diagnostics. Synthetic demo profile.',
    },
  },
  {
    key: 'tom',
    name: 'Tom Hughes (demo)',
    role: 'founder',
    profile: {
      headline: 'Open-source maintainer',
      country: 'IE',
      bio: 'Developer tools for charities. Synthetic demo profile.',
    },
  },
  {
    key: 'sam',
    name: 'Sam Rivers (demo)',
    role: 'supporter',
    profile: {
      bio: 'I support clean-energy and education projects in the UK. Synthetic demo profile.',
      sectors: ['clean_energy', 'edtech', 'climate_tech'],
      stages: ['prototype', 'mvp'],
      purposes: ['equipment', 'community_impact', 'education_training'],
      countries: ['GB', 'IE'],
      fundingMinMinor: 500_000n,
      fundingMaxMinor: 5_000_000n,
      currency: 'GBP',
    },
  },
  {
    key: 'mia',
    name: 'Mia Chen (demo)',
    role: 'supporter',
    profile: {
      bio: 'Angel donor for healthtech and open source. Synthetic demo profile.',
      sectors: ['healthtech', 'developer_tools', 'social_impact'],
      stages: ['idea', 'prototype'],
      purposes: ['research', 'product_development'],
      countries: [],
      fundingMinMinor: 100_000n,
      fundingMaxMinor: 2_000_000n,
      currency: 'GBP',
    },
  },
  {
    key: 'omar',
    name: 'Omar Haddad (demo)',
    role: 'supporter',
    profile: {
      bio: 'Small grants for early teams. Synthetic demo profile.',
      sectors: [],
      stages: [],
      purposes: [],
      countries: ['GB'],
      fundingMinMinor: null,
      fundingMaxMinor: 1_000_000n,
      currency: 'GBP',
    },
  },
];

interface DemoStartup {
  key: string;
  founder: string;
  data: Record<string, unknown> & {
    name: string;
    currency: string;
    targetAmountMinor: bigint;
    minAmountMinor: bigint;
    maxAmountMinor: bigint;
  };
  milestones: { title: string; description: string; targetAmountMinor: bigint }[];
}

const STARTUPS: DemoStartup[] = [
  {
    key: 'solar-schools-demo',
    founder: 'fay',
    data: {
      name: 'Solar Schools',
      tagline: 'Plug-and-play solar kits so rural schools keep the lights on',
      description: 'We design modular solar kits that schools can install in a day.',
      problem: 'Unreliable power interrupts lessons.',
      solution: 'Pre-wired kits with remote monitoring.',
      sector: 'clean_energy',
      stage: 'prototype',
      country: 'GB',
      targetMarket: 'UK rural schools',
      fundingPurposes: ['equipment', 'community_impact'],
      fundingPurposeText: 'Hardware for three pilot schools and an installer training day.',
      currency: 'GBP',
      targetAmountMinor: 4_000_000n,
      minAmountMinor: 1_000_000n,
      maxAmountMinor: 6_000_000n,
    },
    milestones: [
      {
        title: 'Pilot in three schools',
        description: 'Install and monitor kits for one term.',
        targetAmountMinor: 2_500_000n,
      },
      {
        title: 'Installer training',
        description: 'Train local electricians.',
        targetAmountMinor: 1_000_000n,
      },
    ],
  },
  {
    key: 'readright-demo',
    founder: 'raj',
    data: {
      name: 'ReadRight',
      tagline: 'Phonics practice that adapts to every child',
      description: 'A tablet app that listens to children read aloud and adapts practice.',
      problem: 'Teachers cannot hear every child read daily.',
      solution: 'On-device speech recognition with teacher dashboards.',
      sector: 'edtech',
      stage: 'mvp',
      country: 'GB',
      targetMarket: 'UK primary schools',
      fundingPurposes: ['product_development', 'education_training'],
      currency: 'GBP',
      targetAmountMinor: 2_000_000n,
      minAmountMinor: 500_000n,
      maxAmountMinor: 3_000_000n,
    },
    milestones: [
      {
        title: 'Classroom trial',
        description: 'Trial in ten classrooms with evaluation.',
        targetAmountMinor: 1_500_000n,
      },
    ],
  },
  {
    key: 'quickstrip-demo',
    founder: 'lena',
    data: {
      name: 'QuickStrip Diagnostics',
      tagline: 'Paper test strips for early infection screening',
      description: 'Low-cost paper diagnostics read with a phone camera.',
      sector: 'healthtech',
      stage: 'prototype',
      country: 'DE',
      fundingPurposes: ['research'],
      currency: 'EUR',
      targetAmountMinor: 1_500_000n,
      minAmountMinor: 500_000n,
      maxAmountMinor: 2_500_000n,
    },
    milestones: [
      {
        title: 'Lab validation',
        description: 'Validate sensitivity against reference tests.',
        targetAmountMinor: 1_200_000n,
      },
    ],
  },
  {
    key: 'charitykit-demo',
    founder: 'tom',
    data: {
      name: 'CharityKit',
      tagline: 'Open-source donor management for small charities',
      description: 'A free, self-hostable donor CRM maintained by volunteers.',
      sector: 'developer_tools',
      stage: 'mvp',
      country: 'IE',
      fundingPurposes: ['product_development', 'operations'],
      currency: 'GBP',
      targetAmountMinor: 800_000n,
      minAmountMinor: 200_000n,
      maxAmountMinor: 1_000_000n,
    },
    milestones: [
      {
        title: 'Accessibility audit',
        description: 'Fix every WCAG 2.2 AA issue.',
        targetAmountMinor: 300_000n,
      },
    ],
  },
];

const email = (key: string) => `${key}@${DOMAIN}`;

async function upsertUser(prisma: PrismaClient, u: DemoUser): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: email(u.key) } });
  if (existing !== null) return existing.id;
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      email: email(u.key),
      googleSub: `demo-${u.key}`,
      name: u.name,
      role: u.role,
      onboardedAt: new Date(),
    },
  });
  if (u.role === 'founder') {
    await prisma.founderProfile.create({
      data: {
        userId: id,
        displayName: u.name,
        ...(u.profile as { headline: string; country: string; bio: string }),
      },
    });
  } else {
    await prisma.supporterProfile.create({
      data: { userId: id, displayName: u.name, ...(u.profile as object) } as never,
    });
  }
  return id;
}

async function upsertStartup(prisma: PrismaClient, s: DemoStartup, founderId: string) {
  const existing = await prisma.startup.findUnique({
    where: { slug: s.key },
    include: { milestones: true },
  });
  if (existing !== null) return existing;
  const issues = checkFundingPlan(
    {
      ...s.data,
      fundingDeadline: null,
      milestones: s.milestones.map((m) => ({ ...m, currency: s.data.currency })),
    },
    { requireComplete: true },
  );
  if (issues.length > 0)
    throw new Error(`seed startup ${s.key} breaks a rule: ${issues[0]?.message ?? ''}`);
  const id = newId();
  return prisma.startup.create({
    data: {
      ...(s.data as object),
      id,
      slug: s.key,
      founderId,
      description: `${String(s.data.description)}${NOTICE}`,
      status: 'published',
      publishedAt: new Date(),
      milestones: {
        create: s.milestones.map((m, position) => ({
          id: newId(),
          position,
          currency: s.data.currency,
          ...m,
        })),
      },
    } as never,
    include: { milestones: true },
  });
}

async function seedJourney(prisma: PrismaClient, ids: Record<string, string>, startupId: string) {
  const supporterId = ids.sam ?? '';
  const founderId = ids.fay ?? '';
  if ((await prisma.connection.count({ where: { startupId, supporterId } })) > 0) return;
  const connectionId = newId();
  const conversationId = newId();
  const t = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  await prisma.$transaction(async (tx) => {
    await tx.connection.create({
      data: {
        id: connectionId,
        startupId,
        supporterId,
        founderId,
        initiatorId: supporterId,
        status: 'accepted',
        message: 'I fund school energy projects (demo).',
        respondedAt: t(300),
        createdAt: t(320),
      },
    });
    await tx.conversation.create({
      data: {
        id: conversationId,
        connectionId,
        lastMessageAt: t(60),
        participants: {
          create: [
            { userId: supporterId, lastReadAt: t(60) },
            { userId: founderId, lastReadAt: t(120) },
          ],
        },
      },
    });
    const messages: [string, string, number][] = [
      [supporterId, 'Hello! What would a pilot in three schools cost? (demo)', 240],
      [founderId, 'About £25,000 including monitoring for one term. (demo)', 180],
      [supporterId, 'I can propose a grant for part of that. (demo)', 60],
    ];
    for (const [senderId, body, ago] of messages) {
      await tx.message.create({
        data: {
          id: newId(),
          conversationId,
          senderId,
          clientMessageId: newId(),
          body,
          createdAt: t(ago),
        },
      });
    }
    const dealId = newId();
    const first = newId();
    const counter = newId();
    await tx.deal.create({
      data: { id: dealId, connectionId, startupId, supporterId, founderId, createdAt: t(55) },
    });
    await tx.offer.create({
      data: {
        id: first,
        dealId,
        revision: 1,
        createdById: supporterId,
        recipientId: founderId,
        fundingType: 'grant',
        amountMinor: 1_500_000n,
        currency: 'GBP',
        purpose: 'Pilot hardware (demo)',
        conditions: 'Termly progress update',
        status: 'countered',
        respondedAt: t(30),
        respondedById: founderId,
        createdAt: t(55),
      },
    });
    await tx.offer.create({
      data: {
        id: counter,
        dealId,
        revision: 2,
        previousOfferId: first,
        createdById: founderId,
        recipientId: supporterId,
        fundingType: 'grant',
        amountMinor: 2_000_000n,
        currency: 'GBP',
        purpose: 'Pilot hardware and monitoring (demo)',
        conditions: 'Termly progress update',
        status: 'pending',
        createdAt: t(30),
      },
    });
    await tx.deal.update({ where: { id: dealId }, data: { currentOfferId: counter, version: 2 } });
    await tx.dealEvent.createMany({
      data: [
        {
          id: newId(),
          dealId,
          actorId: supporterId,
          type: 'offer_created',
          toStatus: 'negotiating',
          offerId: first,
          createdAt: t(55),
        },
        {
          id: newId(),
          dealId,
          actorId: founderId,
          type: 'offer_countered',
          fromStatus: 'negotiating',
          toStatus: 'negotiating',
          offerId: counter,
          createdAt: t(30),
        },
      ],
    });
    await tx.notification.create({
      data: {
        id: newId(),
        userId: supporterId,
        type: 'offer_countered',
        data: { startupName: 'Solar Schools', actorName: 'Fay Okafor (demo)' },
        link: `/app/deals/${dealId}`,
        dedupeKey: `seed:offer_countered:${dealId}`,
      },
    });
  });
}

async function registerWithMockGoogle(url: string): Promise<void> {
  const users = [
    ...USERS.map((u) => ({ email: email(u.key), name: u.name, sub: `demo-${u.key}` })),
  ];
  const response = await fetch(`${url.replace(/\/+$/, '')}/__seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users }),
  });
  if (!response.ok) throw new Error(`mock-google seed failed with ${String(response.status)}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.isProduction) throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  const logger = createLogger({ level: config.log.level, service: 'seed' });
  const prisma = createPrismaClient({ url: config.database.url, logger });
  try {
    const ids: Record<string, string> = {};
    for (const u of USERS) ids[u.key] = await upsertUser(prisma, u);
    const startups: Record<string, string> = {};
    for (const s of STARTUPS)
      startups[s.key] = (await upsertStartup(prisma, s, ids[s.founder] ?? '')).id;
    await seedJourney(prisma, ids, startups['solar-schools-demo'] ?? '');

    const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEmail !== undefined && adminEmail !== '') {
      const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (existing === null) {
        await prisma.user.create({
          data: {
            id: newId(),
            email: adminEmail,
            googleSub: `${PENDING_SUB_PREFIX}${newId()}`,
            name: 'Demo administrator',
            role: 'admin',
            onboardedAt: new Date(),
          },
        });
      } else {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
      }
      logger.info('seed: development admin role granted (SEED_ADMIN_EMAIL)');
    }
    const mock = process.env.MOCK_GOOGLE_URL;
    if (mock !== undefined && mock !== '') await registerWithMockGoogle(mock);
    logger.info(
      { users: USERS.length, startups: STARTUPS.length },
      'seed: synthetic demo data ready',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof ConfigError || !(error instanceof Error) ? String(error) : error.message;
  process.stderr.write(`seed: failed\n${message}\n`);
  process.exit(1);
});
