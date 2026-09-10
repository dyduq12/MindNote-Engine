/*
 * app.js
 * Orquestracao geral e Fase 1: Parser e Validacao do contrato JSON.
 *
 * Regras de validacao aplicadas (ver documento mestre, secao 3.1,
 * e revisao critica do motor, Passo 4):
 * - "titulo" e obrigatorio em todo no.
 * - "filhos" ausente ou vazio e tratado como no folha.
 * - anotacao.tipo "ilustracao" usa SEMPRE altura_customizada
 *   (nunca entra no calculo por palavras/linhas).
 * - anotacao.linhas_manuais, quando definido e > 0, tem
 *   precedencia ABSOLUTA sobre palavras_estimadas.
 * - palavras_estimadas tem piso minimo de seguranca de 8,
 *   conforme o prompt mestre do NotebookLM.
 */

function normalizarAnotacao(anotacao) {
  if (!anotacao) {
    return null;
  }

  const tipo = anotacao.tipo === 'ilustracao' ? 'ilustracao' : 'pauta';
  const formato = anotacao.formato === 'alongado' ? 'alongado' : 'quadrado';

  if (tipo === 'ilustracao') {
    const alturaValida = typeof anotacao.altura_customizada === 'number' && anotacao.altura_customizada > 0;
    return {
      tipo,
      formato,
      alturaCustomizada: alturaValida ? anotacao.altura_customizada : 400,
      linhasManuais: null,
      palavrasEstimadas: null
    };
  }

  const temLinhasManuais = typeof anotacao.linhas_manuais === 'number' && anotacao.linhas_manuais > 0;
  if (temLinhasManuais) {
    return {
      tipo,
      formato,
      alturaCustomizada: null,
      linhasManuais: Math.max(3, anotacao.linhas_manuais),
      palavrasEstimadas: null
    };
  }

  const palavrasValidas = typeof anotacao.palavras_estimadas === 'number' && anotacao.palavras_estimadas >= 8;
  return {
    tipo,
    formato,
    alturaCustomizada: null,
    linhasManuais: null,
    palavrasEstimadas: palavrasValidas ? anotacao.palavras_estimadas : 8
  };
}

function validarNo(no, profundidade) {
  if (!no || typeof no.titulo !== 'string' || no.titulo.trim() === '') {
    throw new Error(`No invalido na profundidade ${profundidade}: campo "titulo" ausente ou vazio.`);
  }

  return {
    titulo: no.titulo.trim(),
    anotacao: normalizarAnotacao(no.anotacao),
    filhos: Array.isArray(no.filhos) ? no.filhos.map((filho) => validarNo(filho, profundidade + 1)) : []
  };
}

function processarJSON(textoBruto) {
  let dadosBrutos;
  try {
    dadosBrutos = JSON.parse(textoBruto);
  } catch (erro) {
    throw new Error('JSON invalido: ' + erro.message);
  }
  return validarNo(dadosBrutos, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('entrada-json');
  const botaoProcessar = document.getElementById('botao-processar');
  const areaDebug = document.getElementById('area-debug');
  const areaErro = document.getElementById('area-erro');

  botaoProcessar.addEventListener('click', () => {
    areaErro.textContent = '';
    areaDebug.textContent = '';

    try {
      const arvoreValidada = processarJSON(textarea.value);
      renderDebugTextual(arvoreValidada, areaDebug);
    } catch (erro) {
      areaErro.textContent = erro.message;
    }
  });
});
