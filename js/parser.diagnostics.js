/*
 * js/parser.diagnostics.js — Fase 1 (v2.0)
 *
 * Responsabilidade: quando o JSON.parse falha, traduzir a mensagem de erro
 * nativa (ex.: "Unexpected token } in JSON at position 214") em um
 * diagnostico visual util: numero da linha exata, 3 linhas antes, 3 linhas
 * depois, e a linha com erro destacada com o marcador ">>> [Linha N]:".
 *
 * Este modulo NAO toca em nenhuma linha dos motores congelados. Ele apenas
 * gera texto/HTML de diagnostico a partir de uma string e de um objeto
 * Error produzido pelo JSON.parse nativo.
 */

const ParserDiagnostics = (() => {
  const JANELA_LINHAS = 3;

  // ─── Extrai a posicao (indice de caractere) da mensagem de erro do V8 ───
  // Mensagens tipicas: "Unexpected token } in JSON at position 214"
  //                     "Unexpected end of JSON input"
  function extrairPosicaoDoErro(mensagemErro) {
    const match = /position (\d+)/i.exec(mensagemErro || "");
    return match ? Number(match[1]) : null;
  }

  // ─── Converte indice de caractere → {linha, coluna} (1-based) ───────────
  function calcularLinhaColuna(textoOriginal, posicao) {
    const textoAteAqui = textoOriginal.slice(0, posicao);
    const linhas = textoAteAqui.split("\n");
    const linha = linhas.length;
    const coluna = linhas[linhas.length - 1].length + 1;
    return { linha, coluna };
  }

  // ─── Monta a estrutura de contexto: linhas antes/depois + marcador ──────
  function gerarSnippetContexto(textoOriginal, linhaComErro) {
    const todasLinhas = textoOriginal.split("\n");
    const totalLinhas = todasLinhas.length;

    const inicio = Math.max(1, linhaComErro - JANELA_LINHAS);
    const fim = Math.min(totalLinhas, linhaComErro + JANELA_LINHAS);

    const linhasContexto = [];
    for (let n = inicio; n <= fim; n++) {
      linhasContexto.push({
        numero: n,
        conteudo: todasLinhas[n - 1] ?? "",
        ehLinhaComErro: n === linhaComErro,
      });
    }

    return { linhasContexto, totalLinhas, linhaComErro };
  }

  // ─── Escape seguro para injecao em innerHTML ─────────────────────────────
  function escaparHTML(texto) {
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ─── Formato texto puro (para <pre>#area-erro / textContent) ────────────
  function formatarSnippetTexto(snippet) {
    return snippet.linhasContexto
      .map((l) => {
        const prefixo = l.ehLinhaComErro
          ? `>>> [Linha ${l.numero}]: `
          : `    [Linha ${l.numero}]: `;
        return `${prefixo}${l.conteudo}`;
      })
      .join("\n");
  }

  // ─── Formato HTML (para injecao visual com tarja vermelha) ───────────────
  function formatarSnippetHTML(snippet) {
    const linhasHTML = snippet.linhasContexto
      .map((l) => {
        const conteudoEscapado = escaparHTML(l.conteudo);
        if (l.ehLinhaComErro) {
          return (
            `<div class="diagnostico-linha diagnostico-linha-erro">` +
            `<span class="diagnostico-marcador">&gt;&gt;&gt; [Linha ${l.numero}]:</span> ` +
            `<span class="diagnostico-conteudo">${conteudoEscapado}</span>` +
            `</div>`
          );
        }
        return (
          `<div class="diagnostico-linha">` +
          `<span class="diagnostico-marcador">    [Linha ${l.numero}]:</span> ` +
          `<span class="diagnostico-conteudo">${conteudoEscapado}</span>` +
          `</div>`
        );
      })
      .join("");

    return `<div class="diagnostico-snippet">${linhasHTML}</div>`;
  }

  // ─── Ponto de entrada principal ──────────────────────────────────────────
  // Recebe o texto original colado e o objeto Error lancado pelo
  // JSON.parse (ou por sanitizarEntradaJSON). Retorna null se a mensagem
  // de erro nao contiver informacao de posicao (ex.: "Unexpected end of
  // JSON input" nao traz posicao em todos os engines) — nesse caso a UI
  // deve cair no fallback de erro.message simples.
  function diagnosticarErroJSON(textoOriginal, erro) {
    const mensagemErro = erro?.message || "";
    const posicao = extrairPosicaoDoErro(mensagemErro);

    if (posicao === null || typeof textoOriginal !== "string") {
      return null;
    }

    const posicaoSegura = Math.min(posicao, textoOriginal.length);
    const { linha } = calcularLinhaColuna(textoOriginal, posicaoSegura);
    const snippet = gerarSnippetContexto(textoOriginal, linha);

    return {
      linha,
      mensagemOriginal: mensagemErro,
      textoSnippet: formatarSnippetTexto(snippet),
      htmlSnippet: formatarSnippetHTML(snippet),
    };
  }

  return { diagnosticarErroJSON, calcularLinhaColuna, gerarSnippetContexto };
})();

// Exposicao global no mesmo padrao de MindNoteApp, sem interferir nele.
window.ParserDiagnostics = ParserDiagnostics;
