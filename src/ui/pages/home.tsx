import { opened } from '../../core/opening';
import { deadlineOffers } from '../../core/deadline';
import { backupDue, lastExport } from '../safety';
import { EXPECTATION_RULES, expectationLine, expectationShort, nextExpectation } from '../../core/expectation';
import { announcerName, pregameLine } from '../../core/voice';
import { ArtifactCard, type ArtChip } from '../screens/season';
import { isVariant, RINK_BONUS, rinkInfo } from '../../core/rinks';
import { readTactics, tacticsLine } from '../../sim/tactics';
import { dropSecond } from '../../game/gamepad';
import standingsRules from '../../data/standings.json';
import { placeOf, points, type Row } from '../../core/standings';
import type { ComponentChildren } from 'preact';
import { bossInfo, teamStrength } from '../../core/bosses';
import { teamCrest } from '../../core/crest';
import { styleInfo } from '../../core/playStyle';
import { bailOut, canBailOut, homeGame } from '../../core/economy';
import { playerOf, rosterOf, teamOf, type Team } from '../../core/league';
import { talentInfo } from '../../core/mascot';
import { finishSeason } from '../../core/offseason';
import { jerseyColour, leagueName, prestige, prestigeEffects } from '../../core/prestige';
import { canPlay } from '../../core/roster';
import { artifactInfo, artifactModifiers, bossLossEnds, buySecondChance, buyShopArtifact, cupHeld, insuranceLeft, isCupTie, rerollPrice, rerollShop, secondChancePrice, shopArtifact, shopArtifactPrice, maxStrikes, pickRinger, recipeFor, seasonRegions, availableStops, buy, canSimulate, chooseEvent, currentStop, difficultyInfo, eventInfo, healPrice, healStrike, leaveShop, matchup, pickArtifact, powerupInfo, shopPrice, simulateGame, train, travel, buyScouting, scoutPrice, trainingChoices, trainingFocus, playoffSeed, isRival } from '../../core/season';
import type { Stop } from '../../core/seasonMap';
import { seasonSummary } from '../../core/seasonSummary';
import { teamColour } from '../../core/teamColours';
import { modified } from '../../sim/modifiers';
import { xpForLevel } from '../../core/xp';
import prestigeRules from '../../data/prestige.json';
import rules from '../../data/season.json';
import { CrestBadge } from '../Crest';
import { Icon } from '../Icon';
import { EventHeader, MatchupPoster, SeasonSummaryCard, ShopCard, StopCard, StrikeLights, TrainingGain } from '../screens/season';
import { Menu, type MenuItem } from '../Menu';
import type { PlayerRecord } from '../../core/player';
import { CapLine, CountUp, Dots, Face, money, PlayerRow, Ratings } from '../parts';
import { MapKey, SeasonMapView } from '../SeasonMap';
import type { AppCtx } from '../App';
import { count, ordinal } from './shared';

/** The hub: the off-season, the season map and every stop on it, and what a game earned. */
export function homePages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, setScreen, message, playing, joined, setJoined, together, rewards, mapFocus, setMapFocus,
    trainee, setTrainee, prefs, shown, f, league, season, team, myCrest, screenKey,
    go, after, home, top, openGroup, tile, weeklyCard, card, bump, fireSale,
    cashLine, playSeasonGame, keptWords, showOutcome, loadoutLine,
  } = app;

  // ---------------------------------------------------------------- home

  if (screen.name === 'home') {
    // Off-season hub.
    if (season.phase === 'offseason') {
      const ready = canPlay(league, team);
      const pending = f.offseason.pending.length;
      const lastBooks = f.books[f.books.length - 1];
      return (
        <Menu
          key={screenKey}
          remember="hub"
          columns={2}
          title={team.name}
          message={message}
          header={
            <>
              <div class="team-card">
                <CrestBadge crest={myCrest} size={58} />
                <div class="team-card-text">
                  <b>{team.name}</b>
                  <span>
                    Off-season before season {league.season} · {difficultyInfo(f.difficulty).name}
                  </span>
                  <span>
                    All-time {f.record.wins}-{f.record.losses}-{f.record.overtimeLosses}
                    {lastBooks ? ` · last season ${lastBooks.wins} wins${lastBooks.champion ? ', champions' : ''}` : ''}
                  </span>
                </div>
              </div>
              <CapLine league={league} team={team} />
              {cashLine}
              {fireSale && (
                <div class="warn">
                  Fire sale: you are out of cash, and the season cannot start until you are back to zero. Releasing a player under contract or letting
                  staff go now pays half a season of what they earn.
                </div>
              )}
              <div>You play in {leagueName(f.prestige.level)}.</div>
              <div>The sponsor's target for the coming season: {nextExpectation(f).text} Meeting it pays {Math.round(EXPECTATION_RULES.bonus * 100)}% more sponsorship; missing it, {Math.round(EXPECTATION_RULES.penalty * 100)}% less.</div>
              {f.prestige.level > 0 && <div>Prestige level {f.prestige.level}: {prestigeEffects(f.prestige.level).slice(0, 2).join(' ')}</div>}
              {!ready.ok && <div class="warn">Cannot play yet: {ready.reason}</div>}
            </>
          }
          help="A select · left/right and up/down move"
          items={[
            ...(pending > 0
              ? [
                  tile('contracts', 'Decide contracts', `${pending} to settle before the season can start`, () => go({ name: 'contracts' }), {
                    badge: pending,
                    primary: true,
                    wide: true,
                    detail: 'Re-sign each player or let him go.',
                  }),
                ]
              : []),
            tile('start', 'Start the season', `Season ${league.season}: choose how to play it`, () => go({ name: 'setup' }), {
              primary: pending === 0,
              wide: true,
              disabled: !ready.ok || pending > 0 || fireSale,
              detail: pending > 0
                ? 'Decide your expiring contracts first.'
                : fireSale
                  ? 'You are out of cash. Raise money first.'
                  : 'Your seventh skater is the spare: you can swap him in between games.',
            }),
            ...(canBailOut(f)
              ? [
                  tile('bailout', 'League bail-out', 'Ask the league to cover your debt', () => {
                    const result = bailOut(f);
                    after(result.ok ? { ok: true, message: 'The league has covered your debt. Your franchise value has dropped.' } : result);
                  }, { wide: true, detail: 'You have nothing left to sell. The league pays what you owe and your franchise value drops by a tenth.' }),
                ]
              : []),
            card('team', 'Team', pending > 0 ? `${pending} contract${pending === 1 ? '' : 's'} due` : `${rosterOf(league, team).length} players`, () => openGroup('team'), {
              badge: pending,
              detail: 'Roster, lineup, free agents, trades and the mascot.',
            }),
            card('office', 'Front office', `Cash ${money(f.cash)}`, () => openGroup('office'), { detail: 'Finances, staff, facilities and prestige.' }),
            card('collection', 'Collection', f.packs.length > 0 ? `${f.packs.length} pack${f.packs.length === 1 ? '' : 's'} to open` : `${f.gear.length} pieces of gear`, () => openGroup('collection'), {
              badge: f.packs.length,
              detail: 'Packs, gear, artifacts and your jersey.',
            }),
            card('league', 'League', `Trophy room · ${count((f.history ?? []).filter((x) => x.outcome === 'champion').length, 'championship')}`, () => openGroup('league')),
            card('settings', 'Settings', `${difficultyInfo(f.difficulty).name} · sound ${prefs.sound ? 'on' : 'off'}`, () => openGroup('settings'), {
              detail: 'Difficulty, sound, rink detail, save and load.',
            }),
            card('exhibition', 'Exhibition', 'A game that does not count', () => go({ name: 'exhibition' }), {
              disabled: !ready.ok,
              detail: 'A one-off game against any team. Nothing is won or lost.',
            }),
            ...(opened(f, 'weekly') ? [weeklyCard()] : []),
          ]}
        />
      );
    }

    // Season over.
    if (season.phase === 'ended') {
      return (
        <Menu
          key={screenKey}
          stack
          title={`Season ${league.season} is over`}
          message={message}
          header={
            <>
              <SeasonSummaryCard summary={seasonSummary(f)} crest={myCrest} season={league.season} artifacts={f.artifacts.length} />
              {season.expectation && <div>{expectationLine(f)}</div>}
              {cupHeld(f) && <div class="good">You won the cup.</div>}
              {season.outcome === 'champion' && f.prestige.level < prestigeRules.maxLevel && <div class="warn">As champions you can prestige and go up to {leagueName(f.prestige.level + 1)}.</div>}
            </>
          }
          help="A continue"
          items={[
            tile('next', 'Continue to the off-season', 'XP is banked, everyone is a year older, contracts tick down', () => after(finishSeason(f), { name: 'report' }), {
              primary: true,
              icon: 'play',
            }),
            tile('recap', 'The season on one card', 'A picture of it, to keep or to send', () => go({ name: 'recap' }), { icon: 'report' }),
          ]}
        />
      );
    }

    // A boss is beaten: pick an artifact.
    if (season.stage === 'reward') {
      return (
        <Menu
          key={screenKey}
          title="Choose an artifact"
          message={message}
          header="Take one. You keep it for the rest of this season. Some only count at certain moments; a bargain costs you first and pays after."
          items={season.offer.map((id) => {
            const a = artifactInfo(id);
            const half = recipeFor(id);
            const pairs = half && f.artifacts.includes(half.partner) ? ` With your ${artifactInfo(half.partner).name} it becomes ${artifactInfo(half.makes).name}: ${artifactInfo(half.makes).description}` : '';
            const chips: ArtChip[] = [
              ...(a.bargain ? [{ text: `Bargain · ${a.bargain.games} games`, tone: 'bargain' as const }] : []),
              ...(pairs !== '' && half ? [{ text: `Makes ${artifactInfo(half.makes).name}`, tone: 'recipe' as const }] : []),
            ];
            return {
              key: id,
              label: <ArtifactCard name={a.name} description={a.description} modifiers={a.bargain ? [...a.modifiers, ...a.bargain.handicap] : a.modifiers} chips={chips} tall />,
              detail: `${a.description}${pairs}`,
              onSelect: () => after(pickArtifact(f, id)),
            };
          })}
          columns={Math.max(1, Math.min(3, season.offer.length))}
        />
      );
    }
    if (season.stage === 'ringer') {
      const offer = season.ringerOffer ?? [];
      return (
        <Menu
          key={screenKey}
          title="Hire a ringer?"
          message={message}
          header="A loan skater for the rest of this season. He plays in place of your lowest-rated dressed skater, is not on your roster or your cap, and leaves when the season ends."
          items={[
            ...offer.map((x, i) =>
              tile(`ringer-${i}`, x.player.name, `${x.player.position} · ${x.player.overall} overall · ${x.player.talent ? talentInfo(x.player.talent).name : 'no talent'}${x.fee > 0 ? ` · ${x.fee} Pucks a game` : ''}`, () => after(pickRinger(f, i)), {
                icon: 'team',
                primary: true,
                detail: `${x.player.talent ? `${talentInfo(x.player.talent).name}: ${talentInfo(x.player.talent).description} ` : ''}${x.fee > 0 ? `He costs ${x.fee} Pucks after every game.` : 'He costs nothing.'}`,
              }),
            ),
            tile('ringer-none', 'Hire nobody', 'Keep your own six', () => after(pickRinger(f, null)), { detail: 'Your lineup stays as it is.' }),
          ]}
        />
      );
    }

    /** The four groups as dashboard tiles, for the foot of every in-season screen. */
    /** Where you stand, in a few words, for the League card. */
    const leagueStatus = (): string => {
      const table = season.standings;
      if (!table) return 'Standings and results';
      const seed = playoffSeed(f);
      if (seed !== null) return `Playoffs: seed ${seed} of ${season.bracket?.seeds.length ?? 4}`;
      return `${ordinal(placeOf(table, league.userTeamId))} of ${league.teams.length} · ${points(table[league.userTeamId] as Row)} points`;
    };
    const groupCards = (): MenuItem[] => [
      card('team', 'Team', 'Lineup, players, mascot', () => openGroup('team')),
      card('office', 'Front office', `Cash ${money(f.cash)}`, () => openGroup('office')),
      card('collection', 'Collection', f.packs.length > 0 ? `${f.packs.length} to open` : `${f.gear.length} pieces`, () => openGroup('collection'), { badge: f.packs.length }),
      card('league', 'League', leagueStatus(), () => openGroup('league')),
      // Once there is a season behind you, the tile says when the save has no recent copy outside the phone.
      card('settings', 'Settings', (f.history ?? []).length > 0 && backupDue(lastExport(), Date.now()) ? 'Back up your save' : 'Sound, detail, save', () => openGroup('settings')),
      card('exhibition', 'Exhibition', 'A game that does not count', () => go({ name: 'exhibition' })),
      ...(opened(f, 'weekly') ? [weeklyCard()] : []),
    ];
    const best = (players: PlayerRecord[]): PlayerRecord[] => [...players].sort((x, y) => y.overall - x.overall).slice(0, 3);

    // A game is waiting: a map game, a boss, or a playoff game.
    const game = matchup(f);
    if (game) {
      const strength = Math.round(game.away.players.reduce((s, p) => s + p.overall, 0) / game.away.players.length);
      const mine = Math.round(game.home.players.reduce((s, p) => s + p.overall, 0) / game.home.players.length);
      const series = season.playoffs;
      const theirCrest = teamCrest(game.away.name, teamColour(game.away.name, jerseyColour(f)));
      const theirStyle = styleInfo(game.away.setup.style);
      /** The goalie of a dressed team: the last player, unless a mascot has somehow taken the spot. */
      const goalieOf = (players: PlayerRecord[]): { goalie?: PlayerRecord } => {
        const g = players[players.length - 1];
        return g && g.position === 'G' ? { goalie: g } : {};
      };
      return (
        <Menu
          key={screenKey}
          remember="game"
          columns={2}
          title={game.title}
          message={message}
          header={
            <MatchupPoster
              home={{ crest: myCrest, name: team.name, strength: mine, stars: best(game.home.players), ...goalieOf(game.home.players) }}
              away={{ crest: theirCrest, name: game.away.name, strength, stars: best(game.away.players), ...goalieOf(game.away.players), ...(theirStyle ? { style: theirStyle.name } : {}) }}
            >
              {theirStyle && (
                <div class="note">
                  {game.away.name} play {theirStyle.name.toLowerCase()}. {theirStyle.describe}
                </div>
              )}
              <div class="note radio">
                <b>{announcerName(team.name)}, on the radio:</b> {pregameLine(f)}
              </div>
              {isCupTie(f, currentStop(f)) && (
                <div class="note">
                  A cup tie ({season.cup?.won ?? 0} of {seasonRegions(f)} won). Win and you stay in the cup, with {rules.cupCurrency} more Pucks; lose and the cup is over for this season, at no other cost.
                </div>
              )}
              {game.rules?.mercy !== undefined && <div class="note">Mercy rule: the game is called off if either team leads by {game.rules.mercy}.</div>}
              {season.ringer && (
                <div class="note">
                  Ringer: {season.ringer.player.name} ({season.ringer.player.overall}) plays for you{season.ringer.fee > 0 ? `, for ${season.ringer.fee} Pucks a game` : ''}.
                </div>
              )}
              {isVariant(game.rink) && (
                <div class="note">
                  Rink: {rinkInfo(game.rink).name}. {rinkInfo(game.rink).describe}
                </div>
              )}
              {team.lineup.tactics && <div class="note">Your tactics: {tacticsLine(readTactics(team.lineup.tactics))}. Change them under Team, Lineup, or in the pause menu.</div>}
              {game.kind === 'playoff' && season.bracket && (
                <div class="note">
                  Seeds: {season.bracket.seeds.map((id, i) => `${i + 1} ${teamOf(league, id).name}`).join(' · ')}.{' '}
                  {season.bracket.otherWinner
                    ? `${teamOf(league, season.bracket.otherWinner).name} won the other semi-final.`
                    : `The other semi-final: ${season.bracket.other.map((id) => teamOf(league, id).name).join(' against ')}.`}
                </div>
              )}
              {game.trait && (
                <div class="banner bad">
                  <Icon name="boss" size={18} />
                  <span>{game.trait}</span>
                </div>
              )}
              <div class="banner">
                <Icon name="mascot" size={18} />
                <span>
                  Mascots: your {game.mascots.home.mascot.name} {Math.round(game.mascots.home.chance * 100)}% (in for {game.mascots.home.sits}) · their {game.mascots.away.mascot.name}{' '}
                  {Math.round(game.mascots.away.chance * 100)}%. One may come for a period: at the start, or when two behind.
                </span>
              </div>
              {f.prestige.level > 0 && (
                <div class="note">
                  Prestige {f.prestige.level}: they play {f.prestige.level * prestigeRules.opponentRatingPerLevel} points better than shown, and react sooner.
                </div>
              )}
              <div class="poster-foot">
                <StrikeLights strikes={season.strikes} of={maxStrikes(f)} />
                {series && (
                  <span>
                    Best of {rules.seriesWins * 2 - 1}: you <Dots filled={series.wins} total={rules.seriesWins} /> them <Dots filled={series.losses} total={rules.seriesWins} />
                  </span>
                )}
                <span>{homeGame(f, season.gamesPlayed + 1) ? 'Home' : 'Road'}</span>
              </div>
              <div class="poster-loadout">
                <Icon name="powerups" size={16} />
                {loadoutLine}
                <span class="note">Change in Collection</span>
              </div>
            </MatchupPoster>
          }
          help="A select · left/right and up/down move"
          items={[
            ...(joined
              ? [
                  tile('together', 'Two players: co-op', 'Player 2 is on your team for this game', () => {
                    dropSecond();
                    setJoined(false);
                  }, { wide: true, icon: 'team', detail: 'A second controller has joined: both of you play for your team, each with his own skater (yours has the red ring, his the blue). Press here to send player 2 away and play alone.' }),
                ]
              : []),
            tile('play', keptWords ? 'Carry on' : 'Play', keptWords ? `The game you left: ${keptWords}` : game.elite ? 'Elite games must be played' : game.kind === 'game' ? 'Take the ice' : game.kind === 'boss' ? (bossLossEnds(f) && insuranceLeft(f) === 0 ? 'Lose and the season is over' : bossLossEnds(f) ? 'Insured for one loss' : 'Bosses must be played') : 'Playoff games must be played', playSeasonGame, { primary: true, wide: true, ...(keptWords ? { detail: 'This game was under way when you left it, and was kept. It opens paused, where it stopped.' } : {}) }),
            ...(canSimulate(f)
              ? [
                  tile('simulate', 'Simulate', 'Settle it without playing', () => showOutcome(simulateGame(f)), {
                    wide: true,
                    detail: `The result comes from the two teams' ratings, with yours counted ${rules.simPenalty} points weaker, so playing is the better bet. Powerups are not used.`,
                  }),
                ]
              : []),
            ...groupCards(),
          ]}
        />
      );
    }

    const stop = currentStop(f);

    // Training.
    if (stop && stop.kind === 'training') {
      const gain = Math.round(modified(rules.trainingBump, 'trainingBonus', artifactModifiers(f)));
      if (trainee !== null && season.dressed.includes(trainee)) {
        const p = playerOf(league, trainee);
        return (
          <Menu
            key={`${screenKey}-train-${trainee}`}
            title={`Training: ${p.name}`}
            message={message}
            header={
              <>
                <div>
                  <PlayerRow player={p} bump={bump(trainee)} />
                </div>
                <div>Choose what he works on. It lasts for the rest of this season.</div>
                <Ratings player={p} />
              </>
            }
            onBack={() => setTrainee(null)}
            help="A choose · B another player"
            items={trainingChoices(f, trainee).map((choice) => ({
              key: choice.id,
              label: `${choice.name} · ${choice.description}`,
              onSelect: () => {
                const id = trainee;
                setTrainee(null);
                after(train(f, id, choice.id));
              },
            }))}
          />
        );
      }
      return (
        <Menu
          key={screenKey}
          title="Training"
          message={message}
          header={`Pick one dressed player, then what he works on: +${gain} to everything, +${trainingFocus(f)} to one rating, or a trait.`}
          help="A pick him"
          items={season.dressed.map((id) => {
            const p = playerOf(league, id);
            return { key: id, label: <PlayerRow player={p} bump={bump(id)} />, detail: <TrainingGain player={p} gain={gain} />, onSelect: () => setTrainee(id) };
          })}
        />
      );
    }

    // Event.
    if (stop && stop.kind === 'event' && stop.eventId) {
      const event = eventInfo(stop.eventId);
      return (
        <Menu
          key={screenKey}
          stack
          title={event.title}
          header={
            <>
              <EventHeader text={event.text} />
              <div class="poster-foot">
                <StrikeLights strikes={season.strikes} of={maxStrikes(f)} />
                <span>Pucks {season.currency}</span>
                <span>Powerups {season.powerups.length}</span>
              </div>
            </>
          }
          help="A choose"
          items={event.choices.map((choice, i) => tile(String(i), choice.label, '', () => after(chooseEvent(f, i)), { icon: 'event', primary: true }))}
        />
      );
    }

    // Shop.
    if (stop && stop.kind === 'shop') {
      const stock = stop.stock ?? [];
      return (
        <Menu
          key={screenKey}
          remember="shop"
          columns={2}
          title="Shop"
          message={message}
          header={
            <>
              <div class="purse">
                <i>Pucks to spend</i>
                <b>{season.currency}</b>
              </div>
              <div class="poster-foot">
                <StrikeLights strikes={season.strikes} of={maxStrikes(f)} />
                <span>Powerups in the bag {season.powerups.length}</span>
                {insuranceLeft(f) > 0 && <span>Insured against a boss loss</span>}
              </div>
            </>
          }
          help="A buy · left/right and up/down move"
          items={[
            ...stock.map((id, i): MenuItem => {
              const p = powerupInfo(id);
              const price = shopPrice(f, id);
              return {
                key: `${id}-${i}`,
                label: <ShopCard id={id} name={p.name} price={price} affordable={season.currency >= price} />,
                detail: p.description,
                disabled: season.currency < price,
                onSelect: () => after(buy(f, id)),
              };
            }),
            // The top shelf: one artifact, for a good deal more than anything else here.
            ...(shopArtifact(f)
              ? [
                  ((): MenuItem => {
                    const a = artifactInfo(shopArtifact(f) as string);
                    const price = shopArtifactPrice(f);
                    return {
                      key: 'shelf',
                      wide: true,
                      label: (
                        <span class="shop-card">
                          <ArtifactCard name={a.name} description={a.description} modifiers={a.modifiers} chips={[{ text: 'Top shelf', tone: 'recipe' }]} />
                          <span class={`price-tag${season.currency >= price ? '' : ' short'}`}>{price}</span>
                        </span>
                      ),
                      detail: `${a.description} An artifact, kept for the rest of the season.`,
                      disabled: season.currency < price,
                      onSelect: () => after(buyShopArtifact(f)),
                    };
                  })(),
                ]
              : []),
            // Insurance, where a loss to a boss would end the season.
            ...(bossLossEnds(f)
              ? [
                  {
                    key: 'second',
                    wide: true,
                    label: (
                      <span class="shop-card">
                        <Icon name="bailout" size={26} />
                        <span class="shop-name">Second chance</span>
                        <span class={`price-tag${season.currency >= secondChancePrice(f) ? '' : ' short'}`}>{secondChancePrice(f)}</span>
                      </span>
                    ),
                    detail: season.secondChance ? 'You already hold one: your next loss to a boss is a strike and a rematch.' : 'Insurance: one loss to a boss is only a strike, and you play him again. You can hold one.',
                    disabled: Boolean(season.secondChance) || season.currency < secondChancePrice(f),
                    onSelect: () => after(buySecondChance(f)),
                  } as MenuItem,
                ]
              : []),
            {
              key: 'heal',
              wide: true,
              label: (
                <span class="shop-card">
                  <Icon name="bailout" size={26} />
                  <span class="shop-name">Wipe one strike</span>
                  <span class={`price-tag${season.currency >= healPrice(f) ? '' : ' short'}`}>{healPrice(f)}</span>
                </span>
              ),
              detail: season.strikes === 0 ? 'You have no strikes to wipe.' : 'Removes one of your strikes.',
              disabled: season.strikes === 0 || season.currency < healPrice(f),
              onSelect: () => after(healStrike(f)),
            },
            {
              key: 'scout',
              wide: true,
              label: (
                <span class="shop-card">
                  <Icon name="detail" size={26} />
                  <span class="shop-name">Scouting report on the boss</span>
                  <span class={`price-tag${season.currency >= scoutPrice(f) ? '' : ' short'}`}>{scoutPrice(f)}</span>
                </span>
              ),
              detail: season.scouted ? 'You already have a report on the next boss.' : 'The next boss you meet has a weaker team that reacts slower.',
              disabled: Boolean(season.scouted) || season.currency < scoutPrice(f),
              onSelect: () => after(buyScouting(f)),
            },
            ...(rerollPrice(f) !== null
              ? [
                  {
                    key: 'reroll',
                    wide: true,
                    label: (
                      <span class="shop-card">
                        <Icon name="shop" size={26} />
                        <span class="shop-name">See what is in the back</span>
                        <span class={`price-tag${season.currency >= (rerollPrice(f) as number) ? '' : ' short'}`}>{rerollPrice(f)}</span>
                      </span>
                    ),
                    detail: 'Swaps the powerups and the top shelf for others. It costs more each time in the same shop.',
                    disabled: season.currency < (rerollPrice(f) as number),
                    onSelect: () => after(rerollShop(f)),
                  } as MenuItem,
                ]
              : []),
            tile('leave', 'Leave the shop', 'Back to the map', () => after(leaveShop(f)), { wide: true, icon: 'play' }),
          ]}
        />
      );
    }

    // The map: choose where to go next.
    const options = availableStops(f);
    const region = options[0]?.region ?? 0;
    const myStrength = Math.round(teamStrength(league, team.id));
    /** A sentence about the rink a stop is played on; nothing for the standard rink. */
    const rinkLine = (id: string | undefined, pays: boolean): string => (isVariant(id) ? ` Played on ${rinkInfo(id).name}: ${rinkInfo(id).describe}${pays ? ` It pays ${RINK_BONUS} more Pucks.` : ''}` : '');
    const stopCard = (s: Stop): { label: ComponentChildren; detail: string } => {
      if (s.kind === 'game' && s.opponentId) {
        const opponent = league.teams.find((x) => x.id === s.opponentId) as Team;
        return {
          label: (
            <StopCard
              icon="game"
              kind={`${isRival(f, s.opponentId) ? (s.elite ? 'Elite rival game' : 'Rival game') : s.elite ? 'Elite game' : 'Game'}${isVariant(s.rink) ? ` · ${rinkInfo(s.rink).name}` : ''}`}
              title={opponent.name}
              crest={teamCrest(opponent.name)}
              theirs={Math.round(teamStrength(league, opponent.id)) + (s.elite ? rules.eliteRatingBump : 0)}
              mine={myStrength}
            />
          ),
          detail: (isCupTie(f, s) ? `A cup tie: win and you stay in the cup, with ${rules.cupCurrency} more Pucks; lose and the cup is over for the season, at no other cost. ` : '') + (s.elite
            ? `A stronger team playing above itself. Win: ${rules.eliteCurrency} more Pucks and a choice of ${rules.eliteArtifactChoices} artifacts. Lose: a strike.`
            : isRival(f, s.opponentId)
              ? `Your rivals. A win pays ${standingsRules.rivalCurrency} more Pucks and a pack; a loss is a strike.${rinkLine(s.rink, true)}`
              : `A win pays Pucks and a pack; a loss is a strike.${rinkLine(s.rink, true)}`),
        };
      }
      if (s.kind === 'boss' && s.bossId) {
        const boss = bossInfo(s.bossId);
        return {
          label: <StopCard icon="boss" kind={isVariant(s.rink) ? `Boss · ${rinkInfo(s.rink).name}` : 'Boss'} title={boss.name} />,
          detail: `${boss.trait}: ${boss.description}${rinkLine(s.rink, false)} Beat him to choose an artifact and wipe a strike; ${bossLossEnds(f) && insuranceLeft(f) === 0 ? 'lose and the season is over' : 'lose and it is a strike and a rematch'}${bossLossEnds(f) && insuranceLeft(f) > 0 ? ' (your insurance covers one loss)' : ''}.${season.scouted ? ' You have a scouting report on him.' : ''}`,
        };
      }
      if (s.kind === 'training') return { label: <StopCard icon="training" kind="Training" title="One player improves" />, detail: 'One dressed player gains a little of everything, a lot of one rating, or a trait, for the rest of the season.' };
      if (s.kind === 'shop') {
        const shelf = (s.stock ?? []).map((id) => powerupInfo(id).name);
        return {
          label: <StopCard icon="shop" kind="Shop" title={shelf.length > 0 ? shelf.join(', ') : 'Powerups for Pucks'} />,
          detail: `On the shelf: ${shelf.join(', ') || 'nothing'}. Also: wipe a strike for ${healPrice(f)} Pucks, or a scouting report on the boss for ${scoutPrice(f)}.`,
        };
      }
      const happening = s.eventId ? eventInfo(s.eventId) : null;
      return { label: <StopCard icon="event" kind="Event" title={happening ? happening.title : 'Something happens'} />, detail: happening ? happening.text : 'Something happens on the road, and you choose how to handle it.' };
    };
    const ahead = (s: Stop): string => {
      const next = [...new Set(s.next.map((id) => season.map?.stops[id]?.kind).filter(Boolean))];
      return next.length > 0 ? ` Leads to: ${next.join(' or ')}.` : '';
    };
    return (
      <Menu
        key={screenKey}
        remember="map"
        columns={2}
        title={`${season.weekly ? `Weekly run ${season.weekly}` : `Season ${league.season}`} · Region ${region + 1} of ${seasonRegions(f)}`}
        message={message}
        onFocus={setMapFocus}
        header={
          <>
            {(season.expectation || season.cup) && (
              <div class="note">
                {[expectationShort(f), season.cup ? (season.cup.alive ? `Cup: ${season.cup.won} of ${seasonRegions(f)} ties won` : 'Cup: out this season') : ''].filter(Boolean).join(' · ')}
              </div>
            )}
            {season.map && (
              <SeasonMapView map={season.map} last={season.last} current={season.current} open={options.map((o) => o.id)} focus={mapFocus} walked={season.visited} region={region} cup={season.cup?.alive === true} />
            )}
            <MapKey cup={season.cup?.alive === true} />
            <div class="poster-foot">
              <StrikeLights strikes={season.strikes} of={maxStrikes(f)} />
              <span>Powerups {season.powerups.length}</span>
              <span>Artifacts {f.artifacts.length}</span>
              {season.temps.map((t) => (
                <span key={t.label}>
                  {t.label} ({t.games})
                </span>
              ))}
            </div>
          </>
        }
        help="A go there · left/right and up/down move"
        items={[
          ...(deadlineOffers(f).length > 0
            ? [
                tile('deadline', 'Trade deadline', `${count(deadlineOffers(f).length, 'offer')} · until your next game`, () => go({ name: 'deadline' }), {
                  icon: 'trade',
                  wide: true,
                  detail: 'Other clubs have rung with offers: one skater of theirs for one of yours. You may take one. They are withdrawn when you play your next game.',
                }),
              ]
            : []),
          ...options.map((s): MenuItem => {
            const d = stopCard(s);
            return { key: s.id, wide: options.length === 1, label: d.label, detail: `${d.detail}${ahead(s)}`, onSelect: () => after(travel(f, s.id)) };
          }),
          ...groupCards(),
        ]}
      />
    );
  }

  if (screen.name === 'rewards') {
    const r = rewards;
    if (!r) return <Menu key={screenKey} title="Game over" items={[{ key: 'ok', label: 'Continue', onSelect: top }]} />;
    // What is shown builds up one press at a time: result, money, XP, then packs and milestones.
    const extras = r.pack !== null || r.milestones.length > 0;
    const steps = extras ? 4 : 3;
    const shown = Math.min(screen.shown, steps);
    const last = shown >= steps;
    return (
      <Menu
        key={`rewards-${shown}`}
        stack
        title={r.won ? 'Victory' : 'Defeat'}
        header={
          <div class="rewards">
            <div>
            <div class={`result-banner ${r.won ? 'won' : 'lost'}`}>
              {r.won ? 'You win' : r.forfeit ? 'Forfeit' : 'You lose'} {r.score[0]} – {r.score[1]}
            </div>
            {shown >= 2 && (
              <div>
                <div class="reward">
                  <i>Cash</i>
                  <b class={r.cash < 0 ? 'down' : 'up'}>
                    <CountUp value={r.cash} format={(v) => `${r.cash >= 0 ? '+' : ''}${money(v)}`} />
                  </b>
                </div>
                <div class="reward">
                  <i>Pucks</i>
                  <b>{r.pucks > 0 ? <CountUp value={r.pucks} format={(v) => `+${Math.round(v)}`} /> : '0'}</b>
                </div>
                {!r.won && season.phase !== 'ended' && (
                  <div class="reward">
                    <i>Strikes</i>
                    <Dots filled={season.strikes} total={maxStrikes(f)} />
                  </div>
                )}
              </div>
            )}
            {shown >= 4 && (
              <div>
                {r.pack && (
                  <div class="reward">
                    <i>Pack</i>
                    <b>{r.pack}</b>
                  </div>
                )}
                {r.milestones.map((name) => (
                  <div class="reward" key={name}>
                    <i>Milestone</i>
                    <b>{name}</b>
                  </div>
                ))}
              </div>
            )}
            </div>
            {shown >= 3 && (
              <div class="reward-xp">
                {r.xp.map((x) => {
                  const p = league.players[x.id];
                  if (!p) return null;
                  const banked = p.xp + (season.xp[x.id] ?? 0);
                  const need = xpForLevel(p.level);
                  return (
                    <>
                      <span class="reward-who">
                        <Face player={p} size={22} /> {x.name}
                      </span>
                      <span class="meter-bar">
                        <span class={`meter-fill${banked >= need ? '' : ' cool'}`} style={{ width: `${Math.min(1, banked / need) * 100}%`, display: 'block' }} />
                      </span>
                      <span>
                        <CountUp value={x.earned} format={(v) => `+${Math.round(v)} XP`} />
                        {banked >= need ? ' · level up' : ''}
                      </span>
                    </>
                  );
                })}
              </div>
            )}
          </div>
        }
        help="A next"
        items={[
          last
            ? { key: 'done', label: <b>Continue</b>, detail: shown >= 3 ? 'XP is banked, and levels are gained, when the season ends.' : undefined, onSelect: top }
            : { key: 'next', label: <b>Next</b>, onSelect: () => setScreen({ name: 'rewards', shown: shown + 1 }) },
        ]}
      />
    );
  }

  return undefined;
}
