function chooseWeightedOption(options, draw) {
  let remainingWeight = draw * options.reduce((total, option) => total + option.weight, 0);
  for (const option of options) {
    if (remainingWeight < option.weight) {
      return option.value;
    }
    remainingWeight -= option.weight;
  }
  throw new RangeError(
    "A weighted decision requires finite positive weights and a draw in [0, 1)",
  );
}
function createRandomDecisions(random) {
  return {
    next: random,
    chance: (decisionKey, probability) => random() < probability,
    int: (decisionKey, min, max) => min + Math.floor(random() * (max - min + 1)),
    choose: (decisionKey, options) =>
      chooseWeightedOption(options, random()),
  };
}
function weightEqually(values) {
  return values.map((value) => ({
    value: value,
    weight: 1,
  }));
}
function getContextDecisions(context) {
  return context.decisions ?? createRandomDecisions(context.random);
}
export { createRandomDecisions, weightEqually, getContextDecisions };
