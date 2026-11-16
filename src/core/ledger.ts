/** Where money comes from, in the order the finances screen lists it. */
export const INCOME_LINES = ['tickets', 'merchandise', 'sponsorship', 'playoffGate', 'milestones', 'sales', 'gearSold'] as const;
/** Where it goes. */
export const EXPENSE_LINES = ['salaries', 'staff', 'upkeep', 'mascot', 'travel', 'construction', 'gearWork'] as const;

export type IncomeLine = (typeof INCOME_LINES)[number];
export type ExpenseLine = (typeof EXPENSE_LINES)[number];
export type Line = IncomeLine | ExpenseLine;

/** One season's money, by line. Every amount is positive; expenses are what was paid. */
export type Ledger = Record<Line, number>;

export const LINE_NAMES: Record<Line, string> = {
  tickets: 'Ticket sales',
  merchandise: 'Merchandise',
  sponsorship: 'Sponsorships',
  playoffGate: 'Playoff gates',
  milestones: 'Milestone bonuses',
  sales: 'Contracts sold',
  gearSold: 'Gear sold',
  salaries: 'Player salaries',
  staff: 'Staff salaries',
  upkeep: 'Facility upkeep',
  mascot: 'Mascot',
  travel: 'Travel',
  construction: 'Building and costumes',
  gearWork: 'Gear levels',
};

/** A finished season's books, kept for the finances screen and the long-term record. */
export interface SeasonBooks {
  season: number;
  ledger: Ledger;
  cashEnd: number;
  valueEnd: number;
  wins: number;
  champion: boolean;
}

export function newLedger(): Ledger {
  return { tickets: 0, merchandise: 0, sponsorship: 0, playoffGate: 0, milestones: 0, sales: 0, gearSold: 0, salaries: 0, staff: 0, upkeep: 0, mascot: 0, travel: 0, construction: 0, gearWork: 0 };
}

const isIncome = (line: Line): line is IncomeLine => (INCOME_LINES as readonly string[]).includes(line);

/** Books an amount of money on a line: income raises cash, an expense lowers it. This is the only way cash moves. */
export function book(f: { cash: number; ledger: Ledger }, line: Line, amount: number): void {
  const whole = Math.round(amount);
  if (whole === 0) return;
  f.ledger[line] += whole;
  f.cash += isIncome(line) ? whole : -whole;
}

export function totals(ledger: Ledger): { income: number; expenses: number; profit: number } {
  const income = INCOME_LINES.reduce((sum, line) => sum + ledger[line], 0);
  const expenses = EXPENSE_LINES.reduce((sum, line) => sum + ledger[line], 0);
  return { income, expenses, profit: income - expenses };
}
