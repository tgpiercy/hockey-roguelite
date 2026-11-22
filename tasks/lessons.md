# Lessons

Rules written after a correction or a mistake on this project. Read at the start of a session.

## Measuring

- **The scripted player is not a person.** It defends tirelessly and won 36 games in 40 where the owner lost 12-3. Never present its win rate as how hard the game is; say whose number it is.
- **Adding content moves the season measure.** The script cannot beat two bosses at all, so more bosses in the pool raised its title rate with no change in difficulty. Before trusting `measureSeasons`, check what the script cannot do.
- **Check that a new test fails without the fix.** The goalie outlet test was run once against the old numbers to see it fail; do that whenever a test is written for a bug.
- **Small samples lie.** 40 seasons swing by seven points and 100 all-AI games by ten. Say the sample with the number.
- **An assist can be far too strong at the first guess.** Goalie assist at 0.6 cut goals against by more than half. Measure, then halve the change, then measure again.

## Looking

- **Look at the screen, not only the test.** Pictures found cards spilling into each other, a list drawn over the top bar, a title cut off, and four veterans all nicknamed "Lifer"; 1,300 passing tests found none of them.
- **Audit menus at 844 x 390 with a script**: titles cut off, lists outside their box, text ending in dots. It takes a minute and found five faults.
- **Machines can check loudness, not pleasantness.** Rendering each sound off-line showed five tunes far too quiet. Whether any sound is pleasant needs the owner's ears.

## Deciding

- **Show options as pictures and ask.** The player style, the helmet and the player size were each chosen by the owner from three drawn candidates in one question. Do this for anything that is a matter of taste.
- **Put every decision to the owner as a question with the recommended option first.** When the owner states a rule himself ("a boss loss should end the run"), ask only about the edges (which difficulties).
- **The owner's play outranks the plan.** A report from a real game goes to the front of the queue.

## Working

- **Never put text with apostrophes in a shell heredoc.** Write test files and patch scripts with the Write tool.
- **Do not edit `src` while a background test run may start new processes.**
- **A denied command is not to be worked round.** The delete of `tmp_saves/` was declined: leave it, keep it out of commits, and tell the owner the command.
- **Finish a half-built change before switching.** When the owner reported a problem mid-rewrite, the rewrite was brought to a committed, working state first, then the problem was fixed.
- **Say what was not checked.** Every report lists what was seen on screen, what was only tested, and what was not measured.
- **Time the parts before speeding one up.** The plan said the still rink was most of a frame; timing each part showed it was almost nothing, and that painting a new player picture cost 9.5 ms. Measure where the time goes first.
- **Small pictures made of many strokes belong in ordinary memory.** A canvas asked for with `willReadFrequently` painted and handed over a player picture three times faster.
- **In the test browser, step the game a few hundred frames at a time.** A single call that steps thousands times out; a screenshot shows the frame before the last one, so take two.
- **Do not let Python rewrite a hand-laid JSON file.** `json.dumps` kept `rinkLook.json` as it was but spread `mapLook.json` over 350 lines; add a line as text there.
- **Time what Phaser does after `draw()` too.** The read-out timed our drawing at 5 ms while a frame took 25: the crowd's 3,100 shapes were paid for inside Phaser's render. Wrap `game.renderer.render` when timing, and hide one layer at a time to see what each costs.
- **Hand Phaser a finished picture with `addImage`, not `addCanvas`.** Its canvas texture reads every pixel back when it is made, which took as long as painting the picture.
- **The test browser's pane can be hidden, and then frames and timers stop.** Drive frames from a worker's timer when running the game live there.
