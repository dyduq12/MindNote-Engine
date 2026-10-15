"use strict";

/* Controlador da biblioteca da Home. Mantém a persistência no contrato MindNoteDB. */
const MindNoteHome = (() => {
  let termoBusca = "";
  let temporizadorBusca = null;
  let temporizadorFeedbackPrompt = null;
  let filtroSidebar = { tipo: "todos", categoria: null };

  const PROMPT_MESTRE_IA = `Você é um especialista em transformar fontes de estudo em mapas mentais claros para o MindNote Engine. Analise apenas o conteúdo das fontes fornecidas e produza uma árvore hierárquica fiel, com títulos concisos e relações lógicas. Responda exclusivamente com JSON válido, sem Markdown, introdução ou comentários.

Schema obrigatório: um objeto raiz ou uma lista de objetos raiz. Cada nó deve conter exatamente estes campos estruturais: "titulo" (string não vazia), "anotacao" (null ou objeto com "tipo" igual a "pauta" ou "ilustracao"; para pauta, use "linhas_manuais" ou "palavras_estimadas" quando útil; para ilustração, use "altura_customizada"), "cor" (null ou uma destas cores do MindNote: "#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626") e "filhos" (array de nós com o mesmo schema). Use null em anotacao quando não houver conteúdo de apoio. Não invente fatos ausentes das fontes. Evite nós redundantes e mantenha uma hierarquia com profundidade adequada ao material.

Exemplo válido:
{"titulo":"Tema principal","anotacao":null,"cor":null,"filhos":[{"titulo":"Ideia central","anotacao":{"tipo":"pauta","linhas_manuais":4},"cor":"#2563EB","filhos":[]},{"titulo":"Visualização","anotacao":{"tipo":"ilustracao","altura_customizada":220},"cor":null,"filhos":[]}]}`;

  function elemento(tag, classe, texto) {
    const node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texto !== undefined) node.textContent = texto;
    return node;
  }

  function formatarData(timestamp) {
    if (!timestamp) return "Ainda não editado";
    return `Editado em ${new Date(timestamp).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    })}`;
  }

  function fecharMenus(excecao) {
    document.querySelectorAll(".mn-card-menu").forEach((menu) => {
      if (menu !== excecao) {
        menu.hidden = true;
        const botao = menu.closest(".mn-map-card")?.querySelector(".mn-card-menu-trigger");
        botao?.setAttribute("aria-expanded", "false");
        menu.closest(".mn-map-card")?.classList.remove("is-menu-open");
      }
    });
  }

  function navegarParaMapa(id) {
    window.MindNoteRouter?.navegarPara("editor", id);
  }

  function abrirMenuCriacao(abrir) {
    const menu = document.getElementById("mn-home-create-menu");
    const botao = document.getElementById("btn-novo-mapa");
    if (!menu || !botao) return;
    menu.hidden = !abrir;
    botao.setAttribute("aria-expanded", String(abrir));
  }

  function abrirModalImportacao() {
    abrirMenuCriacao(false);
    const modal = document.getElementById("mn-home-import-modal");
    const entrada = document.getElementById("mn-home-json-input");
    const erro = document.getElementById("mn-home-import-error");
    if (erro) { erro.hidden = true; erro.textContent = ""; }
    if (modal) modal.hidden = false;
    window.setTimeout(() => entrada?.focus(), 0);
  }

  function fecharModalImportacao() {
    const modal = document.getElementById("mn-home-import-modal");
    if (modal) modal.hidden = true;
  }

  function validarArvoreImportada(dados) {
    const raizes = Array.isArray(dados) ? dados : [dados];
    if (!raizes.length) throw new Error("Informe pelo menos um nó raiz.");
    const validarNo = (no, caminho) => {
      if (!no || typeof no !== "object" || Array.isArray(no)) throw new Error(`${caminho}: esperado um objeto de nó.`);
      if (typeof no.titulo !== "string" || !no.titulo.trim()) throw new Error(`${caminho}: “titulo” deve ser um texto não vazio.`);
      if (!Object.prototype.hasOwnProperty.call(no, "anotacao")) throw new Error(`${caminho}: inclua o campo “anotacao” (objeto ou null).`);
      if (no.anotacao !== null && (!no.anotacao || typeof no.anotacao !== "object" || !["pauta", "ilustracao"].includes(no.anotacao.tipo))) {
        throw new Error(`${caminho}: “anotacao.tipo” deve ser “pauta” ou “ilustracao”, ou anotacao deve ser null.`);
      }
      if (!Object.prototype.hasOwnProperty.call(no, "cor") || (no.cor !== null && typeof no.cor !== "string")) throw new Error(`${caminho}: “cor” deve ser uma string ou null.`);
      if (!Array.isArray(no.filhos)) throw new Error(`${caminho}: “filhos” deve ser uma lista.`);
      no.filhos.forEach((filho, indice) => validarNo(filho, `${caminho}.filhos[${indice}]`));
    };
    raizes.forEach((raiz, indice) => validarNo(raiz, `raiz[${indice}]`));
  }

  function atualizarBotaoTema() {
    const botao = document.getElementById("btn-home-theme");
    if (!botao) return;
    const tema = window.MindNoteTheme?.obter?.() || (document.body.classList.contains("tema-escuro") ? "escuro" : "claro");
    const icon = document.getElementById("mn-theme-icon");
    const label = document.getElementById("mn-theme-label");
    if (icon) icon.textContent = tema === "escuro" ? "☼" : "☾";
    if (label) label.textContent = tema === "escuro" ? "Tema Claro" : "Tema Escuro";
    botao.title = tema === "escuro" ? "Alternar para tema claro" : "Alternar para tema escuro";
    botao.setAttribute("aria-label", botao.title);
  }

  async function copiarPromptIA(event) {
    const botao = event?.currentTarget || document.getElementById("btn-copiar-prompt-ia");
    if (!botao) return;
    const textoOriginal = botao.dataset.labelOriginal || botao.textContent;
    botao.dataset.labelOriginal = textoOriginal;
    const promptAtual = window.MindNoteSettings?.obterPromptMestre?.() || PROMPT_MESTRE_IA;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(promptAtual);
      else {
        const temporario = elemento("textarea", "", promptAtual);
        temporario.setAttribute("readonly", "");
        temporario.style.position = "fixed";
        temporario.style.opacity = "0";
        document.body.appendChild(temporario);
        temporario.select();
        const copiado = document.execCommand("copy");
        temporario.remove();
        if (!copiado) throw new Error("A cópia não foi autorizada pelo navegador.");
      }
      window.clearTimeout(temporizadorFeedbackPrompt);
      botao.textContent = "Copiado!";
      botao.classList.add("is-copied");
      temporizadorFeedbackPrompt = window.setTimeout(() => {
        botao.textContent = textoOriginal;
        botao.classList.remove("is-copied");
      }, 1800);
    } catch (erro) {
      console.error("Falha ao copiar o prompt:", erro);
      botao.textContent = "Não foi possível copiar";
      window.setTimeout(() => { botao.textContent = textoOriginal; }, 1800);
    }
  }

  async function executarAcao(acao, meta) {
    if (acao === "Abrir") return navegarParaMapa(meta.id);
    if (acao === "Favoritar" || acao === "Remover dos favoritos") {
      await window.MindNoteDB.atualizarOrganizacao(meta.id, { favorito: acao === "Favoritar" });
      await atualizarListaDeMapas();
      return;
    }
    if (acao === "Organizar em pasta") {
      const categorias = [...new Set((await window.MindNoteDB.listarMetas()).map((item) => item.categoria).filter(Boolean))];
      const dica = categorias.length ? `Pastas atuais: ${categorias.join(", ")}\nDeixe vazio para remover a pasta.` : "Digite o nome de uma pasta ou caderno:";
      let categoria = window.prompt(dica, meta.categoria || "");
      if (categoria === null) return;
      if (categoria.trim()) categoria = (await window.MindNoteDB.criarCategoria(categoria)).nome;
      await window.MindNoteDB.atualizarOrganizacao(meta.id, { categoria });
      await atualizarListaDeMapas();
      return;
    }
    if (acao === "Renomear") {
      const titulo = window.prompt("Novo nome do mapa:", meta.titulo || "");
      if (titulo === null || !titulo.trim()) return;
      const registro = await window.MindNoteDB.carregarMapa(meta.id);
      if (!registro) return;
      const svg = await window.MindNoteDB.carregarThumbnail(meta.id);
      await window.MindNoteDB.salvarMapa(meta.id, titulo.trim(), registro.arvores, svg, registro.meta.tema);
      await atualizarListaDeMapas();
      return;
    }
    if (acao === "Duplicar") {
      await window.MindNoteDB.duplicarMapa(meta.id);
      await atualizarListaDeMapas();
      return;
    }
    if (acao === "Excluir") {
      if (!window.confirm(`Excluir “${meta.titulo}”? Esta ação não pode ser desfeita.`)) return;
      await window.MindNoteDB.eliminarMapa(meta.id);
      await atualizarListaDeMapas();
    }
  }

  async function criarCard(meta) {
    const card = elemento("article", "mn-map-card");
    card.tabIndex = 0;
    card.setAttribute("aria-label", `Abrir mapa ${meta.titulo || "Sem título"}`);

    const preview = elemento("div", "mn-map-preview");
    preview.setAttribute("aria-hidden", "true");
    const svg = await window.MindNoteDB.carregarThumbnail(meta.id);
    if (svg) preview.innerHTML = svg;
    else preview.appendChild(elemento("span", "mn-map-preview-empty", "✳"));

    const footer = elemento("div", "mn-map-footer");
    const details = elemento("div", "mn-map-details");
    details.append(elemento("h2", "mn-map-title", meta.titulo || "Sem título"), elemento("p", "mn-map-date", formatarData(meta.dataModificacao)));

    const menuButton = elemento("button", "mn-card-menu-trigger", "⋮");
    menuButton.type = "button";
    menuButton.setAttribute("aria-label", `Ações para ${meta.titulo || "mapa"}`);
    menuButton.setAttribute("aria-expanded", "false");

    const menu = elemento("div", "mn-card-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.addEventListener("click", (event) => event.stopPropagation());

    menuButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const abrir = menu.hidden;
      fecharMenus(menu);
      menu.hidden = !abrir;
      menuButton.setAttribute("aria-expanded", String(abrir));
      card.classList.toggle("is-menu-open", abrir);
    });

    ["Abrir", meta.favorito ? "Remover dos favoritos" : "Favoritar", "Organizar em pasta", "Renomear", "Duplicar", "Excluir"].forEach((acao) => {
      const item = elemento("button", `mn-card-menu-item${acao === "Excluir" ? " mn-card-menu-item--danger" : ""}`, acao);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", async (event) => {
        event.stopPropagation();
        fecharMenus();
        try { await executarAcao(acao, meta); }
        catch (erro) { console.error(`Falha ao ${acao.toLowerCase()} o mapa:`, erro); window.alert("Não foi possível concluir essa ação."); }
      });
      menu.appendChild(item);
    });

    footer.append(details, menuButton);
    card.append(preview, footer, menu);
    card.addEventListener("click", () => {
      if (card.classList.contains("is-menu-open")) {
        fecharMenus();
        return;
      }
      navegarParaMapa(meta.id);
    });
    card.addEventListener("keydown", (event) => {
      if (event.target === card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        navegarParaMapa(meta.id);
      }
    });
    return card;
  }

  async function atualizarListaDeMapas() {
    const grade = document.getElementById("grade-mapas");
    const vazio = document.getElementById("mn-home-empty");
    const tituloVazio = document.getElementById("mn-home-empty-title");
    const copyVazio = document.getElementById("mn-home-empty-copy");
    if (!grade || !vazio || !window.MindNoteDB) return;

    const metas = await window.MindNoteDB.listarMetas();
    window.MindNoteSidebar?.atualizar?.(metas);
    const filtradas = metas.filter((meta) => {
      const correspondeBusca = String(meta.titulo || "").toLocaleLowerCase("pt-BR").includes(termoBusca);
      const correspondeFiltro = filtroSidebar.tipo === "favoritos" ? meta.favorito === true
        : filtroSidebar.tipo === "pastas" ? Boolean(meta.categoria)
          : filtroSidebar.tipo === "pasta" ? meta.categoria === filtroSidebar.categoria
          : true;
      return correspondeBusca && correspondeFiltro;
    });
    const tituloSecao = document.getElementById("mn-home-section-title");
    if (tituloSecao) tituloSecao.textContent = filtroSidebar.tipo === "favoritos" ? "Favoritos"
      : filtroSidebar.tipo === "pasta" ? filtroSidebar.categoria
        : "Seus mapas";
    grade.replaceChildren();
    fecharMenus();

    if (!filtradas.length) {
      grade.hidden = true;
      vazio.hidden = false;
      const buscando = termoBusca.length > 0;
      const filtroAtivo = filtroSidebar.tipo !== "todos";
      tituloVazio.textContent = buscando ? "Nenhum mapa encontrado" : filtroSidebar.tipo === "favoritos" ? "Nenhum favorito ainda"
        : filtroSidebar.tipo === "pasta" ? "Esta pasta está vazia" : "Sua próxima ideia começa aqui";
      copyVazio.textContent = buscando ? "Tente outro termo para encontrar seu mapa." : filtroAtivo ? "Adicione mapas a esta coleção pelo menu do cartão." : "Crie um mapa para organizar pensamentos, projetos e possibilidades.";
      document.getElementById("mn-home-empty-create").hidden = buscando || filtroAtivo;
      return;
    }

    vazio.hidden = true;
    grade.hidden = false;
    for (const meta of filtradas) grade.appendChild(await criarCard(meta));
  }

  function definirFiltroSidebar(filtro = { tipo: "todos" }) {
    filtroSidebar = { tipo: filtro.tipo || "todos", categoria: filtro.categoria || null };
    atualizarListaDeMapas().catch((erro) => console.error("Falha ao aplicar filtro de navegação:", erro));
  }

  function criarMapaEmBranco() {
    const id = window.MindNoteDB?.gerarUUID?.();
    if (id) navegarParaMapa(id);
  }

  function importarEstruturaJSON() {
    const entrada = document.getElementById("mn-home-json-input");
    const erroEl = document.getElementById("mn-home-import-error");
    const textoBruto = entrada?.value || "";
    try {
      const resultado = window.ParserSanitizer
        ? window.ParserSanitizer.sanitizarEntradaJSON(textoBruto)
        : { status: "unico", jsonTexto: textoBruto };
      if (resultado.status === "vazio") throw new Error("Cole uma estrutura JSON para continuar.");
      let jsonTexto = resultado.jsonTexto;
      if (resultado.status === "multiplo") {
        const opcoes = resultado.candidatos.map((c, i) => `${i + 1}. ${c.titulo}`).join("\n");
        const escolha = window.prompt(`Foram encontrados vários mapas. Digite um número para escolher ou 0 para unificar todos como raízes independentes.\n\n${opcoes}`, "1");
        if (String(escolha).trim() === "0") jsonTexto = window.ParserSanitizer.combinarCandidatos(resultado.candidatos);
        else {
          const indice = Number(escolha) - 1;
          if (!Number.isInteger(indice) || indice < 0 || indice >= resultado.candidatos.length) throw new Error("Importação cancelada: escolha um mapa da lista ou 0 para unificar.");
          jsonTexto = resultado.candidatos[indice].jsonTexto;
        }
      }
      validarArvoreImportada(JSON.parse(jsonTexto));
      if (erroEl) { erroEl.hidden = true; erroEl.textContent = ""; }
      fecharModalImportacao();
      const id = window.MindNoteDB?.gerarUUID?.();
      if (!id) throw new Error("Não foi possível criar um identificador para o mapa.");
      navegarParaMapa(id);
      window.setTimeout(() => window.MindNoteApp?.importarJSONBruto?.(jsonTexto), 280);
    } catch (erro) {
      if (erroEl) { erroEl.textContent = erro.message.startsWith("JSON inválido:") ? erro.message : erro.message; erroEl.hidden = false; }
    }
  }

  function abrirImportarJSON() {
    abrirModalImportacao();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const busca = document.getElementById("busca-mapas");
    const novo = document.getElementById("btn-novo-mapa");
    const menuCriacao = document.getElementById("mn-home-create-menu");
    const criarBranco = document.getElementById("home-criar-branco");
    const importar = document.getElementById("home-importar-json");
    const confirmarImportacao = document.getElementById("mn-home-import-confirm");
    const cancelarImportacao = document.getElementById("mn-home-import-cancel");
    const fecharImportacao = document.getElementById("mn-home-modal-close");
    const modalImportacao = document.getElementById("mn-home-import-modal");
    const criarVazio = document.getElementById("mn-home-empty-create");
    const sync = document.getElementById("btn-home-sync");
    const promptIA = document.getElementById("btn-copiar-prompt-ia");
    const promptIAConfig = document.getElementById("btn-copiar-prompt-ia-config");
    const promptMestre = document.getElementById("btn-copy-master-prompt");

    busca?.addEventListener("input", () => {
      window.clearTimeout(temporizadorBusca);
      temporizadorBusca = window.setTimeout(() => {
        termoBusca = busca.value.trim().toLocaleLowerCase("pt-BR");
        atualizarListaDeMapas().catch((erro) => console.error("Falha ao filtrar mapas:", erro));
      }, 150);
    });
    novo?.addEventListener("click", (event) => {
      event.stopPropagation();
      abrirMenuCriacao(menuCriacao?.hidden);
    });
    criarBranco?.addEventListener("click", () => { abrirMenuCriacao(false); criarMapaEmBranco(); });
    criarVazio?.addEventListener("click", criarMapaEmBranco);
    importar?.addEventListener("click", abrirImportarJSON);
    confirmarImportacao?.addEventListener("click", importarEstruturaJSON);
    cancelarImportacao?.addEventListener("click", fecharModalImportacao);
    fecharImportacao?.addEventListener("click", fecharModalImportacao);
    modalImportacao?.addEventListener("click", (event) => { if (event.target === modalImportacao) fecharModalImportacao(); });
    promptIA?.addEventListener("click", copiarPromptIA);
    promptIAConfig?.addEventListener("click", copiarPromptIA);
    promptMestre?.addEventListener("click", copiarPromptIA);
    sync?.addEventListener("click", () => window.alert("A sincronização estará disponível em uma próxima etapa."));
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".mn-home-create-wrap")) abrirMenuCriacao(false);
      if (!event.target?.closest?.(".mn-card-menu-trigger") && !event.target?.closest?.(".mn-card-menu")) fecharMenus();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); busca?.focus();
      }
      if (event.key === "Escape") { fecharMenus(); abrirMenuCriacao(false); if (modalImportacao && !modalImportacao.hidden) fecharModalImportacao(); }
    });
    atualizarBotaoTema();
  });

  return { atualizarListaDeMapas, criarMapaEmBranco, abrirImportarJSON, definirFiltroSidebar };
})();

window.MindNoteHome = MindNoteHome;
