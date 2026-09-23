/*
 * render.pdf.js — Etapa 6.1: scaffold do exportador PDF contínuo
 *
 * Responsabilidade: Iterar as coordenadas calculadas pelo motor geométrico e
 * chamar diretamente as primitivas vetoriais do jsPDF (roundedRect, line,
 * bezierCurve), sem rasterização e sem fatiamento em páginas A4.
 *
 * Esta etapa inicializa o documento panorâmico e valida o canvas gerado.
 * O desenho vetorial completo será implementado nas etapas 6.2 e 6.3.
 */

// ─── Constantes físicas sagradas (espelham engine.text.js — NÃO alterar) ────
const PDF_CAIXA_LARGURA      = 420;   // px — largura única da caixa de anotação
const PDF_ENTRELINHA         = 26;    // px — escala de entrelinha calibrada
const PDF_PADDING_VERTICAL   = 16;    // px
const PDF_PADDING_HORIZONTAL = 20;    // px
const PDF_MARGEM_CANVAS      = 150;   // px

// ─── Cor de fundo neutra para escrita (usada quando tema é escuro) ───────────
const COR_FUNDO_ESCRITA = '#F9FAFB';
const COR_FUNDO_CLARO   = '#F3F4F6';

// ─── Utilitário: hex → [r, g, b] (0-255) ─────────────────────────────────────
function hexParaRGB(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─── Extrai o título da raiz principal para nomear o arquivo ─────────────────
function obterNomeArquivo(arvores) {
  const titulo = arvores?.[0]?.titulo ?? 'MindNote';
  // Sanitiza: remove caracteres inválidos em nomes de arquivo
  const sanitizado = titulo
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `MindNote-${sanitizado || 'Mapa'}.pdf`;
}

// ─── Motor principal de exportação PDF contínuo ───────────────────────────────
function exportarPDFContinuo(arvores) {
  // 1. Verificação da biblioteca jsPDF
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    throw new Error(
      'Biblioteca jsPDF não encontrada. ' +
      'Verifique se o arquivo js/vendor/jspdf.umd.min.js está presente e foi carregado corretamente.'
    );
  }
  const { jsPDF } = window.jspdf;

  // 2. Extração das dimensões totais do canvas
  const dims = arvores[0].canvasDimensoes;
  if (!dims || !dims.larguraTotal || !dims.alturaTotal) {
    throw new Error(
      'Dimensões do canvas ausentes. Certifique-se de que a árvore foi processada antes de exportar.'
    );
  }
  const { larguraTotal, alturaTotal } = dims;

  // 3. Inicialização do documento panorâmico contínuo
  //    • unit: 'px' — trabalha diretamente nas coordenadas do motor geométrico
  //    • format: [largura, altura] — página única do tamanho exato do canvas
  //    • hotfixes: ['px_scaling'] — corrige fator de escala do jsPDF em unidade px
  const doc = new jsPDF({
    orientation: larguraTotal >= alturaTotal ? 'landscape' : 'portrait',
    unit: 'px',
    format: [larguraTotal, alturaTotal],
    hotfixes: ['px_scaling'],
  });

  // 4. Fundo do documento
  //    Sempre usa fundo neutro claro (StarNotes é uma app de escrita manual —
  //    fundo escuro é apenas para ergonomia de tela, não para o papel digital).
  const [r, g, b] = hexParaRGB(COR_FUNDO_ESCRITA);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, larguraTotal, alturaTotal, 'F');

  // ── Etapas 6.2 e 6.3 vão inserir aqui:
  //    desenharConectores(doc, arvores);
  //    desenharNos(doc, arvores);
  //    desenharCaixasAnotacao(doc, arvores);

  // 5. Salva o arquivo para validar a integridade do canvas gerado
  const nomeArquivo = obterNomeArquivo(arvores);
  doc.save(nomeArquivo);
}
