const ofm = OVERALL_MASS_RATE;

/**
 * Limits from the 2026 edition.
 *
 * The old interface still passes:
 * - spacing band as 1..4;
 * - one tyre choice for the whole axle group;
 * - one total load for the whole group.
 *
 * "singleTyre" is also used for mixed tyre groups, because under the
 * 2026 edition a mixed group is treated as a single-tyre group.
 */

function overloadCoefficient(overloadPercent) {
  if (!Number.isFinite(overloadPercent) || overloadPercent <= 0) {
    return OVERLOAD_RATES[0];
  }

  if (overloadPercent <= 10) return OVERLOAD_RATES[1];
  if (overloadPercent <= 20) return OVERLOAD_RATES[2];
  if (overloadPercent <= 30) return OVERLOAD_RATES[3];
  if (overloadPercent <= 40) return OVERLOAD_RATES[4];
  if (overloadPercent <= 50) return OVERLOAD_RATES[5];

  return OVERLOAD_RATES[6];
}

function dimensionCoefficient(height, width, length, allowedLength) {
  let coefficient = 0;

  // The old form has no selector for the special 4.3 m height exception,
  // therefore the standard 4.0 m limit is used.
  if (height > 5) {
    coefficient += DIMENSION_RATES.height[3];
  } else if (height > 4.5) {
    coefficient += DIMENSION_RATES.height[2];
  } else if (height > 4) {
    coefficient += DIMENSION_RATES.height[1];
  }

  // The old form has no selector for an isothermal body,
  // therefore the standard 2.55 m width limit is used.
  if (width > 3.75) {
    coefficient += DIMENSION_RATES.width[3];
  } else if (width > 3) {
    coefficient += DIMENSION_RATES.width[2];
  } else if (width > 2.55) {
    coefficient += DIMENSION_RATES.width[1];
  }

  if (length > allowedLength) {
    coefficient +=
      (length - allowedLength) * DIMENSION_RATES.length[1];
  }

  return coefficient;
}

function tyreTypeFromId(skatId) {
  return typeof skatId === "string" && skatId.endsWith("-2skat")
    ? "dualTyre"
    : "singleTyre";
}

function normalizeSpacingBand(value) {
  const band = Number(value);

  return Number.isInteger(band) && band >= 1 && band <= 4
    ? band
    : null;
}

/**
 * Returns the permitted total load for one axle group.
 *
 * axleCount:
 *   1       -> single axle limit;
 *   2       -> tandem group limit;
 *   3       -> tridem group limit;
 *   4 or more -> per-axle limit multiplied by axle count.
 */
function getAxleGroupLimit(axleCount, spacingBand, skatId) {
  const count = Number(axleCount);

  if (!Number.isFinite(count) || count < 1) return 0;

  const tyreType = tyreTypeFromId(skatId);

  if (count === 1) {
    return AXLE_LIMITS_2026.single[tyreType];
  }

  const band = normalizeSpacingBand(spacingBand);

  if (band === null) return 0;

  const index = band - 1;

  if (count === 2) {
    return AXLE_LIMITS_2026.tandem[tyreType][index];
  }

  if (count === 3) {
    return AXLE_LIMITS_2026.tridem[tyreType][index];
  }

  return (
    AXLE_LIMITS_2026.multiAxlePerAxle[tyreType][index] *
    count
  );
}

function applySeasonalRestriction(limit, restrictionSeason) {
  return restrictionSeason ? limit * 0.8 : limit;
}

function addAxleOverloadCoefficient(
  currentCoefficient,
  {
    axleCount,
    spacingBand,
    skatId,
    actualLoad,
    restrictionSeason,
  },
) {
  const baseLimit = getAxleGroupLimit(
    axleCount,
    spacingBand,
    skatId,
  );

  if (
    baseLimit <= 0 ||
    !Number.isFinite(Number(actualLoad))
  ) {
    return currentCoefficient;
  }

  const allowedLoad = applySeasonalRestriction(
    baseLimit,
    restrictionSeason,
  );

  const overloadPercent =
    (100 * (Number(actualLoad) - allowedLoad)) /
    allowedLoad;

  return (
    currentCoefficient +
    overloadCoefficient(overloadPercent)
  );
}

function addOverallMassCoefficient(
  currentCoefficient,
  actualMass,
  allowedMass,
  restrictionSeason,
) {
  const permittedMass = applySeasonalRestriction(
    allowedMass,
    restrictionSeason,
  );

  const excess = Math.max(
    0,
    Number(actualMass) - permittedMass,
  );

  return currentCoefficient + excess * ofm;
}

function getSingleVehicleAllowedMass(input) {
  const totalAxles =
    Number(input.firstOsCount) +
    Number(input.secondOsCount);

  if (totalAxles <= 2) return MASSES.O1;

  if (totalAxles === 3) {
    /*
     * The 2026 edition keeps the 26 t exception for a three-axle
     * single vehicle when the driven axles are dual-tyred and each
     * axle does not exceed 9.5 t.
     *
     * The form only provides the total driven-group load, so it cannot
     * infer the per-axle condition from the total. The 26 t exception is
     * therefore applied only after an explicit user confirmation.
     */
    const hasThreeAxleBonus =
      Number(input.secondOsCount) === 2 &&
      tyreTypeFromId(input.second_os_skat) ===
        "dualTyre" &&
      input.singleThreeAxleBonusConfirmed === true;

    return hasThreeAxleBonus ? MASSES.O21 : MASSES.O2;
  }

  if (totalAxles === 4) return MASSES.O3;
  if (totalAxles === 5) return MASSES.O4;

  return MASSES.O5;
}

function fixedRoadTrainMassLimit(totalAxles) {
  if (totalAxles === 3) return MASSES.O2A;
  if (totalAxles === 4) return MASSES.O3A;
  if (totalAxles === 5) return MASSES.O4A;
  if (totalAxles === 6) return MASSES.O5;

  return null;
}

/**
 * In the 2026 edition a road train with more than six axles
 * is limited by the sum of the permitted axle-group loads.
 */
function getRoadTrainAllowedMass(groups) {
  const activeGroups = groups.filter(
    (group) => Number(group.axleCount) > 0,
  );

  const totalAxles = activeGroups.reduce(
    (sum, group) => sum + Number(group.axleCount),
    0,
  );

  const fixedLimit = fixedRoadTrainMassLimit(totalAxles);

  if (fixedLimit !== null) return fixedLimit;

  return activeGroups.reduce(
    (sum, group) =>
      sum +
      getAxleGroupLimit(
        group.axleCount,
        group.spacingBand,
        group.skatId,
      ),
    0,
  );
}

function standardTractorGroups(input) {
  return [
    {
      axleCount: input.firstOsCount,
      spacingBand: input.opt_first_os,
      skatId: input.first_os_skat,
      actualLoad: input.X,
    },
    {
      axleCount: input.secondOsCount,
      spacingBand: input.opt_second_os,
      skatId: input.second_os_skat,
      actualLoad: input.Y,
    },
  ];
}

function calculateAxleGroupsCoefficient(
  groups,
  restrictionSeason,
) {
  return groups.reduce(
    (coefficient, group) =>
      addAxleOverloadCoefficient(coefficient, {
        ...group,
        restrictionSeason,
      }),
    0,
  );
}

function calculateSingle(input) {
  const groups = standardTractorGroups(input);
  const actualMass = Number(input.X) + Number(input.Y);
  const allowedMass = getSingleVehicleAllowedMass(input);

  let coefficient = addOverallMassCoefficient(
    0,
    actualMass,
    allowedMass,
    input.restrictionSeason,
  );

  coefficient += calculateAxleGroupsCoefficient(
    groups,
    input.restrictionSeason,
  );

  coefficient += dimensionCoefficient(
    input.height,
    input.width,
    input.length,
    12,
  );

  return coefficient;
}

function calculateTrailer(input) {
  const groups = [
    ...standardTractorGroups(input),
    {
      axleCount: input.thirdOsCount,
      spacingBand: input.opt_third_os,
      skatId: input.third_os_skat,
      actualLoad: input.y2,
    },
  ];

  if (input.fourthActive) {
    groups.push({
      axleCount: input.fourthOsCount,
      spacingBand: input.opt_fourth_os,
      skatId: input.fourth_os_skat,
      actualLoad: input.y3,
    });
  }

  const actualMass = groups.reduce(
    (sum, group) => sum + Number(group.actualLoad || 0),
    0,
  );

  const allowedMass = getRoadTrainAllowedMass(groups);

  let coefficient = addOverallMassCoefficient(
    0,
    actualMass,
    allowedMass,
    input.restrictionSeason,
  );

  coefficient += calculateAxleGroupsCoefficient(
    groups,
    input.restrictionSeason,
  );

  coefficient += dimensionCoefficient(
    input.height,
    input.width,
    input.length,
    24,
  );

  return coefficient;
}

function calculateSemiTrailer(input) {
  const groups = [
    ...standardTractorGroups(input),
    {
      axleCount: input.thirdOsCount,
      spacingBand: input.opt_third_os,
      skatId: input.third_os_skat,
      actualLoad: input.y2,
    },
  ];

  const actualMass = groups.reduce(
    (sum, group) => sum + Number(group.actualLoad || 0),
    0,
  );

  const allowedMass = getRoadTrainAllowedMass(groups);

  let coefficient = addOverallMassCoefficient(
    0,
    actualMass,
    allowedMass,
    input.restrictionSeason,
  );

  coefficient += calculateAxleGroupsCoefficient(
    groups,
    input.restrictionSeason,
  );

  coefficient += dimensionCoefficient(
    input.height,
    input.width,
    input.length,
    24,
  );

  return coefficient;
}

function lowLoaderPhysicalAxleCount(type, axleCount, rowCount) {
  return Number(type) === 1
    ? Number(axleCount)
    : Number(rowCount) * 2;
}

function calculateLowLoader(input) {
  const groups = [
    ...standardTractorGroups(input),
    {
      axleCount: lowLoaderPhysicalAxleCount(
        input.thirdTrailerType,
        input.thirdTrailerAxles,
        input.thirdTrailerRows,
      ),
      spacingBand: input.opt_third_os,
      skatId: input.third_os_skat,
      actualLoad: input.y2,
    },
  ];

  if (input.fourthActive) {
    groups.push({
      axleCount: lowLoaderPhysicalAxleCount(
        input.fourthTrailerType,
        input.fourthTrailerAxles,
        input.fourthTrailerRows,
      ),
      spacingBand: input.opt_fourth_os,
      skatId: input.fourth_os_skat,
      actualLoad: input.y3,
    });
  }

  if (input.fifthActive) {
    groups.push({
      axleCount: lowLoaderPhysicalAxleCount(
        input.fifthTrailerType,
        input.fifthTrailerAxles,
        input.fifthTrailerRows,
      ),
      spacingBand: input.opt_fifth_os,
      skatId: input.fifth_os_skat,
      actualLoad: input.y4,
    });
  }

  const hasDolly = Number(input.dollyValue) === 1;
  const dollyAxleCount = hasDolly
    ? Number(input.dollyRows) * 2
    : 0;

  if (hasDolly && dollyAxleCount > 0) {
    groups.push({
      axleCount: dollyAxleCount,
      spacingBand: input.dollyDistance,
      // The old form has no tyre selector for the dolly.
      // Use the conservative single/mixed-tyre limit.
      skatId: "dolly-1skat",
      actualLoad: input.dollyWeight,
    });
  }

  const actualMass = groups.reduce(
    (sum, group) => sum + Number(group.actualLoad || 0),
    0,
  );

  const allowedMass = getRoadTrainAllowedMass(groups);

  let coefficient = addOverallMassCoefficient(
    0,
    actualMass,
    allowedMass,
    input.restrictionSeason,
  );

  coefficient += calculateAxleGroupsCoefficient(
    groups,
    input.restrictionSeason,
  );

  coefficient += dimensionCoefficient(
    input.height,
    input.width,
    input.length,
    24,
  );

  return coefficient;
}


function getMassAssessment(input) {
  if (input.atc_type === VEHICLE_TYPE.SINGLE) {
    return {
      actualMass: Number(input.X) + Number(input.Y),
      allowedMass: getSingleVehicleAllowedMass(input),
    };
  }

  let groups = standardTractorGroups(input);

  if (input.atc_type === VEHICLE_TYPE.TRAILER) {
    groups = [
      ...groups,
      {
        axleCount: input.thirdOsCount,
        spacingBand: input.opt_third_os,
        skatId: input.third_os_skat,
        actualLoad: input.y2,
      },
    ];

    if (input.fourthActive) {
      groups.push({
        axleCount: input.fourthOsCount,
        spacingBand: input.opt_fourth_os,
        skatId: input.fourth_os_skat,
        actualLoad: input.y3,
      });
    }
  } else if (input.atc_type === VEHICLE_TYPE.SEMI_TRAILER) {
    groups = [
      ...groups,
      {
        axleCount: input.thirdOsCount,
        spacingBand: input.opt_third_os,
        skatId: input.third_os_skat,
        actualLoad: input.y2,
      },
    ];
  } else if (input.atc_type === VEHICLE_TYPE.LOW_LOADER) {
    groups = [
      ...groups,
      {
        axleCount: lowLoaderPhysicalAxleCount(
          input.thirdTrailerType,
          input.thirdTrailerAxles,
          input.thirdTrailerRows,
        ),
        spacingBand: input.opt_third_os,
        skatId: input.third_os_skat,
        actualLoad: input.y2,
      },
    ];

    if (input.fourthActive) {
      groups.push({
        axleCount: lowLoaderPhysicalAxleCount(
          input.fourthTrailerType,
          input.fourthTrailerAxles,
          input.fourthTrailerRows,
        ),
        spacingBand: input.opt_fourth_os,
        skatId: input.fourth_os_skat,
        actualLoad: input.y3,
      });
    }

    if (input.fifthActive) {
      groups.push({
        axleCount: lowLoaderPhysicalAxleCount(
          input.fifthTrailerType,
          input.fifthTrailerAxles,
          input.fifthTrailerRows,
        ),
        spacingBand: input.opt_fifth_os,
        skatId: input.fifth_os_skat,
        actualLoad: input.y4,
      });
    }

    const hasDolly = Number(input.dollyValue) === 1;
    const dollyAxleCount = hasDolly
      ? Number(input.dollyRows) * 2
      : 0;

    if (hasDolly && dollyAxleCount > 0) {
      groups.push({
        axleCount: dollyAxleCount,
        spacingBand: input.dollyDistance,
        skatId: "dolly-1skat",
        actualLoad: input.dollyWeight,
      });
    }
  } else {
    return {
      actualMass: Number.NaN,
      allowedMass: Number.NaN,
    };
  }

  return {
    actualMass: groups.reduce(
      (sum, group) => sum + Number(group.actualLoad || 0),
      0,
    ),
    allowedMass: getRoadTrainAllowedMass(groups),
  };
}

/**
 * Checks the automatic conditions from paragraph 16 of the cargo
 * transportation rules. A fifth condition may also be specified manually
 * in the special permit and cannot be inferred by this calculator.
 */
function assessCoverVehicleRequirement(input) {
  const width = Number(input.width);
  const length = Number(input.length);
  const height = Number(input.height);
  const mass = getMassAssessment(input);
  const effectiveAllowedMass = applySeasonalRestriction(
    mass.allowedMass,
    input.restrictionSeason,
  );

  const reasons = [];

  if (width > 3.5) {
    reasons.push(
      `ширина ${width.toFixed(2)} м превышает 3,5 м`,
    );
  }

  if (length > 24) {
    reasons.push(
      `длина ${length.toFixed(2)} м превышает 24 м`,
    );
  }

  if (height > 4.5) {
    reasons.push(
      `высота ${height.toFixed(2)} м превышает 4,5 м`,
    );
  }

  if (
    Number.isFinite(mass.actualMass) &&
    Number.isFinite(effectiveAllowedMass) &&
    mass.actualMass > effectiveAllowedMass
  ) {
    reasons.push(
      `общая масса ${mass.actualMass.toFixed(2)} т превышает ` +
        `допустимую ${effectiveAllowedMass.toFixed(2)} т`,
    );
  }

  return {
    required: reasons.length > 0,
    reasons,
    actualMass: mass.actualMass,
    allowedMass: effectiveAllowedMass,
  };
}

const calculators = Object.freeze({
  [VEHICLE_TYPE.SINGLE]: calculateSingle,
  [VEHICLE_TYPE.TRAILER]: calculateTrailer,
  [VEHICLE_TYPE.SEMI_TRAILER]: calculateSemiTrailer,
  [VEHICLE_TYPE.LOW_LOADER]: calculateLowLoader,
});

function calculateCharge(input) {
  const calculator = calculators[input.atc_type];

  if (!calculator) {
    return {
      coefficient: Number.NaN,
      amount: Number.NaN,
    };
  }

  const coefficient = calculator(input);

  return {
    coefficient,
    amount: coefficient * MRP * input.distance,
  };
}
