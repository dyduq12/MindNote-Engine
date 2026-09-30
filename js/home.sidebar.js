"use strict";

const MindNoteSidebar = (() => {
  const STORAGE_DEV = "dev_mode_unlocked";
  let clicks = 0;
  let resetClicksTimer = 0;
  let toastTimer = 0;

  function modoDevAtivo() {
    try { return localStorage.getItem(STORAGE_DEV) === "true"; } catch { return false; }
  }

  function mostrarToast(mensagem) {
    const toast = document.getElementById("mn-dev-toast");
    if (!toast) return;
    toast.textContent = mensagem;
    toast.dataset.show = "true";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.dataset.show = "false"; }, 2400);
  }

  function atualizar(metas = []) {
    const total = document.getElementById("mn-nav-total");
    const favoritos = document.getElementById("mn-nav-favorites-count");
    if (total) total.textContent = String(metas.length);
    if (favoritos) favoritos.textContent = String(metas.filter((meta) => meta.favorito === true).length);
    renderizarCategorias().catch((erro) => console.error("Falha ao listar cadernos:", erro));
    atualizarEstadoNuvem();
  }

  async function renderizarCategorias() {
    const lista = document.getElementById("mn-nav-categories");
    if (!lista || !window.MindNoteDB?.listarCategorias) return;
    const categorias = await window.MindNoteDB.listarCategorias();
    lista.replaceChildren();
    categorias.forEach((categoria) => {
      const linha = document.createElement("div");
      linha.className = "mn-nav-category-row";
      const nome = document.createElement("button");
      nome.type = "button";
      nome.className = "mn-nav-category";
      nome.dataset.homeCategory = categoria.nome;
      nome.textContent = categoria.nome;
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "mn-nav-category-remove";
      remover.setAttribute("aria-label", `Remover a pasta ${categoria.nome}`);
      remover.textContent = "×";
      remover.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!window.confirm(`Remover a pasta “${categoria.nome}”? Os mapas serão mantidos sem categoria.`)) return;
        await window.MindNoteDB.removerCategoria(categoria.id);
        atualizar(await window.MindNoteDB.listarMetas());
      });
      nome.addEventListener("click", () => {
        document.querySelectorAll(".mn-nav-item[data-home-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.homeNav === "pastas"));
        document.querySelectorAll(".mn-nav-category").forEach((item) => item.classList.toggle("is-active", item === nome));
        window.MindNoteHome?.definirFiltroSidebar?.({ tipo: "pasta", categoria: categoria.nome });
      });
      linha.append(nome, remover);
      lista.appendChild(linha);
    });
  }

  function atualizarEstadoNuvem() {
    const texto = document.getElementById("mn-cloud-status-text");
    const indicator = document.querySelector(".mn-cloud-indicator");
    let configurado = false;
    try {
      const config = JSON.parse(localStorage.getItem("mindnote_sync_config") || "{}");
      configurado = Boolean(config.url && config.apiKey && config.senha);
    } catch { configurado = false; }
    if (texto) texto.textContent = configurado ? "Credenciais locais · sync não ativa" : "Sincronização não configurada";
    indicator?.classList.toggle("is-configured", configurado);
  }

  function alternarDevMode() {
    const desbloqueado = !modoDevAtivo();
    try { localStorage.setItem(STORAGE_DEV, String(desbloqueado)); } catch { /* mantém nesta aba */ }
    window.dispatchEvent(new CustomEvent("mindnote:dev-mode-change", { detail: { unlocked: desbloqueado } }));
    window.MindNoteSettings?.sincronizarVisibilidadeDev?.();
    mostrarToast(desbloqueado ? "Modo Desenvolvedor desbloqueado" : "Modo Desenvolvedor bloqueado");
  }

  function selecionarNavegacao(tipo) {
    document.querySelectorAll(".mn-nav-item[data-home-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.homeNav === tipo));
    document.querySelectorAll(".mn-nav-category").forEach((item) => item.classList.remove("is-active"));
    const categorias = document.getElementById("mn-nav-categories");
    const novaPasta = document.getElementById("mn-nav-new-folder");
    if (categorias) categorias.hidden = tipo !== "pastas";
    if (novaPasta) novaPasta.hidden = tipo !== "pastas";
    const main = document.getElementById("mn-home-main");
    if (tipo === "settings") {
      window.MindNoteSettings?.mostrarPagina?.("usuario");
      return;
    }
    if (main) main.dataset.view = "maps";
    const filtro = tipo === "favoritos" ? { tipo: "favoritos" }
      : tipo === "pastas" ? { tipo: "pastas" } : { tipo: "todos" };
    window.MindNoteHome?.definirFiltroSidebar?.(filtro);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".mn-nav-item[data-home-nav]").forEach((item) => {
      item.addEventListener("click", () => selecionarNavegacao(item.dataset.homeNav));
    });
    document.getElementById("mn-nav-new-folder")?.addEventListener("click", async () => {
      const nome = window.prompt("Nome da nova pasta ou caderno:", "");
      if (nome === null || !nome.trim()) return;
      await window.MindNoteDB.criarCategoria(nome);
      const pastas = document.querySelector('[data-home-nav="pastas"]');
      if (pastas) selecionarNavegacao("pastas");
      await renderizarCategorias();
      atualizar(await window.MindNoteDB.listarMetas());
    });
    document.getElementById("mn-app-logo")?.addEventListener("click", () => {
      clicks += 1;
      window.clearTimeout(resetClicksTimer);
      if (clicks >= 5) {
        clicks = 0;
        alternarDevMode();
      } else resetClicksTimer = window.setTimeout(() => { clicks = 0; }, 2000);
    });
    document.getElementById("mn-cloud-configure")?.addEventListener("click", () => window.MindNoteSettings?.mostrarPagina?.("sync"));
    document.getElementById("btn-home-config")?.addEventListener("click", () => window.MindNoteSettings?.mostrarPagina?.("usuario"));
    document.getElementById("btn-home-theme")?.addEventListener("click", () => {
      window.MindNoteTheme?.alternar?.();
      atualizarTemaRapido();
    });
    window.addEventListener("mindnote:sync-config-changed", atualizarEstadoNuvem);
    window.addEventListener("mindnote:theme-change", atualizarTemaRapido);
    window.addEventListener("storage", (event) => { if (event.key === "mindnote_sync_config") atualizarEstadoNuvem(); });
    window.MindNoteSettings?.sincronizarVisibilidadeDev?.();
    atualizarTemaRapido();
    renderizarCategorias().catch((erro) => console.error("Falha ao iniciar sidebar:", erro));
  });

  function atualizarTemaRapido() {
    const dark = window.MindNoteTheme?.obter?.() === "escuro";
    const icon = document.getElementById("mn-theme-icon");
    const label = document.getElementById("mn-theme-label");
    if (icon) icon.textContent = dark ? "☼" : "☾";
    if (label) label.textContent = dark ? "Tema Claro" : "Tema Escuro";
  }

  return { atualizar, atualizarEstadoNuvem, mostrarToast, modoDevAtivo };
})();

window.MindNoteSidebar = MindNoteSidebar;
