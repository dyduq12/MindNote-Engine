(function () {
  "use strict";

  var envelope = document.getElementById("json-backstage-envelope");
  var painel = document.getElementById("json-backstage");
  var botaoAbrir = document.getElementById("btn-abrir-backstage");
  var botaoFechar = document.getElementById("btn-fechar-backstage");
  var botaoProcessarTopo = document.getElementById("btn-processar-topo");
  var botaoProcessar = document.getElementById("botao-processar");
  var abas = Array.from(document.querySelectorAll("#json-backstage [data-tab]"));
  if (!envelope || !painel) return;

  function open() {
    envelope.dataset.open = "true";
    envelope.setAttribute("aria-hidden", "false");
    painel.setAttribute("aria-hidden", "false");
    atualizarMetadados();
    window.dispatchEvent(new Event("mindnote:backstage-change"));
  }

  function close() {
    envelope.dataset.open = "false";
    envelope.setAttribute("aria-hidden", "true");
    painel.setAttribute("aria-hidden", "true");
    window.dispatchEvent(new Event("mindnote:backstage-change"));
  }

  function atualizarMetadados() {
    var arvores = window.MindNoteApp?.obterArvoresAtuais?.() || [];
    var total = 0;
    var profundidadeMaxima = 0;
    var visitados = new Set();

    function percorrer(no, profundidade) {
      if (!no || typeof no !== "object" || visitados.has(no)) return;
      visitados.add(no);
      total += 1;
      profundidadeMaxima = Math.max(profundidadeMaxima, profundidade);
      (Array.isArray(no.filhos) ? no.filhos : []).forEach(function (filho) {
        percorrer(filho, profundidade + 1);
      });
    }

    arvores.forEach(function (raiz) { percorrer(raiz, 1); });
    var totalEl = document.getElementById("meta-total-nos");
    var profundidadeEl = document.getElementById("meta-profundidade");
    if (totalEl) totalEl.textContent = String(total);
    if (profundidadeEl) profundidadeEl.textContent = String(profundidadeMaxima);
    var secaoDev = document.getElementById("meta-dev-telemetry");
    var devAtivo = window.MindNoteSettings?.devDesbloqueado?.() || false;
    if (secaoDev) secaoDev.hidden = !devAtivo;
    if (devAtivo) {
      var snapshot = window.MindNoteDevTelemetry?.obterSnapshot?.() || {};
      var fps = document.getElementById("meta-dev-fps");
      var heap = document.getElementById("meta-dev-heap");
      var bounds = document.getElementById("meta-dev-bounds");
      var nodes = document.getElementById("meta-dev-nodes");
      if (fps) fps.textContent = `${snapshot.fps ?? 0} FPS`;
      if (heap) heap.textContent = snapshot.heapBytes == null ? "não suportado" : `${(snapshot.heapBytes / 1048576).toFixed(1)} MB`;
      if (bounds) bounds.textContent = snapshot.bounds ? `${snapshot.bounds.width.toFixed(0)} × ${snapshot.bounds.height.toFixed(0)} px` : "—";
      if (nodes) nodes.textContent = String(snapshot.nodes ?? total);
    }
  }

  function selecionarAba(nome) {
    abas.forEach(function (aba) {
      var ativa = aba.dataset.tab === nome;
      aba.classList.toggle("is-active", ativa);
      aba.setAttribute("aria-selected", String(ativa));
      var conteudo = document.getElementById("tab-content-" + aba.dataset.tab);
      if (conteudo) conteudo.hidden = !ativa;
    });
    if (nome === "meta") atualizarMetadados();
  }

  if (botaoAbrir) botaoAbrir.addEventListener("click", open);
  if (botaoFechar) botaoFechar.addEventListener("click", close);
  if (botaoProcessarTopo) botaoProcessarTopo.addEventListener("click", function () { botaoProcessar?.click(); });
  abas.forEach(function (aba) {
    aba.addEventListener("click", function () { selecionarAba(aba.dataset.tab); });
  });
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && envelope.dataset.open === "true") close();
  });

  window.MindNoteBackstage = { open: open, close: close, selecionarAba: selecionarAba, atualizarMetadados: atualizarMetadados };
}());
