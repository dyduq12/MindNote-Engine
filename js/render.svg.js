/*
 * render.svg.js
 * Responsabilidade final (Fase 4 - ainda nao implementada):
 * Desenhar nos, pautas e curvas de Bezier dentro do elemento <svg>.
 *
 * Ate a Fase 3, este arquivo expoe a funcao de debug textual, usada
 * para auditar o resultado do parser (Fase 1), das dimensoes (Fase 2)
 * e agora das coordenadas absolutas e reserva vertical (Fase 3),
 * antes de existir renderizacao visual real.
 */

function formatarDimensoesDebug(no) {
  if (!no.dimensoes) {
    return '';
  }

  const t = no.dimensoes.titulo;
  const pluralTitulo = t.linhasQuebradas > 1 ? 'linhas' : 'linha';
  let texto = ` [Titulo: ${t.largura}x${t.altura}px (${t.linhasQuebradas} ${pluralTitulo})`;

  const a = no.dimensoes.anotacao;
  if (a) {
    if (a.tipo === 'ilustracao') {
      texto += ` | Ilustracao(${a.formato}): ${a.largura}x${a.altura}px]`;
    } else {
      const pluralAnotacao = a.linhasFinais > 1 ? 'linhas' : 'linha';
      texto += ` | Anotacao(${a.formato}): ${a.largura}x${a.altura}px (${a.linhasFinais} ${pluralAnotacao})]`;
    }
  } else {
    texto += ']';
  }

  return texto;
}

function formatarPosicaoDebug(no) {
  if (!no.posicao) {
    return '';
  }

  const x = Math.round(no.posicao.x);
  const y = Math.round(no.posicao.y);
  const hRamo = Math.round(no._hRamo);

  return ` [Posicao: (X=${x}, Y=${y}) | Ramo H: ${hRamo}px]`;
}

function renderDebugTextual(noRaiz, elementoDestino) {
  const linhas = [];

  if (noRaiz.canvasDimensoes) {
    const largura = Math.round(noRaiz.canvasDimensoes.larguraTotal);
    const altura = Math.round(noRaiz.canvasDimensoes.alturaTotal);
    linhas.push(`Canvas Total: ${largura}x${altura}px`);
    linhas.push('');
  }

  function percorrer(no, profundidade) {
    const indentacao = '  '.repeat(profundidade);
    const linha = `${indentacao}- ${no.titulo}${formatarDimensoesDebug(no)}${formatarPosicaoDebug(no)}`;
    linhas.push(linha);
    no.filhos.forEach((filho) => percorrer(filho, profundidade + 1));
  }

  percorrer(noRaiz, 0);
  elementoDestino.textContent = linhas.join('\n');
}

function renderizarArvoreSVG(coordenadas, elementoSVG) {
  throw new Error('renderizarArvoreSVG ainda nao implementado (Fase 4).');
}
