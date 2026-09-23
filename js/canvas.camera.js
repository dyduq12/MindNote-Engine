"use strict";

// ─── Fase 3 (v2.0): estabilização de câmera (viewBox) ──────────────────────
// Responsável exclusivamente por ler e escrever o atributo viewBox do <svg>
// container do Editor. Nunca lê nem recalcula coordenadas internas geradas
// por engine.geometry.js — apenas preserva o enquadramento visual (pan/zoom)
// entre reprocessamentos do motor (reprocessarERenderizar).

const MARGEM_FOCO = 120;
const DURACAO_FOCO_MS = 320;

function capturarEstado(svg) {
  if (!svg || !svg.viewBox || !svg.viewBox.baseVal) return null;
  const vb = svg.viewBox.baseVal;
  if (!Number.isFinite(vb.width) || !Number.isFinite(vb.height) || vb.width <= 0 || vb.height <= 0) {
    return null;
  }
  return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
}

function restaurarEstado(svg, estado) {
  if (!svg || !estado) return false;
  const { x, y, width, height } = estado;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  return true;
}

function centralizarMapa(svg, canvasDimensoes) {
  if (!svg || !canvasDimensoes) return false;
  const { larguraTotal, alturaTotal } = canvasDimensoes;
  if (!Number.isFinite(larguraTotal) || !Number.isFinite(alturaTotal)) return false;
  svg.setAttribute("viewBox", `0 0 ${larguraTotal} ${alturaTotal}`);
  return true;
}

function animarViewBox(svg, de, para, duracaoMs) {
  if (!svg || !de || !para) return;
  const inicio = performance.now();
  function passo(agora) {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const facilitado = 1 - Math.pow(1 - t, 3);
    const x = de.x + (para.x - de.x) * facilitado;
    const y = de.y + (para.y - de.y) * facilitado;
    const width = de.width + (para.width - de.width) * facilitado;
    const height = de.height + (para.height - de.height) * facilitado;
    svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

function focarNo(svg, no) {
  if (!svg || !no || !no.posicao || !no.dimensoes) return false;
  const estadoAtual = capturarEstado(svg);
  const largura =
    no.dimensoes.unidadeComposta?.larguraTotal || no.dimensoes.titulo?.largura || 240;
  const altura = no.dimensoes.unidadeComposta?.alturaTotal || 48;
  const centroX = no.posicao.x + largura / 2;
  const centroY = no.posicao.y;
  const larguraFoco = largura + MARGEM_FOCO * 2;
  const alturaFoco = altura + MARGEM_FOCO * 2;
  const destino = {
    x: centroX - larguraFoco / 2,
    y: centroY - alturaFoco / 2,
    width: larguraFoco,
    height: alturaFoco,
  };
  if (estadoAtual) {
    animarViewBox(svg, estadoAtual, destino, DURACAO_FOCO_MS);
  } else {
    restaurarEstado(svg, destino);
  }
  return true;
}

window.MindNoteCamera = {
  capturarEstado,
  restaurarEstado,
  centralizarMapa,
  focarNo,
};
