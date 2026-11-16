import { scrapValue } from '../../core/gear';
import { progress } from '../../core/achievements';
import type { ComponentChildren } from 'preact';
import { equip, levelCost, levelUp, rarityInfo, scrap, unequip, wornBy, type GearItem } from '../../core/gear';
import { playerOf, rosterOf } from '../../core/league';
import { openPack, packName } from '../../core/packs';
import { potentialText } from '../../core/scouting';
import { renamePlayer } from '../../core/season';
import { xpForLevel } from '../../core/xp';
import gearData from '../../data/gear.json';
import { EquipPreview, GearCard, GearedRatings, GearRow, setProgress, slotName } from '../gearParts';
import { gameAudio } from '../../game/audio';
import { GearArt } from '../GearArt';
import { Menu } from '../Menu';
import { PackOpening } from '../PackOpening';
import { Face, Grade, Meter, money, PlayerRow, OptionCard } from '../parts';
import type { AppCtx } from '../App';
import { type Screen, count, GEAR_FILTERS, RARITY_ORDER } from './shared';

/** Packs and gear, and a player with what he wears. */
export function gearPages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, setScreen, message, setMessage, gearFilter, setGearFilter, commit, shown, f, league,
    season, team, locked, screenKey, go, after, home, top, card, wearing,
    bump, nameOf,
  } = app;

  // ---------------------------------------------------------------- team screens

  // ---------------------------------------------------------------- gear and packs

  if (screen.name === 'packs') {
    return (
      <Menu
        key={screenKey}
        remember="packs"
        title="Packs"
        message={message}
        header={
          f.packs.length === 0
            ? 'No packs to open. A season win earns a Bronze pack; a shutout, a 4-goal win or a boss win a Silver; each milestone a Gold.'
            : 'What is inside was decided when the pack was earned.'
        }
        onBack={home}
        help="A open · B back"
        items={f.packs.map((pack) => ({
          key: pack.id,
          label: <b>{packName(pack.type)}</b>,
          detail: `${pack.items.length} pieces. Earned: ${pack.reason}.`,
          onSelect: () => {
            const items = openPack(f, pack.id);
            if (!items) return;
            setScreen({ name: 'reveal', ids: items.map((g) => g.id), shown: 0, title: packName(pack.type) });
            setMessage('');
            commit(f);
          },
        }))}
      />
    );
  }

  if (screen.name === 'reveal') {
    const items = screen.ids.map((id) => f.gear.find((g) => g.id === id)).filter((g): g is GearItem => g !== undefined);
    const shown = Math.min(screen.shown, items.length);
    const all = shown >= items.length;
    const turn = (count: number): void => {
      // The sound for the best piece being turned over: a fanfare for a Legendary.
      const turned = items.slice(shown, count);
      gameAudio.play(turned.some((g) => g.rarity === 'legendary') ? 'legendary' : 'reveal');
      setScreen({ ...screen, shown: count });
    };
    return (
      <Menu
        key={`reveal-${shown}`}
        stack
        title={shown === 0 ? screen.title : `${screen.title}: ${shown} of ${items.length}`}
        header={<PackOpening title={screen.title} items={items} shown={shown} />}
        help={all ? 'A done' : 'A turn the next card'}
        items={
          all
            ? [{ key: 'done', label: <b>Done</b>, onSelect: () => go({ name: f.packs.length > 0 ? 'packs' : 'gear' }) }]
            : [
                { key: 'next', label: <b>{shown === 0 ? 'Open the pack' : 'Turn the next card'}</b>, onSelect: () => turn(shown + 1) },
                ...(shown > 0 ? [{ key: 'all', label: 'Turn them all', onSelect: () => turn(items.length) }] : []),
              ]
        }
      />
    );
  }

  if (screen.name === 'gear') {
    const filter = GEAR_FILTERS[gearFilter % GEAR_FILTERS.length]!;
    const cycle = (step: number): void => setGearFilter((gearFilter + step + GEAR_FILTERS.length) % GEAR_FILTERS.length);
    const shown = f.gear
      .filter(filter.test)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        remember="gear"
        title="Gear"
        message={message}
        header={
          <>
            <div>
              {f.gear.length} pieces · showing {filter.label} ({shown.length}) · left and right change what is shown
            </div>
            {f.gear.length === 0 && <div>Nothing yet. Open packs to get gear.</div>}
          </>
        }
        onBack={home}
        help="A equip, level up or scrap · left/right filter · B back"
        items={
          shown.length === 0
            ? [{ key: 'none', label: 'Nothing to show with this filter.', disabled: true, onLeft: () => cycle(-1), onRight: () => cycle(1) }]
            : shown.map((item) => ({
                key: item.id,
                label: <GearRow item={item} wearer={nameOf(item.wornBy)} />,
                detail: <GearCard item={item} />,
                onLeft: () => cycle(-1),
                onRight: () => cycle(1),
                onSelect: () => go({ name: 'item', itemId: item.id }),
              }))
        }
      />
    );
  }

  if (screen.name === 'item') {
    const item = f.gear.find((g) => g.id === screen.itemId);
    if (!item) {
      return <Menu key={screenKey} title="Gear" header="That piece is gone." onBack={() => go({ name: 'gear' })} items={[]} />;
    }
    const cost = levelCost(item);
    const value = scrapValue(item);
    return (
      <Menu
        key={screenKey}
        title="Gear"
        message={message}
        header={
          <>
            <GearCard item={item} />
            <div>
              {item.wornBy ? `Worn by ${nameOf(item.wornBy)}` : 'In the inventory'} · level {item.level} of {gearData.maxLevel}
            </div>
          </>
        }
        onBack={() => go({ name: 'gear' })}
        items={[
          { key: 'equip', label: 'Put it on a player', onSelect: () => go({ name: 'equipOn', itemId: item.id }) },
          ...(item.wornBy ? [{ key: 'off', label: 'Take it off', onSelect: () => after(unequip(f, item.id)) }] : []),
          {
            key: 'level',
            label: cost === null ? 'Level up: already at the top level' : `Level up · ${money(cost)}`,
            detail: 'Each level adds 1 point to every boost on the piece.',
            disabled: cost === null || f.cash < cost,
            onSelect: () => {
              const result = levelUp(f, item.id);
              after(result.ok ? { ok: true, message: `Levelled up to ${item.level}.` } : result);
            },
          },
          {
            key: 'scrap',
            label: `Sell for scrap · ${money(value)}`,
            detail: item.wornBy ? 'Take it off first.' : 'The piece is gone for good.',
            disabled: item.wornBy !== null,
            onSelect: () => {
              const result = scrap(f, item.id);
              after(result.ok ? { ok: true, message: `Sold for ${money(value)}.` } : result, { name: 'gear' });
            },
          },
        ]}
      />
    );
  }

  if (screen.name === 'equipOn') {
    const item = f.gear.find((g) => g.id === screen.itemId);
    const fits = rosterOf(league, team).filter((p) => item && (p.position === 'G') === (item.kind === 'goalie'));
    return (
      <Menu
        key={screenKey}
        title={item ? `Who wears it? ${slotName(item.slot)}` : 'Gear'}
        header={item ? <GearRow item={item} wearer={nameOf(item.wornBy)} /> : 'That piece is gone.'}
        onBack={() => go({ name: 'item', itemId: screen.itemId })}
        items={
          item
            ? fits.map((p) => {
                const has = wornBy(f, p.id).find((g) => g.slot === item.slot);
                return {
                  key: p.id,
                  label: <PlayerRow player={p} note={has ? (has.id === item.id ? 'wearing it' : 'replaces what he has') : ''} />,
                  detail: <EquipPreview f={f} player={p} slot={item.slot} candidate={item} />,
                  onSelect: () => {
                    const result = equip(f, item.id, p.id);
                    after(result.ok ? { ok: true, message: `${p.name} puts it on.` } : result, { name: 'item', itemId: item.id });
                  },
                };
              })
            : []
        }
      />
    );
  }

  if (screen.name === 'player') {
    const p = playerOf(league, screen.playerId);
    const mine = team.roster.includes(p.id);
    const worn = wornBy(f, p.id);
    const slots = p.position === 'G' ? gearData.slots.goalie : gearData.slots.skater;
    const progress = setProgress(worn);
    return (
      <Menu
        key={screenKey}
        remember={`player-${p.id}`}
        title={p.name}
        message={message}
        header={
          <>
            <div class="player-card">
              <Face player={p} size={64} />
              <div class="player-card-text">
                <div class="player-card-top">
                  <Grade player={p} />
                  <b class="player-card-ovr">{p.overall}</b>
                  <span class="player-card-pos">{p.position === 'F' ? 'Forward' : p.position === 'D' ? 'Defence' : 'Goalie'}</span>
                  {bump(p.id) !== 0 && <span class="bump">+{bump(p.id)} this season</span>}
                </div>
                <span>
                  Age {p.age} · {money(p.capHit)} a season · {p.contractYears} year{p.contractYears === 1 ? '' : 's'} left
                </span>
                <span>Potential: {potentialText(f, p)}</span>
              </div>
            </div>
            <Meter
              label={`Level ${p.level}`}
              tone="cool"
              share={(p.xp + (season.xp[p.id] ?? 0)) / xpForLevel(p.level)}
              value={
                <>
                  {Math.floor(p.xp)} of {xpForLevel(p.level)} XP
                  {(season.xp[p.id] ?? 0) > 0 && <> · +{Math.round(season.xp[p.id] ?? 0)} this season, banked when it ends</>}
                </>
              }
            />
            <GearedRatings f={f} player={p} />
            {!progress && <div>Gear changes ratings on the ice. It never changes his grade or cap hit.</div>}
          </>
        }
        onBack={() => go({ name: 'roster' })}
        help="A change a piece · B back"
        items={[
          ...(mine
            ? [
                {
                  key: 'rename',
                  label: <OptionCard icon="roster" name="Rename" value={p.nickname ? `${p.name}, "${p.nickname}"` : p.name} />,
                  detail: 'Press to give him a new name.',
                  onSelect: () => {
                    const typed = window.prompt('His new name', p.name);
                    if (typed !== null) after(renamePlayer(f, p.id, typed));
                  },
                },
              ]
            : []),
          ...slots.map((slot) => {
            const item = worn.find((g) => g.slot === slot);
            return {
              key: slot,
              label: (
                <span class="slot-row">
                  {!item && <GearArt slot={slot} rarity="empty" size={26} />}
                  <span class="slot-name">{slotName(slot)}</span>
                  {item ? <GearRow item={item} /> : <span class="note">empty</span>}
                </span>
              ),
              onSelect: () => go({ name: 'slot', playerId: p.id, slot }),
            };
          }),
          ...(locked ? [] : [{ key: 'release', label: 'Release him', onSelect: () => go({ name: 'release', playerId: p.id }) }]),
        ]}
      />
    );
  }

  if (screen.name === 'slot') {
    const p = playerOf(league, screen.playerId);
    const kind = p.position === 'G' ? 'goalie' : 'skater';
    const back: Screen = { name: 'player', playerId: p.id };
    const current = wornBy(f, p.id).find((g) => g.slot === screen.slot);
    const choices = f.gear
      .filter((g) => g.kind === kind && g.slot === screen.slot && g.id !== current?.id)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || b.level - a.level || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        title={`${p.name}: ${slotName(screen.slot).toLowerCase()}`}
        header={current ? <GearRow item={current} /> : 'Nothing in this slot. The line under the list shows what each piece would change.'}
        onBack={() => go(back)}
        items={[
          ...choices.map((item) => ({
            key: item.id,
            label: <GearRow item={item} wearer={nameOf(item.wornBy)} />,
            detail: <EquipPreview f={f} player={p} slot={screen.slot} candidate={item} />,
            onSelect: () => {
              const result = equip(f, item.id, p.id);
              after(result.ok ? { ok: true, message: `${p.name} puts it on.` } : result, back);
            },
          })),
          ...(current
            ? [
                {
                  key: 'off',
                  label: 'Take it off',
                  detail: <EquipPreview f={f} player={p} slot={screen.slot} candidate={null} />,
                  onSelect: () => after(unequip(f, current.id), back),
                },
              ]
            : []),
          ...(choices.length === 0 && !current ? [{ key: 'none', label: 'You have no gear for this slot yet.', disabled: true }] : []),
        ]}
      />
    );
  }

  return undefined;
}
