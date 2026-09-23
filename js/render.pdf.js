/*
 * render.pdf.js — Etapa 6.2: renderização vetorial 1:1 no PDF
 *
 * Pipeline de três passagens (mesma ordem do render.svg.js):
 *   Passagem 1 — Conectores (ficam atrás dos nós)
 *   Passagem 2 — Pílulas de título
 *   Passagem 3 — Caixas de anotação e anexos
 *
 * Coordenadas usadas diretamente do motor geométrico (engine.geometry.js).
 * Nenhuma transformação de escala é aplicada — mapeamento 1 px canvas = 1 px PDF.
 */

// ─── Constantes físicas sagradas (espelham engine.text.js — NÃO alterar) ────
const PDF_CAIXA_LARGURA      = 420;   // px — largura única da caixa de anotação
const PDF_ENTRELINHA         = 26;    // px — escala de entrelinha calibrada
const PDF_PADDING_VERTICAL   = 16;    // px
const PDF_PADDING_HORIZONTAL = 20;    // px
const PDF_MARGEM_CANVAS      = 150;   // px

// ─── Cor de fundo neutra para escrita ────────────────────────────────────────
const COR_FUNDO_ESCRITA = '#F9FAFB';

// ─── Utilitário: hex '#RRGGBB' → [r, g, b] (0–255) ──────────────────────────
function hexParaRGB(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─── Utilitário: aplica setDrawColor aceitando string hex ────────────────────
function setDraw(doc, hex) {
  const [r, g, b] = hexParaRGB(hex);
  doc.setDrawColor(r, g, b);
}
function setFill(doc, hex) {
  const [r, g, b] = hexParaRGB(hex);
  doc.setFillColor(r, g, b);
}
function setTxt(doc, hex) {
  const [r, g, b] = hexParaRGB(hex);
  doc.setTextColor(r, g, b);
}

// ─── Iterador recursivo de árvore (espelha render.svg.js) ────────────────────
function percorrerArvorePDF(no, cb) {
  cb(no);
  no.filhos.forEach(f => percorrerArvorePDF(f, cb));
}

// ─── Extrai nome de arquivo a partir do título da raiz ───────────────────────
function obterNomeArquivo(arvores) {
  const titulo = arvores?.[0]?.titulo ?? 'MindNote';
  const sanitizado = titulo
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `MindNote-${sanitizado || 'Mapa'}.pdf`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 1 — Conectores
// ═══════════════════════════════════════════════════════════════════════════════
function desenharConectores(doc, arvores) {
  // Estilo padrão para curvas Bézier pai → filhos
  setDraw(doc, '#9CA3AF');
  doc.setLineWidth(2.5);
  doc.setLineCap('round');
  doc.setLineDashPattern([], 0);   // sólido

  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    // ── Curvas cúbicas pai → filhos ──────────────────────────────────────────
    if (Array.isArray(no.conectoresFilhos)) {
      no.conectoresFilhos.forEach(k => {
        const c = k.curva;
        if (!c) return;

        // Cor do conector: usa no.cor se definida, senão cinza padrão
        const corConector = no.cor || '#9CA3AF';
        setDraw(doc, corConector);

        // jsPDF doc.lines() recebe deslocamentos RELATIVOS à origem (p0)
        const dx1 = c.p1.x - c.p0.x,  dy1 = c.p1.y - c.p0.y;
        const dx2 = c.p2.x - c.p0.x,  dy2 = c.p2.y - c.p0.y;
        const dx3 = c.p3.x - c.p0.x,  dy3 = c.p3.y - c.p0.y;
        doc.lines(
          [[dx1, dy1, dx2, dy2, dx3, dy3]],
          c.p0.x, c.p0.y,
          [1, 1],   // escala (1:1 — sem transformação)
          'S'       // stroke only
        );
      });
    }

    // Restaura cor padrão após cada nó colorido
    setDraw(doc, '#9CA3AF');

    // ── Conector título → caixa de anotação (linha reta sólida) ─────────────
    if (no.conectorAnotacao) {
      const l = no.conectorAnotacao;
      doc.setLineWidth(2);
      doc.line(l.x1, l.y1, l.x2, l.y2);
      doc.setLineWidth(2.5);   // restaura espessura padrão
    }

    // ── Conector caixa de anotação → caixa de anexo (linha reta sólida) ─────
    if (no.conectorAnexo) {
      const l = no.conectorAnexo;
      doc.setLineWidth(2);
      doc.line(l.x1, l.y1, l.x2, l.y2);
      doc.setLineWidth(2.5);
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 2 — Pílulas de título
// ═══════════════════════════════════════════════════════════════════════════════
function desenharPilulas(doc, arvores) {
  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    const dT = no.dimensoes?.titulo;
    if (!dT) return;

    const px = no.posicao.x;
    const py = no.posicao.y;
    const x  = px;
    const y  = py - dT.altura / 2;

    // ── Fundo e borda da pílula ───────────────────────────────────────────────
    setFill(doc, '#FFFFFF');
    setDraw(doc, no.cor || '#374151');
    doc.setLineWidth(no.cor ? 2.5 : 2);
    doc.setLineDashPattern([], 0);
    doc.roundedRect(x, y, dT.largura, dT.altura, 8, 8, 'FD');

    // ── Texto centralizado ────────────────────────────────────────────────────
    setTxt(doc, '#111827');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);

    const linhas = dT.linhasTexto || [no.titulo];
    const totalLinhas = linhas.length;
    // Espaçamento vertical: 16px entre linhas, bloco centralizado na pílula
    const espacamento = 16;
    const alturaBloco = (totalLinhas - 1) * espacamento;
    const yInicial    = py - alturaBloco / 2;
    const xCentro     = px + dT.largura / 2;

    linhas.forEach((linha, i) => {
      doc.text(linha, xCentro, yInicial + i * espacamento, {
        align: 'center',
        baseline: 'middle',
      });
    });
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 3 — Caixas de anotação e anexos
// ═══════════════════════════════════════════════════════════════════════════════
function desenharCaixas(doc, arvores) {
  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    const dA = no.dimensoes?.anotacao;
    if (!dA) return;

    // ── 3a. Caixa de anotação principal ──────────────────────────────────────
    const xA = no.posicaoAnotacao.x;
    const yA = no.posicaoAnotacao.y - dA.altura / 2;

    if (dA.tipo === 'pauta') {
      // Contorno tracejado
      setFill(doc, '#FCFCFD');
      setDraw(doc, '#9CA3AF');
      doc.setLineWidth(1.5);
      doc.setLineDashPattern([4, 4], 0);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'FD');
      doc.setLineDashPattern([], 0);   // restaura traço sólido

      // Linhas de pauta internas
      setDraw(doc, '#D1D5DB');
      doc.setLineWidth(1);
      const pv = dA.paddingVertical   || PDF_PADDING_VERTICAL;
      const ph = dA.paddingHorizontal || PDF_PADDING_HORIZONTAL;
      const step = dA.entrelinha || PDF_ENTRELINHA;
      for (let i = 1; i <= (dA.linhasFinais || 0); i++) {
        const ly = yA + pv + i * step;
        if (ly <= yA + dA.altura - pv) {
          doc.line(xA + ph, ly, xA + dA.largura - ph, ly);
        }
      }

    } else {
      // tipo === 'ilustracao'
      setFill(doc, '#FCFCFD');
      setDraw(doc, '#6B7280');
      doc.setLineWidth(2);
      doc.setLineDashPattern([], 0);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'FD');
    }

    // ── 3b. Caixa de anexo (se existir) ──────────────────────────────────────
    const dAnexo = dA.anexo;
    if (dAnexo && no.posicaoAnexo) {
      const xAn = no.posicaoAnexo.x;
      const yAn = no.posicaoAnexo.y - dAnexo.altura / 2;
      setFill(doc, '#FCFCFD');
      setDraw(doc, '#6B7280');
      doc.setLineWidth(2);
      doc.setLineDashPattern([], 0);
      doc.roundedRect(xAn, yAn, dAnexo.largura, dAnexo.altura, 6, 6, 'FD');
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
function exportarPDFContinuo(arvores) {
  // 1. Guard da biblioteca
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    throw new Error(
      'Biblioteca jsPDF não encontrada. ' +
      'Verifique se js/vendor/jspdf.umd.min.js está presente e carregado.'
    );
  }
  const { jsPDF } = window.jspdf;

  // 2. Dimensões do canvas
  const dims = arvores[0].canvasDimensoes;
  if (!dims || !dims.larguraTotal || !dims.alturaTotal) {
    throw new Error(
      'Dimensões do canvas ausentes. Processe a árvore antes de exportar.'
    );
  }
  const { larguraTotal, alturaTotal } = dims;

  // 3. Inicialização do documento panorâmico contínuo
  const doc = new jsPDF({
    orientation: larguraTotal >= alturaTotal ? 'landscape' : 'portrait',
    unit: 'px',
    format: [larguraTotal, alturaTotal],
    hotfixes: ['px_scaling'],
  });

  // 4. Fundo neutro claro (escrita manual — não depende do tema da UI)
  const [r, g, b] = hexParaRGB(COR_FUNDO_ESCRITA);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, larguraTotal, alturaTotal, 'F');

  // 5. Três passagens de renderização vetorial (mesma ordem do SVG)
  desenharConectores(doc, arvores);   // Passagem 1: atrás dos nós
  desenharCaixas(doc, arvores);       // Passagem 3 antes da 2: caixas ficam abaixo das pílulas
  desenharPilulas(doc, arvores);      // Passagem 2: pílulas no topo

  // 6. Download
  doc.save(obterNomeArquivo(arvores));
}
