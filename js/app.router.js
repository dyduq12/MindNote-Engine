"use strict";

/*
 * js/app.router.js — Fase 2 (v2.0)
 *
 * Controlador de navegacao da SPA em Vanilla JS puro. Alterna entre as
 * views irmas do DOM (#view-home, #view-editor e #view-config) com uma transicao
 * de desfoque + opacidade, sem recarregar a pagina e sem framework.
 *
 * Este modulo nao referencia nenhuma linha de engine.geometry.js,
 * engine.text.js, render.svg.js ou render.pdf.js.
 */

const MindNoteRouter = (() => {
  let viewHome = null;
  let viewEditor = null;
  let viewConfig = null;
  let viewAtiva = null;
  let viewAnteriorConfig = "home";
  let idAnteriorConfig = null;

  function obterElementos() {
    viewHome = document.getElementById("view-home");
    viewEditor = document.getElementById("view-editor");
    viewConfig = document.getElementById("view-config");
  }

  function exibir(elemento) {
    if (!elemento) return;
    elemento.hidden = false;
    elemento.style.display = elemento.id === "view-editor" ? "flex" : "grid";
  }

  function aplicarTransicao(elementoQueSai, elementoQueEntra, aoConcluir) {
    if (!elementoQueEntra) {
      aoConcluir?.();
      return;
    }

    if (elementoQueSai && elementoQueSai !== elementoQueEntra) {
      elementoQueSai.classList.remove("view-saindo", "view-entrando");
      elementoQueSai.style.display = "none";
      elementoQueSai.hidden = true;
    }

    // Troca as views no mesmo turno do clique/hash: a view de saída fica
    // imediatamente oculta, sem uma janela em que a Home continue por cima.
    exibir(elementoQueEntra);
    elementoQueEntra.classList.add("view-entrando");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => elementoQueEntra.classList.remove("view-entrando"));
    });
    aoConcluir?.();
  }

  function definirHash(hash) {
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }

  function navegarPara(destino, id, opcoes = {}) {
    const temaPreferido = window.MindNoteTheme?.obter?.();
    if (temaPreferido) window.MindNoteTheme?.aplicar?.(temaPreferido);
    if (!viewHome || !viewEditor || !viewConfig) obterElementos();
    if (destino === "config" && viewAtiva && viewAtiva !== viewConfig) {
      viewAnteriorConfig = viewAtiva === viewEditor ? "editor" : "home";
      idAnteriorConfig = viewAtiva === viewEditor ? extrairIdDaHash() : null;
    }
    if (viewAtiva === viewEditor && destino !== "editor" && document.getElementById("json-backstage-envelope")?.dataset.open === "true") {
      window.MindNoteBackstage?.close?.();
    }

    if (destino === "home") {
      definirHash("#home");
      aplicarTransicao(viewAtiva, viewHome, () => {
        viewAtiva = viewHome;
        document.querySelectorAll(".mn-nav-item[data-home-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.homeNav === "todos"));
        window.MindNoteHome?.definirFiltroSidebar?.({ tipo: "todos" });
        window.MindNoteHome?.atualizarListaDeMapas?.();
      });
      return;
    }

    if (destino === "editor") {
      const hash = id ? `#editor?id=${encodeURIComponent(id)}` : "#editor";
      definirHash(hash);
      aplicarTransicao(viewAtiva, viewEditor, () => {
        viewAtiva = viewEditor;
        if (!opcoes.preservarEditor) window.MindNoteApp?.inicializarComMapa?.(id || null);
      });
      return;
    }

    if (destino === "config") {
      const aba = typeof opcoes.tab === "string" ? opcoes.tab : "usuario";
      definirHash(aba === "usuario" ? "#/config" : `#/config?tab=${encodeURIComponent(aba)}`);
      aplicarTransicao(viewAtiva, viewConfig, () => {
        viewAtiva = viewConfig;
        window.MindNoteSettings?.mostrarPagina?.(aba);
      });
    }
  }

  function voltar() {
    const destino = viewAnteriorConfig || "home";
    const id = idAnteriorConfig;
    viewAnteriorConfig = "home";
    idAnteriorConfig = null;
    navegarPara(destino, id, { preservarEditor: destino === "editor" });
  }

  function extrairIdDaHash() {
    const hash = window.location.hash || "";
    const match = /id=([^&]+)/.exec(hash);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function rotaInicial() {
    const hash = window.location.hash || "";
    if (!viewAtiva) {
      const idAlvo = /^#\/?config(?:\?|$)/i.test(hash) ? "view-config"
        : hash.startsWith("#editor") ? "view-editor" : "view-home";
      [viewHome, viewEditor, viewConfig].forEach((view) => {
        if (!view || view.id === idAlvo) return;
        view.hidden = true;
        view.style.display = "none";
      });
    }
    if (/^#\/?config(?:\?|$)/i.test(hash)) {
      const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      const aba = new URLSearchParams(query).get("tab") || "usuario";
      navegarPara("config", null, { tab: aba });
    } else if (hash.startsWith("#editor")) {
      navegarPara("editor", extrairIdDaHash());
    } else {
      navegarPara("home");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    obterElementos();
    rotaInicial();
  });
  window.addEventListener("hashchange", rotaInicial);
  window.addEventListener("popstate", rotaInicial);

  return { navegarPara, voltar };
})();

window.MindNoteRouter = MindNoteRouter;
