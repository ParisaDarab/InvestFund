/**
 * Minimal finite-state-machine helper used by the connection, offer and deal workflows
 * (docs/DOMAIN_RULES.md §2-§4). Each machine is a table: `status → action → { to, actors }`.
 * The API is authoritative; the web app uses the same tables to decide which actions to show.
 */

export interface TransitionRule<Status extends string, Actor extends string> {
  readonly to: Status;
  /** Who may perform the action from this status. */
  readonly actors: readonly Actor[];
}

export type TransitionTable<
  Status extends string,
  Action extends string,
  Actor extends string,
> = Readonly<Record<Status, Partial<Readonly<Record<Action, TransitionRule<Status, Actor>>>>>>;

export type TransitionResult<Status extends string> =
  | { readonly ok: true; readonly to: Status }
  | { readonly ok: false; readonly reason: 'invalid_transition' | 'not_allowed' };

export function transition<Status extends string, Action extends string, Actor extends string>(
  table: TransitionTable<Status, Action, Actor>,
  from: Status,
  action: Action,
  actor: Actor,
): TransitionResult<Status> {
  const rule = table[from][action];
  if (rule === undefined) return { ok: false, reason: 'invalid_transition' };
  if (!rule.actors.includes(actor)) return { ok: false, reason: 'not_allowed' };
  return { ok: true, to: rule.to };
}

/** Actions `actor` may perform from `from`. */
export function availableActions<
  Status extends string,
  Action extends string,
  Actor extends string,
>(table: TransitionTable<Status, Action, Actor>, from: Status, actor: Actor): Action[] {
  const rules = table[from] as Partial<Record<Action, TransitionRule<Status, Actor>>>;
  return (Object.keys(rules) as Action[]).filter((action) => rules[action]?.actors.includes(actor));
}
