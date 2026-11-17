import { describe, expect, it } from 'vitest';
import commentary from '../src/data/commentary.json';
import speech from '../src/data/speech.json';
import { deliveryFor, isEnglish, rankVoices, spokenText, tenseNow, voiceFor, voiceScore, type VoiceInfo } from '../src/game/voicePlan';

const phone: VoiceInfo[] = [
  { name: 'Deutsch Deutschland', lang: 'de-DE' },
  { name: 'English United States', lang: 'en_US', default: true },
  { name: 'English United Kingdom', lang: 'en-GB' },
  { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
  { name: 'eSpeak English', lang: 'en' },
  { name: 'Français', lang: 'fr-FR' },
];

describe('choosing a voice from what the device has', () => {
  it('only English voices are used, the natural ones first and the crude ones last', () => {
    expect(isEnglish({ name: 'x', lang: 'en_US' })).toBe(true);
    expect(isEnglish({ name: 'x', lang: 'fr-FR' })).toBe(false);
    const ranked = rankVoices(phone).map((v) => v.name);
    expect(ranked).toHaveLength(4);
    expect(ranked[0]).toContain('Natural');
    expect(ranked[ranked.length - 1]).toBe('eSpeak English');
    expect(voiceScore(phone[0]!)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('the player\'s choice is used while the device has it, and the best otherwise', () => {
    expect(voiceFor(phone, 'English United Kingdom', 'goal')!.name).toBe('English United Kingdom');
    expect(voiceFor(phone, 'A voice since removed', 'goal')!.name).toContain('Natural');
    expect(voiceFor(phone, '', 'save')!.name).toContain('Natural');
    expect(voiceFor([], '', 'goal')).toBeNull();
    expect(voiceFor([{ name: 'Suomi', lang: 'fi-FI' }], '', 'goal')).toBeNull();
  });

  it('the announcer\'s own lines are in a second voice where there is one', () => {
    for (const kind of speech.announcerKinds) {
      expect(voiceFor(phone, '', kind)!.name, kind).not.toContain('Natural');
      expect(voiceFor(phone, 'English United Kingdom', kind)!.name).not.toBe('English United Kingdom');
    }
    const one = [{ name: 'English', lang: 'en-US' }];
    expect(voiceFor(one, '', 'opening')!.name).toBe('English');
  });
});

describe('how a line is said', () => {
  it('every kind of call the commentator makes has its own delivery', () => {
    for (const kind of [...Object.keys(commentary.lines), 'opening']) expect((speech.delivery.kinds as Record<string, unknown>)[kind], kind).toBeDefined();
  });

  it('a goal is shouted, a save called quickly, the end of a period read out level', () => {
    const goal = deliveryFor('goal', false, 0.5);
    const save = deliveryFor('save', false, 0.5);
    const period = deliveryFor('period', false, 0.5);
    expect(goal.pitch).toBeGreaterThan(save.pitch);
    expect(save.pitch).toBeGreaterThan(period.pitch);
    expect(goal.rate).toBeGreaterThan(period.rate);
    expect(goal.volume).toBeGreaterThanOrEqual(period.volume);
    expect(deliveryFor('never heard of it', false, 0.5)).toEqual(speech.delivery.default);
  });

  it('a close, late game lifts everything a little, and no two lines are stamped from one mould', () => {
    const calm = deliveryFor('save', false, 0.5);
    const tense = deliveryFor('save', true, 0.5);
    expect(tense.rate).toBeGreaterThan(calm.rate);
    expect(tense.pitch).toBeGreaterThan(calm.pitch);
    expect(deliveryFor('save', false, 0).pitch).toBeLessThan(deliveryFor('save', false, 1).pitch);
    expect(Math.abs(deliveryFor('save', false, 1).pitch - calm.pitch)).toBeCloseTo(speech.delivery.vary);
    // Whatever is added, a voice is never asked for more than a browser will do.
    for (const kind of Object.keys(speech.delivery.kinds)) {
      const most = deliveryFor(kind, true, 1);
      expect(most.rate).toBeLessThanOrEqual(speech.delivery.most.rate);
      expect(most.pitch).toBeLessThanOrEqual(speech.delivery.most.pitch);
      expect(deliveryFor(kind, false, 0).rate).toBeGreaterThanOrEqual(speech.delivery.least.rate);
    }
  });

  it('tense is the third period or later within a goal, or overtime', () => {
    expect(tenseNow(1, [2, 2], false)).toBe(false);
    expect(tenseNow(3, [2, 2], false)).toBe(true);
    expect(tenseNow(3, [3, 2], false)).toBe(true);
    expect(tenseNow(3, [5, 2], false)).toBe(false);
    expect(tenseNow(4, [5, 2], true)).toBe(true);
  });

  it('a score is read as "3 to 2", and marks are taken out', () => {
    expect(spokenText('Lundanss scores! 3-2 Gulls.')).toBe('Lundanss scores! 3 to 2 Gulls.');
    expect(spokenText('The horn goes. 1 – 0')).toBe('The horn goes. 1 to 0');
    expect(spokenText('Period one  ·  Tied')).toBe('Period one, Tied');
  });
});
