/*
 * render.pdf.js — Exportador PDF vetorial com bounding box dinâmico e paridade de tema
 *
 * Correções aplicadas (commit fix/pdf-bounding-box):
 *   1. Bounding box calculado varrendo todos os nós — sem depender de canvasDimensoes.
 *   2. Margem simétrica uniforme de 60 px em todos os lados.
 *   3. offsetX / offsetY corrigem qualquer deslocamento assimétrico.
 *   4. temaAtivo ('claro' | 'escuro') recebido como parâmetro — paletas independentes.
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

// ─── Margem de respiro simétrica do PDF ──────────────────────────────────────
const MARGEM = 60;   // px — uniforme nos 4 lados

// ─── Utilitário: hex '#RRGGBB' → [r, g, b] (0–255) ──────────────────────────
function hexParaRGB(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─── Utilitários de cor para jsPDF ───────────────────────────────────────────
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

// ─── Iterador recursivo de árvore ────────────────────────────────────────────
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

// ─── Paletas de tema ──────────────────────────────────────────────────────────
const PALETA = {
  claro: {
    fundo:          '#F9FAFB',
    pilulaFill:     '#FFFFFF',
    pilulaBordaPad: '#374151',   // quando no.cor for null
    pilulaTxt:      '#111827',
    caixaFill:      '#FCFCFD',
    caixaBorda:     '#9CA3AF',
    caixaLinhasPauta: '#D1D5DB',
    anexoFill:      '#FCFCFD',
    anexoBorda:     '#6B7280',
    conector:       '#9CA3AF',
  },
  escuro: {
    fundo:          '#18181B',
    pilulaFill:     '#27272A',
    pilulaBordaPad: '#52525B',
    pilulaTxt:      '#F4F4F5',
    caixaFill:      '#27272A',
    caixaBorda:     '#52525B',
    caixaLinhasPauta: '#3F3F46',
    anexoFill:      '#27272A',
    anexoBorda:     '#71717A',
    conector:       '#71717A',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDING BOX DINÂMICO
// Varre todos os nós de todas as árvores e retorna os limites reais ocupados
// mais o offsetX/offsetY necessários para centralizar o conteúdo com MARGEM.
// ═══════════════════════════════════════════════════════════════════════════════
function calcularBoundingBox(arvores) {
  let minX =  Infinity,  minY =  Infinity;
  let maxX = -Infinity,  maxY = -Infinity;

  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    // ── Pílula ──────────────────────────────────────────────────────────────
    const dT = no.dimensoes?.titulo;
    if (dT && no.posicao) {
      const px = no.posicao.x;
      const py = no.posicao.y;
      const esq  = px;
      const dir  = px + dT.largura;
      const topo = py - dT.altura / 2;
      const base = py + dT.altura / 2;
      if (esq  < minX) minX = esq;
      if (dir  > maxX) maxX = dir;
      if (topo < minY) minY = topo;
      if (base > maxY) maxY = base;
    }

    // ── Caixa de anotação ────────────────────────────────────────────────────
    const dA = no.dimensoes?.anotacao;
    if (dA && no.posicaoAnotacao) {
      const xA   = no.posicaoAnotacao.x;
      const yA   = no.posicaoAnotacao.y;
      const esq  = xA;
      const dir  = xA + dA.largura;
      const topo = yA - dA.altura / 2;
      const base = yA + dA.altura / 2;
      if (esq  < minX) minX = esq;
      if (dir  > maxX) maxX = dir;
      if (topo < minY) minY = topo;
      if (base > maxY) maxY = base;

      // ── Caixa de anexo ─────────────────────────────────────────────────────
      const dAnexo = dA.anexo;
      if (dAnexo && no.posicaoAnexo) {
        const xAn   = no.posicaoAnexo.x;
        const yAn   = no.posicaoAnexo.y;
        const esqAn  = xAn;
        const dirAn  = xAn + dAnexo.largura;
        const topoAn = yAn - dAnexo.altura / 2;
        const baseAn = yAn + dAnexo.altura / 2;
        if (esqAn  < minX) minX = esqAn;
        if (dirAn  > maxX) maxX = dirAn;
        if (topoAn < minY) minY = topoAn;
        if (baseAn > maxY) maxY = baseAn;
      }
    }
  }));

  // Guarda contra árvores vazias
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }

  const larguraTotal = Math.ceil((maxX - minX) + MARGEM * 2);
  const alturaTotal  = Math.ceil((maxY - minY) + MARGEM * 2);
  const offsetX      = MARGEM - minX;
  const offsetY      = MARGEM - minY;

  return { larguraTotal, alturaTotal, offsetX, offsetY };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 1 — Conectores
// ═══════════════════════════════════════════════════════════════════════════════
function desenharConectores(doc, arvores, paleta, offsetX, offsetY) {
  doc.setLineWidth(2.5);
  doc.setLineCap('round');
  doc.setLineDashPattern([], 0);

  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    // ── Curvas cúbicas pai → filhos ──────────────────────────────────────────
    if (Array.isArray(no.conectoresFilhos)) {
      no.conectoresFilhos.forEach(k => {
        const c = k.curva;
        if (!c) return;

        const corConector = no.cor || paleta.conector;
        setDraw(doc, corConector);

        // dx1..dy3 são deslocamentos RELATIVOS — não recebem offset
        const dx1 = c.p1.x - c.p0.x,  dy1 = c.p1.y - c.p0.y;
        const dx2 = c.p2.x - c.p0.x,  dy2 = c.p2.y - c.p0.y;
        const dx3 = c.p3.x - c.p0.x,  dy3 = c.p3.y - c.p0.y;
        doc.lines(
          [[dx1, dy1, dx2, dy2, dx3, dy3]],
          c.p0.x + offsetX, c.p0.y + offsetY,
          [1, 1],
          'S'
        );
      });
    }

    // Restaura cor padrão
    setDraw(doc, paleta.conector);

    // ── Conector título → caixa de anotação ──────────────────────────────────
    if (no.conectorAnotacao) {
      const l = no.conectorAnotacao;
      doc.setLineWidth(2);
      doc.line(l.x1 + offsetX, l.y1 + offsetY, l.x2 + offsetX, l.y2 + offsetY);
      doc.setLineWidth(2.5);
    }

    // ── Conector caixa → anexo ────────────────────────────────────────────────
    if (no.conectorAnexo) {
      const l = no.conectorAnexo;
      doc.setLineWidth(2);
      doc.line(l.x1 + offsetX, l.y1 + offsetY, l.x2 + offsetX, l.y2 + offsetY);
      doc.setLineWidth(2.5);
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 2 — Pílulas de título
// ═══════════════════════════════════════════════════════════════════════════════
function desenharPilulas(doc, arvores, paleta, offsetX, offsetY) {
  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    const dT = no.dimensoes?.titulo;
    if (!dT) return;

    const x = no.posicao.x + offsetX;
    const y = no.posicao.y - dT.altura / 2 + offsetY;

    // ── Fundo e borda ─────────────────────────────────────────────────────────
    setFill(doc, paleta.pilulaFill);
    setDraw(doc, no.cor || paleta.pilulaBordaPad);
    doc.setLineWidth(no.cor ? 2.5 : 2);
    doc.setLineDashPattern([], 0);
    doc.roundedRect(x, y, dT.largura, dT.altura, 8, 8, 'FD');

    // ── Texto centralizado ────────────────────────────────────────────────────
    setTxt(doc, paleta.pilulaTxt);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);

    const linhas        = dT.linhasTexto || [no.titulo];
    const totalLinhas   = linhas.length;
    const espacamento   = 16;
    const alturaBloco   = (totalLinhas - 1) * espacamento;
    const yInicial      = (no.posicao.y + offsetY) - alturaBloco / 2;
    const xCentro       = x + dT.largura / 2;

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
function desenharCaixas(doc, arvores, paleta, offsetX, offsetY) {
  arvores.forEach(raiz => percorrerArvorePDF(raiz, no => {
    const dA = no.dimensoes?.anotacao;
    if (!dA) return;

    // ── 3a. Caixa de anotação principal ──────────────────────────────────────
    const xA = no.posicaoAnotacao.x + offsetX;
    const yA = no.posicaoAnotacao.y - dA.altura / 2 + offsetY;

    if (dA.tipo === 'pauta') {
      setFill(doc, paleta.caixaFill);
      setDraw(doc, paleta.caixaBorda);
      doc.setLineWidth(1.5);
      doc.setLineDashPattern([4, 4], 0);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'FD');
      doc.setLineDashPattern([], 0);

      setDraw(doc, paleta.caixaLinhasPauta);
      doc.setLineWidth(1);
      const pv   = dA.paddingVertical   || PDF_PADDING_VERTICAL;
      const ph   = dA.paddingHorizontal || PDF_PADDING_HORIZONTAL;
      const step = dA.entrelinha        || PDF_ENTRELINHA;
      for (let i = 1; i <= (dA.linhasFinais || 0); i++) {
        const ly = yA + pv + i * step;
        if (ly <= yA + dA.altura - pv) {
          doc.line(xA + ph, ly, xA + dA.largura - ph, ly);
        }
      }

    } else {
      // tipo === 'ilustracao'
      setFill(doc, paleta.caixaFill);
      setDraw(doc, paleta.anexoBorda);
      doc.setLineWidth(2);
      doc.setLineDashPattern([], 0);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'FD');
    }

    // ── 3b. Caixa de anexo (se existir) ──────────────────────────────────────
    const dAnexo = dA.anexo;
    if (dAnexo && no.posicaoAnexo) {
      const xAn = no.posicaoAnexo.x + offsetX;
      const yAn = no.posicaoAnexo.y - dAnexo.altura / 2 + offsetY;
      setFill(doc, paleta.anexoFill);
      setDraw(doc, paleta.anexoBorda);
      doc.setLineWidth(2);
      doc.setLineDashPattern([], 0);
      doc.roundedRect(xAn, yAn, dAnexo.largura, dAnexo.altura, 6, 6, 'FD');
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
function exportarPDFContinuo(arvores, temaAtivo) {
  // 1. Guard da biblioteca
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    throw new Error(
      'Biblioteca jsPDF não encontrada. ' +
      'Verifique se js/vendor/jspdf.umd.min.js está presente e carregado.'
    );
  }
  const { jsPDF } = window.jspdf;

  // 2. Seleciona paleta conforme tema ativo (padrão: 'claro')
  const paleta = temaAtivo === 'escuro' ? PALETA.escuro : PALETA.claro;

  // 3. Bounding box dinâmico — ignora canvasDimensoes
  const { larguraTotal, alturaTotal, offsetX, offsetY } = calcularBoundingBox(arvores);

  // 4. Inicialização do documento panorâmico contínuo
  const doc = new jsPDF({
    orientation: larguraTotal >= alturaTotal ? 'landscape' : 'portrait',
    unit: 'px',
    format: [larguraTotal, alturaTotal],
    hotfixes: ['px_scaling'],
  });

  // 5. Fundo do PDF conforme tema
  const [r, g, b] = hexParaRGB(paleta.fundo);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, larguraTotal, alturaTotal, 'F');

  // 6. Três passagens de renderização vetorial (mesma ordem do SVG)
  desenharConectores(doc, arvores, paleta, offsetX, offsetY);   // Passagem 1
  desenharCaixas(doc, arvores, paleta, offsetX, offsetY);       // Passagem 3 → abaixo das pílulas
  desenharPilulas(doc, arvores, paleta, offsetX, offsetY);      // Passagem 2 → topo

  // 7. Download
  doc.save(obterNomeArquivo(arvores));
}
