# Doom Observer

A RuneLite plugin that writes down what the game client is told while you
delve under the Ruins of Mokhaiotl, so that `client/encounters/doom-of-mokhaiotl/`
can be made to match the game instead of the wiki and other people's notes:
which map each delve is played on, when the Doom attacks and with what, every
projectile's flight (orbs, rocks and their pieces, acid, the beam), the
larvae and their prayers, volatile earth, the earthen shield, the demonic
shield, burrowing, every effect on the ground, every hitsplat, sound and game
message.

It is a copy of the Vardorvis Observer (`tools/vardorvis-observer`), itself a
copy of the Colosseum Observer (`tools/colosseum-observer` in the
OpenScim-colosseum checkout), with the Doom's own parts put in.

## What it does, and what it does not

It listens to RuneLite's events and appends one JSON object per line to
`~/.runelite/doom-observer/doom-<date>-<time>.jsonl` (on Windows
`C:\Users\<you>\.runelite\doom-observer\`). A new file starts each time you
come to the ruins (map square 20,149: the lobby and delve 1), a delve's map
square (53,100 from delve 2, by the TSPS project's notes), or any place where
one of the Doom's NPCs is (so a deep delve on a map of its own is caught too).
Nothing is written anywhere else in the game.

- It draws nothing: no overlay, no highlight, no text, no sound.
- It adds no menu entry and changes none. Your clicks are read after the
  fact (`MenuOptionClicked`), never consumed or altered.
- It sends no input to the game and makes no network request.
- Every call it makes on the client is a getter. No reflection.
- Nothing about other players is written. Your own name is replaced by
  `<player>` in chat lines and menu targets. Your inventory and worn
  equipment are not written. Your account name, world and login are not
  written.

What is written: everything the Vardorvis Observer writes (its README has
the table: `tick`, `npc_spawn`, `anim`, `spot_anim`, `projectile`,
`graphics_object`, `hitsplat`, `chat`, `sound`, `area_sound`, `click`,
`interface_dump`, `varbit`, the object spawns, `item_container`), and for the
Doom:

| Line (`"e"`) | What |
|---|---|
| `enter`, `map` | the map: on coming in, and every time the scene loads (each descent). `templates` lists the map squares the instance is copied from, as `"region:plane:rotation"` with the number of ground-floor chunks; `templateRegions` all of them |
| `tick` | each NPC also has `overheadArchives` and `overheadSprites`: the prayers a larva shows over its head |
| `projectile` | each projectile when it first appears (as the Vardorvis Observer), now with a number `n` |
| `projectile_flight`, `projectile_end` | every tick, every projectile still flying: where it is (128ths of a tile, height), whom and where it is flying at now, the cycles left; `projectile_end` where it landed. Shows which projectiles follow the player |
| `bar_type` | a kind of bar the client loaded (hitpoints, the charge bar, the shield's): its front sprite id, and the sizes of its front and back sprites |
| `bars` | every tick, for the player and each of the Doom's NPCs: logical and model height, health ratio and scale, overhead prayers (the Doom's two, a larva's), and the canvas point the bars hang from; with the camera's zoom, pitch, yaw and the viewport |
| `bar_crops` | the next drawn frame, cropped around each of those points to a PNG in `doom-<time>-crops/` beside the log: the bars (hitpoints, charge, shield), the overhead prayers and the player's own bar and prayer, as drawn. A player's crop stops just above their head |
| `interface_dump` on `enter` | also the minimap's orbs (160: hitpoints, prayer, run, special attack) and the boss bar (303), for their sizes |
| `burrow_frame` | every client frame (20 ms) the burrowed Doom (14709) moved or turned: where his model is drawn, his facing and animation. His zooms glide between ticks; this is their path and speed |
| `chat` | also `ENGINE` lines, besides the game messages ("Delve level: N duration: ...") |
| `variables` (in `enter`, `map`, `varbit`, `interface_dump`) | the delve's variables named by the TSPS captures: varps 4798, 4803-4805, 4807-4816, 4828 (the level), 1683 (the boss bar's NPC); varbits 17758 (the larva charge), 6099, 6100, 12401 (the boss bar), 16663 |

Every line has `t` (the client's tick count), `c` (the client cycle: 20 ms,
30 to a tick) and `ct` (cycles since this tick's start). A tile is
`{x, y, plane}` within the map square the instance was copied from, south-west
first, the same coordinates `client/encounters/doom-of-mokhaiotl/` uses;
`region` names the square when it is not delve 1's (20,149).

## Is it allowed, and can it get you banned

Nobody can promise that. What the Colosseum Observer's README says holds
here too and is worth reading before you play: RuneLite's list of rejected
features has no item about a plugin that records to a file; this one shows
nothing, acts for you in nothing, changes no interface and sends nothing
out; the client is RuneLite's released client in developer mode, with the
plugin added the way RuneLite's plugin template does it. It is not a Plugin
Hub plugin and has not been reviewed by RuneLite. If that is not enough for
you, do not run it on an account you care about.

## Running it

You need a JDK 11 or newer (`JAVA_HOME` set to it). From the root of this
repository:

```
E:\Projects\OpenScim-colosseum\runelite\gradlew.bat -p tools\doom-observer run
```

(`/e/Projects/OpenScim-colosseum/runelite/gradlew -p tools/doom-observer run`
in Git Bash). RuneLite starts in developer mode with "Doom Observer" in its
plugin list, switched on. The file is flushed every tick; it is complete when
you leave or close the client.

## What to do in there, so that the log answers the open questions

Several plain runs are worth more than one perfect one: which attack comes
when is chosen by the server, and only many delves show how often.

1. **The lobby and the jump.** Walk from the entrance to the gap and jump in.
   Stand still for six ticks before you attack: his surfacing, his first
   attack.
2. **Orbs, from range, without praying.** At delve 1, let three of his orbs
   land unprayed, standing still, then three while you walk a few tiles
   sideways after each launch (does an orb follow you, and when is it rolled).
   Then pray against the rest.
3. **The tongue.** Once, step next to him for two of his attacks.
4. **A rock throw.** Once, stay on the marked tile and let the debris land on
   you; once, step off at once. Each time try to turn your protection prayer
   back on at once and on each of the next three ticks, against the rock's
   orbs.
5. **The melee charge.** Once, let a charge fire unpunished (from full
   hitpoints). Punish every other one, once with a one-hit weapon and once
   with a multi-hit one (claws, a halberd special).
6. **Volatile earth.** Destroy two and stand in the earthen shield for one
   shockwave; for another, stand outside it.
7. **Larvae.** Let one reach him at delve 1; kill one with a demonbane weapon
   and one without; at delve 3 and 4 hit a larva with the style it prays.
8. **Acid (delve 3+).** Step on one pool once.
9. **The demonic shield (delve 3+).** Break one with demonbane; let one
   charge out and fire.
10. **Burrowing (delve 5+).** Stand still through one whole burrow and its
    zooms; dodge the next.
11. **Descend every delve you can.** Each descent writes the map it loads:
    the deep delves' maps are what the simulator lacks.
12. **The end of a delve.** Stay in place for ten ticks after he dies, then
    Investigate the burrow hole.

## Giving the log back

Copy the `.jsonl` files into `.scratch/doom/` of this repository (that
directory is not tracked by git). They hold no account name, but they do
hold what you did at the Doom: read them before you share them with anyone
else.
