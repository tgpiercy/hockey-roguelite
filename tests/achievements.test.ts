import { describe, expect, it } from 'vitest';
import { achieved, ACHIEVEMENT_KINDS, ACHIEVEMENTS, charterOpen, earnAchievements, extraPowerupChoices, featJerseys, progress, unlockWords } from '../src/core/achievements';
import { CHARTERS, charterInfo, weeklySetup } from '../src/core/charter';
import { generateLeague } from '../src/core/generate';
import { userTeam } from '../src/core/league';
import { finishSeason } from '../src/core/offseason';
import { unlockedJerseys } from '../src/core/prestige';
import { newFranchise, recordGame, signatureOffer, startSeason, type Franchise } from '../src/core/season';
import bosses from '../src/data/bosses.json';
import rules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';

const fresh = (seed = 'feats'): Franchise => newFranchise(generateLeague(seed));
const started = (seed = 'feats'): Franchise => {
  const f = fresh(seed);
  startSeason(f);
  return f;
};
const win: GameResult = { score: [3, 1], winner: 0, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] };
const feat = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const title = (f: Franchise, extra: Partial<NonNullable<Franchise['history']>[number]> = {}): void => {
  f.history = [...(f.history ?? []), { season: (f.history ?? []).length + 1, outcome: 'champion', wins: 9, losses: 1, place: 1, points: 20, topScorer: null, awards: [], ...extra }];
};

describe('the list of feats', () => {
  it('each has a name, a sentence, a kind the game knows and something it opens', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_KINDS as readonly string[], a.id).toContain(a.kind);
      expect(a.name.length, a.id).toBeGreaterThan(3);
      expect(a.text.endsWith('.'), a.id).toBe(true);
      expect(a.n, a.id).toBeGreaterThanOrEqual(1);
      expect(unlockWords(a, (id) => charterInfo(id).name).length).toBeGreaterThan(8);
      if (a.unlock.kind === 'jersey') expect(a.unlock.colour).toMatch(/^#[0-9a-f]{6}$/);
      if (a.unlock.kind === 'charter') {
        const charter = CHARTERS.find((c) => c.id === (a.unlock as { id: string }).id);
        expect(charter, a.id).toBeDefined();
        expect(charter!.locked, a.id).toBe(true);
      }
    }
    // Every charter that needs opening has a feat that opens it, and no two feats give the same jersey.
    for (const c of CHARTERS.filter((x) => x.locked)) expect(ACHIEVEMENTS.some((a) => a.unlock.kind === 'charter' && a.unlock.id === c.id), c.id).toBe(true);
    const colours = ACHIEVEMENTS.flatMap((a) => (a.unlock.kind === 'jersey' ? [a.unlock.colour] : []));
    expect(new Set(colours).size).toBe(colours.length);
    // Beating every boss asks for exactly as many as there are.
    expect(feat('every-one').n).toBe(bosses.length);
  });

  it('a new club has done none of them, and nothing is open that a feat opens', () => {
    const f = started();
    expect(earnAchievements(f)).toEqual([]);
    for (const a of ACHIEVEMENTS) expect(progress(f, a), a.id).toBeLessThan(a.n);
    expect(featJerseys(f)).toEqual([]);
    expect(extraPowerupChoices(f)).toBe(0);
    expect(charterOpen(f, 'suddenDeath')).toBe(false);
    expect(charterOpen(f, 'standard')).toBe(true);
    expect(charterOpen(f, 'ironLine')).toBe(true);
  });
});

describe('doing a feat', () => {
  it('is marked once, and what it opens stays open', () => {
    const f = started();
    title(f);
    const first = earnAchievements(f);
    expect(first.map((a) => a.id)).toContain('champions');
    expect(achieved(f, 'champions')).toBe(true);
    expect(earnAchievements(f)).toEqual([]);
    // Lose the history: the feat is still done.
    f.history = [];
    expect(achieved(f, 'champions')).toBe(true);
    expect(featJerseys(f).map((j) => j.name)).toContain('Old gold');
  });

  it('a title opens a jersey to wear; three open another', () => {
    const f = started();
    const before = unlockedJerseys(f).length;
    title(f);
    earnAchievements(f);
    expect(unlockedJerseys(f).length).toBe(before + 1);
    title(f);
    title(f);
    earnAchievements(f);
    expect(achieved(f, 'dynasty')).toBe(true);
    expect(unlockedJerseys(f).length).toBe(before + 2);
  });

  it('a title without a strike opens the Sudden death charter, which can then start a season', () => {
    const f = started();
    f.season.outcome = 'champion';
    f.season.strikes = 1;
    expect(earnAchievements(f).map((a) => a.id)).not.toContain('spotless');
    f.season.strikes = 0;
    expect(earnAchievements(f).map((a) => a.id)).toContain('spotless');
    expect(charterOpen(f, 'suddenDeath')).toBe(true);

    const next = fresh('feats-next');
    startSeason(next, { charter: 'suddenDeath' });
    expect(next.season.charter).toBeUndefined();
    next.feats = ['spotless'];
    next.season.phase = 'offseason';
    startSeason(next, { charter: 'suddenDeath' });
    expect(next.season.charter).toBe('suddenDeath');
  });

  it('a title with three handicap points widens the choice of powerup by one', () => {
    const f = started();
    const usual = signatureOffer(f).length;
    expect(usual).toBe(rules.signatureChoices);
    f.season.outcome = 'champion';
    f.season.vows = { tougher: 2, thinIce: 1 };
    earnAchievements(f);
    expect(achieved(f, 'hard-way')).toBe(true);
    expect(extraPowerupChoices(f)).toBe(1);
    expect(signatureOffer(f).length).toBe(usual + 1);
    expect(signatureOffer(f).slice(0, usual)).toEqual(signatureOffer({ ...f, feats: [] }));
  });

  it('each boss club beaten is counted once', () => {
    const f = started();
    const boss = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss' && s.region === 0)!;
    f.season.current = boss.id;
    f.season.stage = 'arrived';
    recordGame(f, win);
    expect(f.bossesBeaten).toEqual([boss.bossId]);
    expect(progress(f, feat('giant-killers'))).toBe(1);
    // The same club again adds nothing.
    f.bossesBeaten = [boss.bossId as string, boss.bossId as string].slice(0, 1);
    f.bossesBeaten = [...f.bossesBeaten, 'a', 'b', 'c', 'd', 'e'];
    expect(earnAchievements(f).map((a) => a.id)).toContain('giant-killers');
    expect(charterOpen(f, 'allComers')).toBe(true);
  });

  it('nicknames on the roster and a hundred goals by one player are counted', () => {
    const f = started();
    const roster = userTeam(f.league).roster;
    for (const id of roster.slice(0, 4)) f.league.players[id]!.nickname = `N${id}`;
    f.career = { [roster[0]!]: { name: 'x', goals: 100, assists: 3, seasons: 5 } };
    const ids = earnAchievements(f).map((a) => a.id);
    expect(ids).toContain('household-names');
    expect(ids).toContain('hundred-club');
  });

  it('a season that ends in a title marks the feat in the off-season report', () => {
    const f = started('feats-end');
    f.season.phase = 'ended';
    f.season.outcome = 'champion';
    finishSeason(f);
    expect(achieved(f, 'champions')).toBe(true);
    expect((f.offseason.report?.news ?? []).some((line) => /a feat is done, Champions/.test(line))).toBe(true);
  });
});

describe('what stays the same for everyone', () => {
  it('the weekly run never draws a charter that a feat opens', () => {
    const locked = new Set(CHARTERS.filter((c) => c.locked).map((c) => c.id));
    for (let week = 1; week <= 52; week++) expect(locked.has(weeklySetup(`2026-W${week}`).charter)).toBe(false);
  });
});
