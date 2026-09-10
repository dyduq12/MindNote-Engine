/* Fase 2: medicao de texto e dimensoes calibradas para StarNotes. */

const FONTE_PADRAO = '600 15px system-ui, sans-serif';

const CONST_TITULO = {
  LARGURA_MAXIMA: 240,
  PADDING_HORIZONTAL: 16,
  PADDING_VERTICAL: 8,
  ALTURA_MINIMA: 48,
  ALTURA_LINHA: 22
};

const CONST_ANOTACAO = {
  PADDING_VERTICAL: 16,
  PADDING_HORIZONTAL: 20,
  ALTURA_PAUTA_PADRAO: 26,
  LARGURA_QUADRADO: 420,
  LARGURA_ALONGADO: 800,
  DENSIDADE_QUADRADO: 4.5,
  DENSIDADE_ALONGADO: 9.5,
  MULTIPLICADOR_FOLGA: 1.5,
  LINHAS_MINIMAS: 3,
  ALTURA_ILUSTRACAO_PADRAO: 220
};

const CONST_CONECTOR = { LARGURA: 30 };
let _contextoMedicaoCache = null;

function obterContextoMedicao() {
  if (_contextoMedicaoCache) return _contextoMedicaoCache;
  const canvas = document.createElement('canvas');
  const contexto = canvas.getContext('2d');
  contexto.font = FONTE_PADRAO;
  _contextoMedicaoCache = contexto;
  return contexto;
}

function quebrarPalavraLonga(palavra, larguraMaxima, contexto) {
  if (contexto.measureText(palavra).width <= larguraMaxima) return [palavra];
  const fragmentos = [];
  let atual = '';
  for (const caractere of palavra) {
    const teste = atual + caractere;
    if (contexto.measureText(teste).width <= larguraMaxima || atual === '') atual = teste;
    else { fragmentos.push(atual); atual = caractere; }
  }
  if (atual) fragmentos.push(atual);
  return fragmentos;
}

function quebrarTexto(texto, larguraMaxima, font, contextoExterno) {
  const contexto = contextoExterno || obterContextoMedicao();
  const fonteAnterior = contexto.font;
  contexto.font = font || FONTE_PADRAO;
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  palavras.forEach((palavra) => {
    if (contexto.measureText(palavra).width > larguraMaxima) {
      if (atual) { linhas.push(atual); atual = ''; }
      const partes = quebrarPalavraLonga(palavra, larguraMaxima, contexto);
      partes.slice(0, -1).forEach((parte) => linhas.push(parte));
      atual = partes[partes.length - 1] || '';
      return;
    }
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (!atual || contexto.measureText(teste).width <= larguraMaxima) atual = teste;
    else { linhas.push(atual); atual = palavra; }
  });
  if (atual) linhas.push(atual);
  contexto.font = fonteAnterior;
  return linhas.length ? linhas : [''];
}

function calcularDimensaoTitulo(titulo) {
  const larguraUtil = CONST_TITULO.LARGURA_MAXIMA - (CONST_TITULO.PADDING_HORIZONTAL * 2);
  const linhas = quebrarTexto(titulo, larguraUtil, FONTE_PADRAO);
  return {
    largura: CONST_TITULO.LARGURA_MAXIMA,
    altura: Math.max(CONST_TITULO.ALTURA_MINIMA, (CONST_TITULO.PADDING_VERTICAL * 2) + (linhas.length * CONST_TITULO.ALTURA_LINHA)),
    linhasQuebradas: linhas.length,
    linhasTexto: linhas
  };
}

function calcularLinhasFinaisAnotacao(anotacao) {
  if (anotacao.linhasManuais) return Math.max(CONST_ANOTACAO.LINHAS_MINIMAS, anotacao.linhasManuais);
  const densidade = anotacao.formato === 'alongado' ? CONST_ANOTACAO.DENSIDADE_ALONGADO : CONST_ANOTACAO.DENSIDADE_QUADRADO;
  const base = Math.ceil(anotacao.palavrasEstimadas / densidade);
  return Math.max(CONST_ANOTACAO.LINHAS_MINIMAS, Math.ceil(base * CONST_ANOTACAO.MULTIPLICADOR_FOLGA));
}

function calcularDimensaoAnotacao(anotacao, escalaEntrelinha) {
  if (!anotacao) return null;
  const largura = anotacao.formato === 'alongado' ? CONST_ANOTACAO.LARGURA_ALONGADO : CONST_ANOTACAO.LARGURA_QUADRADO;
  if (anotacao.tipo === 'ilustracao') return { largura, altura: anotacao.alturaCustomizada || CONST_ANOTACAO.ALTURA_ILUSTRACAO_PADRAO, linhasFinais: null, tipo: anotacao.tipo, formato: anotacao.formato, entrelinha: null };
  const entrelinha = typeof escalaEntrelinha === 'number' && escalaEntrelinha > 0 ? escalaEntrelinha : CONST_ANOTACAO.ALTURA_PAUTA_PADRAO;
  const linhasFinais = calcularLinhasFinaisAnotacao(anotacao);
  return { largura, altura: (CONST_ANOTACAO.PADDING_VERTICAL * 2) + (linhasFinais * entrelinha), linhasFinais, tipo: anotacao.tipo, formato: anotacao.formato, entrelinha, paddingVertical: CONST_ANOTACAO.PADDING_VERTICAL, paddingHorizontal: CONST_ANOTACAO.PADDING_HORIZONTAL };
}

function enriquecerArvoreComDimensoes(noRaiz, escalaEntrelinha) {
  const titulo = calcularDimensaoTitulo(noRaiz.titulo);
  const anotacao = calcularDimensaoAnotacao(noRaiz.anotacao, escalaEntrelinha);
  noRaiz.dimensoes = { titulo, anotacao, unidadeComposta: { larguraTotal: anotacao ? titulo.largura + CONST_CONECTOR.LARGURA + anotacao.largura : titulo.largura, alturaTotal: anotacao ? Math.max(titulo.altura, anotacao.altura) : titulo.altura } };
  noRaiz.filhos.forEach((filho) => enriquecerArvoreComDimensoes(filho, escalaEntrelinha));
  return noRaiz;
}
