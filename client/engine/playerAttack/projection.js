import { getEquipmentDefinition } from "../../data/equipment.js";
import { getWeaponCategoryOrUnarmed } from "../../data/weaponCategories.js";
function isConflictionGauntletsAttack(attackSetup) {
  if (31106 !== attackSetup.equipment.hands) { // Confliction gauntlets
    return false;
  }
  const weapon = attackSetup.equipment.weapon;
  const weaponDefinition = weapon === undefined ? undefined : getEquipmentDefinition(weapon);
  return (
    !weaponDefinition?.isTwoHanded &&
    ("spell" === attackSetup.attackResources.kind ||
      (!weaponDefinition?.version?.includes("Uncharged") &&
        "magic" === attackSetup.formulaStyle &&
        weapon !== undefined &&
        "powered_staff" === getWeaponCategoryOrUnarmed(weapon)))
  );
}
function isSameConflictionAttack(pendingConflictionAttack, currentConflictionAttack) {
  return (
    pendingConflictionAttack.kind === currentConflictionAttack.kind &&
    pendingConflictionAttack.targetId === currentConflictionAttack.targetId &&
    ("spell" === pendingConflictionAttack.kind
      ? "spell" === currentConflictionAttack.kind && pendingConflictionAttack.spellId === currentConflictionAttack.spellId
      : "charged_staff" === currentConflictionAttack.kind && pendingConflictionAttack.weaponId === currentConflictionAttack.weaponId)
  );
}
function computeBranchSplitDamage(branch, split) {
  return Math.max(
    0,
    Math.floor(
      (branch.total * split.fraction.numerator) / split.fraction.denominator,
    ) + split.offset,
  );
}
function resolveBranchedSplatDamage(damageSpec, selectedBranch) {
  if (selectedBranch === null) {
    throw new RangeError("A branched splat needs the swing's selected branch");
  }
  if (selectedBranch.kind === "allMiss") {
    const allMissDamage = damageSpec.allMiss[selectedBranch.outcome];
    if (allMissDamage === undefined) {
      throw new RangeError("Missing all-miss damage for outcome " + selectedBranch.outcome);
    }
    return allMissDamage;
  }
  const branchSplit = damageSpec.branches[selectedBranch.index];
  if (branchSplit === undefined) {
    throw new RangeError(
      "Missing branch split for selected branch " + selectedBranch.index,
    );
  }
  return Math.max(
    damageSpec.minimumWhenSelected ?? 0,
    computeBranchSplitDamage(selectedBranch, branchSplit),
  );
}
function sumOutcomeWeights(outcomes) {
  return outcomes.reduce((total, outcome) => total + outcome.weight, 0);
}
function forEachDamageOutcome(damageSpec, priorDamage, selectedBranch, visitOutcome) {
  for (const [damage, probability] of buildDamageDistribution(damageSpec, priorDamage, selectedBranch)) {
    visitOutcome(damage, probability);
  }
}
function buildDamageDistribution(damageSpec, priorDamage, selectedBranch) {
  const buildBaseDistribution = (baseSpec) => buildDamageDistribution(baseSpec, priorDamage, selectedBranch);
  switch (damageSpec.kind) {
    case "uniform": {
      const distribution = new Map();
      const uniformProbability = 1 / (damageSpec.maximumInclusive - damageSpec.minimumInclusive + 1);
      for (let damage = damageSpec.minimumInclusive; damage <= damageSpec.maximumInclusive; damage += 1) {
        distribution.set(damage, uniformProbability);
      }
      return distribution;
    }
    case "fixed":
      return new Map([[damageSpec.damage, 1]]);
    case "floorFractionOfPriorHit":
      return new Map([
        [
          Math.floor(
            (getPriorHitDamage(priorDamage, damageSpec.priorHitIndex) * damageSpec.numerator) / damageSpec.denominator,
          ),
          1,
        ],
      ]);
    case "minimum":
      return mapDistributionDamage(buildBaseDistribution(damageSpec.base), (damage) => Math.max(damageSpec.minimumDamage, damage));
    case "floorScale":
      return mapDistributionDamage(buildBaseDistribution(damageSpec.base), (damage) => floorScaleByRatio(damage, damageSpec.ratio));
    case "floorScaleOnProc": {
      const distribution = new Map();
      for (const [baseDamage, probability] of buildBaseDistribution(damageSpec.base)) {
        addProbabilityMass(distribution, baseDamage, probability * (1 - damageSpec.chance));
        addProbabilityMass(distribution, floorScaleByRatio(baseDamage, damageSpec.ratio), probability * damageSpec.chance);
      }
      return distribution;
    }
    case "addFloorScaledCopy":
      return mapDistributionDamage(buildBaseDistribution(damageSpec.base), (baseDamage) => {
        let scaledCopy = baseDamage;
        for (const stageRatio of damageSpec.stages) {
          scaledCopy = floorScaleByRatio(scaledCopy, stageRatio);
        }
        return baseDamage + scaledCopy;
      });
    case "weighted": {
      const distribution = new Map();
      const totalWeight = sumOutcomeWeights(damageSpec.outcomes);
      for (const outcome of damageSpec.outcomes) {
        addProbabilityMass(distribution, outcome.damage, outcome.weight / totalWeight);
      }
      return distribution;
    }
    case "bySelectedBranch":
      return new Map([[resolveBranchedSplatDamage(damageSpec, selectedBranch), 1]]);
    default:
      return (function (unhandledSpec) {
        throw new Error("Unhandled damage spec: " + JSON.stringify(unhandledSpec));
      })(damageSpec);
  }
}
function mapDistributionDamage(distribution, mapDamage) {
  const mappedDistribution = new Map();
  for (const [damage, probability] of distribution) {
    addProbabilityMass(mappedDistribution, mapDamage(damage), probability);
  }
  return mappedDistribution;
}
function addProbabilityMass(distribution, damage, probability) {
  if (probability > 0) {
    distribution.set(damage, (distribution.get(damage) ?? 0) + probability);
  }
}
function floorScaleByRatio(damage, ratio) {
  return Math.floor((damage * ratio.numerator) / ratio.denominator);
}
function getPriorHitDamage(priorDamage, priorHitIndex) {
  const resolvedDamage = priorDamage[priorHitIndex];
  if (undefined === resolvedDamage) {
    throw new RangeError("Missing resolved damage for prior hit " + priorHitIndex);
  }
  return resolvedDamage;
}
function collectFutureHitDependencies(plannedHits, firstFutureIndex) {
  const accuracyDependencyIndices = new Set();
  const damageDependencies = {
    priorHitIndices: new Set(),
    selectedBranch: false,
  };
  for (const futureHit of plannedHits.slice(firstFutureIndex)) {
    collectGateDependencies(futureHit.gate, accuracyDependencyIndices);
    collectAccuracyDependencies(futureHit.accuracy, accuracyDependencyIndices);
    collectDamageDependencies(futureHit.damage, damageDependencies);
  }
  return {
    accuracyIndices: [...accuracyDependencyIndices].filter((priorHitIndex) => priorHitIndex < firstFutureIndex),
    damageIndices: [...damageDependencies.priorHitIndices].filter((priorHitIndex) => priorHitIndex < firstFutureIndex),
    usesSelectedBranch: damageDependencies.selectedBranch,
  };
}
function buildBranchDependencyKey(priorAccuracy, priorDamage, selectedBranch, futureDependencies) {
  const accuracyResults = futureDependencies.accuracyIndices.map((accuracyIndex) =>
    requirePriorAccuracyResult(priorAccuracy, accuracyIndex),
  );
  const resolvedDamages = futureDependencies.damageIndices.map((damageIndex) =>
    (function (priorDamage, priorHitIndex) {
      const resolvedDamage = priorDamage[priorHitIndex];
      if (resolvedDamage === undefined) {
        throw new RangeError("Missing resolved damage for prior hit " + priorHitIndex);
      }
      return resolvedDamage;
    })(priorDamage, damageIndex),
  );
  const selectedBranchDependency = futureDependencies.usesSelectedBranch ? selectedBranch : null;
  return JSON.stringify([accuracyResults, resolvedDamages, selectedBranchDependency]);
}
function collectGateDependencies(gate, accuracyDependencyIndices) {
  switch (gate.kind) {
    case "always":
      return;
    case "ifPriorAccurate":
    case "ifPriorInaccurate":
      accuracyDependencyIndices.add(gate.priorHitIndex);
      return;
    default:
      throwUnhandledProjectionDependency(gate);
  }
}
function collectAccuracyDependencies(accuracySpec, accuracyDependencyIndices) {
  switch (accuracySpec.kind) {
    case "roll":
    case "guaranteed":
    case "whenDamagePositive":
      return;
    case "rollUnlessAnyPriorAccurate":
      for (const priorHitIndex of accuracySpec.priorHitIndices) {
        accuracyDependencyIndices.add(priorHitIndex);
      }
      return;
    default:
      throwUnhandledProjectionDependency(accuracySpec);
  }
}
function collectDamageDependencies(damageSpec, damageDependencies) {
  switch (damageSpec.kind) {
    case "uniform":
    case "fixed":
    case "weighted":
      return;
    case "floorFractionOfPriorHit":
      damageDependencies.priorHitIndices.add(damageSpec.priorHitIndex);
      return;
    case "minimum":
    case "floorScale":
    case "floorScaleOnProc":
    case "addFloorScaledCopy":
      collectDamageDependencies(damageSpec.base, damageDependencies);
      return;
    case "bySelectedBranch":
      damageDependencies.selectedBranch = true;
      return;
    default:
      throwUnhandledProjectionDependency(damageSpec);
  }
}
function throwUnhandledProjectionDependency(unhandledSpec) {
  throw new Error(
    "Unhandled player attack projection dependency: " + JSON.stringify(unhandledSpec),
  );
}
function buildInitialBranches(branchSelection) {
  const emptyBranch = {
    priorAccuracy: [],
    priorDamage: [],
    maximumRolledTotal: 0,
    maximumAppliedTotal: 0,
  };
  if (branchSelection === undefined) {
    return [
      {
        ...emptyBranch,
        probability: 1,
        selectedBranch: null,
      },
    ];
  }
  const initialBranches = [];
  let remainingProbability = 1;
  for (const [attemptIndex, attempt] of branchSelection.attempts.entries()) {
    const {
      minimumInclusive: minimumInclusive,
      maximumInclusive: maximumInclusive,
    } = attempt.total;
    const possibleTotalCount = maximumInclusive - minimumInclusive + 1;
    const probabilityPerTotal = (remainingProbability * attempt.chance) / possibleTotalCount;
    if (probabilityPerTotal > 0) {
      for (let total = minimumInclusive; total <= maximumInclusive; total += 1) {
        initialBranches.push({
          ...emptyBranch,
          probability: probabilityPerTotal,
          selectedBranch: {
            kind: "landed",
            index: attemptIndex,
            total: total,
          },
        });
      }
    }
    remainingProbability *= 1 - attempt.chance;
  }
  if (remainingProbability > 0 || 0 === initialBranches.length) {
    const totalAllMissWeight = branchSelection.allMissWeights.reduce((weightSum, weight) => weightSum + weight, 0);
    for (const [outcomeIndex, weight] of branchSelection.allMissWeights.entries()) {
      if (weight > 0 || 0 === initialBranches.length) {
        initialBranches.push({
          ...emptyBranch,
          probability: (remainingProbability * weight) / totalAllMissWeight,
          selectedBranch: {
            kind: "allMiss",
            outcome: outcomeIndex,
          },
        });
      }
    }
  }
  return initialBranches;
}
function projectPlayerAttack(attackPlan) {
  const [firstPlannedHit, ...remainingPlannedHits] = attackPlan.hits;
  let branches = buildInitialBranches(attackPlan.branchSelection);
  const firstHitProjection = projectPlannedHitOverBranches({
    planIndex: 0,
    hit: firstPlannedHit,
    branches: branches,
    application: attackPlan.application,
    futureDependencies: collectFutureHitDependencies(attackPlan.hits, 1),
  });
  const projectedHits = [firstHitProjection.hit];
  branches = firstHitProjection.branches;
  let planIndex = 1;
  for (const plannedHit of remainingPlannedHits) {
    const hitProjection = projectPlannedHitOverBranches({
      planIndex: planIndex,
      hit: plannedHit,
      branches: branches,
      application: attackPlan.application,
      futureDependencies: collectFutureHitDependencies(attackPlan.hits, planIndex + 1),
    });
    projectedHits.push(hitProjection.hit);
    branches = hitProjection.branches;
    planIndex += 1;
  }
  const expectedRolledDamagePerAttack = projectedHits.reduce((total, projectedHit) => total + projectedHit.expectedRolledDamage, 0);
  const expectedAppliedDamagePerAttack = projectedHits.reduce((total, projectedHit) => total + projectedHit.expectedAppliedDamage, 0);
  return {
    hits: projectedHits,
    expectedRolledDamagePerAttack: expectedRolledDamagePerAttack,
    expectedAppliedDamagePerAttack: expectedAppliedDamagePerAttack,
    maximumRolledDamagePerAttack: branches.reduce(
      (maximum, branch) => Math.max(maximum, branch.maximumRolledTotal),
      0,
    ),
    maximumAppliedDamagePerAttack: branches.reduce(
      (maximum, branch) => Math.max(maximum, branch.maximumAppliedTotal),
      0,
    ),
    appliedDamagePerSecond: expectedAppliedDamagePerAttack / (0.6 * attackPlan.attackSpeedTicks),
  };
}
function projectPlannedHitOverBranches(projectionStep) {
  const branchesByDependencyKey = new Map();
  let gateProbability = 0;
  let accuracyProbability = 0;
  let expectedRolledDamage = 0;
  let expectedAppliedDamage = 0;
  let maximumRolledDamage = 0;
  let maximumAppliedDamage = 0;
  const recordOutcome = (branch, outcome) => {
    const landedDamage = outcome.accuracySucceeded ? Math.max(1, outcome.rolledDamage) : 0;
    const application = projectionStep.application;
    const appliedDamage = Math.floor(
      Math.floor(landedDamage * application.outgoingDamageMultiplier) *
        application.specialAttackDamageMultiplier,
    );
    if (outcome.accuracySucceeded) {
      accuracyProbability += outcome.probability;
    }
    expectedRolledDamage += outcome.probability * outcome.rolledDamage;
    expectedAppliedDamage += outcome.probability * appliedDamage;
    maximumRolledDamage = Math.max(maximumRolledDamage, outcome.rolledDamage);
    maximumAppliedDamage = Math.max(maximumAppliedDamage, appliedDamage);
    const nextBranch = {
      probability: outcome.probability,
      priorAccuracy: [...branch.priorAccuracy, outcome.accuracySucceeded],
      priorDamage: [...branch.priorDamage, outcome.rolledDamage],
      maximumRolledTotal: branch.maximumRolledTotal + outcome.rolledDamage,
      maximumAppliedTotal: branch.maximumAppliedTotal + appliedDamage,
      selectedBranch: branch.selectedBranch,
    };
    const dependencyKey = buildBranchDependencyKey(
      nextBranch.priorAccuracy,
      nextBranch.priorDamage,
      nextBranch.selectedBranch,
      projectionStep.futureDependencies,
    );
    const existingBranch = branchesByDependencyKey.get(dependencyKey);
    branchesByDependencyKey.set(
      dependencyKey,
      undefined === existingBranch
        ? nextBranch
        : {
            ...existingBranch,
            probability: existingBranch.probability + nextBranch.probability,
            maximumRolledTotal: Math.max(
              existingBranch.maximumRolledTotal,
              nextBranch.maximumRolledTotal,
            ),
            maximumAppliedTotal: Math.max(
              existingBranch.maximumAppliedTotal,
              nextBranch.maximumAppliedTotal,
            ),
          },
    );
  };
  for (const branch of projectionStep.branches) {
    if (!isHitGatePassedForPriorAccuracy(projectionStep.hit.gate, branch.priorAccuracy)) {
      recordOutcome(branch, {
        accuracySucceeded: false,
        rolledDamage: 0,
        probability: branch.probability,
      });
      continue;
    }
    gateProbability += branch.probability;
    if (projectionStep.hit.accuracy.kind === "whenDamagePositive") {
      forEachDamageOutcome(projectionStep.hit.damage, branch.priorDamage, branch.selectedBranch, (rolledDamage, damageProbability) => {
        recordOutcome(branch, {
          accuracySucceeded: rolledDamage > 0,
          rolledDamage: rolledDamage,
          probability: branch.probability * damageProbability,
        });
      });
      continue;
    }
    const boltProc = projectionStep.hit.proc;
    if (
      boltProc !== undefined &&
      boltProc.kind !== "kerisCritical" &&
      (boltProc.guaranteed || boltProc.ignoresAccuracy === false || boltProc.kind === "bonusDamage")
    ) {
      // The same cases as roll.js resolvePlannedHitRoll.
      const hitChance = projectedAccuracyChance(projectionStep.hit.accuracy, branch.priorAccuracy);
      const recordWeighted = (weight, accuracySucceeded, rolledDamage) => {
        if (weight > 0) {
          recordOutcome(branch, { accuracySucceeded, rolledDamage, probability: weight });
        }
      };
      const normalOutcomes = (weight, bonus = 0) =>
        weight > 0 &&
        forEachDamageOutcome(projectionStep.hit.damage, branch.priorDamage, branch.selectedBranch, (rolledDamage, damageProbability) =>
          recordWeighted(weight * damageProbability, true, rolledDamage + bonus),
        );
      const procOutcomes = (weight, hitAccurate) => {
        if (weight <= 0) {
          return;
        }
        if (boltProc.kind !== "bonusDamage") {
          forEachProcDamageOutcome(boltProc, (procDamage, damageProbability) => recordWeighted(weight * damageProbability, true, procDamage));
        } else if (hitAccurate) {
          normalOutcomes(weight, boltProc.bonus);
        } else {
          recordWeighted(weight, true, boltProc.bonus);
        }
      };
      const p = branch.probability;
      if (boltProc.guaranteed) {
        const missChance = boltProc.ignoresAccuracy !== false ? boltProc.chance : 0;
        procOutcomes(p * hitChance, true);
        procOutcomes(p * (1 - hitChance) * missChance, false);
        recordWeighted(p * (1 - hitChance) * (1 - missChance), false, 0);
      } else if (boltProc.ignoresAccuracy === false) {
        procOutcomes(p * hitChance * boltProc.chance, true);
        normalOutcomes(p * hitChance * (1 - boltProc.chance));
        recordWeighted(p * (1 - hitChance), false, 0);
      } else {
        procOutcomes(p * boltProc.chance * hitChance, true);
        procOutcomes(p * boltProc.chance * (1 - hitChance), false);
        normalOutcomes(p * (1 - boltProc.chance) * hitChance);
        recordWeighted(p * (1 - boltProc.chance) * (1 - hitChance), false, 0);
      }
      continue;
    }
    const procChance = projectionStep.hit.proc?.chance ?? 0;
    const kerisCritical = projectionStep.hit.proc?.kind === "kerisCritical";
    if (!kerisCritical && projectionStep.hit.proc !== undefined && procChance > 0) {
      forEachProcDamageOutcome(projectionStep.hit.proc, (procDamage, damageProbability) => {
        recordOutcome(branch, {
          accuracySucceeded: true,
          rolledDamage: procDamage,
          probability: branch.probability * procChance * damageProbability,
        });
      });
    }
    const accuracyChance = projectedAccuracyChance(projectionStep.hit.accuracy, branch.priorAccuracy);
    if (accuracyChance < 1) {
      recordOutcome(branch, {
        accuracySucceeded: false,
        rolledDamage: 0,
        probability: branch.probability * (kerisCritical ? 1 : 1 - procChance) * (1 - accuracyChance),
      });
    }
    if (accuracyChance > 0) {
      forEachDamageOutcome(projectionStep.hit.damage, branch.priorDamage, branch.selectedBranch, (rolledDamage, damageProbability) => {
        if (kerisCritical) recordOutcome(branch, {
          accuracySucceeded: true,
          rolledDamage: 3 * rolledDamage,
          probability: branch.probability * procChance * accuracyChance * damageProbability,
        });
        recordOutcome(branch, {
          accuracySucceeded: true,
          rolledDamage: rolledDamage,
          probability: branch.probability * (1 - procChance) * accuracyChance * damageProbability,
        });
      });
    }
  }
  return {
    hit: {
      planIndex: projectionStep.planIndex,
      gateProbability: gateProbability,
      accuracyProbability: accuracyProbability,
      expectedRolledDamage: expectedRolledDamage,
      expectedAppliedDamage: expectedAppliedDamage,
      maximumRolledDamage: maximumRolledDamage,
      maximumAppliedDamage: maximumAppliedDamage,
    },
    branches: [...branchesByDependencyKey.values()],
  };
}
function forEachProcDamageOutcome(proc, visitOutcome) {
  switch (proc.kind) {
    case "fixedDamage":
      visitOutcome(proc.damage, 1);
      return;
    case "uniformDamage": {
      const uniformProbability = 1 / (proc.maximumInclusive - proc.minimumInclusive + 1);
      for (let damage = proc.minimumInclusive; damage <= proc.maximumInclusive; damage += 1) {
        visitOutcome(damage, uniformProbability);
      }
      return;
    }
    default:
      throwUnhandledProjectionValue(proc);
  }
}
function isHitGatePassedForPriorAccuracy(gate, priorAccuracy) {
  switch (gate.kind) {
    case "always":
      return true;
    case "ifPriorAccurate":
      return requirePriorAccuracyResult(priorAccuracy, gate.priorHitIndex);
    case "ifPriorInaccurate":
      return !requirePriorAccuracyResult(priorAccuracy, gate.priorHitIndex);
    default:
      return throwUnhandledProjectionValue(gate);
  }
}
function projectedAccuracyChance(accuracySpec, priorAccuracy) {
  switch (accuracySpec.kind) {
    case "roll":
      return accuracySpec.chance;
    case "guaranteed":
      return 1;
    case "rollUnlessAnyPriorAccurate":
      if (accuracySpec.priorHitIndices.some((priorHitIndex) => requirePriorAccuracyResult(priorAccuracy, priorHitIndex))) {
        return 1;
      } else {
        return accuracySpec.chance;
      }
    case "whenDamagePositive":
      throw new TypeError(
        "whenDamagePositive accuracy is projected from the damage mass, not from a chance",
      );
    default:
      return throwUnhandledProjectionValue(accuracySpec);
  }
}
function requirePriorAccuracyResult(priorAccuracy, priorHitIndex) {
  const accuracyResult = priorAccuracy[priorHitIndex];
  if (accuracyResult === undefined) {
    throw new RangeError("Missing accuracy result for prior hit " + priorHitIndex);
  }
  return accuracyResult;
}
function throwUnhandledProjectionValue(unhandledValue) {
  throw new Error(
    "Unhandled player attack projection value: " + JSON.stringify(unhandledValue),
  );
}
export {
  isConflictionGauntletsAttack,
  isSameConflictionAttack,
  resolveBranchedSplatDamage,
  sumOutcomeWeights,
  projectPlayerAttack,
};
