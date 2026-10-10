/**
 * Integration-test harness for the domain modules: an isolated, migrated database per suite, the
 * full app (every module), a fake Google identity provider, a recording email sender, and helpers
 * to create users with profiles and sign access tokens for them.
 */
import { fileURLToPath } from 'node:url';

import request from 'supertest';

import { createTestDatabase, type TestDatabase } from '@investfund/test-utils/db';

import { createApp } from '../app.js';
import { JwtAccessTokenIssuer } from '../core/auth/access-token.js';
import { createContainer, type Container } from '../core/container.js';
import { newId } from '../core/ids/index.js';
import { MemoryRateLimitStore } from '../core/rateLimit/memory-store.js';
import { RecordingEmailSender } from '../modules/email/email-sender.js';

import { captureLogs, TEST_JWT_SECRET, testConfig, type LogCapture } from './support.js';

import type { ExternalIdentity, IdentityProvider } from '../modules/auth/google-provider.js';
import type { Express } from 'express';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Fake Google: the "code" is the email of a configured identity. */
export class FakeIdentityProvider implements IdentityProvider {
  readonly identities = new Map<string, ExternalIdentity>();
  lastChallenge: string | undefined;

  add(identity: Partial<ExternalIdentity> & { email: string }): ExternalIdentity {
    const full: ExternalIdentity = {
      sub: identity.sub ?? `sub-${identity.email}`,
      email: identity.email,
      emailVerified: identity.emailVerified ?? true,
      name: identity.name ?? identity.email.split('@')[0] ?? 'User',
      picture: identity.picture ?? null,
    };
    this.identities.set(full.email, full);
    return full;
  }

  authorizationUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
    this.lastChallenge = codeChallenge;
    return `https://accounts.example.test/auth?state=${encodeURIComponent(state)}`;
  }

  exchange(code: string): Promise<ExternalIdentity> {
    const identity = this.identities.get(code);
    if (identity === undefined) return Promise.reject(new Error('unknown code'));
    return Promise.resolve(identity);
  }
}

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly role: 'founder' | 'supporter' | 'admin' | null;
  readonly token: string;
  /** `Authorization` header value. */
  readonly auth: string;
}

export interface DomainHarness {
  readonly app: Express;
  readonly container: Container;
  readonly prisma: Container['prisma'];
  readonly logs: LogCapture;
  readonly identity: FakeIdentityProvider;
  readonly emails: RecordingEmailSender;
  createUser(options?: {
    role?: 'founder' | 'supporter' | 'admin' | null;
    email?: string;
    profile?: boolean;
    supporterPrefs?: Partial<{
      sectors: string[];
      stages: string[];
      purposes: string[];
      countries: string[];
      fundingMinMinor: bigint | null;
      fundingMaxMinor: bigint | null;
      currency: string;
    }>;
  }): Promise<TestUser>;
  /** Clears in-memory rate-limit counters between tests. */
  resetRateLimits(): void;
  close(): Promise<void>;
}

let counter = 0;

export async function startDomainHarness(
  prefix: string,
  env: Record<string, string> = {},
): Promise<DomainHarness> {
  const db: TestDatabase = await createTestDatabase({ prismaProjectDir: API_ROOT, prefix });
  const logs = captureLogs();
  const identity = new FakeIdentityProvider();
  const emails = new RecordingEmailSender();
  const container = createContainer(testConfig({ DATABASE_URL: db.url, ...env }), {
    logDestination: logs.stream,
    identityProvider: identity,
    emailSender: emails,
  });
  const app = createApp(container.appDeps());
  const issuer = new JwtAccessTokenIssuer(TEST_JWT_SECRET);
  const { prisma } = container;

  return {
    app,
    container,
    prisma,
    logs,
    identity,
    emails,
    async createUser(options = {}) {
      counter += 1;
      const role = options.role === undefined ? 'supporter' : options.role;
      const id = newId();
      const email = options.email ?? `user${String(counter)}-${id.slice(-6)}@example.test`;
      await prisma.user.create({
        data: {
          id,
          email,
          googleSub: `sub-${id}`,
          name: `User ${String(counter)}`,
          role,
          onboardedAt: role === null ? null : new Date(),
        },
      });
      if (options.profile !== false && role === 'founder') {
        await prisma.founderProfile.create({
          data: { userId: id, displayName: `Founder ${String(counter)}` },
        });
      }
      if (options.profile !== false && role === 'supporter') {
        const prefs = options.supporterPrefs ?? {};
        await prisma.supporterProfile.create({
          data: {
            userId: id,
            displayName: `Supporter ${String(counter)}`,
            sectors: prefs.sectors ?? [],
            stages: prefs.stages ?? [],
            purposes: prefs.purposes ?? [],
            countries: prefs.countries ?? [],
            fundingMinMinor: prefs.fundingMinMinor ?? null,
            fundingMaxMinor: prefs.fundingMaxMinor ?? null,
            currency: prefs.currency ?? 'GBP',
          },
        });
      }
      const token = await issuer.issue({ id, role });
      return { id, email, role, token, auth: `Bearer ${token}` };
    },
    resetRateLimits() {
      const store = container.rateLimitStore;
      if (store instanceof MemoryRateLimitStore) store.clear();
    },
    async close() {
      for (const hook of container.closeHooks) await hook();
      await db.drop();
    },
  };
}

/** A complete, publishable startup body (amounts in pence). */
export function completeStartupBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Solar Schools',
    tagline: 'Solar kits for rural schools',
    description: 'We install low-cost solar kits so rural schools can run computers all day.',
    problem: 'Unreliable power',
    solution: 'Modular solar kits',
    sector: 'clean_energy',
    stage: 'prototype',
    country: 'GB',
    fundingPurposes: ['equipment', 'community_impact'],
    currency: 'GBP',
    targetAmountMinor: '5000000',
    minAmountMinor: '1000000',
    maxAmountMinor: '8000000',
    ...overrides,
  };
}

export const MILESTONES = [
  {
    title: 'Pilot in 3 schools',
    description: 'Install kits in three pilot schools.',
    targetAmountMinor: '2000000',
  },
  {
    title: 'Scale to 20 schools',
    description: 'Roll out after the pilot.',
    targetAmountMinor: '3000000',
  },
];

/** Creates and publishes a complete startup for `founder`; returns the owner view. */
export async function publishStartup(
  harness: DomainHarness,
  founder: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string; milestones: { id: string }[] }> {
  const created = await request(harness.app)
    .post('/api/v1/startups')
    .set('Authorization', founder.auth)
    .send(completeStartupBody(overrides));
  if (created.status !== 201) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const draft = created.body as { id: string; version: number };
  const withMilestones = await request(harness.app)
    .put(`/api/v1/startups/${draft.id}/milestones`)
    .set('Authorization', founder.auth)
    .send({ version: draft.version, milestones: MILESTONES });
  const published = await request(harness.app)
    .post(`/api/v1/startups/${draft.id}/publish`)
    .set('Authorization', founder.auth)
    .send({ version: (withMilestones.body as { version: number }).version });
  if (published.status !== 200)
    throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
  return published.body as { id: string; slug: string; milestones: { id: string }[] };
}

/** Supporter requests, founder accepts; returns the connection and conversation ids. */
export async function connect(
  harness: DomainHarness,
  supporter: TestUser,
  founder: TestUser,
  startupId: string,
): Promise<{ connectionId: string; conversationId: string }> {
  const requested = await request(harness.app)
    .post('/api/v1/connections')
    .set('Authorization', supporter.auth)
    .send({ startupId, message: 'Hello' });
  if (requested.status !== 201)
    throw new Error(`request failed: ${JSON.stringify(requested.body)}`);
  const connectionId = (requested.body as { id: string }).id;
  const accepted = await request(harness.app)
    .post(`/api/v1/connections/${connectionId}/actions`)
    .set('Authorization', founder.auth)
    .send({ action: 'accept' });
  return {
    connectionId,
    conversationId: (accepted.body as { conversationId: string }).conversationId,
  };
}
