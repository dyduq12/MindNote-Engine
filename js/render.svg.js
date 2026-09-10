/*
 * render.svg.js
 * Responsabilidade final (Fase 4 - ainda nao implementada):
 * Desenhar nos, pautas e curvas de Bezier dentro do elemento <svg>.
 *
 * Ate a Fase 3, este arquivo expoe a funcao de debug textual, usada
 * para auditar o resultado do parser/validador (Fase 1) e, a partir
 * da Fase 2, tambem as dimensoes matematicas calculadas para cada no
 * (titulo e anotacao), antes de existir motor geometrico de posicionamento.
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

function renderDebugTextual(noRaiz, elementoDestino) {
  const linhas = [];

  function percorrer(no, profundidade) {
    const indentacao = '  '.repeat(profundidade);
    const linha = `${indentacao}- ${no.titulo}${formatarDimensoesDebug(no)}`;
    linhas.push(linha);
    no.filhos.forEach((filho) => percorrer(filho, profundidade + 1));
  }

  percorrer(noRaiz, 0);
  elementoDestino.textContent = linhas.join('\n');
}

function renderizarArvoreSVG(coordenadas, elementoSVG) {
  throw new Error('renderizarArvoreSVG ainda nao implementado (Fase 4).');
}
