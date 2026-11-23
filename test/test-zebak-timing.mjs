import assert from "node:assert/strict";
import {zebakDefinition, zebakPresentation} from "../client/toa/zebak/native.js";

const audio = zebakPresentation(class {}).audio.rules;
for (const path of [0,1,2,3,4,5,6]) {
  for (const enraged of [false,true]) {
    for (const magic of [false,true]) {
      let attack, damage, visuals;
      const encounter = zebakDefinition({
        stats: () => ({}),
        seedRandom: () => () => magic ? 0.2 : 0.8,
        rollAttack: ({plan}) => { damage = plan; },
        projectile: (_boss,target,config,end) => ({
          target: {kind:"actor", position:[...target.position]},
          slope:config.slope, startHeight:config.startHeight, endHeight:config.endHeight, spotAnimId:config.spotAnimId, startDelayCycles:config.timing.delay, endDelayCycles:end,
        }),
        showAttack: (_context,event) => { attack = event; },
        animate: (_events,event) => { visuals = event; },
      }).factory();
      encounter.configureRunStart({path});
      const [boss] = encounter.createNpcs();
      encounter.phases.enraged = enraged;
      if (enraged) boss.npcTypeId = 11732;
      const player = {alive:true,position:[[24,24], [29,32], [37,40]][path % 3]};
      const tick = 10;
      encounter.processNpcTick(boss, {tick,world:{actors:new Map([["player",player]])}});
      const [launch,secondary] = attack.projectiles;
      const jaw = enraged ? [22.49,32.54] : [22.58,32.54];
      assert.ok(Math.hypot(launch.sourcePosition[0]-jaw[0], launch.sourcePosition[1]-jaw[1]) < 0.01);
      const burst = launch.target.position.map(v => v + 0.5);
      assert.deepEqual(burst, [29.5,32.5]);
      const center = boss.position.map(v => v + boss.size / 2);
      assert.equal(Math.hypot(burst[0]-center[0], burst[1]-center[1]), 11);
      assert.ok(launch.slope > 0);
      assert.ok(launch.endHeight > launch.startHeight);
      assert.deepEqual(launch.target.position.map(v => v + 0.5), secondary.sourcePosition);
      assert.deepEqual(secondary.target, {kind:"actor", position:player.position});
      assert.ok(attack.projectiles.slice(1).every(p => p.startHeight === launch.endHeight));
      assert.equal(visuals.graphics[0].height,launch.endHeight);
      assert.equal(launch.startDelayCycles,path >= 4 ? (enraged ? 32 : 56) : 42);
      assert.ok(launch.endDelayCycles > launch.startDelayCycles);
      assert.equal(launch.endDelayCycles,secondary.startDelayCycles);
      assert.equal(visuals.graphics[0].delayCycles,secondary.startDelayCycles);
      assert.equal(secondary.endDelayCycles,path >= 4 ? 142 : 180);
      assert.equal(attack.impactDelayTicks,damage.impactDelayTicks);
      assert.equal(damage.prayerCheckAt, "impact");
      assert.equal(secondary.startDelayCycles,path >= 4 ? 85 : (enraged ? 95 : 93));
      assert.equal(attack.impactDelayTicks,path >= 4 ? 5 : 7);
      const cues = audio.zuk_attack.resolve({attack:attack.kind, launchTick:tick, impactTick:tick+attack.impactDelayTicks});
      assert.deepEqual(cues.sound.map(s => [s.id, s.delayCycles ?? 0]), [
        [magic ? 5823 : 5819, 0], [magic ? 5878 : 5896, path >= 4 ? 90 : 120],
        [5884, damage.impactDelayTicks * 30],
      ]);
      assert.equal(encounter.attackTick-tick,(enraged?4:7)-Math.min(2,Math.floor(path/2)));
    }
  }
}
console.log("28 ranged and magic timelines passed across normal, enrage and path levels 0-6");
