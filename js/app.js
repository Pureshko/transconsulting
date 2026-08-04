(function ($) {

  const appState = {
    currentStep: null,
    total: 0,
    coefficient: 0,
    coverVehicleAssessment: null,
  };

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

    $("#mobileStepLabel").text(`Шаг ${visibleStep} из 5`);
    $("#headerStepLabel").text(`Шаг ${visibleStep} из 5`);
    $("#mobileProgressBar").css(
      "width",
      `${(visibleStep / 5) * 100}%`,
    );
    $("#headerProgressFill").css(
      "width",
      `${((visibleStep - 1) / 4) * 100}%`,
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

    syncOptionalWeightFields();
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

  function validateWeightStep() {
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

    const valid = required.every((selector) => numericValue(selector) > 0);
    setDisabled(".step-four-btn.next-btn", !valid);

    return valid;
  }

  function validateDimensionsStep() {
    const valid = ["#atc_height", "#atc_width", "#atc_length"].every(
      (selector) => numericValue(selector) > 0,
    );

    setDisabled(".step-five-btn.next-btn", !valid);
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

    let valid = selected === "0";

    if (usesDolly) {
      valid =
        numericValue("input.tesha-row:checked") > 0 &&
        numericValue("#teshaWeight") > 0 &&
        $("#teshaOsDistance").val() !== null;
    }

    setDisabled(".step-tesha-btn.next-btn", !valid);
    return valid;
  }

  function validateAll() {
    validateAxleStep();
    validateWeightStep();
    validateDimensionsStep();
    validateDistanceStep();
    validateDollyStep();
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
    let logoImage;
    let vehicleImage;

    try {
      [logoImage, vehicleImage] = await Promise.all([
        loadReportImage("images/logo.png"),
        loadReportImage(vehicle.image),
      ]);
    } catch (error) {
      console.error("Не удалось подготовить изображения отчета", error);
      window.alert("Не удалось подготовить отчет. Обновите страницу и повторите попытку.");
      return;
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 1400;
    canvas.height = 1900;

    context.fillStyle = "#f4f5f7";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#c20d0e";
    context.fillRect(0, 0, canvas.width, 250);
    context.fillStyle = "#ffffff";
    context.fillRect(62, 42, 166, 166);
    drawContainedImage(context, logoImage, 70, 50, 150, 150);

    context.fillStyle = "#ffffff";
    context.font = "700 58px Arial, sans-serif";
    context.fillText("TRANSPORT ENGINEERING SOLUTIONS", 270, 110);
    context.font = "400 31px Arial, sans-serif";
    context.fillText("Расчет суммы сбора за проезд по территории РК", 270, 166);
    context.font = "400 22px Arial, sans-serif";
    context.fillText(
      `Дата расчета: ${new Date().toLocaleDateString("ru-RU")}`,
      270,
      207,
    );

    context.fillStyle = "#ffffff";
    context.fillRect(62, 300, 1276, 1500);

    context.fillStyle = "#1d232d";
    context.font = "700 38px Arial, sans-serif";
    context.fillText(vehicle.label, 110, 375);
    drawContainedImage(context, vehicleImage, 110, 410, 1180, 430);

    context.strokeStyle = "#e1e3e7";
    context.lineWidth = 2;
    context.strokeRect(110, 875, 1180, 430);
    context.fillStyle = "#1d232d";
    context.font = "700 28px Arial, sans-serif";
    context.fillText("Параметры расчета", 150, 930);
    context.font = "400 25px Arial, sans-serif";

    const details = [
      `Нагрузки по группам осей: ${weightSummary.label}`,
      `Общая фактическая масса: ${weightSummary.total.toFixed(2)} т`,
      `Габариты (Д × Ш × В): ${form.length} × ${form.width} × ${form.height} м`,
      `Расстояние маршрута: ${form.distance} км`,
      `Весенние ограничения: ${form.restrictionSeason ? "учтены" : "не применяются"}`,
    ];

    details.forEach((detail, index) => {
      context.fillText(detail, 150, 995 + index * 58);
    });

    context.fillStyle = "#c20d0e";
    context.fillRect(110, 1345, 1180, 175);
    context.fillStyle = "#ffffff";
    context.font = "600 29px Arial, sans-serif";
    context.fillText("Сумма сбора за проезд", 155, 1405);
    context.font = "800 54px Arial, sans-serif";
    context.fillText(`${amount} тенге`, 155, 1480);

    if (appState.coverVehicleAssessment?.required) {
      context.fillStyle = "#fff3f3";
      context.fillRect(110, 1555, 1180, 170);
      context.fillStyle = "#a70711";
      context.font = "700 27px Arial, sans-serif";
      context.fillText("Необходим автомобиль прикрытия", 150, 1605);
      context.fillStyle = "#363c45";
      context.font = "400 21px Arial, sans-serif";
      let reasonY = 1650;

      appState.coverVehicleAssessment.reasons.forEach((reason) => {
        reasonY = drawWrappedText(
          context,
          `• ${reason}`,
          150,
          reasonY,
          1090,
          30,
        );
      });
    }

    context.fillStyle = "#666e78";
    context.font = "400 20px Arial, sans-serif";
    context.fillText(
      "Предварительный расчет. Для оформления специального разрешения свяжитесь с TES.",
      110,
      1770,
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

  function enableInternationalAutocomplete() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;

      try {
        if (
          typeof originAutocomplete !== "undefined" &&
          typeof destAutocomplete !== "undefined" &&
          originAutocomplete &&
          destAutocomplete
        ) {
          originAutocomplete.setComponentRestrictions({});
          destAutocomplete.setComponentRestrictions({});
          window.clearInterval(timer);
          return;
        }
      } catch (error) {
        console.warn("Не удалось снять ограничение стран в автопоиске", error);
      }

      if (attempts >= 40) {
        window.clearInterval(timer);
      }
    }, 250);
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
  }

  function initialize() {
    const $firstStep = $(".step").first();
    appState.currentStep = $firstStep.get(0);

    $(".add-os-btn").each(function rememberOriginalLabel() {
      const $button = $(this);
      $button.data("add-label", $button.text().trim());
    });

    bindEvents();
    $(".download-report-btn").text("Скачать расчет TES (PDF)");
    loadJsPdf().catch((error) => {
      console.warn("Предварительная загрузка jsPDF не удалась", error);
    });
    enableInternationalAutocomplete();
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
