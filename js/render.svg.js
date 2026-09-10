/*
 * render.svg.js
 * Responsabilidade final (Fase 4 - ainda nao implementada):
 * Desenhar nos, pautas e curvas de Bezier dentro do elemento <svg>.
 *
 * Nesta Fase 1, este arquivo expoe apenas a funcao de debug textual,
 * usada para validar visualmente o resultado do parser/validador
 * (js/app.js) antes de existir motor geometrico.
 */

function renderDebugTextual(noRaiz, elementoDestino) {
  const linhas = [];

  function percorrer(no, profundidade) {
    const indentacao = '  '.repeat(profundidade);
    let linha = `${indentacao}- ${no.titulo}`;

    if (no.anotacao) {
      if (no.anotacao.tipo === 'ilustracao') {
        linha += ` [ilustracao/${no.anotacao.formato}, altura=${no.anotacao.alturaCustomizada}px]`;
      } else if (no.anotacao.linhasManuais) {
        linha += ` [pauta/${no.anotacao.formato}, linhas_manuais=${no.anotacao.linhasManuais}]`;
      } else {
        linha += ` [pauta/${no.anotacao.formato}, palavras_estimadas=${no.anotacao.palavrasEstimadas}]`;
      }
    }

    linhas.push(linha);
    no.filhos.forEach((filho) => percorrer(filho, profundidade + 1));
  }

  percorrer(noRaiz, 0);
  elementoDestino.textContent = linhas.join('\n');
}

function renderizarArvoreSVG(coordenadas, elementoSVG) {
  throw new Error('renderizarArvoreSVG ainda nao implementado (Fase 4).');
}
