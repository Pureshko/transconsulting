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
    const visibleStep = Number($step.data("spa-step")) || 1;

    document.body.dataset.currentStep = String(visibleStep);

    $(".stepper__item").each(function updateNavigationItem() {
      const $item = $(this);
      const itemStep = Number($item.data("nav-step"));

      $item.toggleClass("is-active", itemStep === visibleStep);
      $item.toggleClass("is-complete", itemStep < visibleStep);
    });

    $("#mobileStepLabel").text(`Шаг ${visibleStep} из 6`);
    $("#headerStepLabel").text(`Шаг ${visibleStep} из 6`);
    $("#mobileProgressBar").css(
      "width",
      `${(visibleStep / 6) * 100}%`,
    );
    $("#headerProgressFill").css(
      "width",
      `${((visibleStep - 1) / 5) * 100}%`,
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
      setDisabled(".step-two-btn.next-btn", false);
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

    // Синхронизируем с исходным полем маршрута, чтобы отчёт WhatsApp
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
    const $axleStep = $('.step[data-spa-step="2"]');

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

  function handleWhatsappClick() {
    const rawPhone = $("#whatsappNumber").val().trim();
    const phone = rawPhone.replace(/[^\d+]/g, "");

    if (!phone) {
      window.alert("Пожалуйста, введите номер телефона.");
      return;
    }

    const form = readFormData();
    const weightSummary = buildWeightSummary(form);
    const amount = formatNumber(appState.total.toFixed(2));

    const message = [
      `Сумма сбора за проезд по территории Республики Казахстан: ${amount} тг`,
      "",
      `Нагрузки по группам осей: ${weightSummary.label}`,
      `Общая фактическая масса: ${weightSummary.total.toFixed(2)} т`,
      `Длина: ${form.length} м`,
      `Ширина: ${form.width} м`,
      `Высота: ${form.height} м`,
      `Расстояние: ${form.distance} км`,
      `Сумма сбора: ${amount} тг`,
      ...(appState.coverVehicleAssessment?.required
        ? [
            "",
            "НЕОБХОДИМ АВТОМОБИЛЬ ПРИКРЫТИЯ:",
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
    $(".send-otchet-to-whatsapp-btn").on(
      "click",
      handleWhatsappClick,
    );
  }

  function initialize() {
    const $firstStep = $(".step").first();
    appState.currentStep = $firstStep.get(0);

    $(".add-os-btn").each(function rememberOriginalLabel() {
      const $button = $(this);
      $button.data("add-label", $button.text().trim());
    });

    bindEvents();
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
  let map;
  let directionsService;
  let directionsRenderer;

  // Функция инициализации карты и подсказок (вызывается авто-сплайном Google API)
  function initMap() {
    // 1. Создаем экземпляры сервисов Google Maps
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();

    // 2. Инициализируем карту (по умолчанию центр на Москву, заменят точки при маршруте)
    map = new google.maps.Map(document.getElementById("map"), {
      zoom: 7,
      center: { lat: 55.751244, lng: 37.618423 },
      mapTypeControl: false
    });

    // 3. Привязываем отрисовщик маршрута к нашей карте
    directionsRenderer.setMap(map);

    // 4. Подключаем автозаполнение адресов Google Places к инпутам
    const originInput = document.getElementById("origin");
    const destInput = document.getElementById("destination");

    new google.maps.places.Autocomplete(originInput);
    new google.maps.places.Autocomplete(destInput);
  }

  // Расчет расстояния по нажатию на кнопку
  function calculateDistance() {
    const origin = document.getElementById("origin").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const resultBox = document.getElementById("result");

    if (!origin || !destination) {
      alert("Пожалуйста, заполните обе точки!");
      return;
    }

    // Запрос к Directions Service
    directionsService.route(
      {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING
      },
      (response, status) => {
        if (status === "OK") {
          directionsRenderer.setDirections(response);

          const route = response.routes[0].legs[0];

          // 1. Получаем точное расстояние В МЕТРАХ (тип: Number)
          const distanceInMeters = route.distance.value; // Например: 452800

          // 2. Переводим в КИЛОМЕТРЫ как число с плавающей точкой
          const distanceInKm = distanceInMeters / 1000; // Например: 452.8
          $('input[name="distance"]').val(distanceInKm)

          // 3. Округляем до 1 знака после запятой (или до целого через Math.round)
          const distanceInKmFormatted = Number((distanceInMeters / 1000).toFixed(1)); // 452.8 (тип: Number)

          // 4. Время в секундах (тип: Number)
          const durationInSeconds = route.duration.value;
          const durationInMinutes = Math.round(durationInSeconds / 60);

          // Теперь distanceInKmFormatted можно использовать в любых математических расчетах!
          console.log("Дистанция числом (км):", distanceInKmFormatted);
          console.log("Тип данных:", typeof distanceInKmFormatted); // number

          // Пример вывода на страницу
          resultBox.style.display = "block";
          resultBox.innerHTML = `
            <div class="result-item">Дистанция: <b>${distanceInKmFormatted} км</b></div>
            <div class="result-item">Время в пути: <b>${durationInMinutes} мин.</b></div>
          `;
        } else {
          resultBox.style.display = "block";
          resultBox.innerHTML = `<span style="color: red;">Ошибка: ${status}</span>`;
        }
      }
    );
  }
  $(initialize);

})(window.jQuery);