(() => {
  "use strict";

  if (window.__filtroQuestoesAutoriaCarregado) {
    return;
  }

  window.__filtroQuestoesAutoriaCarregado = true;

  const CONFIG = Object.freeze({
    cardSelector: '[data-lift="lft-cardshape"]',
    defaultTerm: "Autoria própria",
    maxPagesPerSearch: 80,
    pageDelayMs: 900,
    pageChangeTimeoutMs: 10000,
    cardWaitTimeoutMs: 8000
  });

  const STATE = {
    lastTerm: CONFIG.defaultTerm,
    lastScope: "origin",
    isBusy: false,
    lastHit: {
      termNormalized: "",
      scope: "",
      pageSignature: ""
    }
  };

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeSpaces(value) {
    return normalizeText(value).replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function getCards() {
    return Array.from(document.querySelectorAll(CONFIG.cardSelector));
  }

  function getQuestionBlock(card) {
    return card.closest(".css-nfvl6z") || card;
  }

  function getElementText(element) {
    return normalizeSpaces([
      element?.innerText,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title")
    ].filter(Boolean).join(" "));
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      box.width > 0 &&
      box.height > 0
    );
  }

  function isDisabled(element) {
    return (
      Boolean(element.disabled) ||
      element.getAttribute("disabled") !== null ||
      element.getAttribute("aria-disabled") === "true"
    );
  }

  function createElement(tagName, options = {}, children = []) {
    const element = document.createElement(tagName);

    if (options.id) {
      element.id = options.id;
    }

    if (options.className) {
      element.className = options.className;
    }

    if (options.textContent !== undefined) {
      element.textContent = options.textContent;
    }

    if (options.type) {
      element.type = options.type;
    }

    if (options.value !== undefined) {
      element.value = options.value;
    }

    if (options.placeholder) {
      element.placeholder = options.placeholder;
    }

    if (options.title) {
      element.title = options.title;
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    children.forEach((child) => {
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    });

    return element;
  }

  function updateStatus(message, type = "info") {
    const status = document.querySelector("#fq-status");

    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.status = type;
  }

  function setBusy(isBusy, label = "Processando...") {
    STATE.isBusy = isBusy;

    const buttons = document.querySelectorAll("#fq-panel button");
    const searchButton = document.querySelector("#fq-search-next");

    buttons.forEach((button) => {
      button.disabled = isBusy;
    });

    if (searchButton) {
      searchButton.textContent = isBusy ? label : "Buscar próxima página com resultado";
    }
  }

  function getCurrentTerm() {
    const input = document.querySelector("#fq-term");

    const term = input?.value?.trim() || CONFIG.defaultTerm;

    STATE.lastTerm = term;

    return term;
  }

  function getCurrentScope() {
    const scope = document.querySelector("#fq-scope")?.value || "origin";

    STATE.lastScope = scope;

    return scope;
  }

  function cardHasSelectButton(card) {
    const buttons = Array.from(card.querySelectorAll("button"));

    return buttons.some((button) => {
      const text = getElementText(button);
      return text.includes("selecionar questao");
    });
  }

  function extractOrigin(card) {
    const text = normalizeSpaces(card.innerText);

    const match = text.match(
      /origem:\s*(.*?)(?:\s+exposicao:|\s+dificuldade:|\s+acertos:|$)/
    );

    return match ? match[1].trim() : "";
  }

  function cardMatches(card, term, scope) {
    if (!cardHasSelectButton(card)) {
      return false;
    }

    const normalizedTerm = normalizeSpaces(term);

    if (!normalizedTerm) {
      return false;
    }

    if (scope === "origin") {
      const origin = extractOrigin(card);
      return origin.includes(normalizedTerm);
    }

    const fullText = normalizeSpaces(card.innerText);
    return fullText.includes(normalizedTerm);
  }

  function findMatchingCards(term, scope) {
    return getCards().filter((card) => cardMatches(card, term, scope));
  }

  function clearVisualFilter() {
    getCards().forEach((card) => {
      const block = getQuestionBlock(card);

      block.classList.remove("fq-oculto");
      block.classList.remove("fq-mantido");
      block.removeAttribute("data-filtro-questoes");
    });
  }

  function applyFilter(term = getCurrentTerm(), scope = getCurrentScope()) {
    const cards = getCards();

    if (cards.length === 0) {
      updateStatus("Nenhuma questão encontrada na tela atual.", "warning");
      return {
        kept: 0,
        hidden: 0,
        ignored: 0
      };
    }

    let kept = 0;
    let hidden = 0;
    let ignored = 0;

    cards.forEach((card) => {
      const block = getQuestionBlock(card);
      const selectable = cardHasSelectButton(card);
      const matches = cardMatches(card, term, scope);

      if (selectable && matches) {
        block.classList.remove("fq-oculto");
        block.classList.add("fq-mantido");
        block.dataset.filtroQuestoes = "mantido";
        kept += 1;
      } else {
        block.classList.add("fq-oculto");
        block.classList.remove("fq-mantido");
        block.dataset.filtroQuestoes = "ocultado";
        hidden += 1;

        if (!selectable) {
          ignored += 1;
        }
      }
    });

    const pageLabel = getCurrentPageLabel();

    updateStatus(
      `${pageLabel}Filtro aplicado. Mantidas: ${kept}. Ocultadas: ${hidden}.`,
      kept > 0 ? "success" : "warning"
    );

    if (kept > 0) {
      STATE.lastHit = {
        termNormalized: normalizeSpaces(term),
        scope,
        pageSignature: getPageSignature()
      };
    }

    console.info("[Filtro de Questões] Filtro aplicado:", {
      term,
      scope,
      cards: cards.length,
      kept,
      hidden,
      ignored
    });

    return {
      kept,
      hidden,
      ignored
    };
  }

  function removeFilter() {
    clearVisualFilter();

    STATE.lastHit = {
      termNormalized: "",
      scope: "",
      pageSignature: ""
    };

    updateStatus("Filtro removido.", "info");
  }

  function selectVisibleQuestions() {
    const visibleCards = getCards().filter((card) => {
      const block = getQuestionBlock(card);

      return (
        cardHasSelectButton(card) &&
        !block.classList.contains("fq-oculto")
      );
    });

    let selected = 0;

    visibleCards.forEach((card) => {
      const button = Array.from(card.querySelectorAll("button")).find((item) => {
        const text = getElementText(item);
        return text.includes("selecionar questao");
      });

      if (button && !isDisabled(button)) {
        button.click();
        selected += 1;
      }
    });

    updateStatus(`Questões visíveis acionadas: ${selected}.`, "success");
  }

  function getPageSignature() {
    const ids = getCards()
      .map((card) => {
        const rawText = card.innerText || "";
        const idMatch = rawText.match(/ID:\s*([a-zA-Z0-9]+)/);

        if (idMatch) {
          return idMatch[1];
        }

        return normalizeSpaces(rawText).slice(0, 60);
      })
      .join("|");

    return `${getCards().length}|${ids}`;
  }

  function getCurrentPageLabel() {
    const current = getCurrentPaginationNumber();

    if (!current) {
      return "";
    }

    return `Página ${current}: `;
  }

  function getCurrentPaginationNumber() {
    const controls = Array.from(
      document.querySelectorAll('button, a, [role="button"]')
    ).filter((element) => {
      if (
        !isVisible(element) ||
        element.closest(CONFIG.cardSelector) ||
        element.closest("#fq-panel")
      ) {
        return false;
      }

      const rawText = String(element.innerText || "").trim();
      return /^[0-9]+$/.test(rawText);
    });

    const current = controls.find((element) => {
      const className = String(element.className || "").toLowerCase();

      return (
        element.getAttribute("aria-current") === "page" ||
        element.getAttribute("aria-selected") === "true" ||
        element.getAttribute("aria-pressed") === "true" ||
        className.includes("active") ||
        className.includes("selected") ||
        className.includes("current")
      );
    });

    if (!current) {
      return "";
    }

    return String(current.innerText || "").trim();
  }

  function isNavigationControlCandidate(element) {
    if (!isVisible(element)) {
      return false;
    }

    if (element.closest(CONFIG.cardSelector) || element.closest("#fq-panel")) {
      return false;
    }

    const text = getElementText(element);

    const forbiddenExactTexts = new Set([
      "avancar",
      "voltar",
      "sair",
      "salvar progresso"
    ]);

    if (forbiddenExactTexts.has(text)) {
      return false;
    }

    if (text.includes("selecionar questao")) {
      return false;
    }

    return true;
  }

  function findNextPageButton() {
    const controls = Array.from(
      document.querySelectorAll('button, a, [role="button"]')
    ).filter(isNavigationControlCandidate);

    const nextWords = [
      "proxima",
      "proxima pagina",
      "pagina seguinte",
      "seguinte",
      "next",
      "ir para proxima",
      "avancar pagina"
    ];

    const explicitNext = controls.find((element) => {
      if (isDisabled(element)) {
        return false;
      }

      const text = getElementText(element);
      return nextWords.some((word) => text.includes(word));
    });

    if (explicitNext) {
      return explicitNext;
    }

    const numericControls = controls
      .map((element) => {
        const rawText = String(element.innerText || "").trim();
        const number = Number(rawText);

        return {
          element,
          number,
          rawText
        };
      })
      .filter((item) => Number.isInteger(item.number) && item.number > 0)
      .sort((a, b) => a.number - b.number);

    const current = numericControls.find((item) => {
      const element = item.element;
      const className = String(element.className || "").toLowerCase();

      return (
        element.getAttribute("aria-current") === "page" ||
        element.getAttribute("aria-selected") === "true" ||
        element.getAttribute("aria-pressed") === "true" ||
        className.includes("active") ||
        className.includes("selected") ||
        className.includes("current")
      );
    });

    if (!current) {
      return null;
    }

    const next = numericControls.find((item) => {
      return item.number > current.number && !isDisabled(item.element);
    });

    return next ? next.element : null;
  }

  async function waitForCards() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < CONFIG.cardWaitTimeoutMs) {
      if (getCards().length > 0) {
        return true;
      }

      await sleep(250);
    }

    return false;
  }

  async function waitForPageChange(previousSignature) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < CONFIG.pageChangeTimeoutMs) {
      await sleep(250);

      const currentSignature = getPageSignature();

      if (currentSignature !== previousSignature && getCards().length > 0) {
        await sleep(500);
        return true;
      }
    }

    return false;
  }

  async function goToNextPage() {
    const nextButton = findNextPageButton();

    if (!nextButton) {
      return false;
    }

    const previousSignature = getPageSignature();

    nextButton.click();

    await sleep(CONFIG.pageDelayMs);

    return waitForPageChange(previousSignature);
  }

  function scrollToFirstResult(cards) {
    const first = cards[0];

    if (!first) {
      return;
    }

    const block = getQuestionBlock(first);

    block.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function shouldSkipCurrentPage(term, scope) {
    return (
      STATE.lastHit.termNormalized === normalizeSpaces(term) &&
      STATE.lastHit.scope === scope &&
      STATE.lastHit.pageSignature === getPageSignature()
    );
  }

  async function searchNextPageWithResult() {
    if (STATE.isBusy) {
      return;
    }

    const term = getCurrentTerm();
    const scope = getCurrentScope();

    setBusy(true, "Buscando...");

    try {
      await waitForCards();

      const skipCurrent = shouldSkipCurrentPage(term, scope);

      clearVisualFilter();

      if (skipCurrent) {
        updateStatus("Resultado atual já visto. Avançando para a próxima página...", "info");

        const changed = await goToNextPage();

        if (!changed) {
          updateStatus("Não consegui avançar para a próxima página.", "warning");
          return;
        }
      }

      for (let pageAttempt = 1; pageAttempt <= CONFIG.maxPagesPerSearch; pageAttempt += 1) {
        await waitForCards();

        const foundCards = findMatchingCards(term, scope);

        if (foundCards.length > 0) {
          const result = applyFilter(term, scope);
          scrollToFirstResult(foundCards);

          STATE.lastHit = {
            termNormalized: normalizeSpaces(term),
            scope,
            pageSignature: getPageSignature()
          };

          updateStatus(
            `${getCurrentPageLabel()}encontradas ${result.kept} questão(ões). Clique novamente para continuar.`,
            "success"
          );

          return;
        }

        updateStatus(`${getCurrentPageLabel()}nenhum resultado. Avançando...`, "info");

        const changed = await goToNextPage();

        if (!changed) {
          updateStatus("Fim da paginação ou botão de próxima página não encontrado.", "warning");
          return;
        }
      }

      updateStatus(
        `Busca interrompida após ${CONFIG.maxPagesPerSearch} páginas.`,
        "warning"
      );
    } finally {
      setBusy(false);
    }
  }

  function injectStyles() {
    if (document.querySelector("#fq-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "fq-style";

    style.textContent = `
      .fq-oculto {
        display: none !important;
      }

      .fq-mantido {
        outline: 3px solid #22c55e !important;
        background-color: rgba(240, 253, 244, 0.92) !important;
      }

      #fq-panel {
        position: fixed;
        top: 86px;
        right: 330px;
        z-index: 999999;
        width: 310px;
        color: #111827;
        background: rgba(255, 255, 255, 0.78);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(209, 213, 219, 0.9);
        border-radius: 16px;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.22);
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        overflow: hidden;
      }

      #fq-panel * {
        box-sizing: border-box;
      }

      #fq-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        cursor: move;
        user-select: none;
        border-bottom: 1px solid rgba(209, 213, 219, 0.65);
        background: rgba(249, 250, 251, 0.78);
      }

      #fq-title {
        font-weight: 700;
        font-size: 13px;
      }

      #fq-toggle {
        width: 28px;
        min-height: 26px;
        border-radius: 8px;
        border: 1px solid rgba(209, 213, 219, 0.95);
        background: rgba(255, 255, 255, 0.72);
        cursor: pointer;
        font-weight: 700;
      }

      #fq-body {
        padding: 12px;
      }

      #fq-panel.fq-collapsed #fq-body {
        display: none;
      }

      .fq-field {
        margin-bottom: 10px;
      }

      .fq-label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: 600;
        color: #374151;
      }

      #fq-term,
      #fq-scope {
        width: 100%;
        min-height: 34px;
        border: 1px solid rgba(209, 213, 219, 0.95);
        border-radius: 10px;
        padding: 7px 9px;
        background: rgba(255, 255, 255, 0.9);
        color: #111827;
        outline: none;
      }

      #fq-term:focus,
      #fq-scope:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
      }

      .fq-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 7px;
        margin-top: 10px;
      }

      .fq-button {
        min-height: 34px;
        border: 1px solid rgba(209, 213, 219, 0.95);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.86);
        color: #111827;
        cursor: pointer;
        font-weight: 600;
      }

      .fq-button:hover:not(:disabled) {
        background: rgba(243, 244, 246, 0.95);
      }

      .fq-button:disabled {
        cursor: wait;
        opacity: 0.62;
      }

      .fq-button-primary {
        border-color: rgba(37, 99, 235, 0.45);
        background: rgba(37, 99, 235, 0.92);
        color: #ffffff;
      }

      .fq-button-primary:hover:not(:disabled) {
        background: rgba(29, 78, 216, 0.96);
      }

      .fq-button-danger {
        color: #991b1b;
      }

      #fq-status {
        margin-top: 10px;
        padding: 8px;
        min-height: 34px;
        border-radius: 10px;
        line-height: 1.35;
        font-size: 12px;
        background: rgba(249, 250, 251, 0.82);
        border: 1px solid rgba(229, 231, 235, 0.9);
        color: #374151;
      }

      #fq-status[data-status="success"] {
        color: #166534;
        background: rgba(240, 253, 244, 0.88);
        border-color: rgba(187, 247, 208, 0.95);
      }

      #fq-status[data-status="warning"] {
        color: #92400e;
        background: rgba(255, 251, 235, 0.88);
        border-color: rgba(253, 230, 138, 0.95);
      }

      #fq-hint {
        margin-top: 8px;
        color: #6b7280;
        font-size: 11px;
        line-height: 1.35;
      }

      @media (max-width: 1400px) {
        #fq-panel {
          top: 92px;
          right: 24px;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function makeButton(id, text, className = "fq-button") {
    return createElement("button", {
      id,
      type: "button",
      className,
      textContent: text
    });
  }

  function createPanel() {
    if (document.querySelector("#fq-panel")) {
      return;
    }

    const panel = createElement("section", {
      id: "fq-panel",
      attributes: {
        "aria-label": "Filtro de questões"
      }
    });

    const title = createElement("div", {
      id: "fq-title",
      textContent: "Filtro de questões"
    });

    const toggle = createElement("button", {
      id: "fq-toggle",
      type: "button",
      textContent: "−",
      title: "Minimizar painel",
      attributes: {
        "aria-label": "Minimizar painel"
      }
    });

    const header = createElement("header", {
      id: "fq-header"
    }, [title, toggle]);

    const termLabel = createElement("label", {
      className: "fq-label",
      textContent: "Termo"
    });

    termLabel.setAttribute("for", "fq-term");

    const termInput = createElement("input", {
      id: "fq-term",
      type: "text",
      value: CONFIG.defaultTerm,
      placeholder: "Ex.: Autoria própria"
    });

    const termField = createElement("div", {
      className: "fq-field"
    }, [termLabel, termInput]);

    const scopeLabel = createElement("label", {
      className: "fq-label",
      textContent: "Buscar em"
    });

    scopeLabel.setAttribute("for", "fq-scope");

    const scopeSelect = createElement("select", {
      id: "fq-scope"
    });

    const optionOrigin = createElement("option", {
      textContent: "Campo Origem"
    });

    optionOrigin.value = "origin";

    const optionAll = createElement("option", {
      textContent: "Texto inteiro da questão"
    });

    optionAll.value = "all";

    scopeSelect.append(optionOrigin, optionAll);

    const scopeField = createElement("div", {
      className: "fq-field"
    }, [scopeLabel, scopeSelect]);

    const actions = createElement("div", {
      className: "fq-actions"
    }, [
      makeButton("fq-filter-current", "Filtrar página atual", "fq-button fq-button-primary"),
      makeButton("fq-search-next", "Buscar próxima página com resultado"),
      makeButton("fq-select-visible", "Selecionar questões visíveis"),
      makeButton("fq-clear", "Desfazer filtro", "fq-button fq-button-danger")
    ]);

    const status = createElement("div", {
      id: "fq-status",
      textContent: "Painel carregado. Escolha um termo e uma ação."
    });

    status.dataset.status = "info";

    const hint = createElement("div", {
      id: "fq-hint",
      textContent: "Dica: use “Campo Origem” para Autoria própria, Conteudista ou IA. Use “Texto inteiro” para procurar temas ou palavras no enunciado."
    });

    const body = createElement("div", {
      id: "fq-body"
    }, [termField, scopeField, actions, status, hint]);

    panel.append(header, body);

    document.body.appendChild(panel);

    bindPanelEvents();
    enablePanelDrag();
  }

  function bindPanelEvents() {
    document.querySelector("#fq-filter-current")?.addEventListener("click", () => {
      const term = getCurrentTerm();
      const scope = getCurrentScope();

      applyFilter(term, scope);
    });

    document.querySelector("#fq-search-next")?.addEventListener("click", () => {
      searchNextPageWithResult();
    });

    document.querySelector("#fq-select-visible")?.addEventListener("click", () => {
      selectVisibleQuestions();
    });

    document.querySelector("#fq-clear")?.addEventListener("click", () => {
      removeFilter();
    });

    document.querySelector("#fq-term")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyFilter(getCurrentTerm(), getCurrentScope());
      }
    });

    document.querySelector("#fq-toggle")?.addEventListener("click", (event) => {
      event.stopPropagation();

      const panel = document.querySelector("#fq-panel");
      const toggle = document.querySelector("#fq-toggle");

      if (!panel || !toggle) {
        return;
      }

      panel.classList.toggle("fq-collapsed");

      const collapsed = panel.classList.contains("fq-collapsed");

      toggle.textContent = collapsed ? "+" : "−";
      toggle.title = collapsed ? "Expandir painel" : "Minimizar painel";
      toggle.setAttribute(
        "aria-label",
        collapsed ? "Expandir painel" : "Minimizar painel"
      );
    });
  }

  function enablePanelDrag() {
    const panel = document.querySelector("#fq-panel");
    const header = document.querySelector("#fq-header");

    if (!panel || !header) {
      return;
    }

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (event) => {
      if (event.target?.id === "fq-toggle") {
        return;
      }

      isDragging = true;

      const rect = panel.getBoundingClientRect();

      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;

      event.preventDefault();
    });

    document.addEventListener("mousemove", (event) => {
      if (!isDragging) {
        return;
      }

      const nextLeft = Math.max(8, event.clientX - offsetX);
      const nextTop = Math.max(8, event.clientY - offsetY);

      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  function initialize() {
    injectStyles();
    createPanel();

    console.info("[Filtro de Questões] Extensão carregada com sucesso.");
  }

  function waitForBodyAndInitialize() {
    if (document.body) {
      initialize();
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.body) {
        window.clearInterval(intervalId);
        initialize();
      }
    }, 100);
  }

  waitForBodyAndInitialize();
})();