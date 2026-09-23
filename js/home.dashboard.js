"use strict";

/*
 * js/home.dashboard.js — Fase 2 (v2.0)
 *
 * Renderiza a grade de cartoes da Home, o botao flutuante (+) e o estado
 * vazio. Le exclusivamente de window.MindNoteDB (nunca da arvore JSON
 * completa) para manter a tela inicial leve mesmo com muitos mapas.
 *
 * Este modulo nao referencia nenhuma linha de engine.geometry.js,
 * engine.text.js, render.svg.js ou render.pdf.js.
 */

const MindNoteHome = (() => {
  function escaparHTML(texto) {
    return String(texto ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatarData(timestamp) {
    if (!timestamp) return "";
    const data = new Date(timestamp);
    const dataTexto = data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const horaTexto = data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dataTexto} às ${horaTexto}`;
  }

  function el(tag, attrs = {}, filhos = []) {
    const elemento = document.createElement(tag);
    Object.entries(attrs).forEach(([chave, valor]) => {
      if (chave === "class") elemento.className = valor;
      else if (chave === "html") elemento.innerHTML = valor;
      else elemento.setAttribute(chave, valor);
    });
    filhos.forEach((filho) => filho && elemento.appendChild(filho));
    return elemento;
  }

  function fecharTodosOsMenus() {
    document
      .querySelectorAll(".home-card-menu")
      .forEach((menu) => (menu.style.display = "none"));
    const menuNovo = document.getElementById("home-menu-novo");
    if (menuNovo) menuNovo.style.display = "none";
  }

  async function criarCard(meta) {
    const svgString = await window.MindNoteDB.carregarThumbnail(meta.id);

    const thumb = el("div", { class: "home-card-thumb" });
    thumb.innerHTML =
      svgString || '<div class="home-card-thumb-vazio">Sem prévia</div>';

    const corpo = el("div", { class: "home-card-corpo" }, [
      el("h3", { class: "home-card-titulo", html: escaparHTML(meta.titulo) }),
      el("p", {
        class: "home-card-data",
        html: `Editado em ${formatarData(meta.dataModificacao)}`,
      }),
    ]);

    const menu = el("div", { class: "home-card-menu" });
    menu.style.display = "none";

    const itemEditar = el("button", {
      type: "button",
      class: "home-card-menu-item",
      html: "Editar",
    });
    itemEditar.addEventListener("click", (evento) => {
      evento.stopPropagation();
      window.MindNoteRouter?.navegarPara("editor", meta.id);
    });

    const itemDuplicar = el("button", {
      type: "button",
      class: "home-card-menu-item",
      html: "Duplicar",
    });
    itemDuplicar.addEventListener("click", async (evento) => {
      evento.stopPropagation();
      await window.MindNoteDB.duplicarMapa(meta.id);
      atualizarListaDeMapas();
    });

    const itemExportar = el("button", {
      type: "button",
      class: "home-card-menu-item",
      html: "Exportar PDF",
    });
    itemExportar.addEventListener("click", async (evento) => {
      evento.stopPropagation();
      const registro = await window.MindNoteDB.carregarMapa(meta.id);
      if (registro && typeof window.exportarPDFContinuo === "function") {
        try {
          window.exportarPDFContinuo(registro.arvores, registro.meta.tema);
        } catch {
          window.alert(
            "Não foi possível exportar este mapa diretamente da Home. Abra-o no editor e exporte por lá."
          );
        }
      }
    });

    const itemExcluir = el("button", {
      type: "button",
      class: "home-card-menu-item home-card-menu-item-perigo",
      html: "Excluir",
    });
    itemExcluir.addEventListener("click", async (evento) => {
      evento.stopPropagation();
      const confirmado = window.confirm(
        `Excluir "${meta.titulo}"? Esta ação não pode ser desfeita.`
      );
      if (!confirmado) return;
      await window.MindNoteDB.eliminarMapa(meta.id);
      atualizarListaDeMapas();
    });

    menu.appendChild(itemEditar);
    menu.appendChild(itemDuplicar);
    menu.appendChild(itemExportar);
    menu.appendChild(itemExcluir);

    const menuBotao = el("button", {
      type: "button",
      class: "home-card-menu-botao",
      "aria-label": "Mais opções",
      html: "&#8942;",
    });
    menuBotao.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const estaAberto = menu.style.display !== "none";
      fecharTodosOsMenus();
      menu.style.display = estaAberto ? "none" : "flex";
    });

    const card = el("div", { class: "home-card" }, [
      thumb,
      corpo,
      menuBotao,
      menu,
    ]);

    card.addEventListener("click", () => {
      window.MindNoteRouter?.navegarPara("editor", meta.id);
    });

    return card;
  }

  async function atualizarListaDeMapas() {
    const grade = document.getElementById("home-grade-cartoes");
    const estadoVazio = document.getElementById("home-estado-vazio");
    if (!grade || !window.MindNoteDB) return;

    grade.innerHTML = "";
    const metas = await window.MindNoteDB.listarMetas();

    if (metas.length === 0) {
      if (estadoVazio) estadoVazio.style.display = "flex";
      grade.style.display = "none";
      return;
    }

    if (estadoVazio) estadoVazio.style.display = "none";
    grade.style.display = "grid";

    for (const meta of metas) {
      const card = await criarCard(meta);
      grade.appendChild(card);
    }
  }

  function criarMapaEmBranco() {
    const id = window.MindNoteDB?.gerarUUID?.();
    if (!id) return;
    window.MindNoteRouter?.navegarPara("editor", id);
  }

  function abrirImportarJSON() {
    const textoColado = window.prompt(
      "Cole o JSON do mapa (introduções, saudações e blocos ```json``` são limpos automaticamente):",
      ""
    );
    if (!textoColado) return;

    const resultado = window.ParserSanitizer
      ? window.ParserSanitizer.sanitizarEntradaJSON(textoColado)
      : { status: "unico", jsonTexto: textoColado };

    let jsonTexto = null;
    if (resultado.status === "unico") {
      jsonTexto = resultado.jsonTexto;
    } else if (resultado.status === "multiplo") {
      jsonTexto = resultado.candidatos[0].jsonTexto;
    } else {
      window.alert("Nenhum bloco JSON foi encontrado no texto colado.");
      return;
    }

    const id = window.MindNoteDB?.gerarUUID?.();
    if (!id) return;

    window.MindNoteRouter?.navegarPara("editor", id);

    // Pequeno atraso para garantir que a transição de tela e a
    // inicialização do editor (inicializarComMapa) já ocorreram antes de
    // injetar o JSON importado.
    window.setTimeout(() => {
      window.MindNoteApp?.importarJSONBruto?.(jsonTexto);
    }, 280);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const botaoNovo = document.getElementById("home-botao-novo");
    const opcaoCriarZero = document.getElementById("home-opcao-criar-zero");
    const opcaoImportar = document.getElementById("home-opcao-importar");
    const menuNovo = document.getElementById("home-menu-novo");

    botaoNovo?.addEventListener("click", (evento) => {
      evento.stopPropagation();
      if (!menuNovo) return;
      const estaAberto = menuNovo.style.display !== "none";
      fecharTodosOsMenus();
      menuNovo.style.display = estaAberto ? "none" : "flex";
    });

    opcaoCriarZero?.addEventListener("click", () => {
      fecharTodosOsMenus();
      criarMapaEmBranco();
    });

    opcaoImportar?.addEventListener("click", () => {
      fecharTodosOsMenus();
      abrirImportarJSON();
    });

    document.addEventListener("click", fecharTodosOsMenus);
  });

  return { atualizarListaDeMapas, criarMapaEmBranco, abrirImportarJSON };
})();

window.MindNoteHome = MindNoteHome;
