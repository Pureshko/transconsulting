(function ($) {

  const appState = {
    currentStep: null,
    total: 0,
    coefficient: 0,
    coverVehicleAssessment: null,
  };
  let yandexMap = null;
  let routeGeoObjects = null;
  let routeRequestController = null;
  let waypointSequence = 0;
  const PUBLIC_OSRM_URL = "https://router.project-osrm.org";
  const PUBLIC_NOMINATIM_URL = String(
    window.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  ).replace(/\/$/, "");
  const ROUTE_REQUEST_TIMEOUT_MS = 30000;
  const NOMINATIM_MIN_INTERVAL_MS = 1100;
  const nominatimCache = new Map();
  let lastNominatimRequestAt = 0;

  function setDisabled(selector, disabled) {
    $(selector).toggleClass("disabled", Boolean(disabled));
  }

  function setHidden(selector, hidden) {
    $(selector).toggleClass("d-none", Boolean(hidden));
  }

  function setVisible(selector, visible) {
    $(selector).toggle(Boolean(visible));
  }

  function findVisibleSibling($step, direction) {
    let $candidate = direction === "next" ? $step.next() : $step.prev();

    while ($candidate.length && $candidate.hasClass("d-none")) {
      $candidate = direction === "next" ? $candidate.next() : $candidate.prev();
    }

    return $candidate;
  }

  function updateSpaProgress($step) {
    const visibleStep = Number($step.data("progress-step")) || 1;

    document.body.dataset.currentStep = String(visibleStep);

    $(".stepper__item").each(function updateNavigationItem() {
      const $item = $(this);
      const itemStep = Number($item.data("nav-step"));

      $item.toggleClass("is-active", itemStep === visibleStep);
      $item.toggleClass("is-complete", itemStep < visibleStep);
    });

    $("#mobileStepLabel").text(`Шаг ${visibleStep} из 4`);
    $("#headerStepLabel").text(`Шаг ${visibleStep} из 4`);
    $("#mobileProgressBar").css(
      "width",
      `${(visibleStep / 4) * 100}%`,
    );
    $("#headerProgressFill").css(
      "width",
      `${((visibleStep - 1) / 3) * 100}%`,
    );
    $("[data-progress-dot]").each(function updateProgressDot() {
      const $dot = $(this);
      const dotStep = Number($dot.data("progress-dot"));

      $dot.toggleClass("is-complete", dotStep < visibleStep);
      $dot.toggleClass("is-active", dotStep === visibleStep);
    });
  }

  function updateSchemePreview() {
    const vehicleLabels = {
      [VEHICLE_TYPE.SINGLE]: "Одиночный автомобиль",
      [VEHICLE_TYPE.SEMI_TRAILER]: "Тягач + полуприцеп",
      [VEHICLE_TYPE.TRAILER]: "Тягач + прицеп",
      [VEHICLE_TYPE.LOW_LOADER]: "Тягач + трал",
    };
    const vehicleType = checkedId("calc-atc-type");
    const groups = ["first", "second", "third", "fourth", "fifth"]
      .filter((group) => {
        if (group === "fourth") return isAxleGroupActive("fourth");
        if (group === "fifth") return isAxleGroupActive("fifth");
        if (group === "third") return vehicleType !== VEHICLE_TYPE.SINGLE;
        return true;
      })
      .map((group) => {
        if (
          vehicleType === VEHICLE_TYPE.LOW_LOADER &&
          ["third", "fourth", "fifth"].includes(group)
        ) {
          const trailer = readTrailerGroup(group);
          return trailer.selectedCount || null;
        }

        const count = selectedAxleCount(`${group}-os`);
        return Number.isFinite(count) && count > 0 ? count : null;
      })
      .filter(Boolean);

    $("#selectedSchemeLabel").text(
      groups.length ? groups.join(" – ") : "Выберите группы осей",
    );
    $("#selectedVehicleLabel").text(
      vehicleLabels[vehicleType] || "Схема появится после выбора",
    );
  }

  function vehiclePresentation(type) {
    const vehicles = {
      [VEHICLE_TYPE.SINGLE]: {
        label: "Одиночный автомобиль",
        image: "calc-atc-type/single.webp",
      },
      [VEHICLE_TYPE.SEMI_TRAILER]: {
        label: "Тягач + полуприцеп",
        image: "calc-atc-type/polupricep.webp",
      },
      [VEHICLE_TYPE.TRAILER]: {
        label: "Тягач + прицеп",
        image: "calc-atc-type/pricep.webp",
      },
      [VEHICLE_TYPE.LOW_LOADER]: {
        label: "Тягач + трал",
        image: "calc-atc-type/trall.webp",
      },
    };

    return vehicles[type] || vehicles[VEHICLE_TYPE.SEMI_TRAILER];
  }

  function renderResultVehicle(type) {
    const vehicle = vehiclePresentation(type);

    $(".result-vehicle")
      .attr("src", vehicle.image)
      .attr("alt", vehicle.label);
  }

  const VEHICLE_GUIDES = Object.freeze({
    [VEHICLE_TYPE.SINGLE]: "guidance/vehicle-drive-axle.webp",
    [VEHICLE_TYPE.SEMI_TRAILER]: "guidance/vehicle-semitrailer.webp",
    [VEHICLE_TYPE.TRAILER]: "guidance/vehicle-trailer.webp",
    [VEHICLE_TYPE.LOW_LOADER]: "calc-atc-type/trall.webp",
  });

  function applyVehicleDefaults(type) {
    const isSingle = type === VEHICLE_TYPE.SINGLE;

    $("#atc_length").val(isSingle ? 12 : 18);
    $("#atc_width").val(2.55);
    $("#atc_height").val(4);
  }

  function updateVehicleGuides(type) {
    const guide = VEHICLE_GUIDES[type] || VEHICLE_GUIDES[VEHICLE_TYPE.SEMI_TRAILER];
    const label = vehiclePresentation(type).label;

    $(".vehicle-context-guide, .weight-vehicle-guide")
      .attr("src", guide)
      .attr("alt", `Схема: ${label}`);

    // $(".dimension-guide-image").each(function updateDimensionGuide(index) {
    //   const source = index === 1 ? "guidance/vehicle-width.webp" : guide;
    //   $(this).attr("src", source).attr("alt", `Габариты: ${label}`);
    // });
  }

  function openStep($step) {
    if (!$step.length) return;

    $(".step").not($step).addClass("minimized");
    $step.removeClass("minimized");
    appState.currentStep = $step.get(0);
    updateSpaProgress($step);
    notifyParentHeight();
  }

  function completeCurrentStep($step) {
    $step.addClass("minimized step-completed");
  }

  function configureVehicleType(type) {
    const lowLoader = type === VEHICLE_TYPE.LOW_LOADER;
    const trailer = type === VEHICLE_TYPE.TRAILER;
    const semiTrailer = type === VEHICLE_TYPE.SEMI_TRAILER;
    const single = type === VEHICLE_TYPE.SINGLE;

    setVisible(".first-os-group", true);
    setVisible(".second-os-group", true);
    setVisible(".third-os-group", !single);
    setVisible(".fourth-os-group", trailer || lowLoader);
    setVisible(".fifth-os-group", lowLoader);

    setHidden(".three-os-weight-group", single);
    setHidden(".four-os-weight-group", true);
    setHidden(".five-os-weight-group", true);

    setHidden(".third-os-group-container", lowLoader);
    setHidden(".fourth-os-group-container", lowLoader);
    setHidden(".third-os-tral-container", !lowLoader);
    setHidden(".fourth-os-tral-container", !lowLoader);

    setHidden(".first-2os-group", semiTrailer);
    setHidden(".second-21os-group", trailer || lowLoader);
    setHidden(".second-3os-group", false);
    setHidden(".second-4os-group", !lowLoader);

    setHidden(".third-1os-group", semiTrailer);
    setHidden(".third-3os-group", trailer);
    setHidden(".third-4os-group", trailer);

    // These containers also have the generic *-os-group-container class.
    // Remove d-none after hiding the regular axle buttons for a low-loader.
    setHidden(".third-os-skat-container", false);
    setHidden(".fourth-os-skat-container", false);

    if (trailer) {
      $(".fourth-os-group .os-container").hide();
    }

    if (!lowLoader) {
      $(".fifth-os-group .os-container").hide();
    }

    applyVehicleDefaults(type);
    updateVehicleGuides(type);
    syncOptionalWeightFields();
    validateParametersStep();
  }

  function syncOptionalWeightFields() {
    setHidden(".four-os-weight-group", !isAxleGroupActive("fourth"));
    setHidden(".five-os-weight-group", !isAxleGroupActive("fifth"));
  }

  function isSingleAxleId(id) {
    return typeof id === "string" && id.endsWith("-1os");
  }

  function updateStandardAxleDistance(name, id) {
    const group = name.replace("-os", "");
    setHidden(`.${group}-os-distance-container`, isSingleAxleId(id));
  }

  function updateTrailerTypeUi(group, type) {
    const conventional = type === 1;

    $(`#${group}TralOsNum`).parent().toggleClass("d-none", !conventional);
    $(`#${group}TralRowNum`).parent().toggleClass("d-none", conventional);

    const trailer = readTrailerGroup(group);
    setHidden(
      `.${group}-os-distance-container`,
      !(trailer.selectedCount > 1),
    );
  }

  function validateStandardAxleGroup(group) {
    const axleId = checkedId(`${group}-os`);
    const wheelId = checkedId(`${group}-os-skat`);
    const spacing = $(`select[name="${group}-os-distance"]`).val();

    if (!axleId || !wheelId) return false;

    return isSingleAxleId(axleId) || spacing !== null;
  }

  function validateTrailerAxleGroup(group) {
    const trailer = readTrailerGroup(group);
    const wheelId = checkedId(`${group}-os-skat`);
    const spacing = $(`select[name="${group}-os-distance"]`).val();

    if (!trailer.type || !trailer.selectedCount || !wheelId) {
      return false;
    }

    return trailer.selectedCount === 1 || spacing !== null;
  }

  function validateAxleStep() {
    const type = checkedId("calc-atc-type");
    const fourthActive = isAxleGroupActive("fourth");
    const fifthActive = isAxleGroupActive("fifth");

    let valid =
      validateStandardAxleGroup("first") &&
      validateStandardAxleGroup("second");

    if (type === VEHICLE_TYPE.TRAILER || type === VEHICLE_TYPE.SEMI_TRAILER) {
      valid = valid && validateStandardAxleGroup("third");
    }

    if (type === VEHICLE_TYPE.TRAILER && fourthActive) {
      valid = valid && validateStandardAxleGroup("fourth");
    }

    if (type === VEHICLE_TYPE.LOW_LOADER) {
      valid = valid && validateTrailerAxleGroup("third");

      if (fourthActive) {
        valid = valid && validateTrailerAxleGroup("fourth");
      }

      if (fifthActive) {
        valid = valid && validateTrailerAxleGroup("fifth");
      }
    }

    setDisabled(".step-three-btn.next-btn", !valid);
    return valid;
  }

  function isWeightStepValid() {
    const type = checkedId("calc-atc-type");
    const required = ["#first-os-weight", "#second-os-weight"];

    if (type !== VEHICLE_TYPE.SINGLE) {
      required.push("#third-os-weight");
    }

    if (isAxleGroupActive("fourth")) {
      required.push("#four-os-weight");
    }

    if (isAxleGroupActive("fifth")) {
      required.push("#fifth-os-weight");
    }

    const weightsValid = required.every(
      (selector) => numericValue(selector) > 0,
    );
    const dollyValid =
      type !== VEHICLE_TYPE.LOW_LOADER || isDollySelectionValid();
    return weightsValid && dollyValid;
  }

  function isDimensionsStepValid() {
    return ["#atc_height", "#atc_width", "#atc_length"].every(
      (selector) => numericValue(selector) > 0,
    );
  }

  function validateParametersStep() {
    const weightsValid = isWeightStepValid();
    const dimensionsValid = isDimensionsStepValid();
    const valid = weightsValid && dimensionsValid;

    setDisabled(".step-four-btn.next-btn", !weightsValid);
    setDisabled(".step-five-btn.next-btn", !dimensionsValid);
    setDisabled(".combined-params-btn.next-btn", !valid);
    return valid;
  }

  function validateWeightStep() {
    validateParametersStep();
    return isWeightStepValid();
  }

  function validateDimensionsStep() {
    validateParametersStep();
    const valid = isDimensionsStepValid();

    return valid;
  }

  function validateDistanceStep() {
    const value = $('input[name="distance"]').val();
    const valid = value !== "" && toNumber(value) > 0;

    setDisabled(".calc-btn", !valid);
    return valid;
  }

  function validateDollyStep() {
    const selected = checkedValue("input.est-tesha:checked");
    const usesDolly = selected === "1";

    setHidden(".tesha-row-container", !usesDolly);
    setHidden(".tesha-weight-container", !usesDolly);
    setHidden(".tesha-os-distance-container", !usesDolly);

    const valid = isDollySelectionValid();

    setDisabled(".step-tesha-btn.next-btn", !valid);

    if ($(".embedded-dolly-section").length) {
      validateWeightStep();
    }

    return valid;
  }

  function isDollySelectionValid() {
    const selected = checkedValue("input.est-tesha:checked");

    if (selected === "0") {
      return true;
    }

    if (selected !== "1") {
      return false;
    }

    return (
      numericValue("input.tesha-row:checked") > 0 &&
      numericValue("#teshaWeight") > 0 &&
      $("#teshaOsDistance").val() !== null
    );
  }

  function validateAll() {
    validateAxleStep();
    validateWeightStep();
    validateDimensionsStep();
    validateDistanceStep();
    validateDollyStep();
  }

  const COMPANY_WHATSAPP = "77778088823";

  function openCompanyWhatsapp(message) {
    const url =
      `https://api.whatsapp.com/send?phone=${COMPANY_WHATSAPP}` +
      `&text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleProjectConsultationClick() {
    openCompanyWhatsapp(
      "Здравствуйте! Интересует организация перевозки крупногабаритного груза. Хотел(а) бы получить консультацию",
    );
  }

  function handleCalculationHelpClick() {
    openCompanyWhatsapp(
      "Здравствуйте! Я выполнил расчет сбора на вашем сайте и хотел бы получить консультацию по организации перевозки.",
    );
  }

  function handleWhatsappClick() {
    const phone = $("#whatsappNumber").val().replace(/\D/g, "");

    if (phone.length < 10) {
      window.alert("Введите корректный номер WhatsApp с кодом страны.");
      return;
    }

    if (!Number.isFinite(appState.total) || appState.total <= 0) {
      window.alert("Сначала выполните расчет.");
      return;
    }

    const form = readFormData();
    const weightSummary = buildWeightSummary(form);
    const amount = formatNumber(appState.total.toFixed(2));
    const message = [
      `Расчет TES: ${amount} тенге`,
      `Тип ТС: ${vehiclePresentation(form.atc_type).label}`,
      `Нагрузки по группам осей: ${weightSummary.label}`,
      `Общая фактическая масса: ${weightSummary.total.toFixed(2)} т`,
      `Габариты (Д × Ш × В): ${form.length} × ${form.width} × ${form.height} м`,
      `Маршрут: ${form.routeLabel}`,
      `Расстояние: ${form.distance} км`,
      ...(appState.coverVehicleAssessment?.required
        ? [
            "Необходим автомобиль прикрытия:",
            ...appState.coverVehicleAssessment.reasons.map(
              (reason) => `- ${reason}`,
            ),
          ]
        : []),
    ].join("\n");
    const url =
      `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}` +
      `&text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }
  function handleChoiceClick(event) {
    const $card = $(event.currentTarget);

    if ($card.hasClass("disabled")) return;

    const $input = $card.find("input").first();
    const name = $input.attr("name");

    if (!name) return;

    $(".col-btn").each(function resetSameGroup() {
      const $candidate = $(this);

      if ($candidate.find("input").first().attr("name") !== name) {
        return;
      }

      $candidate.find("input").first().prop("checked", false);
      $candidate.find("svg").attr("hidden", true);
    });

    $input.prop("checked", true);
    $card.find("svg").removeAttr("hidden");

    if (name === "calc-atc-type") {
      const vehicleType = $input.attr("id");
      setHidden(".step-tesha", vehicleType !== VEHICLE_TYPE.LOW_LOADER);
      configureVehicleType(vehicleType);
    }

    if (/^(first|second|third|fourth|fifth)-os$/.test(name)) {
      updateStandardAxleDistance(name, $input.attr("id"));
    }

    const trailerGroupMatch = name.match(
      /^(third|fourth|fifth)-tral-type$/,
    );

    if (trailerGroupMatch) {
      updateTrailerTypeUi(
        trailerGroupMatch[1],
        toNumber($input.data("tral-type")),
      );
    }

    validateAll();
    updateSchemePreview();
    notifyParentHeight();
  }

  function handleSelectChange(event) {
    const name = event.currentTarget.name ?? "";
    const trailerGroupMatch = name.match(
      /^(third|fourth|fifth)-tral-(?:os|row)-num$/,
    );

    if (trailerGroupMatch) {
      const group = trailerGroupMatch[1];
      const trailer = readTrailerGroup(group);

      setHidden(
        `.${group}-os-distance-container`,
        !(trailer.selectedCount > 1),
      );
    }

    validateAll();
    updateSchemePreview();
    notifyParentHeight();
  }

  function handleNextClick(event) {
    const $button = $(event.currentTarget);

    if ($button.hasClass("disabled")) return;

    const $current = $button.closest(".step");
    const $content = $current.find(".step-content");

    if ($content.hasClass("two")) {
      configureVehicleType(checkedId("calc-atc-type"));
    }

    if ($content.hasClass("three")) {
      syncOptionalWeightFields();
    }

    completeCurrentStep($current);
    openStep(findVisibleSibling($current, "next"));
  }

  function handlePreviousClick(event) {
    const $button = $(event.currentTarget);

    if ($button.hasClass("disabled")) return;

    const $current = $button.closest(".step");
    const $previous = findVisibleSibling($current, "previous");

    $current.addClass("minimized");
    $previous.removeClass("step-completed");
    openStep($previous);
  }

  function updateFinalAmount(distance) {
    const numericDistance = toNumber(distance);

    if (
      !Number.isFinite(numericDistance) ||
      numericDistance <= 0 ||
      !Number.isFinite(appState.coefficient)
    ) {
      appState.total = 0;
      $("#totalSum").text("Укажите километраж больше 0");
      return;
    }

    const amount = appState.coefficient * MRP * numericDistance;
    appState.total = amount;

    $("#totalSum").text(
      `${formatNumber(amount.toFixed(2))} тенге`,
    );
  }


  function renderCoverVehicleNotice(assessment) {
    const $notice = $("#coverVehicleNotice");
    const $reasons = $("#coverVehicleReasons");

    $reasons.empty();

    if (!assessment?.required) {
      $notice.addClass("d-none");
      notifyParentHeight();
      return;
    }

    assessment.reasons.forEach((reason) => {
      $("<li>").text(reason).appendTo($reasons);
    });

    $notice.removeClass("d-none");
    notifyParentHeight();
  }

  function handleCalculateClick(event) {
    const $button = $(event.currentTarget);

    if ($button.hasClass("disabled")) return;

    const $current = $button.closest(".step");
    const form = readFormData();
    const result = calculateCharge(form);

    appState.coefficient = result.coefficient;
    appState.coverVehicleAssessment =
      assessCoverVehicleRequirement(form);

    renderResultVehicle(form.atc_type);
    $("#finalDistance").val(form.distance);
    updateFinalAmount(form.distance);
    renderCoverVehicleNotice(
      appState.coverVehicleAssessment,
    );

    completeCurrentStep($current);
    openStep(findVisibleSibling($current, "next"));
  }

  function handleFinalDistanceInput(event) {
    const value = event.currentTarget.value;

    // Синхронизируем с исходным полем маршрута, чтобы скачиваемый отчет
    // использовал изменённый километраж.
    $('input[name="distance"]').val(value);
    updateFinalAmount(value);
  }

  function handleOptionalAxleToggle(event) {
    const $button = $(event.currentTarget);
    const group = $button.hasClass("fifth") ? "fifth" : "fourth";
    const activating = !$button.hasClass("os-active");
    const $container = $button.siblings(".os-container");

    $button.toggleClass("os-active", activating);
    $container.toggle(activating);

    $button.text(
      activating ? "Удалить группу осей" : $button.data("add-label"),
    );

    syncOptionalWeightFields();
    validateAll();
    updateSchemePreview();
    notifyParentHeight();
  }

  function handleAxleResetClick() {
    const $axleStep = $(".step-content.three");

    $axleStep.find('input[type="radio"]').prop("checked", false);
    $axleStep.find(".col-btn svg").attr("hidden", true);
    $axleStep.find("select").prop("selectedIndex", 0);
    $axleStep.find(".form-floating[class*='-os-distance-container']")
      .addClass("d-none");

    $(".add-os-btn.os-active").each(function removeOptionalGroup() {
      $(this).trigger("click");
    });

    validateAll();
    updateSchemePreview();
    notifyParentHeight();
  }

  function handleResetClick(event) {
    $(".step").addClass("minimized").removeClass("step-completed");
    $("#totalSum").empty();
    $("#finalDistance").val("");
    $("#coverVehicleNotice").addClass("d-none");
    $("#coverVehicleReasons").empty();
    appState.total = 0;
    appState.coefficient = 0;
    appState.coverVehicleAssessment = null;

    const $current = $(event.currentTarget).closest(".step");
    const $first = $(".step").first();

    openStep($first);
  }

  function buildWeightSummary(form) {
    const weights = [form.X, form.Y];

    if (form.atc_type !== VEHICLE_TYPE.SINGLE) {
      weights.push(form.y2);
    }

    if (form.fourthActive) {
      weights.push(form.y3);
    }

    if (form.fifthActive) {
      weights.push(form.y4);
    }

    return {
      label: weights.map((weight) => `${weight} т`).join(" – "),
      total: weights.reduce((sum, weight) => sum + weight, 0),
    };
  }

  function loadReportImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function drawContainedImage(context, image, x, y, width, height) {
    const scale = Math.min(width / image.width, height / image.height);
    const targetWidth = image.width * scale;
    const targetHeight = image.height * scale;

    context.drawImage(
      image,
      x + (width - targetWidth) / 2,
      y + (height - targetHeight) / 2,
      targetWidth,
      targetHeight,
    );
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/);
    let line = "";
    let cursorY = y;

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;

      if (context.measureText(candidate).width > maxWidth && line) {
        context.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = candidate;
      }
    });

    if (line) {
      context.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }

    return cursorY;
  }

  let jsPdfLoadPromise = null;

  function loadJsPdf() {
    if (window.jspdf?.jsPDF) {
      return Promise.resolve(window.jspdf.jsPDF);
    }

    if (jsPdfLoadPromise) {
      return jsPdfLoadPromise;
    }

    jsPdfLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = "https://cdn.jsdelivr.net/npm/jspdf@3.0.4/dist/jspdf.umd.min.js";
      script.async = true;
      script.dataset.jspdfLoader = "true";
      script.onload = () => {
        if (window.jspdf?.jsPDF) {
          resolve(window.jspdf.jsPDF);
          return;
        }

        reject(new Error("jsPDF loaded without a browser export"));
      };
      script.onerror = () => reject(new Error("Failed to load jsPDF"));
      document.head.appendChild(script);
    }).catch((error) => {
      jsPdfLoadPromise = null;
      throw error;
    });

    return jsPdfLoadPromise;
  }

  async function handleDownloadReport() {
    if (!Number.isFinite(appState.total) || appState.total <= 0) {
      window.alert("Сначала выполните расчет.");
      return;
    }

    let JsPdf;

    try {
      JsPdf = await loadJsPdf();
    } catch (error) {
      console.error("Не удалось загрузить модуль PDF", error);
      window.alert("Не удалось загрузить модуль PDF. Проверьте интернет-соединение и повторите попытку.");
      return;
    }

    const form = readFormData();
    const vehicle = vehiclePresentation(form.atc_type);
    const weightSummary = buildWeightSummary(form);
    const amount = formatNumber(appState.total.toFixed(2));
    let templateImage;
    let vehicleImage;

    try {
      [templateImage, vehicleImage] = await Promise.all([
        loadReportImage("report/template.png"),
        loadReportImage(VEHICLE_GUIDES[form.atc_type] || vehicle.image),
      ]);
    } catch (error) {
      console.error("Не удалось подготовить изображения отчета", error);
      window.alert("Не удалось подготовить отчет. Обновите страницу и повторите попытку.");
      return;
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = templateImage.naturalWidth || 1055;
    canvas.height = templateImage.naturalHeight || 1491;
    context.drawImage(templateImage, 0, 0, canvas.width, canvas.height);

    context.fillStyle = "#1d232d";
    context.font = "700 35px Arial, sans-serif";
    context.fillText("Расчет суммы сбора за проезд", 92, 168);
    context.font = "400 18px Arial, sans-serif";
    context.fillText(
      `Дата расчета: ${new Date().toLocaleDateString("ru-RU")}`,
      92,
      202,
    );

    context.font = "700 26px Arial, sans-serif";
    context.fillText(vehicle.label, 92, 250);
    drawContainedImage(context, vehicleImage, 92, 270, 870, 250);

    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.fillRect(82, 535, 890, 355);
    context.strokeStyle = "#d9dde3";
    context.lineWidth = 2;
    context.strokeRect(82, 535, 890, 355);
    context.fillStyle = "#1d232d";
    context.font = "700 24px Arial, sans-serif";
    context.fillText("Параметры расчета", 112, 580);
    context.font = "400 18px Arial, sans-serif";

    const details = [
      `Нагрузки по группам осей: ${weightSummary.label}`,
      `Общая фактическая масса: ${weightSummary.total.toFixed(2)} т`,
      `Габариты (Д × Ш × В): ${form.length} × ${form.width} × ${form.height} м`,
      `Маршрут: ${form.routeLabel}`,
      `Расстояние маршрута: ${form.distance} км`,
      `Весенние ограничения: ${form.restrictionSeason ? "учтены" : "не применяются"}`,
    ];

    let detailY = 620;
    details.forEach((detail) => {
      detailY = drawWrappedText(context, detail, 112, detailY, 830, 28) + 9;
    });

    context.fillStyle = "#c20d0e";
    context.fillRect(82, 915, 890, 125);
    context.fillStyle = "#ffffff";
    context.font = "600 21px Arial, sans-serif";
    context.fillText("Сумма сбора за проезд", 112, 955);
    context.font = "800 40px Arial, sans-serif";
    context.fillText(`${amount} тенге`, 112, 1012);

    if (appState.coverVehicleAssessment?.required) {
      context.fillStyle = "#fff3f3";
      context.fillRect(82, 1065, 890, 165);
      context.fillStyle = "#a70711";
      context.font = "700 21px Arial, sans-serif";
      context.fillText("Необходим автомобиль прикрытия", 112, 1105);
      context.fillStyle = "#363c45";
      context.font = "400 16px Arial, sans-serif";
      let reasonY = 1140;

      appState.coverVehicleAssessment.reasons.forEach((reason) => {
        reasonY = drawWrappedText(
          context,
          `• ${reason}`,
          112,
          reasonY,
          820,
          23,
        );
      });
    }

    context.fillStyle = "#666e78";
    context.font = "400 15px Arial, sans-serif";
    context.fillText(
      "Предварительный расчет. Для оформления специального разрешения свяжитесь с TES.",
      82,
      1285,
    );

    const pdf = new JsPdf({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const margin = 10;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;
    const scale = Math.min(
      availableWidth / canvas.width,
      availableHeight / canvas.height,
    );
    const reportWidth = canvas.width * scale;
    const reportHeight = canvas.height * scale;
    const reportX = (pageWidth - reportWidth) / 2;
    const reportY = (pageHeight - reportHeight) / 2;
    const reportImage = canvas.toDataURL("image/jpeg", 0.94);

    pdf.addImage(
      reportImage,
      "JPEG",
      reportX,
      reportY,
      reportWidth,
      reportHeight,
      undefined,
      "FAST",
    );
    pdf.save(`TES-raschet-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  let lastReportedHeight = 0;
  let heightUpdateFrame = null;

  function getCalculatorContentHeight() {
    const calculator = document.querySelector(".steps");

    if (!calculator) {
      return 0;
    }

    const rect = calculator.getBoundingClientRect();
    return Math.ceil(rect.height);
  }

  function notifyParentHeight() {
    if (heightUpdateFrame !== null) {
      window.cancelAnimationFrame(heightUpdateFrame);
    }

    heightUpdateFrame = window.requestAnimationFrame(() => {
      heightUpdateFrame = null;

      const height = getCalculatorContentHeight();

      if (!height || Math.abs(height - lastReportedHeight) < 2) {
        return;
      }

      lastReportedHeight = height;

      window.parent.postMessage(
        {
          type: "transconsulting-resize",
          height,
        },
        "*",
      );
    });
  }

  function routePointValues() {
    return [
      $("#origin").val(),
      ...$(".intermediate-route-input")
        .map((_, input) => $(input).val())
        .get(),
      $("#destination").val(),
    ]
      .map((point) => String(point ?? "").trim())
      .filter(Boolean);
  }

  function attachYandexSuggest(inputId) {
    if (window.ymaps?.SuggestView) {
      new window.ymaps.SuggestView(inputId);
    }
  }

  function initializeYandexMap() {
    if (!window.ymaps || !document.getElementById("map")) return;

    window.ymaps.ready(() => {
      yandexMap = new window.ymaps.Map("map", {
        center: [48.0196, 66.9237],
        zoom: 5,
        controls: ["zoomControl", "fullscreenControl"],
      });
      attachYandexSuggest("origin");
      attachYandexSuggest("destination");
    });
  }

  function loadYandexMaps() {
    if (window.ymaps) {
      initializeYandexMap();
      return;
    }

    const script = document.createElement("script");
    const key = String(window.YANDEX_MAPS_API_KEY || "").trim();
    const keyQuery = key ? `&apikey=${encodeURIComponent(key)}` : "";

    script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${keyQuery}`;
    script.async = true;
    script.onload = initializeYandexMap;
    script.onerror = () => {
      $("#result")
        .show()
        .text("Яндекс Карты временно недоступны. Расстояние можно ввести вручную.");
    };
    document.head.appendChild(script);
  }

  function addIntermediateRoute() {
    waypointSequence += 1;
    const inputId = `intermediateRoute${waypointSequence}`;
    const $row = $(
      `<div class="intermediate-route-row">
        <label for="${inputId}">Промежуточная точка</label>
        <div class="intermediate-route-control">
          <input class="intermediate-route-input" type="text" id="${inputId}" placeholder="Введите город или адрес">
          <button class="remove-intermediate-route" type="button" aria-label="Удалить промежуточную точку">×</button>
        </div>
      </div>`,
    );

    $("#intermediateRoutes").append($row);
    attachYandexSuggest(inputId);
    notifyParentHeight();
  }

  function removeIntermediateRoute(event) {
    $(event.currentTarget).closest(".intermediate-route-row").remove();
    notifyParentHeight();
  }

  function waitForRequestInterval(delay, signal) {
    if (signal.aborted) {
      return Promise.reject(new DOMException("Запрос отменён", "AbortError"));
    }

    if (delay <= 0) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const handleAbort = () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException("Запрос отменён", "AbortError"));
      };
      const timeoutId = window.setTimeout(() => {
        signal.removeEventListener("abort", handleAbort);
        resolve();
      }, delay);

      signal.addEventListener("abort", handleAbort, { once: true });
    });
  }

  async function geocodeRoutePoint(point, signal) {
    const cacheKey = point.trim().toLocaleLowerCase("ru-RU");
    const cachedPoint = nominatimCache.get(cacheKey);

    if (cachedPoint) return cachedPoint;

    const elapsed = Date.now() - lastNominatimRequestAt;
    await waitForRequestInterval(
      Math.max(0, NOMINATIM_MIN_INTERVAL_MS - elapsed),
      signal,
    );

    const url = new URL(`${PUBLIC_NOMINATIM_URL}/search`);
    url.searchParams.set("q", point);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("accept-language", "ru");

    const contactEmail = String(window.NOMINATIM_EMAIL || "").trim();
    if (contactEmail) url.searchParams.set("email", contactEmail);

    lastNominatimRequestAt = Date.now();
    const response = await window.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      referrerPolicy: "strict-origin-when-cross-origin",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Nominatim вернул HTTP ${response.status}`);
    }

    const results = await response.json();
    const result = Array.isArray(results) ? results[0] : null;
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`Nominatim не смог найти точку: ${point}`);
    }

    const geocodedPoint = {
      label: point,
      coordinates: [latitude, longitude],
    };
    nominatimCache.set(cacheKey, geocodedPoint);

    return geocodedPoint;
  }

  function buildOsrmRouteUrl(geocodedPoints) {
    const coordinates = geocodedPoints
      .map(({ coordinates: [latitude, longitude] }) => `${longitude},${latitude}`)
      .join(";");

    return `${PUBLIC_OSRM_URL}/route/v1/driving/${coordinates}` +
      "?alternatives=false&steps=false&overview=full&geometries=geojson";
  }

  async function fetchOsrmRoute(geocodedPoints, signal) {
    const response = await window.fetch(buildOsrmRouteUrl(geocodedPoints), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`OSRM вернул HTTP ${response.status}`);
    }

    const data = await response.json();
    const route = data?.routes?.[0];

    if (
      data?.code !== "Ok" ||
      !route ||
      !Number.isFinite(route.distance) ||
      !Array.isArray(route.geometry?.coordinates) ||
      route.geometry.coordinates.length < 2
    ) {
      throw new Error(data?.message || "OSRM не смог построить маршрут");
    }

    return route;
  }

  function drawOsrmRoute(geocodedPoints, route) {
    const routeCoordinates = route.geometry.coordinates
      .filter(
        (coordinate) =>
          Array.isArray(coordinate) &&
          coordinate.length >= 2 &&
          coordinate.every(Number.isFinite),
      )
      .map(([longitude, latitude]) => [latitude, longitude]);

    if (routeCoordinates.length < 2) {
      throw new Error("OSRM вернул некорректную геометрию маршрута");
    }

    if (routeGeoObjects) {
      yandexMap.geoObjects.remove(routeGeoObjects);
    }

    routeGeoObjects = new window.ymaps.GeoObjectCollection();
    routeGeoObjects.add(
      new window.ymaps.Polyline(
        routeCoordinates,
        {
          hintContent: "Маршрут рассчитан OSRM",
        },
        {
          strokeColor: "#c8102e",
          strokeWidth: 5,
          strokeOpacity: 0.82,
        },
      ),
    );

    geocodedPoints.forEach(({ label, coordinates }, index) => {
      const isFirst = index === 0;
      const isLast = index === geocodedPoints.length - 1;
      const iconContent = isFirst ? "А" : isLast ? "Б" : String(index);

      routeGeoObjects.add(
        new window.ymaps.Placemark(
          coordinates,
          {
            iconContent,
            balloonContent: label,
          },
          {
            preset: "islands#redStretchyIcon",
          },
        ),
      );
    });

    yandexMap.geoObjects.add(routeGeoObjects);
    const bounds = routeGeoObjects.getBounds();

    if (bounds) {
      yandexMap.setBounds(bounds, {
        checkZoomRange: true,
        zoomMargin: 36,
      });
    }
  }

  async function calculateHybridRoute() {
    const points = routePointValues();
    const $result = $("#result");
    const $button = $("#calculateRoute");

    if (points.length < 2 || !$("#origin").val().trim() || !$("#destination").val().trim()) {
      window.alert("Пожалуйста, заполните точки отправления и назначения.");
      return;
    }

    if (!window.ymaps || !yandexMap) {
      $result
        .show()
        .text("Яндекс Карты еще загружаются. Повторите попытку или введите расстояние вручную.");
      return;
    }

    if (routeRequestController) {
      routeRequestController.abort();
    }

    const controller = new AbortController();
    routeRequestController = controller;
    const { signal } = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      ROUTE_REQUEST_TIMEOUT_MS,
    );

    $button.prop("disabled", true).text("Рассчитываем…");
    $result.show().text("Определяем координаты через Nominatim…");

    try {
      const geocodedPoints = [];

      for (let index = 0; index < points.length; index += 1) {
        $result.text(
          `Определяем координаты через Nominatim (${index + 1}/${points.length})…`,
        );
        geocodedPoints.push(
          await geocodeRoutePoint(points[index], signal),
        );
      }

      if (signal.aborted) return;

      $result.text("Строим маршрут через OSRM…");
      const route = await fetchOsrmRoute(geocodedPoints, signal);

      if (signal.aborted) return;

      drawOsrmRoute(geocodedPoints, route);

      const distance = Number((route.distance / 1000).toFixed(1));
      const durationMinutes = Math.max(1, Math.round(route.duration / 60));

      $('input[name="distance"]')
        .val(distance)
        .trigger("input");
      $result.empty().append(
        $("<div>")
          .addClass("result-item")
          .append("Маршрут: ", $("<b>").text(points.join(" – "))),
        $("<div>")
          .addClass("result-item")
          .append("Дистанция: ", $("<b>").text(`${distance} км`)),
        $("<div>")
          .addClass("result-item")
          .append(
            "Ориентировочное время: ",
            $("<b>").text(`${durationMinutes} мин.`),
          ),
        $("<div>")
          .addClass("result-item route-source")
          .text("Маршрут рассчитан публичным сервисом OSRM."),
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        $result
          .show()
          .text("Сервис маршрутов не ответил вовремя. Введите расстояние вручную или повторите попытку.");
      } else {
        console.error("Не удалось построить маршрут через OSRM", error);
        $result
          .show()
          .text("Не удалось построить маршрут. Проверьте точки или введите расстояние вручную.");
      }
    } finally {
      window.clearTimeout(timeoutId);

      if (routeRequestController === controller) {
        routeRequestController = null;
        $button.prop("disabled", false).text("Рассчитать расстояние");
      }
    }
  }

  function applyDimensionPlaceholders() {
    $("#atc_length").attr(
      "placeholder",
      "Укажите длину транспортного средства с грузом",
    );
    $("#atc_width").attr(
      "placeholder",
      "Укажите ширину транспортного средства с грузом",
    );
    $("#atc_height").attr(
      "placeholder",
      "Укажите высоту от дорожного полотна до верхней части транспортного средства с грузом",
    );
  }

  function applyCustomerLayoutPolish() {
    if (!document.getElementById("customer-layout-polish")) {
      const style = document.createElement("style");

      style.id = "customer-layout-polish";
      style.textContent = `
        @media (min-width: 900px) {
          .calculator-header {
            min-height: 92px !important;
            gap: 20px !important;
            padding: 12px clamp(20px, 2.5vw, 40px) !important;
          }

          body[data-current-step]:not([data-current-step="1"]) .calculator-header {
            min-height: 78px !important;
            padding-top: 9px !important;
            padding-bottom: 9px !important;
          }

          .brand img {
            width: 54px !important;
            height: 54px !important;
          }

          .brand__wordmark strong {
            font-size: 32px !important;
          }

          .brand__wordmark small {
            max-width: 132px !important;
            font-size: 9px !important;
          }

          .calculator-header__title {
            min-width: 180px !important;
            padding-left: 20px !important;
            font-size: 14px !important;
          }

          .header-benefits {
            gap: clamp(20px, 3.5vw, 52px) !important;
          }

          .header-benefit {
            gap: 9px !important;
            font-size: 13px !important;
          }

          .header-benefit__icon {
            width: 34px !important;
            height: 38px !important;
            font-size: 17px !important;
          }

          .home-link,
          body .header-contact-link {
            min-height: 44px !important;
            padding-right: 16px !important;
            padding-left: 16px !important;
            font-size: 13px !important;
          }

          .calculator-shell {
            min-height: calc(100vh - 92px) !important;
            grid-template-columns: 280px minmax(0, 1fr) !important;
          }

          .calculator-sidebar {
            padding: 34px 18px 34px 22px !important;
          }

          .stepper {
            top: 22px !important;
          }

          .stepper__item {
            min-height: 92px !important;
            grid-template-columns: 34px 42px minmax(0, 1fr) !important;
            gap: 8px !important;
          }

          .stepper__item:not(:last-child)::after {
            top: 32px !important;
            left: 15px !important;
          }

          .stepper__number {
            width: 32px !important;
            height: 32px !important;
            font-size: 13px !important;
          }

          .stepper__icon {
            width: 42px !important;
            height: 42px !important;
          }

          .stepper__icon svg {
            width: 22px !important;
            height: 22px !important;
          }

          .stepper__item strong {
            font-size: 14px !important;
          }

          .stepper__item small {
            margin-top: 5px !important;
            font-size: 12px !important;
          }

          .calculator-main {
            padding: 28px clamp(24px, 3.25vw, 58px) 46px !important;
          }

          .steps {
            width: min(100%, 1180px) !important;
          }

          .step-header .header {
            font-size: clamp(24px, 2.1vw, 32px) !important;
          }

          body .step[data-spa-step="1"] .vehicle-selection .btn.col-btn {
            min-height: 320px !important;
          }

          body .step[data-spa-step="1"] .vehicle-selection .btn.col-btn > img {
            height: 165px !important;
          }
        }

        .step[data-spa-step="1"] .vehicle-selection > .form-container > .row {
          display: contents !important;
        }

        .step[data-spa-step="1"] .vehicle-selection > .form-container > .row > .col {
          width: auto !important;
          max-width: none !important;
          min-width: 0 !important;
          display: flex !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .step[data-spa-step="1"] .vehicle-selection .btn.col-btn {
          width: 100% !important;
          height: 100% !important;
          min-height: 350px !important;
        }

        .step[data-spa-step="1"] .vehicle-selection .btn.col-btn > img {
          width: 100% !important;
          height: 185px !important;
          object-fit: contain !important;
        }

        .step-content.three .btn.col-btn {
          min-height: 88px !important;
        }

        .step-content.three .btn.col-btn img:not(.axle-focus-image) {
          width: auto !important;
          max-width: 120px !important;
          height: 66px !important;
          max-height: 66px !important;
          object-fit: contain !important;
        }

        .step-content.three .third-os-tral-container .btn.col-btn,
        .step-content.three .fourth-os-tral-container .btn.col-btn,
        .step-content.three .fifth-os-tral-container .btn.col-btn {
          min-width: 118px !important;
          height: 128px !important;
        }

        .header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .header-contact-link {
          min-height: 52px !important;
          padding: 0 20px !important;
          border: 1px solid var(--tes-red) !important;
          border-radius: 8px !important;
          color: #fff !important;
          background: var(--tes-red) !important;
          white-space: nowrap;
        }

        .header-contact-link:hover {
          color: #fff !important;
          background: var(--tes-red-dark) !important;
        }

        .result-actions {
          grid-template-columns: 1fr !important;
        }

        .embedded-dolly-section {
          margin-top: 28px;
          padding-top: 26px;
          border-top: 1px solid var(--tes-line);
        }

        .embedded-dolly-section__heading {
          margin-bottom: 18px;
        }

        .embedded-dolly-section__heading .step-label {
          margin-bottom: 6px;
          font-size: 22px;
        }

        .embedded-dolly-section__heading p {
          margin: 0;
          color: var(--tes-muted);
          font-size: 14px;
        }

        .embedded-dolly-section > .container {
          width: 100% !important;
          max-width: none !important;
          padding: 0 !important;
        }

        .advanced-axle-options {
          margin: 10px 0 16px;
          border: 1px dashed #c6cbd2;
          border-radius: 10px;
          background: #fafbfc;
        }

        .advanced-axle-options summary {
          padding: 12px 14px;
          color: var(--tes-muted);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .advanced-axle-options[open] {
          padding: 0 12px 12px;
        }

        .advanced-axle-options[open] summary {
          margin: 0 -12px 12px;
          border-bottom: 1px solid var(--tes-line);
        }

        .fourth-os-group,
        .fifth-os-group {
          flex: 0 0 100% !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        .fourth-os-group { order: 20; }
        .fifth-os-group { order: 21; }

        .combined-dimensions-section {
          margin-top: 30px;
          padding-top: 26px;
          border-top: 1px solid var(--tes-line);
        }

        .combined-dimensions-section > .step-label {
          margin-bottom: 18px;
          font-size: 22px;
        }

        .combined-dimensions-section .form-container,
        .combined-dimensions-section .form-group {
          background: #FDFDFD !important;
          box-shadow: none !important;
        }

        .combined-dimensions-section .form-container {
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr));
          gap: 16px;
        }

        .combined-dimensions-section .form-group {
          width: auto;
          min-width: 0;
        }

        .intermediate-route-row {
          margin-bottom: 14px;
        }

        .intermediate-route-control {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 44px;
          gap: 8px;
        }

        .remove-intermediate-route,
        .route-secondary-button {
          border: 1px solid #ccd1d8 !important;
          color: #444b55 !important;
          background: #fff !important;
        }

        .remove-intermediate-route {
          width: 44px !important;
          padding: 0 !important;
          font-size: 24px !important;
        }

        .route-secondary-button {
          margin-bottom: 10px;
        }

        .project-consultation-btn,
        .calculation-help-btn {
          width: 100%;
          margin-top: 14px;
          border: 0;
          border-radius: 8px;
          color: #fff;
          background: var(--tes-red) !important;
        }

        .project-consultation-btn:hover,
        .calculation-help-btn:hover {
          background: var(--tes-red-dark) !important;
        }

        @media (max-width: 899.98px) {
          .header-actions {
            gap: 7px;
          }

          .header-contact-link {
            min-height: 44px !important;
            padding: 0 12px !important;
            font-size: 12px !important;
          }
        }

        @media (max-width: 559.98px) {
          .header-contact-link {
            max-width: 112px;
            line-height: 1.15;
            white-space: normal;
          }

          .step[data-spa-step="1"] .vehicle-selection .btn.col-btn {
            min-height: 280px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const $trailerGroupTitle = $(
      ".third-os-group > .os-container > .step-label",
    ).first();
    $trailerGroupTitle.text("Группы осей на прицепе (трале)");

    const wrapAdvancedOptions = ($container, $options) => {
      if (!$container.length || !$options.length) return;

      const $details = $(
        '<details class="advanced-axle-options"><summary>Сложная конструкция</summary></details>',
      );
      $details.append($options);
      $container.append($details);
    };

    wrapAdvancedOptions(
      $(".first-os-group .os-container").first(),
      $(".first-2os-group, #first-2skat").map(function advancedSteering() {
        return $(this).closest(".col-btn").get(0);
      }),
    );
    wrapAdvancedOptions(
      $(".second-os-group .os-container").first(),
      $(".second-21os-group, .second-3os-group, .second-4os-group, #second-1skat")
        .map(function advancedDrive() {
          return $(this).closest(".col-btn").get(0);
        }),
    );

    $(".third-os-group > .os-container > .image-container").first().prepend(
      '<img class="vehicle-context-guide" src="guidance/vehicle-semitrailer.webp" alt="Схема выбранного транспортного средства">',
    );
    $('.three-os-weight-group > .image-container')
      .first()
      .prepend(
        '<img class="weight-vehicle-guide" src="guidance/vehicle-semitrailer.webp" alt="Схема распределения нагрузки выбранного транспортного средства">',
      );

    $(".step.step-tesha .step-header").text(
      "Передняя распределительная тележка (Jeep Dolly)",
    );
    $(".step.step-tesha .step-label").first().text(
      "Добавить переднюю распределительную тележку (Jeep Dolly)?",
    );
    $(".tesha-row-container > .step-label").first().text(
      "Ряды передней распределительной тележки",
    );
    $(".tesha-weight-container .step-label").first().text(
      "Суммарная нагрузка на переднюю распределительную тележку",
    );
    $("#teshaWeight").siblings("label").text(
      "Суммарная нагрузка на тележку, т",
    );

    const $homeLink = $(".home-link").first();
    const $contactLink = $(".contact-permit-btn").first();

    if ($homeLink.length && $contactLink.length) {
      const $headerActions = $('<div class="header-actions"></div>');

      $homeLink.before($headerActions);
      $contactLink
        .addClass("header-contact-link")
        .attr("href", "https://te-solutions.kz/")
        .attr("target", "_blank")
        .attr("rel", "noopener noreferrer")
        .text("Связаться с нами");
      $headerActions.append($contactLink, $homeLink);
    }

    const $weightStep = $('.step[data-spa-step="3"]')
      .not(".step-tesha")
      .first();
    const $dollyStep = $(".step.step-tesha").first();

    if ($weightStep.length && $dollyStep.length) {
      const $weightContent = $weightStep.find(".step-content").first();
      const $weightNavigation = $weightContent
        .children(".navigation-container")
        .last();
      const $dollyForm = $dollyStep
        .find(".step-content.tesha > .container")
        .first()
        .detach();
      const $embeddedDolly = $(
        '<section class="embedded-dolly-section step-tesha d-none"></section>',
      );

      $embeddedDolly.append(
        '<div class="embedded-dolly-section__heading"><div class="step-label">Передняя распределительная тележка (Jeep Dolly)</div><p>Укажите наличие и параметры тележки для выбранного транспортного средства.</p></div>',
        $dollyForm,
      );
      $embeddedDolly.insertBefore($weightNavigation);
      $dollyStep.remove();
      $weightContent
        .find(".text-secondary")
        .last()
        .text(
          "Введите суммарную фактическую нагрузку на каждую группу. При наличии передней распределительной тележки укажите её параметры ниже.",
        );
    }

    const $noDolly = $("#est-tesha-0");
    $noDolly.prop("checked", true);
    $noDolly.closest(".col-btn").find("svg").removeAttr("hidden");
    $("#est-tesha-1").siblings("img").after(
      '<span class="col-label text-uppercase">Да</span>',
    );
    $noDolly.siblings("img").after(
      '<span class="col-label text-uppercase">Нет</span>',
    );

    const $dimensionStep = $('.step[data-spa-step="4"]').first();
    const $weightContent = $('.step[data-spa-step="3"]')
      .not(".step-tesha")
      .find(".step-content.four")
      .first();

    if ($dimensionStep.length && $weightContent.length) {
      const $dimensionForm = $dimensionStep
        .find(".step-content.five > .form-container")
        .first()
        .detach();
      const $dimensionNavigation = $dimensionStep
        .find(".navigation-container")
        .first()
        .detach();
      const $weightNavigation = $weightContent
        .children(".navigation-container")
        .last();
      const $dimensionSection = $(
        '<section class="combined-dimensions-section"><div class="step-label">Габаритные параметры</div></section>',
      );

      $dimensionSection.append($dimensionForm);
      $dimensionSection.insertBefore($weightNavigation);
      $dimensionNavigation
        .find(".next-btn")
        .removeClass("step-five-btn")
        .addClass("combined-params-btn");
      $weightNavigation.replaceWith($dimensionNavigation);
      $dimensionStep.remove();

      $('.step[data-spa-step="3"] .step-header .header')
        .first()
        .text("Весовые и габаритные параметры");
      $('.step[data-spa-step="5"]').attr("data-progress-step", "3");
    }
  }

  function bindEvents() {
    $(".next-btn").on("click", handleNextClick);
    $(".prev-btn").on("click", handlePreviousClick);
    $(".calc-btn").on("click", handleCalculateClick);
    $(".col-btn").on("click", handleChoiceClick);
    $("select").on("change", handleSelectChange);
    $(".os-weight").on("input", validateWeightStep);
    $(".atc-msrmnt").on("input", validateDimensionsStep);
    $(".step-one-form").on("input", validateDistanceStep);
    $("#finalDistance").on("input", handleFinalDistanceInput);
    $("#teshaWeight").on("input", validateDollyStep);
    $(".add-os-btn").on("click", handleOptionalAxleToggle);
    $(".reset-btn").on("click", handleResetClick);
    $("#axleResetButton").on("click", handleAxleResetClick);
    $(".download-report-btn").on("click", handleDownloadReport);
    $(".send-otchet-to-whatsapp-btn").on("click", handleWhatsappClick);
    $(".project-consultation-btn").on("click", handleProjectConsultationClick);
    $(".calculation-help-btn").on("click", handleCalculationHelpClick);
    $("#addIntermediateRoute").on("click", addIntermediateRoute);
    $("#calculateRoute").on("click", calculateHybridRoute);
    $("#intermediateRoutes").on(
      "click",
      ".remove-intermediate-route",
      removeIntermediateRoute,
    );
  }

  function initialize() {
    const $firstStep = $(".step").first();
    appState.currentStep = $firstStep.get(0);

    $(".add-os-btn").each(function rememberOriginalLabel() {
      const $button = $(this);
      $button.data("add-label", $button.text().trim());
    });

    applyCustomerLayoutPolish();
    bindEvents();
    $(".download-report-btn").text("Скачать расчет TES (PDF)");
    loadJsPdf().catch((error) => {
      console.warn("Предварительная загрузка jsPDF не удалась", error);
    });
    loadYandexMaps();
    applyDimensionPlaceholders();
    validateAll();
    updateSchemePreview();
    openStep($firstStep);
    notifyParentHeight();

    if ("ResizeObserver" in window) {
      const calculator = document.querySelector(".steps");

      if (calculator) {
        const observer = new ResizeObserver(notifyParentHeight);
        observer.observe(calculator);
      }
    }

    window.addEventListener("load", notifyParentHeight);
  }
  
  $(initialize);

})(window.jQuery);
