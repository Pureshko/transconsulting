const MRP = 4325;
const OVERALL_MASS_RATE = 0.005;

const MASSES = Object.freeze({
  O0: 10,
  O1: 18,
  O2: 25,
  O2A: 28,
  O21: 26,
  O211: 25,
  O3: 32,
  O3A: 36,
  O4: 38,
  O4A: 40,
  O5: 44,
});

const DIMENSION_RATES = Object.freeze({
  height: [0, 0.009, 0.018, 0.036],
  width: [0, 0.009, 0.019, 0.038],
  length: [0, 0.004],
});

const OVERLOAD_RATES = Object.freeze([
  0,
  0.011,
  0.014,
  0.19,
  0.38,
  0.5,
  1,
]);

const VEHICLE_TYPE = Object.freeze({
  SINGLE: "single",
  TRAILER: "pricep",
  SEMI_TRAILER: "polupricep",
  LOW_LOADER: "trall",
});

const AXLE_LIMITS_2026 = Object.freeze({
  single: Object.freeze({
    singleTyre: 10.5,
    dualTyre: 11.5,
  }),

  tandem: Object.freeze({
    singleTyre: Object.freeze([11.5, 14, 17, 18]),
    dualTyre: Object.freeze([12.5, 16, 18, 20]),
  }),

  tridem: Object.freeze({
    singleTyre: Object.freeze([17, 20, 23.5, 25]),
    dualTyre: Object.freeze([18, 21, 24, 26]),
  }),

  multiAxlePerAxle: Object.freeze({
    singleTyre: Object.freeze([5.5, 6.5, 7.5, 8.5]),
    dualTyre: Object.freeze([6, 7, 8, 9]),
  }),
});

const STEP_ANIMATION_MS = 400;
