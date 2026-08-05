const $ = window.jQuery;

if (!$) {
  throw new Error("Calculator requires jQuery.");
}

const toNumber = (value) => Number(value);

const checkedId = (name) =>
  $(`input[name="${name}"]:checked`).attr("id") ?? null;

const checkedValue = (selector) => $(selector).val() ?? null;

const numericValue = (selector) => toNumber($(selector).val());

const selectedAxleCount = (name) =>
  toNumber($(`input[name="${name}"]:checked`).data("kol-os"));

const isAxleGroupActive = (group) =>
  $(`.add-os-btn.${group}`).hasClass("os-active");

function formatNumber(value) {
  const [integer, decimal] = String(value).split(".");
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return decimal === undefined
    ? formattedInteger
    : `${formattedInteger}.${decimal}`;
}

function readTrailerGroup(group) {
  const type = toNumber($(`input.${group}-tral-type:checked`).data("tral-type"));
  const axleCount = numericValue(`#${group}TralOsNum`);
  const rowCount = numericValue(`#${group}TralRowNum`);

  return {
    type,
    axleCount,
    rowCount,
    selectedCount: type === 1 ? axleCount : rowCount,
    physicalAxleCount: type === 1 ? axleCount : rowCount * 2,
  };
}

function readFormData() {
  const fourthActive = isAxleGroupActive("fourth");
  const fifthActive = isAxleGroupActive("fifth");
  const thirdTrailer = readTrailerGroup("third");
  const fourthTrailer = readTrailerGroup("fourth");
  const fifthTrailer = readTrailerGroup("fifth");

  const routePoints = [
    $("#origin").val(),
    ...$(".intermediate-route-input")
      .map((_, input) => $(input).val())
      .get(),
    $("#destination").val(),
  ]
    .map((point) => String(point ?? "").trim())
    .filter(Boolean);

  return {
    distance: numericValue('input[name="distance"]'),
    routePoints,
    routeLabel: routePoints.length >= 2
      ? routePoints.join(" – ")
      : "Маршрут не указан",
    atc_type: checkedId("calc-atc-type"),

    first_os: checkedId("first-os"),
    second_os: checkedId("second-os"),
    third_os: checkedId("third-os"),
    fourth_os: fourthActive ? checkedId("fourth-os") : null,
    fifth_os: fifthActive ? checkedId("fifth-os") : null,

    first_os_skat: checkedId("first-os-skat"),
    second_os_skat: checkedId("second-os-skat"),
    third_os_skat: checkedId("third-os-skat"),
    fourth_os_skat: fourthActive ? checkedId("fourth-os-skat") : null,
    fifth_os_skat: fifthActive ? checkedId("fifth-os-skat") : null,

    opt_first_os: numericValue('select[name="first-os-distance"]'),
    opt_second_os: numericValue('select[name="second-os-distance"]'),
    opt_third_os: numericValue('select[name="third-os-distance"]'),
    opt_fourth_os: fourthActive
      ? numericValue('select[name="fourth-os-distance"]')
      : null,
    opt_fifth_os: fifthActive
      ? numericValue('select[name="fifth-os-distance"]')
      : null,

    firstOsCount: selectedAxleCount("first-os"),
    secondOsCount: selectedAxleCount("second-os"),
    thirdOsCount: selectedAxleCount("third-os"),
    fourthOsCount: selectedAxleCount("fourth-os"),
    fifthOsCount: selectedAxleCount("fifth-os"),

    X: numericValue("#first-os-weight"),
    Y: numericValue("#second-os-weight"),
    y1: numericValue("#second-os-weight"),
    y2: numericValue("#third-os-weight"),
    y3: fourthActive ? numericValue("#four-os-weight") : 0,
    y4: fifthActive ? numericValue("#fifth-os-weight") : 0,

    restrictionSeason: $("#restrictionSeason").is(":checked"),
    height: numericValue("#atc_height"),
    width: numericValue("#atc_width"),
    length: numericValue("#atc_length"),

    fourthActive,
    fifthActive,

    dollyValue: checkedValue("input.est-tesha:checked"),
    dollyRows: numericValue("input.tesha-row:checked"),
    dollyWeight: numericValue("#teshaWeight"),
    dollyDistance: checkedValue("#teshaOsDistance"),

    thirdTrailerType: thirdTrailer.type,
    thirdTrailerAxles: thirdTrailer.axleCount,
    thirdTrailerRows: thirdTrailer.rowCount,
    fourthTrailerType: fourthTrailer.type,
    fourthTrailerAxles: fourthTrailer.axleCount,
    fourthTrailerRows: fourthTrailer.rowCount,
    fifthTrailerType: fifthTrailer.type,
    fifthTrailerAxles: fifthTrailer.axleCount,
    fifthTrailerRows: fifthTrailer.rowCount,
  };
}
