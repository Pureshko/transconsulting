const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = vm.createContext({ console });

for (const file of ["js/constants.js", "js/calculations.js"]) {
  const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
  vm.runInContext(source, context, { filename: file });
}

function calculate(input) {
  context.testInput = input;
  return vm.runInContext("calculateCharge(testInput)", context);
}

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

function closeTo(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const craneCase = {
  atc_type: "single",
  distance: 1331,
  firstOsCount: 1,
  secondOsCount: 2,
  first_os_skat: "first-1skat",
  second_os_skat: "second-2skat",
  opt_first_os: 0,
  opt_second_os: 3,
  X: 8.9,
  Y: 16.98,
  restrictionSeason: false,
  length: 12.3,
  width: 2.55,
  height: 4,
};

const craneWithoutConfirmation = calculate(craneCase);
closeTo(craneWithoutConfirmation.coefficient, 0.0056, 0.0000001);
closeTo(craneWithoutConfirmation.amount, 32236.82);
assert.equal(Math.round(craneWithoutConfirmation.amount), 32237);

const craneWithConfirmation = calculate({
  ...craneCase,
  singleThreeAxleBonusConfirmed: true,
});
closeTo(craneWithConfirmation.coefficient, 0.0056, 0.0000001);
closeTo(craneWithConfirmation.amount, 32236.82);

const overloadBoundaries = [
  [-1, 0],
  [0, 0],
  [0.01, 0.011],
  [10, 0.011],
  [10.01, 0.014],
  [20, 0.014],
  [20.01, 0.19],
  [30, 0.19],
  [30.01, 0.38],
  [40, 0.38],
  [40.01, 0.5],
  [50, 0.5],
  [50.01, 1],
];

for (const [percent, expectedRate] of overloadBoundaries) {
  closeTo(
    evaluate(`overloadCoefficient(${percent})`),
    expectedRate,
    0.0000001,
  );
}

closeTo(
  evaluate('dimensionCoefficient(4, 2.55, 12, 12)'),
  0,
  0.0000001,
);
closeTo(
  evaluate('dimensionCoefficient(4.5, 3, 12.3, 12)'),
  0.0192,
  0.0000001,
);
closeTo(
  evaluate('dimensionCoefficient(5, 3.75, 13, 12)'),
  0.041,
  0.0000001,
);

assert.equal(
  evaluate('getAxleGroupLimit(1, 0, "first-1skat")'),
  10.5,
);
assert.equal(
  evaluate('getAxleGroupLimit(2, 3, "second-2skat")'),
  18,
);
assert.equal(
  evaluate('getAxleGroupLimit(3, 4, "third-1skat")'),
  25,
);
assert.equal(
  evaluate('getAxleGroupLimit(4, 2, "fourth-2skat")'),
  28,
);

const trailerBase = {
  atc_type: "pricep",
  distance: 100,
  firstOsCount: 1,
  secondOsCount: 1,
  thirdOsCount: 1,
  fourthOsCount: 1,
  first_os_skat: "first-1skat",
  second_os_skat: "second-2skat",
  third_os_skat: "third-2skat",
  fourth_os_skat: "fourth-2skat",
  opt_first_os: 0,
  opt_second_os: 0,
  opt_third_os: 0,
  opt_fourth_os: 0,
  X: 5,
  Y: 5,
  y2: 5,
  y3: 12,
  fourthActive: false,
  restrictionSeason: false,
  length: 20,
  width: 2.55,
  height: 4,
};

closeTo(calculate(trailerBase).amount, 0);
closeTo(calculate({ ...trailerBase, fourthActive: true }).amount, 4757.5);

console.log("Calculation regression tests passed.");
