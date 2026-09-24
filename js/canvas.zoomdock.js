"use strict";

// ─── Fase 3 (v2.0): Zoom Dock flutuante + Modo Estudo ──────────────────────
// Consome exclusivamente a API pública window.MindNoteApp.obterArvoresAtuais()
// e window.MindNoteCamera. Nunca acessa variáveis internas de app.js
// (arvoresAtuais, temaAtual, etc.) diretamente.

const FATOR_ZOOM_IN = 0.85;
const FATOR_ZOOM_OUT = 1 / 0.85;

let dockElemento = null;
let modoEstudoAtivo = false;

function obterSVGAtivo() {
  return document.querySelector("#canvas-container svg");
}

function aplicarZoomComFator(fator) {
  const svg = obterSVGAtivo();
  if (!svg) return false;
  const estado = window.MindNoteCamera?.capturarEstado(svg);
  if (!estado) return false;
  const novaLargura = estado.width * fator;
  const novaAltura = estado.height * fator;
  const centroX = estado.x + estado.width / 2;
  const centroY = estado.y + estado.height / 2;
  const novoEstado = {
    x: centroX - novaLargura / 2,
    y: centroY - novaAltura / 2,
    width: novaLargura,
    height: novaAltura,
  };
  return window.MindNoteCamera?.restaurarEstado(svg, novoEstado) || false;
}

function escalaReal() {
  const svg = obterSVGAtivo();
  if (!svg || !svg.viewBox || !svg.viewBox.baseVal) return false;
  // Fase 3.3 (fix): preserva o centro da visão atual em vez de saltar
  // para a origem (0,0) do canvas.
  const vb = svg.viewBox.baseVal;
  const container = document.getElementById("canvas-container");
  const w = (container && container.clientWidth) || vb.width;
  const h = (container && container.clientHeight) || vb.height;
  if (!w || !h) return false;
  const cx = vb.x + vb.width / 2;
  const cy = vb.y + vb.height / 2;
  const novoEstado = { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  return window.MindNoteCamera?.restaurarEstado(svg, novoEstado) || false;
}

function enquadramentoTotal() {
  const svg = obterSVGAtivo();
  if (!svg) return false;
  const canvasDimensoes = window.MindNoteApp?.obterArvoresAtuais?.()?.[0]?.canvasDimensoes;
  if (!canvasDimensoes) return false;
  return window.MindNoteCamera?.centralizarMapa(svg, canvasDimensoes) || false;
}

function alternarModoEstudo() {
  const container = document.getElementById("canvas-container");
  if (!container) return false;
  modoEstudoAtivo = !modoEstudoAtivo;
  container.classList.toggle("modo-estudo", modoEstudoAtivo);
  document
    .querySelectorAll(".mindnote-selected")
    .forEach((elemento) => elemento.classList.remove("mindnote-selected"));
  const botaoCadeado = document.getElementById("zoom-cadeado");
  if (botaoCadeado) botaoCadeado.classList.toggle("ativo", modoEstudoAtivo);
  return modoEstudoAtivo;
}

function criarBotao(id, rotulo, aoClicar) {
  const botao = document.createElement("button");
  botao.id = id;
  botao.type = "button";
  botao.className = "zoom-dock-btn";
  botao.textContent = rotulo;
  botao.addEventListener("click", (evento) => {
    evento.stopPropagation();
    aoClicar();
  });
  return botao;
}

function construirDock() {
  const dock = document.createElement("div");
  dock.id = "zoom-dock";
  dock.appendChild(criarBotao("zoom-mais", "+", () => aplicarZoomComFator(FATOR_ZOOM_IN)));
  dock.appendChild(criarBotao("zoom-menos", "−", () => aplicarZoomComFator(FATOR_ZOOM_OUT)));
  dock.appendChild(criarBotao("zoom-1-1", "1:1", () => escalaReal()));
  dock.appendChild(criarBotao("zoom-fit", "Fit", () => enquadramentoTotal()));
  dock.appendChild(criarBotao("zoom-cadeado", "🔒", () => alternarModoEstudo()));
  return dock;
}

// ─── Fase 3.2 (fix): o dock é ancorado em #view-editor, e não em
// #canvas-container. O container do canvas é limpo via `container.textContent
// = ''` a cada chamada de renderizarArvoreSVG() (js/render.svg.js), o que
// destruía o dock a cada mutação/reprocessamento. #view-editor nunca é
// esvaziado pelo motor de renderização, então o dock sobrevive a qualquer
// redraw do SVG.
function inicializar() {
  const editor = document.getElementById("view-editor");
  if (!editor) return null;
  const existente = document.getElementById("zoom-dock");
  if (existente) {
    dockElemento = existente;
    return dockElemento;
  }
  dockElemento = construirDock();
  editor.appendChild(dockElemento);
  return dockElemento;
}

window.MindNoteZoomDock = {
  inicializar,
  zoomComFator: aplicarZoomComFator,
  escalaReal,
  enquadramentoTotal,
  alternarModoEstudo,
};
