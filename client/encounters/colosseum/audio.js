// The sounds of the waves that are in no animation. The game's server sends
// each of them, so here they are rules, keyed by the type of a tick event
// (docs/ADDING-AN-ENCOUNTER.md, section 5, `audio`). The layers of all
// encounters hear every event: a rule answers `pass` to what is not its own.
//
// The sounds of an animation's frames (a cast, a throw, a clap, a step, a
// death) are in the cache with the animation and need nothing here: the
// scene plays them, each as far as the cache says it carries. That is 4
// tiles for the shaman's cast and 5 from the middle tile of a colossus (4
// for its step), so a monster that attacks from across the arena is not
// heard doing it, in the game as here.
//
// Sources as in constants.js; CACHE names a sound in its table of names. OBS
// has no shockwave colossus (waves 7, 8 and 11), and the cache names no
// sound of its own outside its animations but spare takes of theirs: nothing
// is played for it here.
import { colosseumMonsters } from "./constants.js";

const cyclesPerTick = 30;
const pass = { kind: "pass" };
// ColosseumEncounter.placeMonster names an actor `colosseum_<kind>_<n>`.
const kindOf = (actorId) => (typeof actorId === "string" ? /^colosseum_([a-z]+)_\d+$/.exec(actorId)?.[1] : undefined);

// OBS: sent on the tick of the attack to sound as its projectile arrives,
// with no place. The shaman's came with 50 of 64 casts, the same 50 that
// drew the effect on the player (shaman.js); the javelin's with 7 of 29
// javelins, each a hitsplat of 0 under Protect from Missiles, and with none
// of three that were not prayed against and dealt 0. Inferred: it is the
// attack whose accuracy roll succeeds (`accurate`), prayed against or not.
// CACHE: varl_serpent_shaman_water_impact_01 and
// varlamore_colossi_javelin_range_attack_hit_player_01.
const hitSoundIds = { colosseum_shaman_spell: 8339, colosseum_javelin_throw: 8348 };
// OBS, 14 claps: the shockwave colossus's comes with every one, accurate or
// not, sent at the clap to sound as its projectile arrives, with no place.
// CACHE: toa_akka_projectle_impact_01.
const clapSoundId = 5774;
// OBS: a hit that hurts a monster is heard 10 tiles from its middle tile, on
// the tick of the hitsplat, and a hit of 0 is not: the shaman 25 of 26 hits
// that hurt (none of 5 hits of 0), the javelin colossus 26 of 26 (none of
// 6), the manticore 10 of 10 (none of 2). The jaguar has none of its own (1
// of 34): its sound is on a frame of the animation it plays when hit. CACHE:
// human_hit, varlamore_colossi_javelin_hit_01 and magmaquiris_hit.
const hurtSoundIds = { shaman: 513, javelin: 8353, manticore: 600 };
const hurtSoundRange = 10;
// OBS, a javelin thrown high (5 of 5 that came down): 90 client cycles after
// the throw, as the falling javelin appears, a sound that has no place; and
// 180 after it, as the blast is drawn, one heard 15 tiles from the tile it
// comes down on. CACHE: ..._javelin_artillery_attack_falling_whoosh_01 and
// ..._javelin_range_attack_hit_floor_01.
const highJavelinFallingSound = { id: 8356, delayCycles: 90 };
const highJavelinLandingSound = { id: 8352, range: 15 };

export const colosseumAudio = {
  layerName: "colosseum",
  rules: {
    // The thralls' sounds are the player's, in every fight (application.js).
    hit_applied: {
      preloadIds: Object.values(hurtSoundIds),
      resolve(event) {
        const kind = kindOf(event.targetId);
        if (!Object.hasOwn(hurtSoundIds, kind ?? "") || !(event.damage > 0)) return pass;
        const middle = Math.floor(colosseumMonsters[kind].size / 2);
        const [x, y] = event.targetPosition;
        return { kind: "play", sound: { id: hurtSoundIds[kind], range: hurtSoundRange, position: [x + middle, y + middle], channel: "area" } };
      },
    },
    zuk_attack: {
      preloadIds: [...Object.values(hitSoundIds), clapSoundId, highJavelinFallingSound.id, highJavelinLandingSound.id],
      resolve(event) {
        if (event.attack === "colosseum_shockwave_clap") {
          return { kind: "play", sound: { id: clapSoundId, delayCycles: event.projectileArrivalCycles, channel: "sfx" } };
        }
        if (event.attack === "colosseum_javelin_high") {
          return {
            kind: "play",
            sound: [
              { ...highJavelinFallingSound, channel: "sfx" },
              // The event's target is the tile the javelin comes down on.
              // ponytail: how loud is settled at the throw, when the player
              // stands on that tile; the game settles it at the landing. Play
              // it from an event of the landing if the encounter emits one.
              { ...highJavelinLandingSound, delayCycles: (event.impactTick - event.launchTick) * cyclesPerTick, position: [...event.targetPosition], channel: "area" },
            ],
          };
        }
        const hitSoundId = Object.hasOwn(hitSoundIds, event.attack) ? hitSoundIds[event.attack] : undefined;
        if (hitSoundId === undefined || event.accurate !== true) return pass;
        return { kind: "play", sound: { id: hitSoundId, delayCycles: event.projectileArrivalCycles, channel: "sfx" } };
      },
    },
  },
};
