"use strict";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  const allowedHost = "https://admin.saladeavaliacoes.com.br/";

  if (!tab.url.startsWith(allowedHost)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.__filtroQuestoesAutoriaCarregado = false;

        document
          .querySelectorAll(".fq-oculto, .fq-mantido")
          .forEach((element) => {
            element.classList.remove("fq-oculto");
            element.classList.remove("fq-mantido");
            element.removeAttribute("data-filtro-questoes");
          });

        document.querySelector("#fq-panel")?.remove();
        document.querySelector("#fq-style")?.remove();
      }
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (error) {
    console.error("[Filtro de Questões] Falha ao reiniciar extensão:", error);
  }
});