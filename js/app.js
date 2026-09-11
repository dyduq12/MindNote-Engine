"use strict";

const MindNoteApp = window.MindNoteApp || {};
let arvoresAtuais = null;
let temaAtual = "claro";

function normalizarAnexo(anexo) {
  if (!anexo) return null;
  const alturaValida = typeof anexo.altura === "number" && Number.isFinite(anexo.altura) && anexo.altura > 0;
  return { tipo: "ilustracao", altura: alturaValida ? anexo.altura : 220 };
}

function normalizarAnotacao(anotacao) {
  if (!anotacao) return null;
  const tipo = anotacao.tipo === "ilustracao" ? "ilustracao" : "pauta";
  const anexo = normalizarAnexo(anotacao.anexo);

  if (tipo === "ilustracao") {
    const alturaValida = typeof anotacao.altura_customizada === "number" && Number.isFinite(anotacao.altura_customizada) && anotacao.altura_customizada > 0;
    return { tipo: "ilustracao", alturaCustomizada: alturaValida ? anotacao.altura_customizada : 220, linhasManuais: null, palavrasEstimadas: null, anexo };
  }

  const linhasValidas = typeof anotacao.linhas_manuais === "number" && Number.isFinite(anotacao.linhas_manuais) && anotacao.linhas_manuais > 0;
  const palavrasValidas = typeof anotacao.palavras_estimadas === "number" && Number.isFinite(anotacao.palavras_estimadas) && anotacao.palavras_estimadas >= 8;
  return { tipo: "pauta", alturaCustomizada: null, linhasManuais: linhasValidas ? Math.max(3, Math.floor(anotacao.linhas_manuais)) : null, palavrasEstimadas: linhasValidas ? null : palavrasValidas ? anotacao.palavras_estimadas : 8, anexo };
}

function validarNo(no, profundidade = 0) {
  if (!no || typeof no.titulo !== "string" || no.titulo.trim() === "") {
    throw new Error(`Nó inválido na profundidade ${profundidade}: campo "titulo" ausente ou vazio.`);
  }
  return { titulo: no.titulo.trim(), anotacao: normalizarAnotacao(no.anotacao), filhos: Array.isArray(no.filhos) ? no.filhos.map((filho) => validarNo(filho, profundidade + 1)) : [] };
}

function processarJSON(textoBruto) {
  let dadosBrutos;
  try { dadosBrutos = JSON.parse(textoBruto); } catch (erro) { throw new Error(`JSON inválido: ${erro.message}`); }
  const listaBruta = Array.isArray(dadosBrutos) ? dadosBrutos : [dadosBrutos];
  if (listaBruta.length === 0) throw new Error("A lista de árvores não pode ser vazia.");
  return listaBruta.map((raiz) => validarNo(raiz, 0));
}

function obterEscalaEntrelinha() {
  const valor = Number(document.getElementById("entrada-escala")?.value);
  return Number.isFinite(valor) && valor > 0 ? valor : 26;
}

function reprocessarERenderizar() {
  if (!Array.isArray(arvoresAtuais) || arvoresAtuais.length === 0) return;
  arvoresAtuais.forEach((raiz) => enriquecerArvoreComDimensoes(raiz, obterEscalaEntrelinha()));
  calcularCoordenadasMultiplas(arvoresAtuais);
  const container = document.getElementById("canvas-container");
  if (container) renderizarArvoreSVG(arvoresAtuais, container);
}

const PROPRIEDADES_TRANSITORIAS = new Set(["_hRamo", "_hPropria", "posicao", "posicaoAnotacao", "posicaoAnexo", "conectoresFilhos", "conectorAnotacao", "conectorAnexo", "canvasDimensoes", "dimensoes"]);

function clonarEstadoLimpo(valor) {
  if (Array.isArray(valor)) return valor.map(clonarEstadoLimpo);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor).filter(([chave]) => !PROPRIEDADES_TRANSITORIAS.has(chave)).map(([chave, conteudo]) => [chave, clonarEstadoLimpo(conteudo)]));
}

function sincronizarEstadoParaTextarea() {
  const campoJSON = document.getElementById("entrada-json");
  if (!campoJSON || !Array.isArray(arvoresAtuais)) return;
  const estadoLimpo = clonarEstadoLimpo(arvoresAtuais);
  campoJSON.value = JSON.stringify(estadoLimpo.length === 1 ? estadoLimpo[0] : estadoLimpo, null, 2);
}

function garantirArvoresAtuais() {
  if (!Array.isArray(arvoresAtuais)) throw new Error("Nenhuma árvore foi carregada. Processe um JSON primeiro.");
}

function finalizarMutacao() {
  reprocessarERenderizar();
  sincronizarEstadoParaTextarea();
}

function adicionarFilho(no) {
  if (!no || typeof no !== "object") return null;
  if (!Array.isArray(no.filhos)) no.filhos = [];
  const novoFilho = { titulo: "Novo Tópico", anotacao: { tipo: "pauta", linhasManuais: 4, alturaCustomizada: null, palavrasEstimadas: null, anexo: null }, filhos: [] };
  no.filhos.push(novoFilho);
  finalizarMutacao();
  return novoFilho;
}

function adicionarAnotacao(no) {
  if (!no || no.anotacao !== null) return false;
  no.anotacao = { tipo: "pauta", linhasManuais: 4, alturaCustomizada: null, palavrasEstimadas: null, anexo: null };
  finalizarMutacao();
  return true;
}

function alterarLinhas(no, delta) {
  if (!no?.anotacao || no.anotacao.tipo !== "pauta") return false;
  const variacao = Number(delta);
  if (!Number.isFinite(variacao)) return false;
  const atuais = Number.isFinite(no.anotacao.linhasManuais) ? no.anotacao.linhasManuais : 3;
  no.anotacao.linhasManuais = Math.max(3, Math.floor(atuais + variacao));
  no.anotacao.palavrasEstimadas = null;
  finalizarMutacao();
  return true;
}

function alternarTipoAnotacao(no) {
  if (!no?.anotacao) return false;
  if (no.anotacao.tipo === "pauta") {
    no.anotacao.tipo = "ilustracao";
    no.anotacao.alturaCustomizada = 220;
    no.anotacao.linhasManuais = null;
    no.anotacao.palavrasEstimadas = null;
  } else {
    no.anotacao.tipo = "pauta";
    no.anotacao.alturaCustomizada = null;
    no.anotacao.linhasManuais = 4;
    no.anotacao.palavrasEstimadas = null;
  }
  finalizarMutacao();
  return true;
}

function adicionarAnexo(no) {
  if (!no?.anotacao || no.anotacao.anexo) return false;
  no.anotacao.anexo = { tipo: "ilustracao", altura: 220 };
  finalizarMutacao();
  return true;
}

function removerAnotacao(no) {
  if (!no?.anotacao) return false;
  no.anotacao = null;
  finalizarMutacao();
  return true;
}

function adicionarNovaRaiz() {
  garantirArvoresAtuais();
  const novaRaiz = { titulo: "Novo Tema", anotacao: null, filhos: [] };
  arvoresAtuais.push(novaRaiz);
  finalizarMutacao();
  return novaRaiz;
}

Object.assign(MindNoteApp, { adicionarFilho, adicionarAnotacao, alterarLinhas, alternarTipoAnotacao, adicionarAnexo, removerAnotacao, adicionarNovaRaiz, sincronizarEstadoParaTextarea, reprocessarERenderizar });
window.MindNoteApp = MindNoteApp;

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("entrada-json");
  const entradaEscala = document.getElementById("entrada-escala");
  const botaoProcessar = document.getElementById("botao-processar");
  const botaoTema = document.getElementById("botao-tema");
  const botaoNovaRaiz = document.getElementById("botao-nova-raiz");
  const areaErro = document.getElementById("area-erro");

  botaoProcessar.addEventListener("click", () => {
    areaErro.textContent = "";
    try { arvoresAtuais = processarJSON(textarea.value); reprocessarERenderizar(); } catch (erro) { areaErro.textContent = erro.message; }
  });

  entradaEscala.addEventListener("change", () => {
    if (!arvoresAtuais) return;
    try { reprocessarERenderizar(); sincronizarEstadoParaTextarea(); } catch (erro) { areaErro.textContent = erro.message; }
  });

  botaoTema.addEventListener("click", () => {
    temaAtual = temaAtual === "claro" ? "escuro" : "claro";
    definirTema(temaAtual);
    document.body.classList.toggle("tema-escuro", temaAtual === "escuro");
    botaoTema.textContent = temaAtual === "claro" ? "Tema: Claro" : "Tema: Escuro";
    reprocessarERenderizar();
  });

  botaoNovaRaiz.addEventListener("click", () => {
    try { MindNoteApp.adicionarNovaRaiz(); } catch (erro) { areaErro.textContent = erro.message; }
  });
});
