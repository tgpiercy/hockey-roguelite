import powerupData from '../../data/powerups.json';
import type { PowerupSpec } from '../../sim/modifiers';
import artifactData from '../../data/artifacts.json';
import eventData from '../../data/events.json';
import { defaultTuning } from '../../sim/tuning';
import { menuColours } from '../../core/teamColours';
import { rinkInfo } from '../../core/rinks';
import { type PlayerSort } from '../../core/compare';
import { type GearItem } from '../../core/gear';
import { jerseyColour, prestige } from '../../core/prestige';
import { hire } from '../../core/staff';
import { type ArtifactInfo, currentStop, matchup, type Franchise, isRival } from '../../core/season';
import { teamColour } from '../../core/teamColours';
import { trade } from '../../core/trades';
import gearData from '../../data/gear.json';
import { slotName } from '../gearParts';
import { type IconName } from '../Icon';

export type Screen =
  | { name: 'title' }
  | { name: 'home' }
  | { name: 'roster' }
  | { name: 'player'; playerId: string }
  | { name: 'slot'; playerId: string; slot: string }
  | { name: 'release'; playerId: string }
  | { name: 'packs' }
  | { name: 'reveal'; ids: string[]; shown: number; title: string }
  | { name: 'gear' }
  | { name: 'item'; itemId: string }
  | { name: 'equipOn'; itemId: string }
  | { name: 'freeAgents' }
  | { name: 'lineup' }
  | { name: 'pick'; line: 0 | 1; slot: number }
  | { name: 'exhibition' }
  | { name: 'practice' }
  | { name: 'powerups' }
  | { name: 'load'; slot: number }
  | { name: 'artifacts' }
  | { name: 'league' }
  | { name: 'standings' }
  | { name: 'news' }
  | { name: 'trophies' }
  | { name: 'report' }
  | { name: 'contracts' }
  | { name: 'contract'; playerId: string }
  | { name: 'skills' }
  | { name: 'skill'; playerId: string }
  | { name: 'tradeTeams' }
  | { name: 'tradeTheirs'; teamId: string }
  | { name: 'tradeMine'; teamId: string; theirId: string }
  | { name: 'tradeConfirm'; teamId: string; theirId: string; mineId: string }
  | { name: 'prestige' }
  | { name: 'finances' }
  | { name: 'staff' }
  | { name: 'hire' }
  | { name: 'staffMember'; staffId: string }
  | { name: 'facilities' }
  | { name: 'mascot' }
  | { name: 'setup' }
  | { name: 'found' }
  | { name: 'feats' }
  | { name: 'team' }
  | { name: 'office' }
  | { name: 'collection' }
  | { name: 'settings' }
  | { name: 'difficulty'; fresh: boolean; first?: boolean }
  | { name: 'switching' }
  | { name: 'assists' }
  | { name: 'firstSkate' }
  | { name: 'signs' }
  | { name: 'ratingWorth' }
  | { name: 'rewards'; shown: number }
  | { name: 'jersey' }
  | { name: 'saves' }
  | { name: 'padTest' }
  | { name: 'padSetup'; player?: 0 | 1 }
  | { name: 'confirmAbandon' }
  | { name: 'deadline' }
  | { name: 'deadlineOffer'; index: number }
  | { name: 'recap' }
  | { name: 'confirmNew' };

export type Sort = PlayerSort;
export type Group = 'team' | 'office' | 'collection' | 'settings' | 'league';

/** The icon each hub-style row carries, by the row's key. A row can also name its own. */
export const TILE_ICONS: Record<string, IconName> = {
  weekly: 'clock',
  team: 'team',
  league: 'report',
  standings: 'report',
  news: 'report',
  trophies: 'prestige',
  office: 'office',
  collection: 'collection',
  settings: 'settings',
  roster: 'roster',
  lineup: 'lineup',
  fa: 'freeAgents',
  trade: 'trade',
  powerups: 'powerups',
  mascot: 'mascot',
  finances: 'finances',
  staff: 'staff',
  facilities: 'facilities',
  prestige: 'prestige',
  report: 'report',
  packs: 'packs',
  gear: 'gear',
  artifacts: 'artifacts',
  jersey: 'jersey',
  difficulty: 'difficulty',
  sound: 'sound',
  volume: 'sound',
  detail: 'detail',
  saves: 'save',
  play: 'play',
  start: 'play',
  simulate: 'simulate',
  exhibition: 'exhibition',
  career: 'prestige',
  practice: 'training',
  mainmenu: 'play',
  contracts: 'contracts',
  bailout: 'bailout',
};
export const BUTTONS = ['LT', 'RB'];

/** "1 season", "2 seasons". */
export const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 1st, 2nd, 3rd, 4th ... */
export const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;

/** The gear screen's filters, cycled with left and right. */
export const GEAR_FILTERS: { label: string; test: (item: GearItem) => boolean }[] = [
  { label: 'everything', test: () => true },
  { label: 'not worn', test: (item) => item.wornBy === null },
  ...[...gearData.slots.skater, ...gearData.slots.goalie].map((slot) => ({ label: slotName(slot).toLowerCase(), test: (item: GearItem) => item.slot === slot })),
  ...gearData.rarities.map((r) => ({ label: r.name.toLowerCase(), test: (item: GearItem) => item.rarity === r.id })),
];
export const RARITY_ORDER = gearData.rarities.map((r) => r.id as string);

/** The two powerups loaded on the practice rink, free. */
export const practicePowerups = (powerupData as unknown as PowerupSpec[]).filter((p) => (p.seconds ?? 0) > 0).slice(0, 2);

/** Every artifact there is, and every event, for the page of what has been found. */
export const everyArtifact = artifactData as unknown as ArtifactInfo[];
export const allEvents = eventData as unknown as { id: string }[];

/** A rink's size, corners and nets, for its little outline: its own numbers where it changes them, the usual ones where it does not. */
export function rinkShape(id: string): { length: number; width: number; corner: number; nets: number } {
  const own = rinkInfo(id).tuning;
  return {
    length: own.rink?.length ?? defaultTuning.rink.length,
    width: own.rink?.width ?? defaultTuning.rink.width,
    corner: own.rink?.cornerRadius ?? defaultTuning.rink.cornerRadius,
    nets: own.net?.mouthWidth ?? defaultTuning.net.mouthWidth,
  };
}

/** The colours the menus wear for a franchise on a screen: its own, or those of the boss or rival about to be played. */
export function menuTint(f: Franchise, screen: { name: string }): { team: string; deep: string; ink: string } {
  const mine = jerseyColour(f);
  if (screen.name === 'home' && f.season.stage === 'arrived') {
    const stop = currentStop(f);
    const opponent = stop && (stop.kind === 'boss' || (stop.kind === 'game' && isRival(f, stop.opponentId))) ? matchup(f) : null;
    if (opponent) return menuColours(teamColour(opponent.away.name, mine));
  }
  return menuColours(mine);
}
