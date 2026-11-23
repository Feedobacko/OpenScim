import { solHereditName, solMessageColors, grappleWindowTicks } from "./constants.js";
import { clearSolAttackState } from "./bossAttacks.js";
var grappleTargets = [
  {
    slot: "body",
    taunt: "I'LL CRUSH YOUR BODY!",
    bodyPart: "BODY",
  },
  {
    slot: "cape",
    taunt: "I'LL BREAK YOUR BACK!",
    bodyPart: "BACK",
  },
  {
    slot: "hands",
    taunt: "I'LL TWIST YOUR HANDS OFF!",
    bodyPart: "HANDS",
  },
  {
    slot: "legs",
    taunt: "I'LL BREAK YOUR LEGS!",
    bodyPart: "LEGS",
  },
  {
    slot: "boots",
    taunt: "I'LL CUT YOUR FEET OFF!",
    bodyPart: "FEET",
  },
];
var grappleOverheadTextColor = "#ff0000";
function buildGrappleTauntSegments(grappleTarget) {
  const bodyPartStart = grappleTarget.taunt.indexOf(grappleTarget.bodyPart);
  const bodyPartEnd = bodyPartStart + grappleTarget.bodyPart.length;
  return [
    {
      text: grappleTarget.taunt.slice(0, bodyPartStart),
    },
    {
      text: grappleTarget.bodyPart,
      color: "#ffffff",
    },
    {
      text: grappleTarget.taunt.slice(bodyPartEnd),
    },
  ];
}
function buildGrappleTauntMessage(grappleTarget) {
  const [leadSegment, bodyPartSegment, tailSegment] = buildGrappleTauntSegments(grappleTarget);
  return [
    {
      text: `${solHereditName}: `,
    },
    {
      text: leadSegment.text,
      color: solMessageColors.red,
    },
    bodyPartSegment,
    {
      text: tailSegment.text,
      color: grappleOverheadTextColor,
    },
  ];
}
var grappleWrongBodyPartMessage = [
  {
    text: "You defended the wrong body part!",
    color: solMessageColors.red,
  },
];
var grapplePerfectParryMessage = [
  {
    text: `You perfectly parry ${solHereditName}'s grapple!`,
    color: solMessageColors.green,
  },
];
function getGrappleOutcomeMessage(resolution) {
  switch (resolution.outcome) {
    case "perfect-parry":
      return grapplePerfectParryMessage;
    case "parry": {
      const grappleTarget = resolution.target;
      return [
        {
          text: `You successfully defend your ${grappleTarget.bodyPart.charAt(0) + grappleTarget.bodyPart.slice(1).toLowerCase()} from ${solHereditName}'s grapple!`,
          color: solMessageColors.green,
        },
      ];
    }
    case "fail":
      return null;
  }
}
// Answers whether the click fell inside the grapple's window, for a wrong
// slot too. Only a click on the right slot defends.
function recordGrappleDefenceClick(grapple, clickedSlot, tick) {
  const pending = grapple.pending;
  if (!pending || tick < pending.startTick || tick > pending.startTick + grappleWindowTicks) {
    return false;
  }
  if (clickedSlot === pending.target.slot) {
    pending.defendedTick ??= tick;
  }
  return true;
}
function hasItemInEquipmentSlot(player, slot) {
  if (slot === "ammo") {
    return player.combatSupplies.equippedAmmo != null;
  } else if (slot === "quiver-ammo") {
    return player.combatSupplies.quiverAmmo != null;
  } else {
    return player.equipment[slot] !== undefined;
  }
}
function resolvePendingGrapple(grapple, tick, bossAlive, random) {
  const pending = grapple.pending;
  if (!pending) {
    return null;
  }
  const resolveTick = pending.startTick + grappleWindowTicks;
  if (pending.defendedTick !== null && pending.defendedTick <= tick) {
    grapple.pending = null;
    return {
      outcome: pending.defendedTick === resolveTick ? "perfect-parry" : "parry",
      target: pending.target,
      damages: [],
    };
  }
  if (tick !== resolveTick) {
    return null;
  }
  grapple.pending = null;
  if (!bossAlive) {
    return {
      outcome: "fail",
      target: pending.target,
      damages: [],
    };
  }
  const rollDamage = () => Math.floor(random() * 45);
  return {
    outcome: "fail",
    target: pending.target,
    damages: [
      {
        baseDamage: Math.max(rollDamage(), rollDamage()),
        attackType: "typeless",
        source: "SolGrapple",
      },
    ],
  };
}
function resolveSolGrapple(boss, context, random) {
  const player = context.world.getPlayer();
  if (!boss.alive || !player?.alive || boss.combat.targetId !== player.id) {
    clearSolAttackState(boss);
    return [];
  }
  const grappleTarget = boss.state.grapple.pending?.target;
  for (const clickedSlot of context.inputs?.equipmentSlotClicks ?? []) {
    if (hasItemInEquipmentSlot(player, clickedSlot) && recordGrappleDefenceClick(boss.state.grapple, clickedSlot, context.tick) && clickedSlot !== grappleTarget?.slot) {
      context.tickEvents.emit({
        type: "game_message",
        kind: "game",
        segments: grappleWrongBodyPartMessage,
      });
    }
  }
  const resolution = resolvePendingGrapple(boss.state.grapple, context.tick, boss.alive, random);
  if (resolution?.outcome === "perfect-parry") {
    boss.state.guaranteedMaxHitUntilTick = context.tick + 5;
  }
  const segments = resolution && getGrappleOutcomeMessage(resolution);
  if (segments) {
    context.tickEvents.emit({
      type: "game_message",
      kind: "game",
      segments: segments,
    });
  }
  if (resolution) {
    return [...resolution.damages];
  } else {
    return [];
  }
}
export { grappleTargets, grappleOverheadTextColor, buildGrappleTauntSegments, buildGrappleTauntMessage, resolveSolGrapple };
