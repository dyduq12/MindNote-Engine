"use strict";

const MindNoteApp = window.MindNoteApp || {};
let arvoresAtuais = null;
let temaAtual = "claro";

// ─── Fase 2 (v2.0): identidade do mapa aberto no editor (persistência) ─────
let mapaAtualId = null;
let mapaAtualTitulo = "Novo Mapa";
let autosaveTimeoutId = null;
const AUTOSAVE_DELAY_MS = 1200;

// ─── Paleta de cores de destaque ──────────────────────────────────────────
const CORES_RAMO = [null, "#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626"];

// ─── Normalização ───────────────────────────────────────────────────────────────
function normalizarAnexo(anexo) {
if (!anexo) return null;
const alturaValida =
typeof anexo.altura === "number" &&
Number.isFinite(anexo.altura) &&
anexo.altura > 0;
return { tipo: "ilustracao", altura: alturaValida ? anexo.altura : 220 };
}

function normalizarAnotacao(anotacao) {
if (!anotacao) return null;
const tipo = anotacao.tipo === "ilustracao" ? "ilustracao" : "pauta";
const anexo = normalizarAnexo(anotacao.anexo);

if (tipo === "ilustracao") {
const alturaValida =
typeof anotacao.altura_customizada === "number" &&
Number.isFinite(anotacao.altura_customizada) &&
anotacao.altura_customizada > 0;
return {
tipo: "ilustracao",
alturaCustomizada: alturaValida ? anotacao.altura_customizada : 220,
linhasManuais: null,
palavrasEstimadas: null,
anexo,
};
}

const linhasValidas =
typeof anotacao.linhas_manuais === "number" &&
Number.isFinite(anotacao.linhas_manuais) &&
anotacao.linhas_manuais > 0;
const palavrasValidas =
typeof anotacao.palavras_estimadas === "number" &&
Number.isFinite(anotacao.palavras_estimadas) &&
anotacao.palavras_estimadas >= 8;
return {
tipo: "pauta",
modeloPauta: ["horizontal", "quadriculada", "pontos", "cornell"].includes(anotacao.modeloPauta) ? anotacao.modeloPauta : (window.MindNoteSettings?.obterPautaPadrao?.() || "horizontal"),
alturaCustomizada: null,
linhasManuais: linhasValidas ? Math.max(3, Math.floor(anotacao.linhas_manuais)) : null,
palavrasEstimadas: linhasValidas ? null : palavrasValidas ? anotacao.palavras_estimadas : 8,
anexo,
};
}

function validarNo(no, profundidade = 0) {
if (!no || typeof no.titulo !== "string" || no.titulo.trim() === "") {
throw new Error(
`Nó inválido na profundidade ${profundidade}: campo "titulo" ausente ou vazio.`
);
}
const cor =
typeof no.cor === "string" && CORES_RAMO.includes(no.cor)
? no.cor
: no.cor === null || no.cor === undefined
? null
: null;
return {
titulo: no.titulo.trim(),
anotacao: normalizarAnotacao(no.anotacao),
cor,
filhos: Array.isArray(no.filhos)
? no.filhos.map((filho) => validarNo(filho, profundidade + 1))
: [],
};
}

function processarJSON(textoBruto) {
let dadosBrutos;
try {
dadosBrutos = JSON.parse(textoBruto);
} catch (erro) {
throw new Error(`JSON inválido: ${erro.message}`);
}
const listaBruta = Array.isArray(dadosBrutos) ? dadosBrutos : [dadosBrutos];
if (listaBruta.length === 0)
throw new Error("A lista de árvores não pode ser vazia.");
return listaBruta.map((raiz) => validarNo(raiz, 0));
}

function obterEscalaEntrelinha() {
const valor = Number(document.getElementById("entrada-escala")?.value);
return Number.isFinite(valor) && valor > 0 ? Math.max(18, Math.min(36, valor)) : 26;
}

function percorrerNosGeometricos(no, callback, profundidade = 0) {
callback(no, profundidade);
no.filhos?.forEach((filho) => percorrerNosGeometricos(filho, callback, profundidade + 1));
}

function aplicarLayoutConfigurado(arvores, config) {
const gapV = config.gapVertical || 60, gapH = config.gapHorizontal || 120;
const gapRaizes = config.gapMultiRoots || 160;
const larguraNo = (no) => no.dimensoes.unidadeComposta.larguraTotal;
const alturaNo = (no) => no.dimensoes.unidadeComposta.alturaTotal;
const posicionar = (no, x, y) => {
no.posicao = { x, y };
no.posicaoAnotacao = no.dimensoes.anotacao ? { x: x + no.dimensoes.titulo.largura + 30, y } : null;
no.posicaoAnexo = no.dimensoes.anotacao?.anexo ? { x: no.posicaoAnotacao.x + no.dimensoes.anotacao.largura + 30, y } : null;
};
let topoRaiz = 0, cursorGrid = 0, cursorRadial = 0;

if (config.template === "study-briefing") {
  arvores.forEach((raiz) => {
    const spans = new Map(), alturasNivel = [];
    const medir = (no, depth = 0) => {
      alturasNivel[depth] = Math.max(alturasNivel[depth] || 0, alturaNo(no));
      const filhos = no.filhos.map((filho) => medir(filho, depth + 1));
      const larguraFilhos = filhos.reduce((sum, child) => sum + child, 0) + Math.max(0, filhos.length - 1) * gapV;
      const span = Math.max(larguraNo(no), larguraFilhos); spans.set(no, span); return span;
    };
    medir(raiz);
    const yNivel = []; alturasNivel.forEach((height, i) => { yNivel[i] = (yNivel[i - 1] || topoRaiz) + (i ? alturasNivel[i - 1] / 2 + gapH + height / 2 : height / 2); });
    const posicionarVertical = (no, left, depth = 0) => {
      const span = spans.get(no); posicionar(no, left + (span - larguraNo(no)) / 2, yNivel[depth]);
      const total = no.filhos.reduce((sum, child) => sum + spans.get(child), 0) + Math.max(0, no.filhos.length - 1) * gapV;
      let x = left + (span - total) / 2;
      no.filhos.forEach((child) => { posicionarVertical(child, x, depth + 1); x += spans.get(child) + gapV; });
    };
    posicionarVertical(raiz, 0);
    topoRaiz = yNivel[alturasNivel.length - 1] + alturasNivel.at(-1) / 2 + gapRaizes;
  });
} else if (config.template === "grid-livre") {
  const colunas = 3;
  arvores.forEach((raiz) => {
    const nos = []; percorrerNosGeometricos(raiz, (no) => nos.push(no));
    const w = Math.max(...nos.map(larguraNo)), h = Math.max(...nos.map(alturaNo));
    nos.forEach((no, i) => posicionar(no, (i % colunas) * (w + gapH), cursorGrid + Math.floor(i / colunas) * (h + gapV)));
    cursorGrid += Math.ceil(nos.length / colunas) * (h + gapV) + gapRaizes;
  });
} else if (config.template === "radial") {
  arvores.forEach((raiz) => {
    let profundidadeMax = 0, folhasMax = 1, larguraMax = 0;
    const folhas = (no, depth = 0) => {
      profundidadeMax = Math.max(profundidadeMax, depth); larguraMax = Math.max(larguraMax, larguraNo(no));
      return no.filhos.length ? no.filhos.reduce((sum, child) => sum + folhas(child, depth + 1), 0) : 1;
    };
    folhasMax = folhas(raiz);
    const raioNivel = larguraMax + gapH;
    const raioLimite = Math.max(raioNivel, profundidadeMax * raioNivel);
    const centroX = cursorRadial + raioLimite + larguraMax, centroY = raioLimite + larguraMax;
    const distribuir = (no, depth, inicio, fim) => {
      const angulo = (inicio + fim) / 2, raio = depth * raioNivel;
      posicionar(no, centroX + Math.cos(angulo) * raio - larguraNo(no) / 2, centroY + Math.sin(angulo) * raio);
      let cursor = inicio;
      const total = no.filhos.reduce((sum, child) => sum + folhas(child, 0), 0) || 1;
      no.filhos.forEach((child) => {
        const amplitude = (fim - inicio) * (folhas(child, 0) / total);
        distribuir(child, depth + 1, cursor, cursor + amplitude); cursor += amplitude;
      });
    };
    distribuir(raiz, 0, -Math.PI / 2, 3 * Math.PI / 2);
    cursorRadial += 2 * (raioLimite + larguraMax) + gapRaizes;
  });
} else {
  arvores.forEach((raiz, index) => {
    percorrerNosGeometricos(raiz, (no, depth) => {
      const dx = depth * (gapH - 120);
      no.posicao.x += dx;
      if (no.posicaoAnotacao) no.posicaoAnotacao.x += dx;
      if (no.posicaoAnexo) no.posicaoAnexo.x += dx;
      const dy = index * (gapRaizes - 160);
      no.posicao.y += dy;
      if (no.posicaoAnotacao) no.posicaoAnotacao.y += dy;
      if (no.posicaoAnexo) no.posicaoAnexo.y += dy;
    });
  });
}

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
arvores.forEach((raiz) => percorrerNosGeometricos(raiz, (no) => {
  const x0 = no.posicao.x, x1 = x0 + larguraNo(no), y0 = no.posicao.y - alturaNo(no) / 2, y1 = no.posicao.y + alturaNo(no) / 2;
  minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
}));
if (!Number.isFinite(minX)) return;
const deslocar = (no) => {
  no.posicao.x += 150 - minX; no.posicao.y += 150 - minY;
  if (no.posicaoAnotacao) { no.posicaoAnotacao.x += 150 - minX; no.posicaoAnotacao.y += 150 - minY; }
  if (no.posicaoAnexo) { no.posicaoAnexo.x += 150 - minX; no.posicaoAnexo.y += 150 - minY; }
  no.filhos.forEach(deslocar);
};
arvores.forEach(deslocar);
arvores.forEach((raiz) => calcularConectores(raiz));
const ratio = config.bezierTension === "rigida" ? .25 : .5;
arvores.forEach((raiz) => percorrerNosGeometricos(raiz, (no) => no.conectoresFilhos?.forEach(({ curva }, index) => {
  const c = curva, dx = c.p3.x - c.p0.x;
  c.roteamento = config.bezierTension === "ortogonal" ? "ortogonal" : "bezier";
  if (config.template === "study-briefing" && no.filhos[index]) {
    const child = no.filhos[index];
    c.p0 = { x: no.posicao.x + no.dimensoes.titulo.largura / 2, y: no.posicao.y + no.dimensoes.titulo.altura / 2 };
    c.p3 = { x: child.posicao.x + child.dimensoes.titulo.largura / 2, y: child.posicao.y - child.dimensoes.titulo.altura / 2 };
    c.eixo = "vertical";
    const dy = c.p3.y - c.p0.y, controleY = c.p0.y + dy * ratio;
    c.p1 = { x: c.p0.x, y: controleY }; c.p2 = { x: c.p3.x, y: c.p3.y - dy * ratio };
  } else {
    const controleX = c.p0.x + dx * ratio;
    c.eixo = "horizontal";
    c.p1 = { x: controleX, y: c.p0.y }; c.p2 = { x: c.p3.x - dx * ratio, y: c.p3.y };
  }
})));
const canvas = { larguraTotal: maxX - minX + 300, alturaTotal: maxY - minY + 300 };
arvores.forEach((raiz) => percorrerNosGeometricos(raiz, (no) => { no.canvasDimensoes = canvas; }));
}

// ─── Ciclo principal ───────────────────────────────────────────────────────
function reprocessarERenderizar() {
if (!Array.isArray(arvoresAtuais) || arvoresAtuais.length === 0) return;
const editorAtivo = document.getElementById("view-editor");
if (!editorAtivo || editorAtivo.hidden || editorAtivo.style.display === "none") return;
const layoutConfig = window.MindNoteSettings?.obterLayoutConfig?.() || {};
if (typeof CONST_GEOMETRIA !== "undefined") CONST_GEOMETRIA.GAP_VERTICAL_IRMAOS = layoutConfig.gapVertical || 60;
arvoresAtuais.forEach((raiz) =>
enriquecerArvoreComDimensoes(raiz, obterEscalaEntrelinha())
);
calcularCoordenadasMultiplas(arvoresAtuais);
aplicarLayoutConfigurado(arvoresAtuais, layoutConfig);
const container = document.getElementById("canvas-container");
if (!container) return;
// ─── Fase 3 (v2.0): estabilização de câmera — captura o viewBox do SVG
// atual antes do redraw e restaura no SVG novo, para que mutações (cor,
// linhas, título, etc.) não resetem o enquadramento visual do usuário.
const svgAntigo = container.querySelector("svg");
const estadoAntesDoRedraw = svgAntigo ? window.MindNoteCamera?.capturarEstado(svgAntigo) : null;
renderizarArvoreSVG(arvoresAtuais, container);
const svgNovo = container.querySelector("svg");
if (estadoAntesDoRedraw && svgNovo) {
window.MindNoteCamera?.restaurarEstado(svgNovo, estadoAntesDoRedraw);
// Fase 3.4 (fix): sincroniza o cache interno de pan/zoom do novo SVG com
// o viewBox recém-restaurado, para que o próximo gesto do usuário parta
// do estado correto e não do padrão calculado por criarInteracaoViewport.
svgNovo._sincronizarCamera?.();
}
}

// ─── Serialização limpa (cor é persistente; propriedades geométricas são transitórias) ───
const PROPRIEDADES_TRANSITORIAS = new Set([
"_hRamo",
"_hPropria",
"posicao",
"posicaoAnotacao",
"posicaoAnexo",
"conectoresFilhos",
"conectorAnotacao",
"conectorAnexo",
"canvasDimensoes",
"dimensoes",
]);

function clonarEstadoLimpo(valor) {
if (Array.isArray(valor)) return valor.map(clonarEstadoLimpo);
if (!valor || typeof valor !== "object") return valor;
return Object.fromEntries(
Object.entries(valor)
.filter(([chave]) => !PROPRIEDADES_TRANSITORIAS.has(chave))
.map(([chave, conteudo]) => [chave, clonarEstadoLimpo(conteudo)])
);
}

function sincronizarEstadoParaTextarea() {
const campoJSON = document.getElementById("entrada-json");
if (!campoJSON || !Array.isArray(arvoresAtuais)) return;
const estadoLimpo = clonarEstadoLimpo(arvoresAtuais);
campoJSON.value = JSON.stringify(
estadoLimpo.length === 1 ? estadoLimpo[0] : estadoLimpo,
null,
2
);
}

function garantirArvoresAtuais() {
if (!Array.isArray(arvoresAtuais))
throw new Error("Nenhuma árvore foi carregada. Processe um JSON primeiro.");
}

// ─── Fase 2 (v2.0): persistência automática (autosave) ──────────────
// Gera uma miniatura SVG leve a partir do vivo do canvas, removendo
// apenas elementos de interação (toolbar/handles) que não fazem sentido numa
// prévia estática. Não recalcula nenhuma coordenada — clona o que o motor
// geométrico já desenhou.
function gerarThumbnailSVG() {
const svgOriginal = document.querySelector("#canvas-container svg");
if (!svgOriginal) return null;
const clone = svgOriginal.cloneNode(true);
clone
.querySelectorAll("#micro-toolbar, .mindnote-resize-handle, .mindnote-selected")
.forEach((elemento) => elemento.remove());
clone.removeAttribute("width");
clone.removeAttribute("height");
clone.setAttribute("width", "100%");
clone.setAttribute("height", "100%");
return new XMLSerializer().serializeToString(clone);
}

function obterTituloMapaAtual() {
if (Array.isArray(arvoresAtuais) && arvoresAtuais[0]?.titulo) {
return arvoresAtuais[0].titulo;
}
return mapaAtualTitulo || "Novo Mapa";
}

function atualizarIndicadorAutosave() {
const indicador = document.getElementById("indicador-autosave");
if (!indicador) return;
const agora = new Date();
const hh = String(agora.getHours()).padStart(2, "0");
const mm = String(agora.getMinutes()).padStart(2, "0");
indicador.textContent = `● Salvo às ${hh}:${mm}`;
}

function salvarNoBancoAgora() {
if (!mapaAtualId || !window.MindNoteDB || !Array.isArray(arvoresAtuais)) return;
const svgString = gerarThumbnailSVG();
const titulo = obterTituloMapaAtual();
mapaAtualTitulo = titulo;
window.MindNoteDB
.salvarMapa(mapaAtualId, titulo, arvoresAtuais, svgString, temaAtual)
.then(atualizarIndicadorAutosave)
.catch((erro) => console.error("Falha ao salvar mapa:", erro));
}

function agendarAutosave() {
if (!mapaAtualId) return;
if (autosaveTimeoutId) window.clearTimeout(autosaveTimeoutId);
autosaveTimeoutId = window.setTimeout(salvarNoBancoAgora, AUTOSAVE_DELAY_MS);
}

function finalizarMutacao() {
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
agendarAutosave();
}

// ─── Mutações ────────────────────────────────────────────────────────────────
function adicionarFilho(no) {
if (!no || typeof no !== "object") return null;
window.MindNoteHistory?.registrarSnapshot("adicionar-filho");
if (!Array.isArray(no.filhos)) no.filhos = [];
const novoFilho = {
titulo: "Novo Tópico",
anotacao: {
tipo: "pauta",
modeloPauta: window.MindNoteSettings?.obterPautaPadrao?.() || "horizontal",
linhasManuais: 4,
alturaCustomizada: null,
palavrasEstimadas: null,
anexo: null,
},
cor: null,
filhos: [],
};
no.filhos.push(novoFilho);
finalizarMutacao();
return novoFilho;
}

function adicionarAnotacao(no) {
if (!no || no.anotacao !== null) return false;
window.MindNoteHistory?.registrarSnapshot("adicionar-anotacao");
no.anotacao = {
tipo: "pauta",
modeloPauta: window.MindNoteSettings?.obterPautaPadrao?.() || "horizontal",
linhasManuais: 4,
alturaCustomizada: null,
palavrasEstimadas: null,
anexo: null,
};
finalizarMutacao();
return true;
}

function alterarLinhas(no, delta) {
if (!no?.anotacao || no.anotacao.tipo !== "pauta") return false;
const variacao = Number(delta);
if (!Number.isFinite(variacao)) return false;
const atuais = Number.isFinite(no.anotacao.linhasManuais)
? no.anotacao.linhasManuais
: 3;
const novasLinhas = Math.max(3, Math.floor(atuais + variacao));
if (novasLinhas === atuais && no.anotacao.palavrasEstimadas == null) return false;
window.MindNoteHistory?.registrarSnapshot("alterar-linhas");
no.anotacao.linhasManuais = novasLinhas;
no.anotacao.palavrasEstimadas = null;
finalizarMutacao();
return true;
}

function alternarTipoAnotacao(no) {
if (!no?.anotacao) return false;
window.MindNoteHistory?.registrarSnapshot("alternar-tipo-anotacao");
if (no.anotacao.tipo === "pauta") {
no.anotacao.tipo = "ilustracao";
no.anotacao.alturaCustomizada = 220;
no.anotacao.linhasManuais = null;
no.anotacao.palavrasEstimadas = null;
} else {
no.anotacao.tipo = "pauta";
no.anotacao.modeloPauta = window.MindNoteSettings?.obterPautaPadrao?.() || "horizontal";
no.anotacao.alturaCustomizada = null;
no.anotacao.linhasManuais = 4;
no.anotacao.palavrasEstimadas = null;
}
finalizarMutacao();
return true;
}

function adicionarAnexo(no) {
if (!no?.anotacao || no.anotacao.anexo) return false;
window.MindNoteHistory?.registrarSnapshot("adicionar-anexo");
no.anotacao.anexo = { tipo: "ilustracao", altura: 220 };
finalizarMutacao();
return true;
}

function removerAnotacao(no) {
if (!no?.anotacao) return false;
window.MindNoteHistory?.registrarSnapshot("remover-anotacao");
no.anotacao = null;
finalizarMutacao();
return true;
}

function adicionarNovaRaiz() {
garantirArvoresAtuais();
const novaRaiz = { titulo: "Novo Tema", anotacao: null, cor: null, filhos: [] };
window.MindNoteHistory?.registrarSnapshot("adicionar-raiz");
arvoresAtuais.push(novaRaiz);
finalizarMutacao();
return novaRaiz;
}

// ─── Edição de título ───────────────────────────────────────────────────────────
function atualizarTitulo(no, novoTexto) {
if (!no || typeof novoTexto !== "string") return false;
const titulo = novoTexto.trim();
if (!titulo) return false;
if (titulo === no.titulo) return false;
window.MindNoteHistory?.registrarSnapshot("alterar-titulo");
no.titulo = titulo;
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
agendarAutosave();
return true;
}

// ─── Alternância cíclica de cor ──────────────────────────────────────────────────
function alternarCor(no) {
if (!no) return false;
const indiceAtual = CORES_RAMO.indexOf(no.cor !== undefined ? no.cor : null);
const baseIndice = indiceAtual === -1 ? 0 : indiceAtual;
window.MindNoteHistory?.registrarSnapshot("alternar-cor");
no.cor = CORES_RAMO[(baseIndice + 1) % CORES_RAMO.length];
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
agendarAutosave();
return true;
}

// ─── Fase 3.3 (fix): exclusão de nó ─────────────────────────────
function removerNo(noAlvo) {
if (!noAlvo) return;
// Se for raiz
const indiceRaiz = arvoresAtuais.indexOf(noAlvo);
if (indiceRaiz !== -1) {
if (arvoresAtuais.length <= 1) {
alert("Não é possível remover a única raiz do mapa mental.");
return;
}
if (confirm(`Deseja realmente excluir a raiz "${noAlvo.titulo}" e todos os seus ramos?`)) {
window.MindNoteHistory?.registrarSnapshot("remover-raiz");
arvoresAtuais.splice(indiceRaiz, 1);
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
agendarAutosave();
}
return;
}
// Se for nó filho (busca recursiva do pai)
function buscarPai(noAtual) {
for (const f of noAtual.filhos || []) {
if (f === noAlvo) return noAtual;
const achou = buscarPai(f);
if (achou) return achou;
}
return null;
}
let pai = null;
for (const r of arvoresAtuais) {
pai = buscarPai(r);
if (pai) break;
}
if (pai) {
if (confirm(`Deseja excluir o tópico "${noAlvo.titulo}"?`)) {
window.MindNoteHistory?.registrarSnapshot("remover-no");
pai.filhos = pai.filhos.filter(f => f !== noAlvo);
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
agendarAutosave();
}
}
}

// ─── Fase 2 (v2.0): ciclo de vida do mapa dentro do editor ───────────
// Chamado pelo roteador ao entrar na view do editor. Se `id` corresponder a
// um mapa já salvo, carrega seus dados; caso contrário, inicializa um mapa
// em branco com aquele id (permitindo que o autosave o persista já na
// primeira mutação).
async function inicializarComMapa(id) {
window.MindNoteHistory?.limpar?.();
mapaAtualId = id || window.MindNoteDB?.gerarUUID?.() || null;

const indicador = document.getElementById("indicador-autosave");
if (indicador) indicador.textContent = "";
const areaErroEl = document.getElementById("area-erro");
if (areaErroEl) areaErroEl.textContent = "";

if (id && window.MindNoteDB) {
try {
const registro = await window.MindNoteDB.carregarMapa(id);
if (registro) {
arvoresAtuais = registro.arvores;
mapaAtualTitulo = registro.meta.titulo;
 temaAtual = window.MindNoteTheme?.obter?.() || (registro.meta.tema === "escuro" ? "escuro" : "claro");
aplicarTemaNaInterface();
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
const botaoExportarEl = document.getElementById("botao-exportar-pdf");
if (botaoExportarEl) botaoExportarEl.disabled = false;
return;
}
} catch (erro) {
console.error("Falha ao carregar mapa:", erro);
}
}

// Mapa novo em branco (id ainda não existe em maps_meta)
arvoresAtuais = [{ titulo: "Novo Tema", anotacao: null, cor: null, filhos: [] }];
mapaAtualTitulo = "Novo Tema";
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
const botaoExportarEl = document.getElementById("botao-exportar-pdf");
if (botaoExportarEl) botaoExportarEl.disabled = false;
agendarAutosave();
}

// Usado pela Home ao importar JSON: aplica o texto já sanitizado no mapa
// recém-criado, reaproveitando o mesmo parser e o mesmo diagnóstico de erro
// do fluxo manual do editor.
function importarJSONBruto(jsonTexto) {
const textarea = document.getElementById("entrada-json");
if (textarea) textarea.value = jsonTexto;
try {
const novasArvores = processarJSON(jsonTexto);
if (Array.isArray(arvoresAtuais) && arvoresAtuais.length > 0) {
window.MindNoteHistory?.registrarSnapshot("importar-json");
}
arvoresAtuais = novasArvores;
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
const botaoExportarEl = document.getElementById("botao-exportar-pdf");
if (botaoExportarEl) botaoExportarEl.disabled = false;
agendarAutosave();
} catch (erro) {
const areaErroEl = document.getElementById("area-erro");
if (areaErroEl) areaErroEl.textContent = erro.message;
}
}

function restaurarArvores(arvores) {
if (!Array.isArray(arvores) || arvores.length === 0) return false;
arvoresAtuais = clonarEstadoLimpo(arvores);
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
salvarNoBancoAgora();
window.dispatchEvent(new CustomEvent("mindnote:selection-change", {
detail: { no: null, tipo: null },
}));
return true;
}

function aplicarTemaNaInterface() {
definirTema(temaAtual);
if (window.MindNoteTheme) window.MindNoteTheme.aplicar(temaAtual);
else {
document.body.classList.toggle("tema-escuro", temaAtual === "escuro");
document.body.classList.toggle("tema-claro", temaAtual === "claro");
}
const botaoTema = document.getElementById("botao-tema");
if (botaoTema) {
botaoTema.textContent = temaAtual === "claro" ? "Tema: Claro" : "Tema: Escuro";
}
}

window.addEventListener("mindnote:theme-change", (evento) => {
const novoTema = evento.detail?.theme;
if (novoTema !== "claro" && novoTema !== "escuro") return;
temaAtual = novoTema;
definirTema(temaAtual);
const botaoTema = document.getElementById("botao-tema");
if (botaoTema) botaoTema.textContent = temaAtual === "claro" ? "Tema: Claro" : "Tema: Escuro";
const editor = document.getElementById("view-editor");
if (editor && !editor.hidden && editor.style.display !== "none" && Array.isArray(arvoresAtuais)) reprocessarERenderizar();
});

// ─── Exposição pública ─────────────────────────────────────────────────────────────────
Object.assign(MindNoteApp, {
adicionarFilho,
adicionarAnotacao,
alterarLinhas,
alternarTipoAnotacao,
adicionarAnexo,
removerAnotacao,
adicionarNovaRaiz,
atualizarTitulo,
alternarCor,
sincronizarEstadoParaTextarea,
reprocessarERenderizar,
inicializarComMapa,
importarJSONBruto,
restaurarArvores,
});
window.MindNoteApp = MindNoteApp;
window.MindNoteApp.salvarNoStorage = salvarNoBancoAgora;
// ─── Fase 3 (v2.0): getter público para módulos satélites (Zoom Dock) ──────
// Nunca exponha `arvoresAtuais` diretamente no window — apenas via este getter.
window.MindNoteApp.obterArvoresAtuais = () => arvoresAtuais;
// ─── Fase 3.3 (fix): exposição da exclusão de nó ────────────────────
window.MindNoteApp.removerNo = removerNo;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
const textarea = document.getElementById("entrada-json");
const entradaEscala = document.getElementById("entrada-escala");
const botaoProcessar = document.getElementById("botao-processar");
const botaoTema = document.getElementById("botao-tema");
const botaoNovaRaiz = document.getElementById("botao-nova-raiz");
const botaoExportar = document.getElementById("botao-exportar-pdf");
const areaErro = document.getElementById("area-erro");
const botaoVoltarHome = document.getElementById("botao-voltar-home");

const elementosObrigatoriosEditor = { textarea, entradaEscala, botaoProcessar, botaoTema, botaoNovaRaiz, botaoExportar, areaErro };
const elementosEditorAusentes = Object.entries(elementosObrigatoriosEditor)
  .filter(([, elemento]) => !elemento)
  .map(([nome]) => nome);
if (elementosEditorAusentes.length) {
  console.error("Bootstrap do Editor interrompido: elementos DOM ausentes", elementosEditorAusentes);
  return;
}

temaAtual = window.MindNoteTheme?.obter?.() || temaAtual;
aplicarTemaNaInterface();
try {
const espacamentoSalvo = Number(localStorage.getItem("mn_ruling_line_height") || localStorage.getItem("mindnote_default_line_spacing"));
if (Number.isInteger(espacamentoSalvo) && espacamentoSalvo >= 18 && espacamentoSalvo <= 36) entradaEscala.value = String(espacamentoSalvo);
} catch { /* mantém o padrão de 26 px */ }

botaoExportar.disabled = true;

// ─── Fase 1 (v2.0): sanitização de entrada + diagnóstico visual de erro ────
// Passa o texto colado pelo sanitizador ANTES do JSON.parse. Se o
// sanitizador ou o diagnóstico não estiverem carregados por algum motivo,
// cai de volta para o comportamento original (texto bruto direto ao
// parser), preservando 100% a compatibilidade com o fluxo consolidado.
botaoProcessar?.addEventListener("click", () => {
areaErro.textContent = "";
const textoBruto = textarea.value;

const resultadoSanitizacao = window.ParserSanitizer
? window.ParserSanitizer.sanitizarEntradaJSON(textoBruto)
: { status: "unico", jsonTexto: textoBruto };

let jsonParaProcessar = textoBruto;

if (resultadoSanitizacao.status === "vazio") {
areaErro.textContent =
"Nenhum bloco JSON foi encontrado no texto colado.";
botaoExportar.disabled = true;
return;
}

if (resultadoSanitizacao.status === "multiplo") {
const candidatos = resultadoSanitizacao.candidatos;
const listaTitulos = candidatos
.map((c, i) => `${i + 1}. ${c.titulo}`)
.join("\n");
const escolha = window.prompt(
`Foram identificados ${candidatos.length} mapas. Digite um número para carregar um deles ou 0 para unificar todos como raízes independentes.\n\n${listaTitulos}`,
"1"
);
const indice = Number(escolha) - 1;
if (String(escolha).trim() === "0" && window.ParserSanitizer?.combinarCandidatos) {
jsonParaProcessar = window.ParserSanitizer.combinarCandidatos(candidatos);
} else {
if (
!Number.isInteger(indice) ||
indice < 0 ||
indice >= candidatos.length
) {
areaErro.textContent = "Nenhum mapa selecionado.";
return;
}
jsonParaProcessar = candidatos[indice].jsonTexto;
}
} else {
jsonParaProcessar = resultadoSanitizacao.jsonTexto;
}

try {
const novasArvores = processarJSON(jsonParaProcessar);
if (Array.isArray(arvoresAtuais) && arvoresAtuais.length > 0) {
window.MindNoteHistory?.registrarSnapshot("processar-json");
}
arvoresAtuais = novasArvores;
reprocessarERenderizar();
botaoExportar.disabled = false;
agendarAutosave();
} catch (erro) {
const diagnostico = window.ParserDiagnostics
? window.ParserDiagnostics.diagnosticarErroJSON(jsonParaProcessar, erro)
: null;
areaErro.textContent = diagnostico
? diagnostico.textoSnippet
: erro.message;
botaoExportar.disabled = true;
}
});

entradaEscala?.addEventListener("change", () => {
if (!arvoresAtuais) return;
try {
reprocessarERenderizar();
sincronizarEstadoParaTextarea();
agendarAutosave();
} catch (erro) {
areaErro.textContent = erro.message;
}
});

botaoTema?.addEventListener("click", () => {
temaAtual = window.MindNoteTheme?.alternar?.() || (temaAtual === "claro" ? "escuro" : "claro");
window.dispatchEvent(new CustomEvent("mindnote:theme-change", { detail: { theme: temaAtual } }));
aplicarTemaNaInterface();
reprocessarERenderizar();
agendarAutosave();
});

botaoNovaRaiz?.addEventListener("click", () => {
try {
MindNoteApp.adicionarNovaRaiz();
} catch (erro) {
areaErro.textContent = erro.message;
}
});

// ─── Fase 2 (v2.0): retorno seguro à Home ──────────────────────
botaoVoltarHome?.addEventListener("click", () => {
salvarNoBancoAgora();
window.MindNoteRouter?.navegarPara("home");
});

// ─── Listener de exportação PDF — repassa temaAtual ─────────────────────
botaoExportar?.addEventListener("click", () => {
areaErro.textContent = "";
if (
!Array.isArray(arvoresAtuais) ||
arvoresAtuais.length === 0 ||
!arvoresAtuais[0].posicao // verifica coordenadas calculadas
) {
areaErro.textContent = "Processe um JSON antes de exportar.";
return;
}
try {
    exportarPDFContinuo(arvoresAtuais, temaAtual);
} catch (erro) {
areaErro.textContent = `Erro na exportação: ${erro.message}`;
}
});

// ─── Fase 3 (v2.0): inicializa o Zoom Dock flutuante isolado no Editor ──────
window.MindNoteZoomDock?.inicializar?.();
});
