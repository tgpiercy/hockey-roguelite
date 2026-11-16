import type { ComponentChildren } from 'preact';
import { acceptDeadline, deadlineOffers, deadlineWords } from '../../core/deadline';
import { playerOf, teamOf } from '../../core/league';
import { seasonRecap } from '../../core/recap';
import { Menu } from '../Menu';
import { money } from '../parts';
import { RecapPicture, savePicture } from '../RecapPicture';
import { TradeOffer } from '../screens/club';
import type { AppCtx } from '../App';

/** The trade deadline's offers, and the picture of a season that has ended. */
export function deadlinePages(app: AppCtx): ComponentChildren | undefined {
  const { screen, message, setMessage, f, league, screenKey, go, after, tile, myCrest } = app;

  if (screen.name === 'deadline') {
    const offers = deadlineOffers(f);
    return (
      <Menu
        key={screenKey}
        title="Trade deadline"
        message={message}
        header={
          <div class="note">
            {offers.length > 0
              ? 'Other clubs have rung. Each offers one skater for one of yours. You may take one; they are withdrawn when you play your next game. Your roster is otherwise locked until the off-season.'
              : 'Nobody has an offer for you this season.'}
          </div>
        }
        onBack={() => go({ name: 'home' })}
        items={[
          ...offers.map((o, index) => {
            const club = teamOf(league, o.teamId);
            const theirs = playerOf(league, o.theirId);
            const mine = playerOf(league, o.mineId);
            const words = deadlineWords(o.kind);
            return tile(`offer-${index}`, words.name, `${theirs.name} for ${mine.name}`, () => go({ name: 'deadlineOffer', index }), {
              icon: 'trade',
              detail: (
                <>
                  <TradeOffer give={mine} get={theirs} accepted verdict={club.name} />
                  <div class="note">{words.what}</div>
                </>
              ),
            });
          }),
          tile('back', 'Back to the map', 'Take none of them, for now', () => go({ name: 'home' }), { icon: 'play' }),
        ]}
      />
    );
  }

  if (screen.name === 'deadlineOffer') {
    const offer = deadlineOffers(f)[screen.index];
    if (!offer) {
      go({ name: 'home' }, 'That offer is no longer on the table.');
      return null;
    }
    const club = teamOf(league, offer.teamId);
    const theirs = playerOf(league, offer.theirId);
    const mine = playerOf(league, offer.mineId);
    return (
      <Menu
        key={screenKey}
        stack
        title={club.name}
        header={
          <>
            <TradeOffer give={mine} get={theirs} accepted verdict={`${club.name} offer this.`} />
            <div class="note">
              {theirs.name} takes {mine.name}'s place in your lineup, and {mine.name}'s gear returns to your inventory. Your payroll goes {theirs.capHit >= mine.capHit ? 'up' : 'down'} by {money(Math.abs(theirs.capHit - mine.capHit))}. The other offers are withdrawn.
            </div>
          </>
        }
        onBack={() => go({ name: 'deadline' })}
        initialFocus={1}
        items={[
          tile('yes', 'Make the trade', `${mine.name} for ${theirs.name}`, () => after(acceptDeadline(f, screen.index), { name: 'home' }), { icon: 'trade', primary: true }),
          tile('no', 'No, go back', 'Look at the other offers', () => go({ name: 'deadline' }), { icon: 'play' }),
        ]}
      />
    );
  }

  if (screen.name === 'recap') {
    const recap = seasonRecap(f);
    return (
      <Menu
        key={screenKey}
        stack
        title={`Season ${recap.season}: the picture`}
        message={message}
        header={<RecapPicture recap={recap} crest={myCrest} id="recap-picture" />}
        onBack={() => go({ name: 'home' })}
        items={[
          tile('save', 'Save the picture', 'A PNG file, to keep or to send', () => void savePicture('recap-picture', `third-line-season-${recap.season}.png`).then((ok) => setMessage(ok ? 'Saved to your downloads.' : 'This browser would not save the picture.')), { icon: 'save', primary: true }),
          tile('back', 'Back', 'To the end of the season', () => go({ name: 'home' }), { icon: 'play' }),
        ]}
      />
    );
  }

  return undefined;
}
