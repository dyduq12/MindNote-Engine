"use strict";

/*
 * js/app.router.js — Fase 2 (v2.0)
 *
 * Controlador de navegacao da SPA em Vanilla JS puro. Alterna entre as
 * duas secoes irmas do DOM (#view-home e #view-editor) com uma transicao
 * de desfoque + opacidade, sem recarregar a pagina e sem framework.
 *
 * Este modulo nao referencia nenhuma linha de engine.geometry.js,
 * engine.text.js, render.svg.js ou render.pdf.js.
 */

const MindNoteRouter = (() => {
  const DURACAO_TRANSICAO_MS = 220;

  let viewHome = null;
  let viewEditor = null;

  function obterElementos() {
    viewHome = document.getElementById("view-home");
    viewEditor = document.getElementById("view-editor");
  }

  function aplicarTransicao(elementoQueSai, elementoQueEntra, aoConcluir) {
    if (!elementoQueEntra) {
      aoConcluir?.();
      return;
    }

    if (!elementoQueSai || elementoQueSai === elementoQueEntra) {
      elementoQueEntra.style.display = "flex";
      aoConcluir?.();
      return;
    }

    elementoQueSai.classList.add("view-saindo");

    window.setTimeout(() => {
      elementoQueSai.style.display = "none";
      elementoQueSai.classList.remove("view-saindo");

      elementoQueEntra.style.display = "flex";
      elementoQueEntra.classList.add("view-entrando");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          elementoQueEntra.classList.remove("view-entrando");
        });
      });

      aoConcluir?.();
    }, DURACAO_TRANSICAO_MS);
  }

  function navegarPara(destino, id) {
    if (!viewHome || !viewEditor) obterElementos();

    if (destino === "home") {
      window.history.replaceState(null, "", "#home");
      aplicarTransicao(viewEditor, viewHome, () => {
        window.MindNoteHome?.atualizarListaDeMapas?.();
      });
      return;
    }

    if (destino === "editor") {
      const hash = id ? `#editor?id=${encodeURIComponent(id)}` : "#editor";
      window.history.replaceState(null, "", hash);
      aplicarTransicao(viewHome, viewEditor, () => {
        window.MindNoteApp?.inicializarComMapa?.(id || null);
      });
      return;
    }
  }

  function extrairIdDaHash() {
    const hash = window.location.hash || "";
    const match = /id=([^&]+)/.exec(hash);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function rotaInicial() {
    const hash = window.location.hash || "";
    if (hash.startsWith("#editor")) {
      navegarPara("editor", extrairIdDaHash());
    } else {
      navegarPara("home");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    obterElementos();
    rotaInicial();
  });

  return { navegarPara };
})();

window.MindNoteRouter = MindNoteRouter;
