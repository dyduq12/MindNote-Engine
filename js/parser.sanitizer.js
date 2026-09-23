/*
 * js/parser.sanitizer.js — Fase 1 (v2.0)
 *
 * Responsabilidade: limpar texto colado (potencialmente "sujo", com
 * introducoes de IA, blocos ```json, ou multiplos mapas concatenados)
 * ANTES de chegar ao JSON.parse.
 *
 * Este modulo NAO toca em nenhuma linha de engine.geometry.js,
 * engine.text.js, render.svg.js ou render.pdf.js. Ele apenas produz uma
 * string JSON candidata (ou uma lista de candidatas) a partir do texto
 * bruto colado pelo usuario.
 *
 * Contrato de saida de `sanitizarEntradaJSON(textoBruto)`:
 *   { status: "vazio" }
 *     → nenhum bloco JSON foi encontrado no texto.
 *   { status: "unico", jsonTexto: string }
 *     → exatamente um bloco JSON valido foi encontrado; pronto para
 *       JSON.parse.
 *   { status: "multiplo", candidatos: [{ jsonTexto, titulo }, ...] }
 *     → mais de um bloco JSON valido foi encontrado; a UI deve exibir
 *       um modal de escolha usando `titulo` como rotulo.
 */

const ParserSanitizer = (() => {
  // ─── Passo 1: extracao de blocos ```json ... ``` ────────────────────────
  function extrairBlocosFenced(textoBruto) {
    const regex = /```(?:json)?\s*([\s\S]*?)```/gi;
    const blocos = [];
    let match;
    while ((match = regex.exec(textoBruto)) !== null) {
      const conteudo = match[1].trim();
      if (conteudo) blocos.push(conteudo);
    }
    return blocos;
  }

  // ─── Passo 2: varredura posicional estrita (sem markdown fence) ─────────
  // Localiza TODOS os blocos JSON de nivel superior (objetos `{...}` ou
  // listas `[...]`) presentes no texto, ignorando qualquer prosa antes,
  // entre ou depois deles. Respeita strings (aspas, escapes) para nao
  // contar chaves/colchetes que estejam dentro de um valor de texto.
  function localizarBlocosPorVarredura(textoBruto) {
    const blocos = [];
    const tamanho = textoBruto.length;
    let i = 0;

    while (i < tamanho) {
      const charAtual = textoBruto[i];

      if (charAtual === "{" || charAtual === "[") {
        const abertura = charAtual;
        const fechamento = abertura === "{" ? "}" : "]";
        let profundidade = 0;
        let dentroDeString = false;
        let escapando = false;
        let fimIndice = -1;

        for (let j = i; j < tamanho; j++) {
          const c = textoBruto[j];

          if (dentroDeString) {
            if (escapando) {
              escapando = false;
            } else if (c === "\\") {
              escapando = true;
            } else if (c === '"') {
              dentroDeString = false;
            }
            continue;
          }

          if (c === '"') {
            dentroDeString = true;
            continue;
          }

          if (c === abertura) profundidade++;
          else if (c === fechamento) {
            profundidade--;
            if (profundidade === 0) {
              fimIndice = j;
              break;
            }
          }
        }

        if (fimIndice !== -1) {
          blocos.push(textoBruto.slice(i, fimIndice + 1));
          i = fimIndice + 1;
          continue;
        }
      }

      i++;
    }

    return blocos;
  }

  // ─── Passo 3: validacao e extracao de titulo de um candidato ────────────
  // Retorna null se o candidato nao for um JSON valido segundo o contrato
  // do MindNote Engine (objeto com "titulo" string, ou lista de objetos
  // assim). Nao lanca excecao — apenas descarta candidatos invalidos.
  function validarCandidato(jsonTexto) {
    let dados;
    try {
      dados = JSON.parse(jsonTexto);
    } catch {
      return null;
    }

    const raizes = Array.isArray(dados) ? dados : [dados];
    if (raizes.length === 0) return null;

    const primeiraRaiz = raizes[0];
    if (
      !primeiraRaiz ||
      typeof primeiraRaiz !== "object" ||
      typeof primeiraRaiz.titulo !== "string" ||
      primeiraRaiz.titulo.trim() === ""
    ) {
      return null;
    }

    const titulo =
      raizes.length > 1
        ? `${primeiraRaiz.titulo.trim()} (+${raizes.length - 1} outra${
            raizes.length - 1 > 1 ? "s" : ""
          })`
        : primeiraRaiz.titulo.trim();

    return { jsonTexto, titulo };
  }

  // ─── Ponto de entrada principal ──────────────────────────────────────────
  function sanitizarEntradaJSON(textoBruto) {
    if (typeof textoBruto !== "string" || textoBruto.trim() === "") {
      return { status: "vazio" };
    }

    // Prioridade 1: blocos delimitados por ```json ... ```
    let brutos = extrairBlocosFenced(textoBruto);

    // Prioridade 2: se nao houver blocos fenced, varre o texto inteiro
    // procurando blocos JSON balanceados de nivel superior.
    if (brutos.length === 0) {
      brutos = localizarBlocosPorVarredura(textoBruto);
    }

    if (brutos.length === 0) {
      return { status: "vazio" };
    }

    const candidatosValidos = brutos
      .map(validarCandidato)
      .filter((c) => c !== null);

    if (candidatosValidos.length === 0) {
      // Nenhum candidato passou a validacao de contrato — repassa o
      // primeiro bloco bruto encontrado para que o diagnostico de erro
      // (parser.diagnostics.js) possa apontar exatamente o problema de
      // sintaxe ao usuario, em vez de falhar silenciosamente.
      return { status: "unico", jsonTexto: brutos[0] };
    }

    if (candidatosValidos.length === 1) {
      return { status: "unico", jsonTexto: candidatosValidos[0].jsonTexto };
    }

    return { status: "multiplo", candidatos: candidatosValidos };
  }

  return { sanitizarEntradaJSON };
})();

// Exposicao global no mesmo padrao de MindNoteApp, sem interferir nele.
window.ParserSanitizer = ParserSanitizer;
