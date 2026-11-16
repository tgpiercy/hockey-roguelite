import { describe, expect, it } from 'vitest';
import { screenPlan } from '../src/ui/fullscreen';
import { BACKUP_DAYS, backupDue, backupWords, isBenign } from '../src/ui/safety';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-15T12:00:00Z');
const ago = (days: number): string => new Date(now - days * DAY).toISOString();

describe('the reminder to export the save', () => {
  it('is due when the save was never exported, or not for a fortnight', () => {
    expect(backupDue(null, now)).toBe(true);
    expect(backupDue('not a date', now)).toBe(true);
    expect(backupDue(ago(0), now)).toBe(false);
    expect(backupDue(ago(BACKUP_DAYS - 1), now)).toBe(false);
    expect(backupDue(ago(BACKUP_DAYS + 1), now)).toBe(true);
  });

  it('says in words when the last copy was made', () => {
    expect(backupWords(null, now)).toBe('never exported');
    expect(backupWords(ago(0), now)).toBe('exported today');
    expect(backupWords(ago(1), now)).toBe('exported yesterday');
    expect(backupWords(ago(9), now)).toBe('exported 9 days ago');
  });
});

describe('the notice when something goes wrong', () => {
  it('is not raised for things that are not the game going wrong', () => {
    for (const message of ['ResizeObserver loop limit exceeded', 'NotAllowedError: play() failed because the user did not interact', 'AbortError: The user aborted a request.', 'Script error.']) {
      expect(isBenign(message), message).toBe(true);
    }
  });

  it('is raised for a real fault', () => {
    for (const message of ["TypeError: Cannot read properties of undefined (reading 'pos')", 'RangeError: Maximum call stack size exceeded', 'Error: no player 99']) {
      expect(isBenign(message), message).toBe(false);
    }
  });
});

describe('getting the address bar out of the way', () => {
  const phone = { standalone: false, fullscreen: false, canRequest: true, touch: true };

  it('opened from the home screen, or already full screen, there is nothing to do', () => {
    expect(screenPlan({ ...phone, standalone: true })).toBe('none');
    expect(screenPlan({ ...phone, fullscreen: true })).toBe('none');
  });

  it('a phone whose browser allows it is taken full screen on a touch', () => {
    expect(screenPlan(phone)).toBe('request');
  });

  it('a phone whose browser does not is told to add the game to the home screen', () => {
    expect(screenPlan({ ...phone, canRequest: false })).toBe('hint');
  });

  it('a computer is left alone', () => {
    expect(screenPlan({ ...phone, touch: false })).toBe('none');
    expect(screenPlan({ ...phone, touch: false, canRequest: false })).toBe('none');
  });
});

