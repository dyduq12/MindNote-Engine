/*
 * engine.text.js
 * Fase 2: Motor de Medicao de Texto Real e Calculo Geometrico das Caixas.
 *
 * Todas as funcoes de calculo sao puras (mesma entrada => mesma saida).
 * A unica dependencia de ambiente e um canvas 2D off-screen, criado uma
 * unica vez e reutilizado apenas para medir largura real de strings,
 * sem qualquer insercao no DOM visivel.
 */

const FONTE_PADRAO = '16px system-ui, sans-serif';

const CONST_TITULO = {
  LARGURA_MAXIMA: 240,     // px - dentro da faixa 220-260px definida na diretriz da Fase 2
  RESPIRO_LATERAL: 16,     // px - 8px de respiro interno em cada lado, subtraido da largura util de medicao
  PADDING_VERTICAL: 16,    // px - 8px em cada margem vertical (rotulo digital, nao manuscrito)
  ALTURA_LINHA: 24         // px - altura de linha usada para o texto do titulo
};

const CONST_ANOTACAO = {
  PADDING: 40,                   // px - em todas as margens, Tabela 2.2 do documento mestre
  ALTURA_PAUTA_PADRAO: 68,       // px - escalavel pelo seletor de entrelinha da UI
  LARGURA_QUADRADO: 600,         // px
  LARGURA_ALONGADO: 1200,        // px
  DENSIDADE_QUADRADO: 4.5,       // palavras/linha
  DENSIDADE_ALONGADO: 9.5,       // palavras/linha
  MULTIPLICADOR_FOLGA: 1.5,      // +50% de folga dinamica
  LINHAS_MINIMAS: 3,             // piso minimo de seguranca
  ALTURA_ILUSTRACAO_PADRAO: 400  // px - fallback quando altura_customizada estiver ausente
};

const CONST_CONECTOR = {
  LARGURA: 30 // px - conector de adjacencia entre titulo e anotacao
};

let _contextoMedicaoCache = null;

function obterContextoMedicao() {
  if (_contextoMedicaoCache) {
    return _contextoMedicaoCache;
  }
  const canvas = document.createElement('canvas');
  const contexto = canvas.getContext('2d');
  contexto.font = FONTE_PADRAO;
  _contextoMedicaoCache = contexto;
  return contexto;
}

function quebrarPalavraLonga(palavra, larguraMaxima, contexto) {
  if (contexto.measureText(palavra).width <= larguraMaxima) {
    return [palavra];
  }

  const fragmentos = [];
  let fragmentoAtual = '';

  for (const caractere of palavra) {
    const testeFragmento = fragmentoAtual + caractere;
    if (contexto.measureText(testeFragmento).width <= larguraMaxima || fragmentoAtual === '') {
      fragmentoAtual = testeFragmento;
    } else {
      fragmentos.push(fragmentoAtual);
      fragmentoAtual = caractere;
    }
  }

  if (fragmentoAtual) {
    fragmentos.push(fragmentoAtual);
  }

  return fragmentos;
}

/*
 * quebrarTexto: funcao utilitaria pura de word-wrap.
 * Protege contra o edge case de uma unica palavra mais larga que
 * larguraMaxima, forcando quebra por caractere nesse caso especifico
 * (Passo 5 da revisao critica do motor: titulo/anotacao com texto
 * anormalmente longo nao pode vazar da caixa).
 */
function quebrarTexto(texto, larguraMaxima, font, contextoExterno) {
  const contexto = contextoExterno || obterContextoMedicao();
  const fonteAnterior = contexto.font;
  contexto.font = font || FONTE_PADRAO;

  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let linhaAtual = '';

  palavras.forEach((palavra) => {
    const larguraPalavra = contexto.measureText(palavra).width;

    if (larguraPalavra > larguraMaxima) {
      if (linhaAtual) {
        linhas.push(linhaAtual);
        linhaAtual = '';
      }
      const fragmentos = quebrarPalavraLonga(palavra, larguraMaxima, contexto);
      fragmentos.slice(0, -1).forEach((fragmento) => linhas.push(fragmento));
      linhaAtual = fragmentos[fragmentos.length - 1] || '';
      return;
    }

    const linhaTeste = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (contexto.measureText(linhaTeste).width <= larguraMaxima || linhaAtual === '') {
      linhaAtual = linhaTeste;
    } else {
      linhas.push(linhaAtual);
      linhaAtual = palavra;
    }
  });

  if (linhaAtual) {
    linhas.push(linhaAtual);
  }

  contexto.font = fonteAnterior;
  return linhas.length > 0 ? linhas : [''];
}

function calcularDimensaoTitulo(titulo) {
  const larguraUtil = CONST_TITULO.LARGURA_MAXIMA - CONST_TITULO.RESPIRO_LATERAL;
  const linhasQuebradas = quebrarTexto(titulo, larguraUtil, FONTE_PADRAO);
  const altura = CONST_TITULO.PADDING_VERTICAL + (linhasQuebradas.length * CONST_TITULO.ALTURA_LINHA);

  return {
    largura: CONST_TITULO.LARGURA_MAXIMA,
    altura,
    linhasQuebradas: linhasQuebradas.length
  };
}

/*
 * calcularLinhasFinaisAnotacao: aplica a precedencia rigida definida
 * na Fase 1 (linhas_manuais > estimativa por palavras) e a formula de
 * folga dinamica de +50%, respeitando o piso minimo de 3 linhas.
 */
function calcularLinhasFinaisAnotacao(anotacao) {
  if (anotacao.linhasManuais) {
    return Math.max(CONST_ANOTACAO.LINHAS_MINIMAS, anotacao.linhasManuais);
  }

  const densidade = anotacao.formato === 'alongado'
    ? CONST_ANOTACAO.DENSIDADE_ALONGADO
    : CONST_ANOTACAO.DENSIDADE_QUADRADO;

  const linhasBase = Math.ceil(anotacao.palavrasEstimadas / densidade);
  const linhasComFolga = Math.ceil(linhasBase * CONST_ANOTACAO.MULTIPLICADOR_FOLGA);

  return Math.max(CONST_ANOTACAO.LINHAS_MINIMAS, linhasComFolga);
}

/*
 * calcularDimensaoAnotacao: aplica estritamente a tabela de constantes
 * calibradas. Tipo "ilustracao" respeita altura_customizada (ou o
 * fallback de 400px) sem gerar pautas internas nem aplicar a formula
 * de padding + linhas.
 */
function calcularDimensaoAnotacao(anotacao, escalaEntrelinha) {
  if (!anotacao) {
    return null;
  }

  const largura = anotacao.formato === 'alongado'
    ? CONST_ANOTACAO.LARGURA_ALONGADO
    : CONST_ANOTACAO.LARGURA_QUADRADO;

  if (anotacao.tipo === 'ilustracao') {
    const altura = anotacao.alturaCustomizada || CONST_ANOTACAO.ALTURA_ILUSTRACAO_PADRAO;
    return {
      largura,
      altura,
      linhasFinais: null,
      tipo: anotacao.tipo,
      formato: anotacao.formato
    };
  }

  const alturaPauta = (typeof escalaEntrelinha === 'number' && escalaEntrelinha > 0)
    ? escalaEntrelinha
    : CONST_ANOTACAO.ALTURA_PAUTA_PADRAO;

  const linhasFinais = calcularLinhasFinaisAnotacao(anotacao);
  const altura = (CONST_ANOTACAO.PADDING * 2) + (linhasFinais * alturaPauta);

  return {
    largura,
    altura,
    linhasFinais,
    tipo: anotacao.tipo,
    formato: anotacao.formato
  };
}

/*
 * enriquecerArvoreComDimensoes: percorre a arvore normalizada (Fase 1)
 * e anexa em cada no o objeto "dimensoes", combinando titulo + anotacao
 * na Unidade Composta (secao 4.1 do documento mestre). A funcao muta o
 * no recebido e retorna a mesma referencia, para uso direto no fluxo
 * de app.js.
 */
function enriquecerArvoreComDimensoes(noRaiz, escalaEntrelinha) {
  const dimensaoTitulo = calcularDimensaoTitulo(noRaiz.titulo);
  const dimensaoAnotacao = calcularDimensaoAnotacao(noRaiz.anotacao, escalaEntrelinha);

  const larguraTotal = dimensaoAnotacao
    ? dimensaoTitulo.largura + CONST_CONECTOR.LARGURA + dimensaoAnotacao.largura
    : dimensaoTitulo.largura;

  const alturaTotal = dimensaoAnotacao
    ? Math.max(dimensaoTitulo.altura, dimensaoAnotacao.altura)
    : dimensaoTitulo.altura;

  noRaiz.dimensoes = {
    titulo: dimensaoTitulo,
    anotacao: dimensaoAnotacao,
    unidadeComposta: {
      larguraTotal,
      alturaTotal
    }
  };

  noRaiz.filhos.forEach((filho) => enriquecerArvoreComDimensoes(filho, escalaEntrelinha));

  return noRaiz;
}
