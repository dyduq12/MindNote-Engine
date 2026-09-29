(function () {
  "use strict";

  var envelope = document.getElementById("node-inspector-envelope");
  var panel = document.getElementById("node-inspector");
  var state = {
    noSelecionado: null,
    timerTitulo: null,
    secoesAbertas: new Set(["identidade", "anotacao", "anexo", "acoes"])
  };
  var cores = [
    "#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626", "#0891B2",
    "#DB2777", "#65A30D", "#EA580C", "#4F46E5", "#0F766E", "#9333EA"
  ];
  if (!envelope || !panel) return;

  function criar(tag, classe, texto) {
    var node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texto !== undefined) node.textContent = texto;
    return node;
  }

  function mutacaoRenderizar() {
    window.MindNoteApp.reprocessarERenderizar();
    window.MindNoteApp.sincronizarEstadoParaTextarea?.();
    window.MindNoteApp.salvarNoStorage?.();
    render();
  }

  function stepper(container, valor, incremento, minimo, formatar, aoAlterar) {
    var controles = criar("div", "mn-inspector-stepper");
    var menos = criar("button", "mn-inspector-stepper-button", "−");
    var campo = criar("input", "mn-inspector-stepper-input");
    var hint = criar("output", "mn-inspector-stepper-value", formatar(valor));
    var mais = criar("button", "mn-inspector-stepper-button", "+");
    campo.type = "number";
    campo.value = String(valor);
    campo.readOnly = true;
    campo.setAttribute("aria-label", "Valor atual");
    menos.type = mais.type = "button";
    menos.setAttribute("aria-label", "Diminuir");
    mais.setAttribute("aria-label", "Aumentar");
    function ajustar(delta) {
      var proximo = Math.max(minimo, Number(campo.value || valor) + delta * incremento);
      campo.value = String(proximo);
      hint.textContent = formatar(proximo);
      aoAlterar(proximo);
    }
    menos.addEventListener("click", function () { ajustar(-1); });
    mais.addEventListener("click", function () { ajustar(1); });
    controles.append(menos, campo, mais);
    container.append(controles, hint);
  }

  function secao(scrollEl, chave, titulo) {
    var details = criar("details", "mn-inspector-section");
    var aberta = state.secoesAbertas.has(chave);
    var summary = criar("summary", "mn-inspector-section-title", titulo);
    var body = criar("div", "mn-inspector-section-body");
    details.open = aberta;
    summary.setAttribute("aria-expanded", String(aberta));
    if (!aberta) body.setAttribute("hidden", "");
    details.append(summary, body);
    details.addEventListener("toggle", function () {
      var estaAberta = details.open;
      summary.setAttribute("aria-expanded", String(estaAberta));
      if (estaAberta) {
        state.secoesAbertas.add(chave);
        body.removeAttribute("hidden");
      } else {
        state.secoesAbertas.delete(chave);
        body.setAttribute("hidden", "");
      }
    });
    scrollEl.appendChild(details);
    return body;
  }

  function render() {
    if (!state.noSelecionado || !panel) return;
    var tituloAtual = state.noSelecionado.titulo || "Sem título";
    var inputExistente = panel.querySelector(".mn-inspector-title-input");
    if (inputExistente && document.activeElement === inputExistente) {
      var cabecalhoAtivo = panel.querySelector(".mn-inspector-heading");
      if (cabecalhoAtivo) cabecalhoAtivo.textContent = tituloAtual;
      return;
    }

    var scrollY = panel.querySelector(".mn-panel-scroll")?.scrollTop || 0;
    panel.replaceChildren();
    var header = criar("header", "mn-inspector-header");
    var intro = criar("div", "mn-inspector-heading-wrap");
    intro.append(criar("span", "mn-inspector-eyebrow", "NÓ SELECIONADO"), criar("h2", "mn-inspector-heading", tituloAtual));
    var fechar = criar("button", "mn-inspector-close", "×");
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar inspetor");
    fechar.addEventListener("click", function () {
      window.dispatchEvent(new CustomEvent("mindnote:selection-change", { detail: { no: null, tipo: null } }));
    });
    header.append(intro, fechar);
    panel.appendChild(header);

    var scrollEl = criar("div", "mn-panel-scroll");
    panel.appendChild(scrollEl);
    var identidade = secao(scrollEl, "identidade", "Identidade");
    var labelTitulo = criar("label", "mn-inspector-label", "Título");
    var inputTitulo = criar("input", "mn-inspector-title-input");
    inputTitulo.type = "text";
    inputTitulo.value = state.noSelecionado.titulo || "";
    inputTitulo.maxLength = 240;
    labelTitulo.appendChild(inputTitulo);
    identidade.appendChild(labelTitulo);
    inputTitulo.addEventListener("input", function () {
      state.noSelecionado.titulo = inputTitulo.value;
      var heading = panel.querySelector(".mn-inspector-heading");
      if (heading) heading.textContent = inputTitulo.value || "Sem título";
      if (state.timerTitulo !== null) window.clearTimeout(state.timerTitulo);
      state.timerTitulo = window.setTimeout(function () {
        state.timerTitulo = null;
        if (!state.noSelecionado) return;
        window.MindNoteApp?.reprocessarERenderizar?.();
        window.MindNoteApp?.sincronizarEstadoParaTextarea?.();
        window.MindNoteApp?.salvarNoStorage?.();
      }, 360);
    });

    var coresWrap = criar("div", "mn-inspector-color-grid");
    cores.forEach(function (cor) {
      var botao = criar("button", "mn-inspector-color");
      botao.type = "button";
      botao.style.setProperty("--mn-swatch", cor);
      botao.setAttribute("aria-label", "Cor " + cor);
      botao.setAttribute("aria-pressed", String(state.noSelecionado.cor === cor));
      if (state.noSelecionado.cor === cor) {
        botao.classList.add("is-active");
        botao.appendChild(criar("span", "mn-inspector-color-check", "✓"));
      }
      botao.addEventListener("click", function () {
        var corEscolhida = cor;
        state.noSelecionado.cor = corEscolhida;
        mutacaoRenderizar();
      });
      coresWrap.appendChild(botao);
    });
    identidade.append(criar("span", "mn-inspector-label", "Cor do nó"), coresWrap);

    var anotacao = secao(scrollEl, "anotacao", "Anotação & Pauta");
    if (!state.noSelecionado.anotacao) {
      var adicionarAnotacao = criar("button", "mn-inspector-action", "+ Adicionar anotação");
      adicionarAnotacao.type = "button";
      adicionarAnotacao.addEventListener("click", function () {
        window.MindNoteApp?.adicionarAnotacao?.(state.noSelecionado);
        window.MindNoteApp?.salvarNoStorage?.();
        render();
      });
      anotacao.appendChild(adicionarAnotacao);
    } else {
      var segmentado = criar("div", "mn-inspector-segmented");
      [["pauta", "Pauta"], ["ilustracao", "Ilustração"]].forEach(function (item) {
        var botao = criar("button", "mn-inspector-segment", item[1]);
        botao.type = "button";
        botao.setAttribute("aria-pressed", String(state.noSelecionado.anotacao.tipo === item[0]));
        if (state.noSelecionado.anotacao.tipo === item[0]) botao.classList.add("is-active");
        botao.addEventListener("click", function () {
          if (state.noSelecionado.anotacao.tipo === item[0]) return;
          var modo = item[0];
          state.noSelecionado.anotacao.tipo = modo;
          state.noSelecionado.anotacao.alturaCustomizada = modo === "ilustracao" ? 220 : null;
          state.noSelecionado.anotacao.linhasManuais = modo === "pauta" ? 4 : null;
          state.noSelecionado.anotacao.palavrasEstimadas = null;
          mutacaoRenderizar();
        });
        segmentado.appendChild(botao);
      });
      anotacao.appendChild(segmentado);
      if (state.noSelecionado.anotacao.tipo === "pauta") {
        var linhas = Number.isFinite(state.noSelecionado.anotacao.linhasManuais) ? state.noSelecionado.anotacao.linhasManuais : 3;
        anotacao.appendChild(criar("span", "mn-inspector-label", "Linhas manuais"));
        stepper(anotacao, linhas, 1, 3, function (n) { return n + " linhas · " + (n * 26) + " px"; }, function (proximo) {
          state.noSelecionado.anotacao.linhasManuais = proximo;
          mutacaoRenderizar();
        });
      }
    }

    var dimensoes = secao(scrollEl, "anexo", "Dimensões do Anexo");
    if (state.noSelecionado.anotacao && state.noSelecionado.anotacao.anexo) {
      var altura = Number(state.noSelecionado.anotacao.anexo.altura) || 220;
      stepper(dimensoes, altura, 26, 120, function (n) { return "Altura do anexo · " + n + " px"; }, function (proximo) {
        state.noSelecionado.anotacao.anexo.altura = proximo;
        mutacaoRenderizar();
      });
    } else {
      var adicionarAnexo = criar("button", "mn-inspector-action", "+ Adicionar anexo");
      adicionarAnexo.type = "button";
      adicionarAnexo.disabled = !state.noSelecionado.anotacao;
      adicionarAnexo.addEventListener("click", function () {
        window.MindNoteApp?.adicionarAnexo?.(state.noSelecionado);
        window.MindNoteApp?.salvarNoStorage?.();
        render();
      });
      dimensoes.appendChild(adicionarAnexo);
    }

    var acoes = secao(scrollEl, "acoes", "Ações Rápidas");
    var filho = criar("button", "mn-inspector-action", "+T Adicionar Filho");
    filho.type = "button";
    filho.addEventListener("click", function () {
      window.MindNoteApp?.adicionarFilho?.(state.noSelecionado);
      window.MindNoteApp?.salvarNoStorage?.();
      render();
    });
    var excluir = criar("button", "mn-inspector-action mn-inspector-action--danger", "🗑️ Excluir Nó");
    excluir.type = "button";
    excluir.addEventListener("click", function () {
      var alvo = state.noSelecionado;
      window.MindNoteApp?.removerNo?.(alvo);
      window.MindNoteApp?.salvarNoStorage?.();
      window.dispatchEvent(new CustomEvent("mindnote:selection-change", { detail: { no: null, tipo: null } }));
    });
    acoes.append(filho, excluir);
    scrollEl.scrollTop = scrollY;
  }

  function close() {
    if (state.timerTitulo !== null) {
      window.clearTimeout(state.timerTitulo);
      state.timerTitulo = null;
    }
    state.noSelecionado = null;
    document.body.dataset.inspectorAberto = "false";
    envelope.dataset.open = "false";
    envelope.setAttribute("aria-hidden", "true");
    panel.setAttribute("aria-hidden", "true");
    panel.replaceChildren();
  }

  function open(node) {
    if (!node || typeof node !== "object") return;
    state.noSelecionado = node;
    document.body.dataset.inspectorAberto = "true";
    envelope.dataset.open = "true";
    envelope.setAttribute("aria-hidden", "false");
    panel.setAttribute("aria-hidden", "false");
    render();
  }

  window.addEventListener("mindnote:selection-change", function (event) {
    var detalhe = event && event.detail;
    if (!detalhe || !detalhe.no) {
      close();
      return;
    }
    open(detalhe.no);
  });

  window.MindNoteInspector = { open: open, close: close, render: render };
}());