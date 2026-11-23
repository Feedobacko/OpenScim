# Vardorvis Observer

A RuneLite plugin that writes down what the game client is told while you
are at Vardorvis, so that `client/encounters/vardorvis/` can be made to match
the game instead of the wiki and other people's notes: when he attacks and
moves, when each special comes and in what order, the axes' paths, the head's
projectile, the cracks and spikes, the strangle's overlay, the barrier, every
hitsplat and sound and game message.

It is a copy of the Colosseum Observer (`tools/colosseum-observer` in the
OpenScim-colosseum checkout), with the Colosseum's own parts taken out (its
variables, the health-bar measurements) and Vardorvis's put in.

## What it does, and what it does not

It listens to RuneLite's events and appends one JSON object per line to
`~/.runelite/vardorvis-observer/vardorvis-<date>-<time>.jsonl` (on Windows
`C:\Users\<you>\.runelite\vardorvis-observer\`). A new file starts each time
you come to the ritual site in the Stranglewood (region 4405: the rocks
outside and the fight's instance). Nothing is written anywhere else in the
game.

- It draws nothing: no overlay, no highlight, no text, no sound.
- It adds no menu entry and changes none. Your clicks are read after the
  fact (`MenuOptionClicked`), never consumed or altered.
- It sends no input to the game and makes no network request.
- Every call it makes on the client is a getter (`getTickCount`,
  `getGameCycle`, `getLocalPlayer`, `getTopLevelWorldView`,
  `getBoostedSkillLevel`, `getEnergy`, `getVarbitValue`, `getVarpValue`,
  `getWidget`). No reflection.
- Nothing about other players is written. Your own name is replaced by
  `<player>` in chat lines and menu targets. Your inventory and worn
  equipment are not written. Your account name, world and login are not
  written.

What is written:

| Line (`"e"`) | What |
|---|---|
| `enter`, `leave` | you came to or left the ritual site |
| `tick` | every game tick: you (tile, animation, prayers, hitpoints, prayer points, run on or off) and every NPC (tile, where its model is drawn, animation and its frame, stance, facing, target, health, spot animations) |
| `npc_spawn`, `npc_despawn`, `npc_changed`, `npc_present` | an NPC appears or leaves (Vardorvis, a tendril, an axe, the head), with its id, size, tile and its stand, walk and run animations |
| `anim`, `spot_anim` | an animation or a spot animation starts on you or an NPC (the strangle's spores on you) |
| `projectile` | once per projectile: id, start and end cycle, slope, start position, start and end height, who shot it at whom (the head's gaze) |
| `graphics_object` | a graphic on the ground (a crack, a spike) |
| `hitsplat` | a hitsplat on you or an NPC: type (the bleed's is its own), amount, the cycle it disappears on |
| `target`, `death`, `overhead_text` | an actor turns to another, dies, says something |
| `chat` | the game's own lines ("Vardorvis' head gazes upon you...", "You have started bleeding!"), never what a player typed |
| `sound`, `area_sound` | a sound effect, with its delay |
| `click` | your own click: the option, its target, the widget (a spore) |
| `interface_loaded`, `interface_dump`, `interface_closed` | an interface opens; one and three ticks later every widget of it is written (the strangle's overlay, the kill count) |
| `item_container` | the items of a container that is not your own (the loot) |
| `varbit`, `stat` | a game variable, your hitpoints or prayer changes; the strangle's variable (varp 3942) and run (varp 173) are written with it |
| `object_spawn`, `wall_object_spawn`, `decorative_object_spawn`, `ground_object_spawn` and their `_despawn` | an object of the scene appears or leaves (the barrier's tendrils, the rocks) |
| `game_state` | loading, logged in |

Every line has `t` (the client's tick count), `c` (the client cycle: 20 ms,
30 to a tick) and `ct` (cycles since this tick's start). A tile is
`{x, y, plane}` within the ritual site's map square, south-west first: the
same coordinates `client/encounters/vardorvis/` uses.

## Is it allowed, and can it get you banned

Nobody can promise that. What the Colosseum Observer's README says holds
here too, word for word, and is worth reading there before you play:

- RuneLite's list of removed or refused features
  (github.com/runelite/runelite/wiki/Rejected-or-Rolled-Back-Features) has
  no item about a plugin that records to a file; this one shows nothing,
  acts for you in nothing, changes no interface and sends nothing out.
- The client is RuneLite's released client, unchanged, with the plugin
  added the way RuneLite's plugin template does it (developer mode).
- It is not a Plugin Hub plugin and has not been reviewed by RuneLite (the
  Hub would refuse it because it writes a file). RuneLite makes no
  guarantee for a plugin loaded this way, and neither does Jagex.

If that is not enough for you, do not run it on an account you care about.

## Running it

You need a JDK 11 or newer (`JAVA_HOME` set to it). The plugin is built with
the Gradle wrapper of a RuneLite clone; the one in the OpenScim-colosseum
checkout works:

```
E:\Projects\OpenScim-colosseum\runelite\gradlew.bat -p tools\vardorvis-observer run
```

(from the root of this repository; `/e/Projects/OpenScim-colosseum/runelite/gradlew
-p tools/vardorvis-observer run` in Git Bash). RuneLite starts in developer
mode with "Vardorvis Observer" in its plugin list, switched on. It uses your
normal `~/.runelite` settings. To log in with a Jagex account: the sidebar's
Jagex account panel, "Add Jagex Account", log in, pick the character, "Play
Now" (github.com/runelite/runelite/wiki/Using-Jagex-Accounts).

Then fight Vardorvis. The file is flushed every tick; it is complete when
you leave the site or close the client.

## What to do in there, so that the log answers the open questions

None of this is needed for the plugin to work. It is what makes the log
useful. Several plain kills on a normal world are worth more than one
perfect one: which special comes when is chosen by the server, and only
many kills show how often.

1. **Before the fight.** Walk up to the rocks and climb in, and stand still
   for five ticks inside before you attack. That gives the barrier, where
   he and you stand at the start, and whether he moves before he is hit.
2. **The first ticks.** Attack him from where you stand, and then stand
   still in melee for three of his attacks without praying. That gives his
   first attack, his attack speed, how fast he runs at you, and his hits
   and heals unprayed.
3. **Protect from Melee.** Then pray melee for three more of his attacks.
4. **Axes.** Once, let an axe cut you on purpose, and stand still after it
   until the bleed is over. Once, get cut and then keep walking; once, get
   cut and keep running. That settles the bleed: how many hits, how far
   apart, and how moving changes it. Dodge the rest of the axes.
5. **The head.** Once below 570, let one head's gaze land without Protect
   from Missiles, and try to turn a protection prayer back on at once and
   on each of the next four ticks. Pray Protect from Missiles against the
   rest.
6. **Darts.** Once, stand on a crack and take the spike. Once, move one
   tile between his darts.
7. **The strangle.** Clear one strangle as fast as you can; let one run out
   without clicking a spore; clear one with a single spore left over.
8. **The kill.** Stay in place for ten ticks after he dies, then open the
   loot.
9. **Several kills.** Do as many plain kills as you like after that; each
   adds to how often each special comes and in what order.

## Giving the log back

Copy the `.jsonl` files into `.scratch/vardorvis/` of this repository (that
directory is not tracked by git). They hold no account name, but they do
hold what you did at Vardorvis: read them before you share them with anyone
else.
