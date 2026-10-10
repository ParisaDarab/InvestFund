/**
 * Startup use cases (docs/DOMAIN_RULES.md §1): drafting, milestones, publication, archiving.
 *
 * - Only the owning founder can read or change a draft; everything is checked here, not in the
 *   router, and a foreign startup is reported as 404 (no existence leak).
 * - Funding rules (`checkFundingPlan`) run on every write. A published startup must stay
 *   publishable after an edit.
 * - Writes use optimistic concurrency: the client sends the `version` it read; a stale version
 *   is a 409 `version-conflict`.
 */
import {
  checkFundingPlan,
  DEFAULT_CURRENCY,
  type CreateStartupRequest,
  type OwnedStartup,
  type ReplaceMilestonesRequest,
  type RuleIssue,
  type UpdateStartupRequest,
} from '@investfund/shared';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../core/errors/domain-errors.js';
import { newId } from '../../core/ids/index.js';
import { recordAudit } from '../shared/audit.js';
import { bigintOrNull, dateOnly, toDate } from '../shared/serialize.js';

import { makeSlug } from './slug.js';
import {
  publicationIssuesOf,
  reportedFunding,
  startupInclude,
  toOwned,
  type StartupRow,
} from './startup.mapper.js';

import type { Prisma, PrismaClient } from '../../core/db/prisma.js';
import type { TransactionClient, UnitOfWork } from '../../core/db/unit-of-work.js';
import type { z } from 'zod';

type CreateInput = z.output<typeof CreateStartupRequest>;
type UpdateInput = z.output<typeof UpdateStartupRequest>;
type MilestonesInput = z.output<typeof ReplaceMilestonesRequest>;

const toProblemErrors = (issues: readonly RuleIssue[]) =>
  issues.map((issue) => ({ path: `body.${issue.path}`, code: issue.code, message: issue.message }));

const PLAIN_FIELDS = [
  'name',
  'tagline',
  'description',
  'problem',
  'solution',
  'sector',
  'stage',
  'country',
  'targetMarket',
  'productDescription',
  'businessModel',
  'teamDescription',
  'websiteUrl',
  'fundingPurposeText',
  'currency',
] as const;
const AMOUNT_FIELDS = ['targetAmountMinor', 'minAmountMinor', 'maxAmountMinor'] as const;

type FieldInput = { readonly [K in keyof CreateInput]?: CreateInput[K] | undefined };

/** Converts request fields to column values; `undefined` means "leave unchanged". */
function toColumns(input: FieldInput): Prisma.StartupUncheckedUpdateInput {
  const out: Record<string, unknown> = {};
  for (const key of PLAIN_FIELDS) if (input[key] !== undefined) out[key] = input[key];
  for (const key of AMOUNT_FIELDS)
    if (input[key] !== undefined) out[key] = bigintOrNull(input[key]);
  if (input.fundingPurposes !== undefined)
    out.fundingPurposes = [...new Set(input.fundingPurposes)];
  if (input.fundingDeadline !== undefined) out.fundingDeadline = toDate(input.fundingDeadline);
  return out;
}

export class StartupService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uow: UnitOfWork,
  ) {}

  async listMine(founderId: string): Promise<OwnedStartup[]> {
    const rows = await this.prisma.startup.findMany({
      where: { founderId },
      include: startupInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const funded = await reportedFunding(
      this.prisma,
      rows.map((r) => r.id),
    );
    return rows.map((row) => toOwned(row, funded.get(row.id) ?? 0n));
  }

  async getOwned(founderId: string, startupId: string): Promise<OwnedStartup> {
    const row = await this.loadOwned(this.prisma, founderId, startupId);
    const funded = await reportedFunding(this.prisma, [row.id]);
    return toOwned(row, funded.get(row.id) ?? 0n);
  }

  async create(founderId: string, input: CreateInput): Promise<OwnedStartup> {
    const profile = await this.prisma.founderProfile.findUnique({ where: { userId: founderId } });
    if (profile === null) {
      throw new BusinessRuleError('Complete your founder profile before creating a startup.');
    }
    const columns = toColumns(input);
    const currency = input.currency ?? DEFAULT_CURRENCY;
    this.assertFunding(
      {
        currency,
        targetAmountMinor: bigintOrNull(input.targetAmountMinor),
        minAmountMinor: bigintOrNull(input.minAmountMinor),
        maxAmountMinor: bigintOrNull(input.maxAmountMinor),
        fundingDeadline: input.fundingDeadline ?? null,
        milestones: [],
      },
      false,
    );

    const id = newId();
    await this.uow.run(async (tx) => {
      await tx.startup.create({
        data: {
          ...(columns as Prisma.StartupUncheckedCreateInput),
          id,
          founderId,
          name: input.name,
          slug: makeSlug(input.name),
          currency,
        },
      });
      await recordAudit(tx, {
        actorId: founderId,
        action: 'startup.created',
        entityType: 'startup',
        entityId: id,
      });
    });
    return this.getOwned(founderId, id);
  }

  async update(founderId: string, startupId: string, input: UpdateInput): Promise<OwnedStartup> {
    await this.uow.run(async (tx) => {
      const current = await this.loadOwned(tx, founderId, startupId);
      this.assertVersion(current, input.version);
      if (current.status === 'archived') {
        throw new ConflictError('Restore the startup before editing it.', {
          slug: 'invalid-state',
        });
      }
      const columns = toColumns(input);
      const merged = { ...current, ...columns } as unknown as StartupRow;
      if (columns.currency !== undefined && columns.currency !== current.currency) {
        if (current.milestones.length > 0 || current.status === 'published') {
          throw new BusinessRuleError(
            'The currency cannot change once milestones exist or the startup is published.',
          );
        }
      }
      this.assertFunding(
        {
          currency: merged.currency,
          targetAmountMinor: merged.targetAmountMinor,
          minAmountMinor: merged.minAmountMinor,
          maxAmountMinor: merged.maxAmountMinor,
          fundingDeadline: dateOnly(merged.fundingDeadline),
          milestones: current.milestones,
        },
        false,
      );
      if (current.status === 'published') {
        const issues = publicationIssuesOf(merged);
        if (issues.length > 0) {
          throw new BusinessRuleError('A published startup must stay complete.', {
            errors: toProblemErrors(issues),
          });
        }
      }
      await this.bumpVersion(tx, current, columns);
    });
    return this.getOwned(founderId, startupId);
  }

  async replaceMilestones(
    founderId: string,
    startupId: string,
    input: MilestonesInput,
  ): Promise<OwnedStartup> {
    await this.uow.run(async (tx) => {
      const current = await this.loadOwned(tx, founderId, startupId);
      this.assertVersion(current, input.version);
      if (current.status === 'archived') {
        throw new ConflictError('Restore the startup before editing it.', {
          slug: 'invalid-state',
        });
      }
      const existingIds = new Set(current.milestones.map((m) => m.id));
      for (const milestone of input.milestones) {
        if (milestone.id !== undefined && !existingIds.has(milestone.id)) {
          throw new NotFoundError('A milestone in the list does not belong to this startup.');
        }
      }
      const planned = input.milestones.map((m) => ({
        targetAmountMinor: BigInt(m.targetAmountMinor),
        currency: current.currency,
      }));
      this.assertFunding(
        {
          currency: current.currency,
          targetAmountMinor: current.targetAmountMinor,
          minAmountMinor: current.minAmountMinor,
          maxAmountMinor: current.maxAmountMinor,
          fundingDeadline: dateOnly(current.fundingDeadline),
          milestones: planned,
        },
        current.status === 'published',
      );

      const keep = new Set(input.milestones.flatMap((m) => (m.id === undefined ? [] : [m.id])));
      const removed = [...existingIds].filter((id) => !keep.has(id));
      if (removed.length > 0) {
        const referenced = await tx.offerMilestone.count({
          where: { milestoneId: { in: removed } },
        });
        if (referenced > 0) {
          throw new ConflictError(
            'A milestone referenced by a funding proposal cannot be removed.',
            { slug: 'invalid-state' },
          );
        }
        await tx.startupMilestone.deleteMany({ where: { id: { in: removed } } });
      }
      for (const [position, milestone] of input.milestones.entries()) {
        const data = {
          position,
          title: milestone.title,
          description: milestone.description,
          targetAmountMinor: BigInt(milestone.targetAmountMinor),
          currency: current.currency,
          targetDate: toDate(milestone.targetDate),
        };
        if (milestone.id === undefined) {
          await tx.startupMilestone.create({ data: { ...data, id: newId(), startupId } });
        } else {
          await tx.startupMilestone.update({ where: { id: milestone.id }, data });
        }
      }
      await this.bumpVersion(tx, current, {});
    });
    return this.getOwned(founderId, startupId);
  }

  async publish(founderId: string, startupId: string, version: number): Promise<OwnedStartup> {
    await this.uow.run(async (tx) => {
      const current = await this.loadOwned(tx, founderId, startupId);
      this.assertVersion(current, version);
      if (current.status === 'published') return;
      if (current.status === 'archived') {
        throw new ConflictError('Restore the startup before publishing it.', {
          slug: 'invalid-state',
        });
      }
      const issues = publicationIssuesOf(current);
      if (issues.length > 0) {
        throw new BusinessRuleError('The startup is not ready to publish.', {
          errors: toProblemErrors(issues),
        });
      }
      await this.bumpVersion(tx, current, {
        status: 'published',
        publishedAt: current.publishedAt ?? new Date(),
      });
      await recordAudit(tx, {
        actorId: founderId,
        action: 'startup.published',
        entityType: 'startup',
        entityId: startupId,
      });
    });
    return this.getOwned(founderId, startupId);
  }

  /** `unpublish`: published → draft. `archive`: any → archived. `restore`: archived → draft. */
  async changeStatus(
    founderId: string,
    startupId: string,
    version: number,
    action: 'unpublish' | 'archive' | 'restore',
  ): Promise<OwnedStartup> {
    await this.uow.run(async (tx) => {
      const current = await this.loadOwned(tx, founderId, startupId);
      this.assertVersion(current, version);
      const allowed =
        (action === 'unpublish' && current.status === 'published') ||
        (action === 'archive' && current.status !== 'archived') ||
        (action === 'restore' && current.status === 'archived');
      if (!allowed) {
        throw new ConflictError(`Cannot ${action} a ${current.status} startup.`, {
          slug: 'invalid-state',
        });
      }
      await this.bumpVersion(tx, current, {
        status: action === 'archive' ? 'archived' : 'draft',
        archivedAt: action === 'archive' ? new Date() : null,
      });
      await recordAudit(tx, {
        actorId: founderId,
        action: `startup.${action}`,
        entityType: 'startup',
        entityId: startupId,
      });
    });
    return this.getOwned(founderId, startupId);
  }

  private async loadOwned(
    db: TransactionClient | PrismaClient,
    founderId: string,
    startupId: string,
  ): Promise<StartupRow> {
    const row = await db.startup.findUnique({ where: { id: startupId }, include: startupInclude });
    if (row?.founderId !== founderId) {
      throw new NotFoundError('The startup was not found.');
    }
    return row;
  }

  private assertVersion(row: StartupRow, version: number): void {
    if (row.version !== version) {
      throw new ConflictError('The startup changed since you loaded it. Reload and try again.', {
        slug: 'version-conflict',
      });
    }
  }

  private assertFunding(
    plan: Parameters<typeof checkFundingPlan>[0],
    requireComplete: boolean,
  ): void {
    const issues = checkFundingPlan(plan, { requireComplete });
    if (issues.length > 0) {
      throw new BusinessRuleError('The funding plan breaks a rule.', {
        errors: toProblemErrors(issues),
      });
    }
  }

  private async bumpVersion(
    tx: TransactionClient,
    current: StartupRow,
    data: Prisma.StartupUncheckedUpdateManyInput,
  ): Promise<void> {
    const { count } = await tx.startup.updateMany({
      where: { id: current.id, version: current.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError('The startup changed since you loaded it. Reload and try again.', {
        slug: 'version-conflict',
      });
    }
  }
}
