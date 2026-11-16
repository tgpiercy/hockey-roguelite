import type { ComponentChildren } from 'preact';
import { seasonEndBills, starCount } from '../../core/economy';
import { build, buildCost, FACILITIES, facilityLevel, facilityUpkeep, MAX_FACILITY_LEVEL, freeBuilds } from '../../core/facilities';
import { EXPENSE_LINES, INCOME_LINES, LINE_NAMES, totals, type Ledger } from '../../core/ledger';
import { costumeCost, dropInChance, mascotPower, mascotRating, talentInfo, upgradeCostume, userMascot } from '../../core/mascot';
import { prestige } from '../../core/prestige';
import { gradePower, hire, kindName, letGo, roleOf, slotsFor, STAFF_KINDS, staffOfKind, staffSalePrice } from '../../core/staff';
import { travel } from '../../core/season';
import { trade } from '../../core/trades';
import mascotRules from '../../data/mascot.json';
import { BarRow, LineChart, sharesOf } from '../Charts';
import { FacilityCard, MascotPanel, OpenDesk, StaffCard, TalentBadge } from '../screens/club';
import { Menu, type MenuItem } from '../Menu';
import { Grade, money } from '../parts';
import type { AppCtx } from '../App';
import { count } from './shared';

/** The club: money, staff, facilities and the mascot. */
export function clubPages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, message, f, league, season, locked, screenKey, go, after, home,
    top, tile, cashLine,
  } = app;

  // ---------------------------------------------------------------- the club: money, staff, facilities, mascot

  if (screen.name === 'finances') {
    const bills = seasonEndBills(f);
    const last = f.books[f.books.length - 1];
    const statement = (ledger: Ledger, title: string): MenuItem[] => {
      const t = totals(ledger);
      const lines = [...INCOME_LINES.filter((l) => ledger[l] !== 0), ...EXPENSE_LINES.filter((l) => ledger[l] !== 0)];
      const shares = sharesOf(lines.map((l) => ledger[l]));
      const isIncome = (l: string): boolean => (INCOME_LINES as readonly string[]).includes(l);
      return [
        { key: `${title}-head`, disabled: true, label: <span class="ledger-head">{title}</span> },
        ...lines.map(
          (l, i): MenuItem => ({
            key: `${title}-${l}`,
            disabled: true,
            label: <BarRow name={LINE_NAMES[l]} share={shares[i] ?? 0} tone={isIncome(l) ? 'in' : 'out'} figure={`${isIncome(l) ? '+' : '−'}${money(ledger[l])}`} />,
          }),
        ),
        {
          key: `${title}-net`,
          disabled: true,
          label: <BarRow name={t.profit >= 0 ? 'Profit' : 'Loss'} share={0} tone="net" figure={`${t.profit >= 0 ? '+' : '−'}${money(Math.abs(t.profit))}`} />,
        },
      ];
    };
    const due = bills.salaries + bills.staff + bills.upkeep + bills.mascot;
    return (
      <Menu
        key={screenKey}
        title="Finances"
        message={message}
        header={
          <>
            {cashLine}
            {f.books.length > 0 && (
              <LineChart
                labels={f.books.map((b) => `season ${b.season}`)}
                format={money}
                series={[
                  { name: 'Cash', values: f.books.map((b) => b.cashEnd), colour: 'var(--accent)' },
                  { name: 'Value', values: f.books.map((b) => b.valueEnd), colour: 'var(--good)' },
                ]}
              />
            )}
            <div class="due">
              <i>Due at season end</i>
              <span>
                Players {money(bills.salaries)} · staff {money(bills.staff)} · upkeep {money(bills.upkeep)} · mascot {money(bills.mascot)}
              </span>
              <span>
                Out <b class="down">{money(due)}</b> · sponsorship in <b class="up">{money(bills.sponsorship)}</b>
              </span>
            </div>
            <div class="note">
              Home games bring tickets, road games cost travel, every game sells merchandise ({starCount(f)} star player{starCount(f) === 1 ? '' : 's'}). The cap limits
              player pay; cash pays for everything.
            </div>
          </>
        }
        onBack={home}
        help="B back"
        items={[
          ...statement(f.ledger, locked ? `Season ${league.season} so far` : 'This off-season so far'),
          ...(last ? statement(last.ledger, `Season ${last.season}: ${last.wins} wins${last.champion ? ', champions' : ''}`) : []),
        ]}
      />
    );
  }

  if (screen.name === 'staff') {
    const items: MenuItem[] = STAFF_KINDS.flatMap((kind) => {
      const have = staffOfKind(f, kind);
      const empty = Math.max(0, slotsFor(kind) - have.length);
      return [
        ...have.map((member) => ({
          key: member.id,
          label: <StaffCard member={member} />,
          detail: roleOf(member).blurb,
          onSelect: () => go({ name: 'staffMember', staffId: member.id }),
        })),
        ...Array.from({ length: empty }, (_, i) => ({
          key: `${kind}-empty-${i}`,
          label: <OpenDesk job={kindName(kind)} />,
          detail: 'Nobody is doing this job. Hire someone from the pool.',
          onSelect: () => go({ name: 'hire' }),
        })),
      ];
    });
    return (
      <Menu
        key={screenKey}
        remember="staff"
        columns={2}
        title="Staff"
        message={message}
        header={
          <>
            {cashLine}
            <div>Two trainers, a scout and a promoter. Staff are paid from cash at the end of each season and do not count against the cap.</div>
          </>
        }
        onBack={home}
        help="A open · left/right and up/down move · B back"
        items={[...items, tile('hire', 'Hire from the pool', `${f.staffPool.length} available`, () => go({ name: 'hire' }), { wide: true, icon: 'freeAgents', primary: true })]}
      />
    );
  }

  if (screen.name === 'hire') {
    const pool = [...f.staffPool].sort((a, b) => gradePower(b.grade) - gradePower(a.grade) || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        remember="hire"
        columns={2}
        title="Hire staff"
        message={message}
        header={
          <>
            {cashLine}
            <div>Grade D is one step, S is five: each step is worth what the line below says. A new pool arrives every off-season.</div>
          </>
        }
        onBack={() => go({ name: 'staff' })}
        help="A hire · left/right and up/down move · B back"
        items={pool.map((member) => {
          const kind = roleOf(member).kind;
          const full = staffOfKind(f, kind).length >= slotsFor(kind);
          return {
            key: member.id,
            label: <StaffCard member={member} note={full ? 'no free desk' : ''} />,
            detail: roleOf(member).blurb,
            onSelect: () => {
              const result = hire(f, member.id);
              after(result.ok ? { ok: true, message: `${member.name} hired for ${money(member.salary)} a season.` } : result);
            },
          };
        })}
      />
    );
  }

  if (screen.name === 'staffMember') {
    const member = f.staff.find((x) => x.id === screen.staffId);
    if (!member) return <Menu key={screenKey} title="Staff" header="He no longer works for you." onBack={() => go({ name: 'staff' })} items={[]} />;
    const price = staffSalePrice(f, member);
    return (
      <Menu
        key={screenKey}
        title={member.name}
        header={
          <>
            <StaffCard member={member} />
            <div>{roleOf(member).blurb}</div>
            <div class="note">
              {price > 0
                ? `Fire sale: selling his contract pays you ${money(price)}.`
                : 'Letting him go saves his salary from now on. It pays nothing, and he does not return to the pool.'}
            </div>
          </>
        }
        onBack={() => go({ name: 'staff' })}
        initialFocus={1}
        items={[
          tile('go', price > 0 ? 'Sell his contract' : 'Let him go', price > 0 ? `For ${money(price)}` : 'He leaves for good', () => {
            const result = letGo(f, member.id);
            after(result.ok ? { ok: true, message: `${member.name} has left.${result.paid > 0 ? ` You were paid ${money(result.paid)}.` : ''}` } : result, { name: 'staff' });
          }, { icon: 'trade' }),
          tile('keep', 'Keep him', 'Back to the staff', () => go({ name: 'staff' }), { icon: 'staff', primary: true }),
        ]}
      />
    );
  }

  if (screen.name === 'facilities') {
    return (
      <Menu
        key={screenKey}
        remember="facilities"
        columns={2}
        title="Facilities"
        message={message}
        header={
          <>
            {cashLine}
            <div>
              Each has {MAX_FACILITY_LEVEL} levels. Building is paid at once; every level costs upkeep each season (now {money(facilityUpkeep(f))}) and adds to
              your franchise value.
            </div>
          </>
        }
        onBack={home}
        help="A build the next level · left/right and up/down move · B back"
        items={FACILITIES.map((facility) => {
          const level = facilityLevel(f, facility.id);
          const cost = buildCost(level);
          return {
            key: facility.id,
            label: <FacilityCard id={facility.id} name={facility.name} level={level} maxLevel={MAX_FACILITY_LEVEL} cost={cost} affordable={cost !== null && (freeBuilds(f) > 0 || f.cash >= cost)} />,
            detail: freeBuilds(f) > 0 ? `${facility.description} You have ${freeBuilds(f)} free level${freeBuilds(f) === 1 ? '' : 's'} from prestige: the next one you build costs nothing.` : facility.description,
            disabled: cost === null || (freeBuilds(f) === 0 && f.cash < cost),
            onSelect: () => {
              const result = build(f, facility.id);
              after(result.ok ? { ok: true, message: `${facility.name} is now level ${level + 1}.` } : result);
            },
          };
        })}
      />
    );
  }

  if (screen.name === 'mascot') {
    const mine = userMascot(f);
    const cost = costumeCost(f);
    return (
      <Menu
        key={screenKey}
        title="Mascot"
        message={message}
        header={
          <MascotPanel name={f.mascot.name} power={mascotPower(f)} chance={dropInChance(f.mascot.misses ?? 0)} rating={mascotRating(mine.power)}>
            <div class="talents">
              {f.mascot.talents.slice(0, mascotRules.talentUnlockPower.length).map((id, i) => (
                <TalentBadge key={id} name={talentInfo(id).name} known={i < mine.talents.length} needs={mascotRules.talentUnlockPower[i] ?? 0} />
              ))}
            </div>
          </MascotPanel>
        }
        onBack={home}
        items={[
          tile('costume', cost === null ? 'Costume at the top level' : 'Upgrade his costume', cost === null ? `Level ${f.mascot.costume}` : `To level ${f.mascot.costume + 1} for ${money(cost)}`, () => {
            const result = upgradeCostume(f);
            after(result.ok ? { ok: true, message: `${f.mascot.name} has a new costume.` } : result);
          }, { icon: 'jersey', primary: true, disabled: cost === null || f.cash < cost, detail: `Each costume level is ${mascotRules.costume.powerPerLevel} mascot power.` }),
          // He learns as many talents as there are marks on the power meter, in his own order.
          ...f.mascot.talents.slice(0, mascotRules.talentUnlockPower.length).map((id, i): MenuItem => {
            const talent = talentInfo(id);
            const known = i < mine.talents.length;
            return tile(id, talent.name, known ? 'Knows it' : `At power ${mascotRules.talentUnlockPower[i]}`, () => undefined, { icon: known ? 'prestige' : 'detail', disabled: true, detail: talent.description });
          }),
        ]}
      />
    );
  }

  return undefined;
}
