/*
 * engine.geometry.js
 * Fase 3: Motor Geometrico Anti-Colisao (posicionamento espacial
 * absoluto e matematica das curvas de Bezier).
 *
 * Depende dos objetos "dimensoes" anexados na Fase 2 (engine.text.js)
 * e do objeto CONST_CONECTOR, tambem definido em engine.text.js
 * (scripts classicos compartilham o mesmo escopo lexico de topo).
 *
 * Este arquivo NAO desenha nada em tela: apenas calcula e anexa
 * coordenadas absolutas e pontos de curva em cada no da arvore.
 */

const CONST_GEOMETRIA = {
  GAP_VERTICAL_IRMAOS: 40,    // px - espaco de seguranca entre ramos irmaos
  GAP_HORIZONTAL_NIVEL: 120,  // px - espaco entre colunas de profundidade
  MARGEM_CANVAS: 150          // px - margem de seguranca nas bordas do canvas total
};

/*
 * Passagem 1 (Bottom-Up): calcula a reserva vertical H_ramo de cada no,
 * percorrendo das folhas para a raiz (pos-ordem). Anexa H_propria e
 * H_ramo diretamente no no, para reuso na Passagem 2.
 *
 * Nota de engenharia: quando H_propria(pai) > soma(H_ramo(filhos)),
 * o max() garante que nenhum irmao subsequente colida verticalmente,
 * mas os filhos desse pai especifico podem nao ocupar toda a banda
 * reservada. Isso e uma simplificacao aceita nesta fase - nao gera
 * colisao, apenas distribuicao levemente desbalanceada nesse caso raro.
 */
function calcularReservaVertical(no) {
  const dimensoes = no.dimensoes;
  const hPropria = Math.max(
    dimensoes.titulo.altura,
    dimensoes.anotacao ? dimensoes.anotacao.altura : 0
  );

  if (no.filhos.length === 0) {
    no._hPropria = hPropria;
    no._hRamo = hPropria + CONST_GEOMETRIA.GAP_VERTICAL_IRMAOS;
    return no._hRamo;
  }

  const hFilhos = no.filhos.reduce((soma, filho) => soma + calcularReservaVertical(filho), 0);
  no._hPropria = hPropria;
  no._hRamo = Math.max(hPropria, hFilhos);
  return no._hRamo;
}

/*
 * calcularLargurasColunas: varre a arvore uma vez e retorna um array
 * onde o indice e a profundidade e o valor e a maior largura de
 * Unidade Composta (titulo + conector + anotacao) encontrada naquele
 * nivel hierarquico.
 */
function calcularLargurasColunas(noRaiz) {
  const larguras = [];

  function percorrer(no, profundidade) {
    const larguraAtual = no.dimensoes.unidadeComposta.larguraTotal;
    larguras[profundidade] = Math.max(larguras[profundidade] || 0, larguraAtual);
    no.filhos.forEach((filho) => percorrer(filho, profundidade + 1));
  }

  percorrer(noRaiz, 0);
  return larguras;
}

/*
 * calcularPosicoesX: converte as larguras de coluna em coordenadas X
 * absolutas de inicio de cada nivel de profundidade, aplicando o gap
 * horizontal fixo entre niveis.
 */
function calcularPosicoesX(largurasColunas) {
  const posicoesX = [0];
  for (let nivel = 1; nivel < largurasColunas.length; nivel++) {
    posicoesX[nivel] = posicoesX[nivel - 1] + largurasColunas[nivel - 1] + CONST_GEOMETRIA.GAP_HORIZONTAL_NIVEL;
  }
  return posicoesX;
}

/*
 * Passagem 2 (Top-Down): fixa a coordenada X (pela coluna de
 * profundidade) e a coordenada Y (pelo empilhamento de irmaos e
 * centralizacao do pai) de cada no. O ponto (x, y) armazenado em
 * "posicao" representa o centro vertical da lateral esquerda da
 * celula de titulo - e o ponto usado como referencia pelos conectores.
 *
 * O caso degenerado de filho unico e resolvido automaticamente pela
 * formula de centralizacao: (Y1 + Y1) / 2 = Y1.
 */
function posicionarNo(no, profundidade, topoDisponivel, posicoesX) {
  no.posicao = { x: posicoesX[profundidade], y: null };

  no.posicaoAnotacao = no.dimensoes.anotacao
    ? { x: posicoesX[profundidade] + no.dimensoes.titulo.largura + CONST_CONECTOR.LARGURA, y: null }
    : null;

  if (no.filhos.length === 0) {
    no.posicao.y = topoDisponivel + (no._hPropria / 2);
  } else {
    let cursorY = topoDisponivel;
    no.filhos.forEach((filho) => {
      posicionarNo(filho, profundidade + 1, cursorY, posicoesX);
      cursorY += filho._hRamo;
    });

    const primeiroFilho = no.filhos[0];
    const ultimoFilho = no.filhos[no.filhos.length - 1];
    no.posicao.y = (primeiroFilho.posicao.y + ultimoFilho.posicao.y) / 2;
  }

  if (no.posicaoAnotacao) {
    no.posicaoAnotacao.y = no.posicao.y;
  }
}

/*
 * calcularPontosSaidaPai: define o ponto de origem (P0) de cada
 * conector pai -> filho. Com 1 ou 2 filhos, todos saem do centro
 * vertical do pai (comportamento simples). Com 3 ou mais filhos,
 * os pontos sao distribuidos verticalmente ao longo da borda direita
 * da Unidade Composta do pai, evitando congestionamento visual das
 * curvas na saida.
 */
function calcularPontosSaidaPai(pai) {
  const alturaUnidadePai = pai._hPropria;
  const xSaida = pai.posicao.x + pai.dimensoes.unidadeComposta.larguraTotal;
  const totalFilhos = pai.filhos.length;

  if (totalFilhos < 3) {
    return pai.filhos.map(() => ({ x: xSaida, y: pai.posicao.y }));
  }

  const topoUnidade = pai.posicao.y - (alturaUnidadePai / 2);
  const passo = alturaUnidadePai / (totalFilhos + 1);

  return pai.filhos.map((_, indice) => ({
    x: xSaida,
    y: topoUnidade + (passo * (indice + 1))
  }));
}

/*
 * calcularCurvaBezier: aplica a formula de tangencia horizontal
 * definida no documento mestre (secao 4.4).
 */
function calcularCurvaBezier(p0, p3) {
  const deltaX = p3.x - p0.x;
  const p1 = { x: p0.x + (deltaX / 2), y: p0.y };
  const p2 = { x: p3.x - (deltaX / 2), y: p3.y };
  return { p0, p1, p2, p3 };
}

/*
 * calcularConectorAnotacao: traco horizontal simples entre a lateral
 * direita do titulo e a lateral esquerda da anotacao. Como ambos
 * compartilham o mesmo centro vertical (posicao.y === posicaoAnotacao.y),
 * o traco resultante e sempre perfeitamente horizontal.
 */
function calcularConectorAnotacao(no) {
  if (!no.dimensoes.anotacao) {
    return null;
  }

  return {
    x1: no.posicao.x + no.dimensoes.titulo.largura,
    y1: no.posicao.y,
    x2: no.posicaoAnotacao.x,
    y2: no.posicaoAnotacao.y
  };
}

/*
 * calcularConectores: percorre a arvore ja posicionada e anexa, em
 * cada no, a lista de curvas para os filhos diretos e o conector
 * simples para a anotacao lateral, se existir.
 */
function calcularConectores(no) {
  if (no.filhos.length > 0) {
    const pontosSaida = calcularPontosSaidaPai(no);

    no.conectoresFilhos = no.filhos.map((filho, indice) => {
      const p0 = pontosSaida[indice];
      const p3 = { x: filho.posicao.x, y: filho.posicao.y };
      return {
        filhoTitulo: filho.titulo,
        curva: calcularCurvaBezier(p0, p3)
      };
    });

    no.filhos.forEach(calcularConectores);
  } else {
    no.conectoresFilhos = [];
  }

  no.conectorAnotacao = calcularConectorAnotacao(no);
}

/*
 * calcularDimensoesCanvas: varre a arvore posicionada para obter os
 * extremos X e Y ocupados e soma a margem de seguranca do canvas.
 */
function calcularDimensoesCanvas(noRaiz) {
  let maxX = 0;
  let maxY = 0;

  function percorrer(no) {
    const xFinalNo = no.posicao.x + no.dimensoes.unidadeComposta.larguraTotal;
    const yFinalNo = no.posicao.y + (no._hPropria / 2);

    maxX = Math.max(maxX, xFinalNo);
    maxY = Math.max(maxY, yFinalNo);

    no.filhos.forEach(percorrer);
  }

  percorrer(noRaiz);

  return {
    larguraTotal: maxX + CONST_GEOMETRIA.MARGEM_CANVAS,
    alturaTotal: maxY + CONST_GEOMETRIA.MARGEM_CANVAS
  };
}

/*
 * calcularCoordenadas: orquestra as duas passagens do motor geometrico
 * e anexa canvasDimensoes na raiz. Muta a arvore recebida (assim como
 * enriquecerArvoreComDimensoes, na Fase 2) e retorna a mesma referencia
 * para uso direto em app.js.
 */
function calcularCoordenadas(noRaiz) {
  calcularReservaVertical(noRaiz);

  const largurasColunas = calcularLargurasColunas(noRaiz);
  const posicoesX = calcularPosicoesX(largurasColunas);

  posicionarNo(noRaiz, 0, 0, posicoesX);
  calcularConectores(noRaiz);

  noRaiz.canvasDimensoes = calcularDimensoesCanvas(noRaiz);

  return noRaiz;
}
