# Hockey Roguelite – Game Design Doc

Oct 14, 2026 · @Timothy Graeme Piercy

## Overview

A mobile arcade hockey roguelite where the team is the star: build a roster under a salary cap, run 3-on-3 season campaigns, and chase permanent gear through packs.

- **Platform:** mobile (iOS and Android), Bluetooth Xbox controller as primary input, touch as fallback
- **Inspiration:** arcade 3-on-3 hockey with roguelite run structure; original name, art and characters
- **Engine:** web prototype first to prove the feel, then Godot or Unity for the real build

**Design pillars**

1. Fast, physical 3-on-3 hockey that feels good on a controller
2. Team building under cap pressure is the core decision
3. Two progression layers: runs reset, the franchise and gear persist
4. Every season tells a story: rookies rise, veterans fade

## On-ice gameplay

Games are 3-on-3: three skaters and a goalie per side, viewed top-down, with the user controlling whichever skater is nearest the puck.

- **Dressed lineup:** 7 players per campaign (6 skaters + 1 goalie): two lines of 3 that swap on line changes
- **Fatigue:** skaters tire with ice time; tired players skate and shoot worse, which makes line changes a real call
- **Game length:** 3 periods of about 2 minutes, sudden-death OT

| Button | Action |
| --- | --- |
| Left stick | Skate |
| A | Pass (hold for saucer pass) |
| X | Shoot (hold to charge) |
| B | Body check / poke check |
| Y | Switch player |
| RT | Sprint |
| LT / RB | Activate powerups |
| LB | Line change |

## League, players and grades

Every player comes from one league-wide pool of generated players; there is no user-created player.

- **League:** about 12 AI teams plus yours, each with its own roster drawn from the pool
- **Player profile:** name, position (F, D or G), age, skills, overall rating, grade, cap hit
- **Skater skills:** shooting, passing, speed, checking, puck control, stamina
- **Goalie skills:** reflexes, positioning, rebound control, stamina
- **Pool refresh:** each off-season, veterans retire and a rookie class enters

The overall rating maps to a letter grade, and the grade sets the cap hit.

| Grade | Overall | Typical cap hit |
| --- | --- | --- |
| S | 95+ | $11M+ |
| A+ / A | 88–94 | $8–11M |
| B+ / B | 78–87 | $4–8M |
| C+ / C | 65–77 | $1.5–4M |
| D | under 65 | $0.8–1.5M |

## Roster building and salary cap

Each season starts with a roster of 7 skaters plus 1 goalie, built under a hard salary cap.

- **Cap:** a working number of $35M, tuned so one S-grade star forces cheap depth elsewhere
- **Moves:** sign free agents, release players, and trade with AI teams in the off-season
- **Contracts:** 1–4 year terms; expiring players can be re-signed at a new cap hit based on current grade
- **Starting team:** a randomized, mostly C-grade roster so early seasons are about finding value

## Season campaign and run structure

A season campaign is the roguelite run: pick 7 from the roster and push through a branching map to the championship.

1. **Off-season:** sign, trade and release players under the cap; equip gear
2. **Dress the lineup:** choose 6 skaters and 1 goalie for the run; the other skater stays home
3. **Run map:** branching nodes, each a game, training session, random event or shop
4. **Boss teams:** a tougher team ends each region of the map
5. **Playoffs:** a bracket where a series loss ends the run
6. **Season end:** XP banked, players age, contracts tick down, the pool refreshes

Powerups and artifacts earned during a run stay through that season and later seasons until the user prestiges.

## Player progression and aging

Players earn XP by playing and spend it to rank up skills, while age slowly pulls their ratings back down.

- **XP sources:** ice time, goals, assists, hits, blocked shots; goalies earn from saves and wins
- **Rank-ups:** each level grants skill points, capped by a hidden potential rating
- **Benched players:** earn a small share of XP so depth players still develop

| Age | Phase | Effect each season |
| --- | --- | --- |
| 18–25 | Growth | Bonus XP gain |
| 26–30 | Peak | No decline |
| 31–34 | Decline | Speed and stamina drop first |
| 35+ | Steep decline | All skills drop; retirement chance rises |

Passing and positioning decline slowest, so smart veterans stay useful longer than fast ones.

## Equipment, rarity and set bonuses

Gear is permanent: it survives seasons and prestige, and each player equips up to 6 pieces.

- **Slots:** stick, skates, gloves, helmet, pads, jersey; each piece boosts 1–3 skills
- **Duplicates:** scrap into tape currency, spent to level up owned gear

| Rarity | Drop rate | Skill boosts | Extra |
| --- | --- | --- | --- |
| Common | 60% | 1 | None |
| Rare | 28% | 2 | None |
| Epic | 10% | 2–3 | One perk |
| Legendary | 2% | 3 | One strong perk |

| Set | 2-piece bonus | 4-piece bonus |
| --- | --- | --- |
| Sniper | +10% shot power | Charged one-timer |
| Enforcer | +Checking | Big hits knock the puck loose |
| Burner | +Speed | Breakaway speed boost |
| Playmaker | +Passing | Passes thread through sticks |
| Brick Wall (goalie) | +Reflexes | First shot each period auto-saved |

## Packs and rewards, season milestones

Packs are earned only, never bought, and are the main source of gear.

| Pack | Items | Guarantee | Earned by |
| --- | --- | --- | --- |
| Bronze | 3 | None | Any win |
| Silver | 4 | 1 Rare+ | Shutout, 4+ goal win, boss win |
| Gold | 5 | 1 Epic+ | Season milestones |

- **Pity timer:** a Legendary is guaranteed if 25 packs pass without one
- **Team milestones:** 5, 10 and 15 wins; making the playoffs; winning the championship
- **Stat milestones:** a player reaching 25 goals; 5 team shutouts; a hat trick

## Prestige

Prestige keeps the roster and all gear but wipes every earned artifact and powerup, in exchange for a permanent prestige level.

| Kept | Lost |
| --- | --- |
| Roster and contracts | Artifacts |
| All gear and tape currency | Powerups |
| Player XP and skills |  |

Each prestige level should give something lasting, such as a small boost to pack odds, a new jersey, or a harder league tier with better rewards.

## Franchise economy and facilities

The franchise runs two budgets: the salary cap limits player pay, and operating cash must cover every cost of running the team, players included.

- **Franchise value** rises with profit, wins, titles and facility levels; it is the long-term score of the franchise
- **Running out of cash** forces a fire sale: release players or sell staff contracts before the next season

| Revenue | Driven by |
| --- | --- |
| Ticket sales | Wins, arena level, promoters |
| Merchandise | Star players, mascot power |
| Sponsorships | Franchise value, promoters |
| Playoff gates | Each home playoff game |
| Milestone bonuses | Season milestones |

| Expense | Notes |
| --- | --- |
| Player salaries | Count against the cap and cash |
| Trainers | Salary scales with grade |
| Scouts | Salary scales with grade |
| Promoters | Salary scales with grade |
| Facility upkeep | Grows with each facility level |
| Mascot | Salary plus costume upgrades |
| Travel | Per road game |

**Staff** are hired from their own pool with grades and contracts, like players.

- **Trainers:** boost XP in one skill area (shooting, skating, defence, goaltending)
- **Scouts:** reveal hidden potential and surface better free agents and rookies
- **Promoters:** raise attendance, merch and sponsorship revenue

**Facilities** are built once and upgraded through levels 1–5; each level costs cash to build and adds upkeep.

| Facility | Effect per level |
| --- | --- |
| Training centre | More XP per game; slows aging decline |
| Medical wing | Faster injury recovery; fewer fatigue penalties |
| Front office | Players accept lower cap hits when re-signing (hometown discount) |
| Scouting office | More players visible in the pool; potential revealed sooner |
| Arena | More seats and higher ticket revenue |
| Mascot den | Raises mascot power |

## Mascot

Each franchise has one mascot: a highly skilled wildcard who randomly drops in for a single game, replacing a dressed skater.

- **Drop-in chance:** rolled before each game; starts at 5% and rises with mascot power, capped at 35%
- **Single game only:** the replaced skater sits that game, then returns; the mascot earns no XP and never ages
- **Cost:** paid from operating cash, not the cap
- **Mascot power** rises through the mascot den, costume upgrades, and promoter bonuses
- **Rivals:** AI teams and bosses have mascots too

| Talent | Effect while on ice |
| --- | --- |
| Crowd surge | Whole team skates faster after a goal |
| Spin move | Undodgeable deke past one defender |
| Distraction | Opposing goalie's reflexes drop for 10 seconds |
| Cannon shot | A charged slap shot with near-max power |
| Rally cry | Fatigue resets for teammates once per period |

Each mascot starts with one talent and unlocks more as mascot power grows.

- [ ] Can the mascot ever replace the goalie, or skaters only?
- [ ] Can the user see the drop-in before the game and decline it?

## Open questions and build plan

**Open questions**

- [ ] What does each prestige level give back?
- [ ] Do players' artifacts vs. team-wide powerups need separate rules?
- [ ] How many games in a season run, and how long should one run take?
- [ ] Can AI teams poach your expiring players?

**Build plan**

1. Web prototype: 3-on-3 rink with controller support, to prove skating, passing and shooting feel
2. Add packs and gear screens to the prototype to test the reward loop
3. Move to Godot or Unity in Claude Code; rebuild gameplay on the tuned values
4. Add league pool, grades, cap and roster screens
5. Add the season run map, bosses and playoffs
6. Add XP, aging and prestige
