import { useEffect, useState } from 'preact/hooks';
import audioData from '../data/audio.json';
import musicData from '../data/music.json';
import { gameAudio, noiseBuffer, playSound } from '../game/audio';
import { music } from '../game/music';
import type { SoundName } from '../game/soundMap';

/**
 * Every sound and every tune on one page, opened with ?sound, each with a button to hear it. It exists
 * because none of them can be judged without listening. Beside each is what a machine can say about it:
 * how loud its loudest moment is, how loud it is on average, and how long it lasts.
 */
const WHEN: Record<string, string> = {
  pass: 'a pass leaves a stick',
  shot: 'a shot (louder the harder it is)',
  post: 'the puck hits a post',
  save: 'a goalie stops it',
  hit: 'a body check lands',
  poke: 'a poke check takes the puck',
  tap: 'the puck is received',
  drop: 'the puck is dropped at a faceoff',
  whistle: 'play is stopped',
  horn: 'a period ends, and a goal',
  roar: 'your crowd after your goal',
  groan: 'your crowd after their goal',
  chime: 'something good on the menus',
  tick: 'moving between menu items',
  select: 'choosing a menu item',
  back: 'going back on the menus',
  reveal: 'a card turns over in a pack',
  legendary: 'a legendary card',
};
const TUNES: Record<string, string> = {
  theme: 'the menus (it loops)',
  organ: 'a stoppage in play',
  goalFor: 'your goal',
  goalAgainst: 'their goal',
  win: 'a game won',
  loss: 'a game lost',
  reveal: 'opening a pack',
  fanfare: 'a championship',
};

interface Measure {
  /** The loudest single moment, 1 being the most a speaker can give. */
  peak: number;
  /** The average level while it sounds. */
  rms: number;
  seconds: number;
}

/** Renders something into a buffer off-line (nothing is heard) and measures it. */
async function measure(seconds: number, fill: (ctx: OfflineAudioContext) => void): Promise<Measure> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  fill(ctx);
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] as number);
    if (v > peak) peak = v;
    if (v > 0.001) last = i;
  }
  let sum = 0;
  for (let i = 0; i <= last; i++) sum += (data[i] as number) ** 2;
  return { peak, rms: Math.sqrt(sum / Math.max(1, last + 1)), seconds: (last + 1) / rate };
}

const show = (m: Measure | undefined): string => (m ? `peak ${m.peak.toFixed(2)} · average ${m.rms.toFixed(2)} · ${m.seconds.toFixed(2)} s` : 'measuring…');

export function SoundSheet() {
  const sounds = Object.keys(audioData.sounds) as SoundName[];
  const tunes = Object.keys(musicData.pieces) as (keyof typeof musicData.pieces)[];
  const [measures, setMeasures] = useState<Record<string, Measure>>({});
  const [looping, setLooping] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, Measure> = {};
      for (const name of sounds) {
        out[`s:${name}`] = await measure(4, (ctx) => playSound(ctx, ctx.destination, noiseBuffer(ctx), name, 1, 0));
      }
      for (const name of tunes) {
        out[`t:${name}`] = await measure(45, (ctx) => {
          const gain = ctx.createGain();
          gain.gain.value = musicData.gain;
          gain.connect(ctx.destination);
          music.schedule(ctx, gain, name, 0);
        });
      }
      if (alive) {
        setMeasures(out);
        // For reading the figures without the page: the same numbers as text.
        (window as unknown as { __soundMeasures?: unknown }).__soundMeasures = out;
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const ready = (): void => {
    gameAudio.unlock();
    gameAudio.configure(true, 1);
    music.configure(true, 1);
    music.wake();
  };

  return (
    <div class="art-sheet sound-sheet">
      <h2>Sounds</h2>
      <p class="note">Press a row to hear it. The figures are what each one measures at full volume before the game's own volume is applied: a peak near or above 1 would distort; an average far from the others is too loud or too quiet beside them.</p>
      <div class="sound-rows">
        {sounds.map((name) => (
          <button
            key={name}
            class="sound-row"
            onClick={() => {
              ready();
              gameAudio.play(name);
            }}
          >
            <b>{name}</b>
            <span>{WHEN[name] ?? ''}</span>
            <small>{show(measures[`s:${name}`])}</small>
          </button>
        ))}
      </div>
      <h2>Music</h2>
      <div class="sound-rows">
        {tunes.map((name) => (
          <button
            key={name}
            class="sound-row"
            onClick={() => {
              ready();
              if (name === 'theme') {
                if (looping) music.stop();
                else music.loop('theme');
                setLooping(!looping);
              } else music.sting(name);
            }}
          >
            <b>{name}</b>
            <span>
              {TUNES[name] ?? ''}
              {name === 'theme' && looping ? ' — playing; press to stop' : ''}
            </span>
            <small>{show(measures[`t:${name}`])}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
