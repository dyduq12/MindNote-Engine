/*
 * render.pdf.js — Exportador PDF vetorial com bounding box dinâmico e paridade de tema
 *
 * Correções aplicadas (commit fix/pdf-bounding-box):
 *   1. Bounding box calculado varrendo todos os nós — sem depender de canvasDimensoes.
 *   2. Folha vetorial dinâmica com margem configurável e simétrica.
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
const PDF_ENTRELINHA         = 26;    // px — escala de entrelinha calibrada
const PDF_PADDING_VERTICAL   = 16;    // px
const PDF_PADDING_HORIZONTAL = 20;    // px

// ─── Margem vetorial configurável; a página contínua continua em escala 1:1 ─
const MARGEM_PADRAO = 60;

function obterConfiguracaoPDF() {
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const margem = Math.max(20, Math.min(150, Number(read('mn_pdf_margin', MARGEM_PADRAO)) || MARGEM_PADRAO));
  const tema = ['tela', 'claro', 'escuro'].includes(read('mn_pdf_theme_parity', 'tela')) ? read('mn_pdf_theme_parity', 'tela') : 'tela';
  const formato = ['continuo', 'a4-paisagem', 'a3-estudo'].includes(read('mn_pdf_format', 'continuo')) ? read('mn_pdf_format', 'continuo') : 'continuo';
  return { margem, tema, formato, renderLinhas: read('mn_pdf_render_lines', 'true') !== 'false', metadados: read('mn_pdf_embed_metadata', 'true') !== 'false' };
}

// ─── Utilitário: hex '#RRGGBB' → [r, g, b] (0–255) ──────────────────────────
function hexParaRGB(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function misturarHex(frente, fundo, opacidade) {
  const a = hexParaRGB(frente), b = hexParaRGB(fundo);
  return `#${a.map((canal, index) => Math.round(canal * opacidade + b[index] * (1 - opacidade)).toString(16).padStart(2, '0')).join('')}`;
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

function desenharPontosGrade(doc, x, y, largura, altura, cor, offsetX = 0, offsetY = 0) {
  setFill(doc, cor);
  const inicioX = Math.ceil((x - offsetX - 3) / 24) * 24 + 3 + offsetX;
  const inicioY = Math.ceil((y - offsetY - 3) / 24) * 24 + 3 + offsetY;
  for (let gx = inicioX; gx < x + largura; gx += 24) {
    for (let gy = inicioY; gy < y + altura; gy += 24) {
      const pertoCanto = (gx < x + 6 || gx > x + largura - 6) && (gy < y + 6 || gy > y + altura - 6);
      if (!pertoCanto) doc.circle(gx, gy, 1.5, 'F');
    }
  }
}

// ─── Iterador recursivo de árvore ────────────────────────────────────────────
function percorrerArvorePDF(no, cb, corPai = null) {
  const corEfetiva = no.cor || corPai || "#64748b";
  cb(no, corEfetiva);
  no.filhos.forEach(f => percorrerArvorePDF(f, cb, corEfetiva));
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
    fundo:          '#F3F4F6',
    pilulaFill:     '#FFFFFF',
    pilulaBordaPad: '#374151',   // quando no.cor for null
    pilulaTxt:      '#111827',
    caixaFill:      '#FCFCFD',
    caixaBorda:     '#9CA3AF',
    caixaLinhasPauta: '#D1D5DB',
    gradeIlustracao: '#E5E7EB',
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
    gradeIlustracao: '#3F3F46',
    anexoFill:      '#27272A',
    anexoBorda:     '#71717A',
    conector:       '#71717A',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDING BOX DINÂMICO
// Varre todos os nós de todas as árvores e retorna os limites reais ocupados
// mais os offsets necessários para manter a margem escolhida ao redor.
// ═══════════════════════════════════════════════════════════════════════════════
function calcularBoundingBox(arvores, margem = MARGEM_PADRAO) {
  const rootSvg = document.querySelector("#canvas-container svg #viewport-root");
  if (rootSvg?.getBBox) {
    const auxiliares = rootSvg.querySelectorAll(".mindnote-hitbox, .mindnote-handle, #micro-toolbar");
    const estilos = Array.from(auxiliares, (el) => el.style.display);
    try {
      auxiliares.forEach((el) => { el.style.display = "none"; });
      const box = rootSvg.getBBox();
      if (box.width > 0 && box.height > 0) {
        return {
          larguraTotal: box.width + margem * 2,
          alturaTotal: box.height + margem * 2,
          offsetX: margem - box.x,
          offsetY: margem - box.y,
        };
      }
    } catch { /* fallback para os limites geométricos persistidos */ }
    finally { auxiliares.forEach((el, index) => { el.style.display = estilos[index]; }); }
  }
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

  const larguraTotal = (maxX - minX) + margem * 2;
  const alturaTotal  = (maxY - minY) + margem * 2;
  const offsetX      = margem - minX;
  const offsetY      = margem - minY;

  return { larguraTotal, alturaTotal, offsetX, offsetY };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 1 — Conectores
// ═══════════════════════════════════════════════════════════════════════════════
function desenharConectores(doc, arvores, paleta, offsetX, offsetY) {
  doc.setLineWidth(2.5);
  doc.setLineCap('round');
  doc.setLineDashPattern([], 0);

  arvores.forEach(raiz => percorrerArvorePDF(raiz, (no, corEfetiva) => {
    // ── Curvas cúbicas pai → filhos ──────────────────────────────────────────
    if (Array.isArray(no.conectoresFilhos)) {
      no.conectoresFilhos.forEach(k => {
        const c = k.curva;
        if (!c) return;

        const corConector = corEfetiva;
        setDraw(doc, corConector);

        // dx1..dy3 são deslocamentos RELATIVOS — não recebem offset
        const dx1 = c.p1.x - c.p0.x,  dy1 = c.p1.y - c.p0.y;
        const dx2 = c.p2.x - c.p0.x,  dy2 = c.p2.y - c.p0.y;
        const dx3 = c.p3.x - c.p0.x,  dy3 = c.p3.y - c.p0.y;
        if (c.roteamento === 'ortogonal') {
          if (c.eixo === 'vertical') {
            const middleY = (c.p0.y + c.p3.y) / 2 + offsetY;
            doc.line(c.p0.x + offsetX, c.p0.y + offsetY, c.p0.x + offsetX, middleY);
            doc.line(c.p0.x + offsetX, middleY, c.p3.x + offsetX, middleY);
            doc.line(c.p3.x + offsetX, middleY, c.p3.x + offsetX, c.p3.y + offsetY);
          } else {
            const middleX = (c.p0.x + c.p3.x) / 2 + offsetX;
            doc.line(c.p0.x + offsetX, c.p0.y + offsetY, middleX, c.p0.y + offsetY);
            doc.line(middleX, c.p0.y + offsetY, middleX, c.p3.y + offsetY);
            doc.line(middleX, c.p3.y + offsetY, c.p3.x + offsetX, c.p3.y + offsetY);
          }
        } else {
          doc.lines(
            [[dx1, dy1, dx2, dy2, dx3, dy3]],
            c.p0.x + offsetX, c.p0.y + offsetY,
            [1, 1], 'S'
          );
        }
      });
    }

    // Restaura cor padrão
    setDraw(doc, corEfetiva);

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
  arvores.forEach(raiz => percorrerArvorePDF(raiz, (no, corEfetiva) => {
    const dT = no.dimensoes?.titulo;
    if (!dT) return;

    const x = no.posicao.x + offsetX;
    const y = no.posicao.y - dT.altura / 2 + offsetY;

    // ── Fundo e borda ─────────────────────────────────────────────────────────
    setFill(doc, paleta.pilulaFill);
    setDraw(doc, corEfetiva);
    doc.setLineWidth(no.cor ? 2.5 : 2);
    doc.setLineDashPattern([], 0);
    doc.roundedRect(x, y, dT.largura, dT.altura, 8, 8, 'FD');

    // ── Texto centralizado ────────────────────────────────────────────────────
    setTxt(doc, paleta.pilulaTxt);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(15);

    const linhas        = dT.linhasTexto || [no.titulo];
    const espacamento   = 22;
    const linhasQuebradas = dT.linhasQuebradas || linhas.length;
    const deslocamentoPrimeiraLinha = -((linhasQuebradas - 1) * espacamento) / 2;
    const yInicial      = no.posicao.y + offsetY;
    const xCentro       = x + dT.largura / 2;

    linhas.forEach((linha, i) => {
      doc.text(linha, xCentro, yInicial + deslocamentoPrimeiraLinha + i * espacamento, {
        align: 'center',
        baseline: 'middle',
      });
    });
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSAGEM 3 — Caixas de anotação e anexos
// ═══════════════════════════════════════════════════════════════════════════════
function desenharCaixas(doc, arvores, paleta, offsetX, offsetY, renderLinhas = true) {
  arvores.forEach(raiz => percorrerArvorePDF(raiz, (no, corEfetiva) => {
    const dA = no.dimensoes?.anotacao;
    if (!dA) return;

    // ── 3a. Caixa de anotação principal ──────────────────────────────────────
    const xA = no.posicaoAnotacao.x + offsetX;
    const yA = no.posicaoAnotacao.y - dA.altura / 2 + offsetY;

    if (dA.tipo === 'pauta') {
      setFill(doc, paleta.caixaFill);
      setDraw(doc, misturarHex(corEfetiva, paleta.caixaFill, .5));
      doc.setLineWidth(1.5);
      doc.setLineDashPattern([4, 4], 0);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'FD');
      doc.setLineDashPattern([], 0);

      if (renderLinhas) {
        setDraw(doc, misturarHex(paleta.caixaLinhasPauta, paleta.caixaFill, .8));
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
      }

    } else {
      // tipo === 'ilustracao'
      setFill(doc, paleta.fundo);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'F');
      desenharPontosGrade(doc, xA, yA, dA.largura, dA.altura, paleta.gradeIlustracao, offsetX, offsetY);
      setDraw(doc, corEfetiva);
      doc.setLineWidth(2);
      doc.setLineDashPattern([], 0);
      doc.roundedRect(xA, yA, dA.largura, dA.altura, 6, 6, 'S');
    }

    // ── 3b. Caixa de anexo (se existir) ──────────────────────────────────────
    const dAnexo = dA.anexo;
    if (dAnexo && no.posicaoAnexo) {
      const xAn = no.posicaoAnexo.x + offsetX;
      const yAn = no.posicaoAnexo.y - dAnexo.altura / 2 + offsetY;
      setFill(doc, paleta.fundo);
      doc.roundedRect(xAn, yAn, dAnexo.largura, dAnexo.altura, 6, 6, 'F');
      desenharPontosGrade(doc, xAn, yAn, dAnexo.largura, dAnexo.altura, paleta.gradeIlustracao, offsetX, offsetY);
      setDraw(doc, corEfetiva);
      doc.setLineWidth(2);
      doc.setLineDashPattern([], 0);
      doc.roundedRect(xAn, yAn, dAnexo.largura, dAnexo.altura, 6, 6, 'S');
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

  const configuracao = obterConfiguracaoPDF();
  const temaPDF = configuracao.tema === 'tela' ? temaAtivo : configuracao.tema;
  const paleta = temaPDF === 'escuro' ? PALETA.escuro : PALETA.claro;

  // 3. Bounding box dinâmico — ignora canvasDimensoes
  const { larguraTotal, alturaTotal, offsetX, offsetY } = calcularBoundingBox(arvores, configuracao.margem);

  // 4. Contínuo é o padrão 1:1. Os formatos de estudo usam paginação em ladrilhos,
  // deslocando o mesmo desenho vetorial para recortar cada folha sem redimensioná-lo.
  const tile = configuracao.formato === 'a4-paisagem' ? [1122.52, 793.7]
    : configuracao.formato === 'a3-estudo' ? [1587.4, 1122.52] : [larguraTotal, alturaTotal];
  const colunas = Math.max(1, Math.ceil(larguraTotal / tile[0]));
  const linhas = Math.max(1, Math.ceil(alturaTotal / tile[1]));
  const doc = new jsPDF({
    orientation: tile[0] >= tile[1] ? 'landscape' : 'portrait',
    unit: 'px', format: tile, hotfixes: ['px_scaling'],
  });

  let totalNos = 0;
  arvores.forEach((raiz) => percorrerArvorePDF(raiz, () => { totalNos += 1; }));
  const titulo = arvores?.[0]?.titulo || 'MindNote';
  const dataModificacao = new Date().toISOString();
  if (configuracao.metadados && doc.setProperties) {
    doc.setProperties({
      title: titulo,
      subject: `Mapa mental · ${totalNos} nós · modificado em ${dataModificacao}`,
      creator: 'MindNote Engine',
      keywords: `MindNote, mapa mental, ${totalNos} nós, modificado ${dataModificacao}`,
    });
  }

  for (let linha = 0; linha < linhas; linha += 1) {
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      if (linha !== 0 || coluna !== 0) doc.addPage(tile, tile[0] >= tile[1] ? 'landscape' : 'portrait');
      const [r, g, b] = hexParaRGB(paleta.fundo);
      doc.setFillColor(r, g, b); doc.rect(0, 0, tile[0], tile[1], 'F');
      const deslocamentoX = offsetX - coluna * tile[0];
      const deslocamentoY = offsetY - linha * tile[1];
      desenharConectores(doc, arvores, paleta, deslocamentoX, deslocamentoY);
      desenharPilulas(doc, arvores, paleta, deslocamentoX, deslocamentoY);
      desenharCaixas(doc, arvores, paleta, deslocamentoX, deslocamentoY, configuracao.renderLinhas);
    }
  }

  // 5. Download
  doc.save(obterNomeArquivo(arvores));
}
