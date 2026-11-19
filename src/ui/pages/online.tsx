import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { teamStrength } from '../../core/bosses';
import { dress } from '../../core/matchup';
import { jerseyColour } from '../../core/prestige';
import { periodSecondsOf } from '../../core/season';
import { teamColour } from '../../core/teamColours';
import words from '../../data/onlineWords.json';
import { canLink, guestLink, hostLink, type HostLink, type Link } from '../../game/peer';
import { readSure, type SureMessage } from '../../game/wire';
import { buildId } from '../keptGame';
import type { OnlineShow } from '../matchView';
import { Menu, type MenuItem } from '../Menu';
import { OptionCard } from '../parts';
import { playMatch } from '../playMatch';
import { loadPrefs } from '../prefs';
import type { AppCtx } from '../App';

/**
 * A game across two devices (docs/ONLINE.md, step 1): one hosts and hands over an invitation, the other
 * answers with a code of its own. Both are passed by hand: there is no server. Exhibition only.
 */
export function onlinePages(app: AppCtx): ComponentChildren | undefined {
  const { screen, screenKey } = app;
  if (screen.name === 'online') return <Pick key={screenKey} app={app} />;
  if (screen.name === 'onlineHost') return <Host key={screenKey} app={app} />;
  if (screen.name === 'onlineJoin') return <Join key={screenKey} app={app} invitation={screen.invitation ?? ''} />;
  return undefined;
}

/** The link the host hands over: the game's own address with the code on the end. */
const inviteLink = (code: string): string => `${location.origin}${location.pathname}?join=${code}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function pasted(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

const canShare = (): boolean => typeof navigator.share === 'function';

function share(text: string): void {
  void navigator.share({ text }).catch(() => undefined);
}

/** A box of text: the code to hand over (read only), or the place to paste the other device's. */
function Box({ label, value, onInput }: { label: string; value: string; onInput?: (text: string) => void }) {
  return (
    <label class="code-box">
      <span>{label}</span>
      <textarea
        rows={3}
        value={value}
        readOnly={!onInput}
        spellcheck={false}
        autocapitalize="off"
        onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
        onInput={(e) => onInput?.((e.target as HTMLTextAreaElement).value)}
      />
    </label>
  );
}

function Pick({ app }: { app: AppCtx }) {
  const { go, tile, message } = app;
  const able = canLink();
  return (
    <Menu
      title="Two devices"
      message={message}
      header={able ? words.pick : words.cannot}
      onBack={() => go({ name: 'exhibition' })}
      items={
        able
          ? [
              tile('host', 'Host a game', 'Your team, your rink; you hand over an invitation', () => go({ name: 'onlineHost' }), { icon: 'game', wide: true, detail: words.hostDetail }),
              tile('join', 'Join a game', 'Paste the invitation you were sent', () => go({ name: 'onlineJoin' }), { icon: 'team', wide: true, detail: words.joinDetail }),
            ]
          : []
      }
    />
  );
}

/** Closes a line when its screen is left, unless a game has taken it over. */
function useLine<T extends Link>(): { line: { current: T | null }; taken: { current: boolean } } {
  const line = useRef<T | null>(null);
  const taken = useRef(false);
  useEffect(
    () => () => {
      if (!taken.current) line.current?.wire.close();
    },
    [],
  );
  return { line, taken };
}

function Host({ app }: { app: AppCtx }) {
  const { f, league, team, exRink, go, tile, setPlaying, setScreen, setMessage, setPrefs } = app;
  const opponents = league.teams.filter((x) => x.id !== league.userTeamId).sort((a, b) => teamStrength(league, a.id) - teamStrength(league, b.id));
  const [mode, setMode] = useState<'versus' | 'coop'>('versus');
  const [against, setAgainst] = useState(Math.floor(opponents.length / 2));
  const [stage, setStage] = useState<'setup' | 'making' | 'code' | 'joining'>('setup');
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const { line, taken } = useLine<HostLink>();
  const opponent = opponents[against];

  const start = (link: HostLink): void => {
    const homeTeam = dress(league, team);
    const away = opponent ? dress(league, opponent) : null;
    if (!homeTeam || !away || !opponent) return;
    taken.current = true;
    setPlaying(true);
    const homeColour = jerseyColour(f);
    playMatch(
      { periodSeconds: periodSecondsOf(f), home: homeTeam, away, homeColour, awayColour: teamColour(away.name, homeColour), rink: exRink, second: mode === 'coop' ? 0 : 1, online: { role: 'host', wire: link.wire } },
      (result) => {
        setScreen({ name: 'exhibition' });
        setMessage(result.forfeit ? `The game against ${opponent.name} ended early.` : `Across two devices: ${result.score[0]}-${result.score[1]} against ${opponent.name}.`);
        setPrefs(loadPrefs());
        setPlaying(false);
      },
    );
  };

  const make = (): void => {
    setStage('making');
    hostLink()
      .then((link) => {
        line.current = link;
        setStage('code');
        setNote('');
      })
      .catch(() => {
        setStage('setup');
        setNote(words.failed);
      });
  };

  const accept = (text: string): void => {
    const link = line.current;
    if (!link || !text.trim()) {
      setNote(words.noAnswer);
      return;
    }
    setStage('joining');
    setNote('');
    const timer = window.setTimeout(() => {
      if (!taken.current) {
        setStage('code');
        setNote(words.noJoin);
      }
    }, words.joinSeconds * 1000);
    void link.accept(text).then((ok) => {
      if (!ok) {
        window.clearTimeout(timer);
        setStage('code');
        setNote(words.badCode);
        return;
      }
      link.joined
        .then(() => {
          window.clearTimeout(timer);
          start(link);
        })
        .catch(() => {
          window.clearTimeout(timer);
          setStage('setup');
          line.current = null;
          setNote(words.noJoin);
        });
    });
  };

  const link = line.current;
  const setupItems: MenuItem[] = [
    tile('make', 'Make the invitation', stage === 'making' ? 'One moment…' : 'A link to send to the other player', make, { primary: true, wide: true, icon: 'game', detail: words.makeDetail }),
    {
      key: 'mode',
      label: <OptionCard icon="team" name="Two players" value={mode === 'versus' ? 'Versus (head to head)' : 'Co-op (same team)'} chip="Change" />,
      detail: 'Press to change. Versus: the other player takes the team below. Co-op: both of you play for your team against it.',
      onSelect: () => setMode(mode === 'versus' ? 'coop' : 'versus'),
    },
    {
      key: 'against',
      label: <OptionCard icon="game" name={mode === 'versus' ? 'Their team' : 'Against'} value={opponent ? `${opponent.name} · ${Math.round(teamStrength(league, opponent.id))}` : 'Nobody'} chip="Change" />,
      detail: `Press to change. Your team averages ${Math.round(teamStrength(league, team.id))} overall. The rink is the one chosen on the Exhibition screen.`,
      onSelect: () => setAgainst((against + 1) % Math.max(1, opponents.length)),
    },
  ];
  const codeItems: MenuItem[] = link
    ? [
        tile('copy', 'Copy the invitation', 'Then send it to the other player any way you like', () => void copy(inviteLink(link.code)).then((ok) => setNote(ok ? words.copied : words.copyByHand)), { primary: true, wide: true, icon: 'game' }),
        ...(canShare() ? [tile('share', 'Share the invitation', 'Through a message or mail', () => share(inviteLink(link.code)), { icon: 'team' })] : []),
        tile('paste', 'Paste their answer', 'The code the other player sends back', () => void pasted().then((text) => (text ? accept(text) : setNote(words.pasteByHand))), { icon: 'team' }),
        tile('use', 'Use the answer in the box', 'If you pasted it there by hand', () => accept(answer), { icon: 'game' }),
      ]
    : [];
  return (
    <Menu
      title="Host a game"
      message={note}
      header={
        stage === 'setup' || stage === 'making' ? (
          <div class="note">{words.hostSteps}</div>
        ) : (
          <>
            <div class="note">{stage === 'joining' ? words.joining : words.hostCode}</div>
            {link && <Box label="The invitation" value={inviteLink(link.code)} />}
            <Box label="Their answer" value={answer} onInput={setAnswer} />
          </>
        )
      }
      onBack={() => go({ name: 'online' })}
      items={stage === 'setup' || stage === 'making' ? setupItems : stage === 'joining' ? [] : codeItems}
    />
  );
}

function Join({ app, invitation }: { app: AppCtx; invitation: string }) {
  const { go, tile, setPlaying, setScreen, setMessage, setPrefs } = app;
  const [stage, setStage] = useState<'paste' | 'making' | 'answer'>('paste');
  const [box, setBox] = useState(invitation);
  const [note, setNote] = useState('');
  const { line, taken } = useLine<Link>();

  const begin = (link: Link, m: Extract<SureMessage, { k: 'start' }>): void => {
    if (m.build !== buildId()) {
      setNote(words.otherBuild);
      link.wire.close();
      line.current = null;
      setStage('paste');
      return;
    }
    const show = m.show as OnlineShow;
    taken.current = true;
    setPlaying(true);
    playMatch(
      { home: show.home, away: show.away, ...(show.homeColour ? { homeColour: show.homeColour } : {}), ...(show.awayColour ? { awayColour: show.awayColour } : {}), userAtHome: show.userAtHome, second: show.second, online: { role: 'guest', wire: link.wire, start: m } },
      (result) => {
        setScreen({ name: 'exhibition' });
        setMessage(result.forfeit ? words.endedEarly : `Across two devices: ${show.home.name} ${result.score[0]}, ${show.away.name} ${result.score[1]}.`);
        setPrefs(loadPrefs());
        setPlaying(false);
      },
    );
  };

  const answer = (text: string): void => {
    if (!text.trim()) {
      setNote(words.noInvitation);
      return;
    }
    setStage('making');
    setNote('');
    guestLink(text)
      .then((link) => {
        if (!link) {
          setStage('paste');
          setNote(words.badCode);
          return;
        }
        line.current = link;
        link.wire.onSure = (message) => {
          const m = readSure(message);
          if (m?.k === 'start' && !taken.current) begin(link, m);
        };
        link.joined.catch(() => {
          if (taken.current) return;
          line.current = null;
          setStage('paste');
          setNote(words.noJoin);
        });
        setStage('answer');
      })
      .catch(() => {
        setStage('paste');
        setNote(words.failed);
      });
  };

  // Opened from an invitation link: the answer is made at once.
  useEffect(() => {
    if (invitation) answer(invitation);
  }, []);

  const link = line.current;
  const items: MenuItem[] =
    stage === 'answer' && link
      ? [
          tile('copy', 'Copy your answer', 'Then send it back to the host', () => void copy(link.code).then((ok) => setNote(ok ? words.copied : words.copyByHand)), { primary: true, wide: true, icon: 'game' }),
          ...(canShare() ? [tile('share', 'Share your answer', 'Through a message or mail', () => share(link.code), { icon: 'team' })] : []),
        ]
      : stage === 'paste'
        ? [
            tile('paste', 'Paste the invitation', 'The link the host sent you', () => void pasted().then((text) => (text ? answer(text) : setNote(words.pasteByHand))), { primary: true, wide: true, icon: 'game' }),
            tile('use', 'Use what is in the box', 'If you pasted it there by hand', () => answer(box), { icon: 'team' }),
          ]
        : [];
  return (
    <Menu
      title="Join a game"
      message={note}
      header={
        stage === 'answer' && link ? (
          <>
            <div class="note">{words.guestCode}</div>
            <Box label="Your answer" value={link.code} />
          </>
        ) : (
          <>
            <div class="note">{stage === 'making' ? words.making : words.joinSteps}</div>
            <Box label="The invitation" value={box} onInput={setBox} />
          </>
        )
      }
      onBack={() => go({ name: 'online' })}
      items={items}
    />
  );
}
