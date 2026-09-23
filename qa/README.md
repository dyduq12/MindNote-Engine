# QA — Rede de Seguranca de Regressao (Fase 0)

Este diretorio existe para garantir que a evolucao para a v2.0 nunca regrida o
motor matematico congelado: `engine.geometry.js`, `engine.text.js`,
`render.svg.js` e `render.pdf.js` (validados no commit `81b5761`).

## Arquivos

- `fixture-referencia.json` — mapa de teste fixo, cobrindo:
  - no raiz com multiplos filhos;
  - anotacao pautada de 4 linhas (`linhas_manuais: 4`);
  - anotacao pautada de 5 linhas com anexo de ilustracao (`linhas_manuais: 5` + `anexo.altura`);
  - subno sem anotacao (caso degenerado de centralizacao);
  - subno com `cor` de ramo definida (testa curvas Bezier coloridas);
  - no apenas com ilustracao, sem pauta de linhas (`tipo: "ilustracao"`);
  - no-folha sem anotacao e sem filhos.

## Como gerar o baseline numerico (fazer uma unica vez, contra o commit 81b5761)

1. Abra o MindNote Engine na branch `main`, no commit `81b5761` (antes de
   qualquer mudanca da v2.0).
2. Cole o conteudo de `fixture-referencia.json` no campo `#entrada-json`.
3. Clique em "Processar Arvore".
4. Abra o DevTools e, no console, execute:
   ```js
   console.log(JSON.stringify(arvoresAtuais[0].posicao));
   console.log(JSON.stringify(arvoresAtuais[0].canvasDimensoes));
   ```
   Anote os valores de `x`, `y` do no raiz e as dimensoes totais do canvas.
5. Clique em "Exportar para StarNotes (PDF)" e salve o arquivo gerado como
   `baseline-commit-81b5761.pdf` dentro desta pasta (fora do controle de
   versao, ou versionado se o time preferir auditoria completa).
6. Abra o SVG renderizado (botao direito > Inspecionar > copiar o `outerHTML`
   do elemento `#svg-mapa`) e salve como `baseline-commit-81b5761.svg`.

## Como validar cada fase da v2.0 contra o baseline

Apos QUALQUER fase da v2.0 (Fase 1, Fase 2, ...), repita os passos 2 a 6 e
compare:

- `posicao.x` e `posicao.y` do no raiz devem ser **identicos**, casa decimal
  por casa decimal.
- `canvasDimensoes.larguraTotal` e `alturaTotal` devem ser **identicos**.
- O `outerHTML` do SVG deve ser identico em todos os atributos numericos
  (`d`, `x`, `y`, `width`, `height`, `viewBox`).
- O PDF exportado deve ter exatamente as mesmas dimensoes de pagina em px.

Qualquer divergencia nesses valores indica regressao no motor matematico e
bloqueia o merge daquela fase, independentemente de quao pequena pareca a
mudanca de codigo introduzida.

## Escopo desta pasta

Esta pasta e puramente de apoio a QA. Nenhum arquivo aqui e importado pela
aplicacao em tempo de execucao.
