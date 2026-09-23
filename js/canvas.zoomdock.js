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
  if (!svg) return false;
  const canvasDimensoes = window.MindNoteApp?.obterArvoresAtuais?.()?.[0]?.canvasDimensoes;
  if (!canvasDimensoes) return false;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  return true;
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

function inicializar() {
  if (dockElemento) return dockElemento;
  const container = document.getElementById("canvas-container");
  if (!container) return null;
  dockElemento = construirDock();
  container.appendChild(dockElemento);
  return dockElemento;
}

window.MindNoteZoomDock = {
  inicializar,
  zoomComFator: aplicarZoomComFator,
  escalaReal,
  enquadramentoTotal,
  alternarModoEstudo,
};
