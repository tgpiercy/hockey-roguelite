import economy from '../data/economy.json';
import data from '../data/staff.json';
import { scaleModifiers, type Modifier } from '../sim/modifiers';
import { book } from './ledger';
import { createNameMaker } from './names';
import { createRng, type Rng } from './rng';
import type { MoveResult } from './roster';
import type { Franchise } from './season';

export type StaffKind = 'trainer' | 'scout' | 'promoter';

export interface StaffMember {
  id: string;
  name: string;
  /** Which job he does: a role id from staff.json, such as "shooting" or "promoter". */
  role: string;
  grade: string;
  /** Dollars a season, from operating cash. Staff do not count against the salary cap. */
  salary: number;
  contractYears: number;
}

export interface StaffRole {
  id: string;
  kind: StaffKind;
  title: string;
  blurb: string;
  weight: number;
  /** What one grade step gives, as modifiers per step. */
  perPower: Modifier[];
}

export const STAFF_ROLES = data.roles as StaffRole[];
export const STAFF_KINDS = Object.keys(data.slots) as StaffKind[];

export function roleOf(member: StaffMember): StaffRole {
  return (STAFF_ROLES.find((r) => r.id === member.role) ?? STAFF_ROLES[0]) as StaffRole;
}

export function kindName(kind: StaffKind): string {
  return data.kindNames[kind];
}

export function slotsFor(kind: StaffKind): number {
  return data.slots[kind];
}

/** How strong a grade is: D is 1 step, S is 5. */
export function gradePower(grade: string): number {
  return data.grades.find((g) => g.grade === grade)?.power ?? 0;
}

function weighted<T extends { weight: number }>(rng: Rng, items: readonly T[]): T {
  let roll = rng.next() * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1] as T;
}

/** The staff available to hire this off-season. The same seed and season always give the same people. */
export function generateStaffPool(seed: string, season: number, taken: Iterable<string> = []): StaffMember[] {
  const rng = createRng(`${seed}/staff/${season}`);
  const names = createNameMaker(rng.fork('names'), taken);
  const pool: StaffMember[] = [];
  for (let i = 0; i < data.poolSize; i++) {
    // The first few are one of each kind, so every job can always be filled.
    const kind = STAFF_KINDS[i];
    const role = weighted(rng, kind ? STAFF_ROLES.filter((r) => r.kind === kind) : STAFF_ROLES);
    const grade = weighted(rng, data.grades);
    pool.push({
      id: `s-${season}-${String(i + 1).padStart(2, '0')}`,
      name: names.player(),
      role: role.id,
      grade: grade.grade,
      salary: grade.salary,
      contractYears: rng.int(data.minContractYears, data.maxContractYears),
    });
  }
  return pool;
}

/** The people you employ in one kind of job. */
export function staffOfKind(f: Franchise, kind: StaffKind): StaffMember[] {
  return f.staff.filter((member) => roleOf(member).kind === kind);
}

export function staffSalaries(f: Franchise): number {
  return f.staff.reduce((sum, member) => sum + member.salary, 0);
}

/** The modifiers your staff give. */
export function staffModifiers(f: Franchise): Modifier[] {
  return f.staff.flatMap((member) => scaleModifiers(roleOf(member).perPower, gradePower(member.grade)));
}

/** Hires someone from the pool, if there is a free slot for his kind of job. His salary is paid at the end of each season. */
export function hire(f: Franchise, staffId: string): MoveResult {
  const member = f.staffPool.find((s) => s.id === staffId);
  if (!member) return { ok: false, reason: 'He is no longer available.' };
  const kind = roleOf(member).kind;
  const slots = slotsFor(kind);
  if (staffOfKind(f, kind).length >= slots) {
    return { ok: false, reason: `You can employ ${slots} ${kindName(kind).toLowerCase()}${slots === 1 ? '' : 's'}. Let one go first.` };
  }
  f.staffPool = f.staffPool.filter((s) => s.id !== staffId);
  f.staff.push(member);
  f.offseason.signed.push(member.id);
  return { ok: true };
}

/** What selling a staff contract pays during a fire sale. Nothing for someone hired this off-season. */
export function staffSalePrice(f: Franchise, member: StaffMember): number {
  if (f.cash >= 0 || f.season.phase !== 'offseason' || f.offseason.signed.includes(member.id)) return 0;
  return Math.round(member.salary * economy.fireSale.staffShare);
}

/** Lets a staff member go. With cash below zero his contract is sold, which pays half a season of his salary. */
export function letGo(f: Franchise, staffId: string): { ok: true; paid: number } | { ok: false; reason: string } {
  const member = f.staff.find((s) => s.id === staffId);
  if (!member) return { ok: false, reason: 'He does not work for you.' };
  const paid = staffSalePrice(f, member);
  f.staff = f.staff.filter((s) => s.id !== staffId);
  if (paid > 0) book(f, 'sales', paid);
  return { ok: true, paid };
}

/**
 * The end of a season for staff: contracts tick down, those that run out leave, and a new pool arrives.
 * Call it after the league's season number has moved on. Returns a line of news for each departure.
 */
export function tickStaff(f: Franchise): string[] {
  const news: string[] = [];
  for (const member of f.staff) member.contractYears -= 1;
  for (const member of f.staff.filter((s) => s.contractYears <= 0)) {
    news.push(`${member.name} (${roleOf(member).title.toLowerCase()}, grade ${member.grade}) has left: his contract ran out.`);
  }
  f.staff = f.staff.filter((s) => s.contractYears > 0);
  f.staffPool = generateStaffPool(
    f.league.seed,
    f.league.season,
    f.staff.map((s) => s.name),
  );
  return news;
}
