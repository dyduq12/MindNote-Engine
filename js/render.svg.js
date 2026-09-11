// ─── Namespace SVG ───────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Paletas ─────────────────────────────────────────────────────────────────
const TEMA = {
  claro: {
    fundo: '#F3F4F6', pill: '#FFF', borda: '#374151', texto: '#111827',
    anotacao: '#FCFCFD', anotacaoBorda: '#9CA3AF', pauta: '#D1D5DB',
    conector: '#9CA3AF', ilustracao: '#6B7280', grid: '#E5E7EB',
  },
  escuro: {
    fundo: '#18181B', pill: '#27272A', borda: '#52525B', texto: '#F4F4F5',
    anotacao: '#27272A', anotacaoBorda: '#52525B', pauta: '#3F3F46',
    conector: '#71717A', ilustracao: '#71717A', grid: '#3F3F46',
  },
};
let temaAtualRender = 'claro';          // NUNCA renomear para temaAtual
function definirTema(t) { temaAtualRender = t === 'escuro' ? 'escuro' : 'claro'; }
function tema() { return TEMA[temaAtualRender]; }

// ─── Auxiliares SVG ──────────────────────────────────────────────────────────
function el(tag, a = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  Object.entries(a).forEach(([n, v]) => e.setAttribute(n, String(v)));
  return e;
}
function percorrerArvore(no, cb) {
  cb(no);
  no.filhos.forEach(f => percorrerArvore(f, cb));
}

// ─── Estado de interação ─────────────────────────────────────────────────────
let selecaoAtual = null;
let toolbarAtual = null;
let resizeState   = null;   // estado do drag-to-resize

// ─── Hit-testing: decide se o alvo pertence a um elemento interativo ─────────
// O listener de navegação do SVG NUNCA captura o pointer se esta função retornar true.
function ehElementoInterativo(target) {
  return Boolean(
    target.closest?.(
      '.mindnote-node, .mindnote-box, .mindnote-handle, #micro-toolbar'
    )
  );
}

// ─── Seleção e toolbar ───────────────────────────────────────────────────────
function limparSelecao() {
  if (selecaoAtual?.elemento) selecaoAtual.elemento.classList.remove('mindnote-selected');
  selecaoAtual = null;
  if (toolbarAtual) { toolbarAtual.remove(); toolbarAtual = null; }
}

function acaoToolbar(rotulo, acao) {
  const b = el('g', { class: 'micro-toolbar-button' });
  const r = el('rect', { x: 0, y: 0, width: 44, height: 44, rx: 8 });
  const t = el('text', { x: 22, y: 27, 'text-anchor': 'middle' });
  t.textContent = rotulo;
  b.appendChild(r);
  b.appendChild(t);
  // Impede que cliques na toolbar disparem o listener de pointerdown do SVG
  b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  b.addEventListener('click', e => { e.stopPropagation(); acao(); });
  return b;
}

function exibirToolbar(no, tipo, elemento, pos) {
  if (toolbarAtual) toolbarAtual.remove();
  toolbarAtual = el('g', { id: 'micro-toolbar' });
  const acoes = [];

  if (tipo === 'titulo') {
    acoes.push(['+T',  () => window.MindNoteApp?.adicionarFilho(no)]);
    // ── NOVO: botão renomear ──────────────────────────────────────────────
    acoes.push(['✏️', () => {
      const novoTitulo = window.prompt('Editar título:', no.titulo);
      if (novoTitulo !== null) window.MindNoteApp?.atualizarTitulo(no, novoTitulo);
    }]);
    // ── NOVO: botão de cor ────────────────────────────────────────────────
    acoes.push(['🎨', () => window.MindNoteApp?.alternarCor(no)]);
    if (!no.anotacao) acoes.push(['+A', () => window.MindNoteApp?.adicionarAnotacao(no)]);
  } else {
    if (no.anotacao?.tipo === 'pauta') {
      acoes.push(['+',  () => window.MindNoteApp?.alterarLinhas(no,  1)]);
      acoes.push(['−',  () => window.MindNoteApp?.alterarLinhas(no, -1)]);
    }
    acoes.push(['Tipo', () => window.MindNoteApp?.alternarTipoAnotacao(no)]);
    if (!no.anotacao?.anexo) acoes.push(['+An', () => window.MindNoteApp?.adicionarAnexo(no)]);
    acoes.push(['🗑',   () => window.MindNoteApp?.removerAnotacao(no)]);
  }

  acoes.forEach((item, i) => {
    const botao = acaoToolbar(item[0], () => { limparSelecao(); item[1](); });
    botao.setAttribute('transform', `translate(${pos.x + i * 48},${pos.y})`);
    toolbarAtual.appendChild(botao);
  });

  elemento.ownerSVGElement.querySelector('#viewport-root').appendChild(toolbarAtual);
}

function selecionar(no, tipo, elemento, pos) {
  limparSelecao();
  selecaoAtual = { no, tipo, elemento };
  elemento.classList.add('mindnote-selected');
  exibirToolbar(no, tipo, elemento, pos);
}

// ─── TEXTO nas pílulas ────────────────────────────────────────────────────────
function texto(g, no, d, x, y) {
  const e = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
  e.setAttribute('fill', tema().texto);
  e.setAttribute('class', 'mindnote-title-text');
  (d.linhasTexto || quebrarTexto(no.titulo, d.largura - 32, FONTE_PADRAO)).forEach((l, i) => {
    const t = el('tspan', { x, dy: i ? 22 : -((d.linhasQuebradas - 1) * 22) / 2 });
    t.textContent = l;
    e.appendChild(t);
  });
  g.appendChild(e);
}

// ─── Drag-to-Resize (espaço SVG correto via CTM inverso) ─────────────────────
function converterParaEspacoSVG(svg, cx, cy) {
  const inversa = svg.getScreenCTM().inverse();
  return new DOMPoint(cx, cy).matrixTransform(inversa);
}

function iniciarResize(no, anexo, handle, e, svg) {
  e.stopPropagation();    // não inicia pan
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  const pontoInicial = converterParaEspacoSVG(svg, e.clientX, e.clientY);
  const alturaInicial = anexo
    ? (no.anotacao.anexo.altura || 220)
    : (no.anotacao.alturaCustomizada || 220);
  resizeState = { no, anexo, handle, svg, pointerId: e.pointerId, pontoInicial, alturaInicial };
}

function moverResize(e) {
  if (!resizeState || e.pointerId !== resizeState.pointerId) return;
  const pontoAtual = converterParaEspacoSVG(resizeState.svg, e.clientX, e.clientY);
  const deltaY     = pontoAtual.y - resizeState.pontoInicial.y;
  const novaAltura = Math.max(120, Math.round(resizeState.alturaInicial + deltaY));
  if (resizeState.anexo) resizeState.no.anotacao.anexo.altura = novaAltura;
  else                   resizeState.no.anotacao.alturaCustomizada = novaAltura;
  window.MindNoteApp?.reprocessarERenderizar?.();
}

function finalizarResize() {
  if (!resizeState) return;
  // Aplica piso mínimo definitivo antes de sincronizar
  if (resizeState.anexo) {
    resizeState.no.anotacao.anexo.altura =
      Math.max(120, resizeState.no.anotacao.anexo.altura);
  } else {
    resizeState.no.anotacao.alturaCustomizada =
      Math.max(120, resizeState.no.anotacao.alturaCustomizada || 120);
  }
  window.MindNoteApp?.sincronizarEstadoParaTextarea?.();
  resizeState = null;
}

function adicionarHandleResize(no, pos, d, g, anexo, svg) {
  if (d.tipo !== 'ilustracao') return;
  const handle = el('rect', {
    x: pos.x + d.largura / 2 - 24,
    y: pos.y + d.altura / 2 - 10,
    width: 48, height: 8, rx: 4,
    class: 'mindnote-handle mindnote-resize-handle',
  });
  handle.addEventListener('pointerdown', e => iniciarResize(no, anexo, handle, e, svg));
  // pointermove e pointerup são escutados no SVG para funcionar mesmo se o dedo sair do handle
  g.appendChild(handle);
}

// ─── Caixa de anotação ────────────────────────────────────────────────────────
function caixa(no, pos, d, g, anexo, svg) {
  const t = tema();
  const x = pos.x;
  const y = pos.y - d.altura / 2;

  const r = el('rect', {
    x, y,
    width: d.largura, height: d.altura,
    rx: 6, ry: 6,
    fill:   d.tipo === 'ilustracao' ? 'url(#dot-grid)' : t.anotacao,
    stroke: d.tipo === 'ilustracao' ? t.ilustracao : t.anotacaoBorda,
    'stroke-width': d.tipo === 'ilustracao' ? 2 : 1.5,
    class: 'mindnote-box',
  });
  if (d.tipo !== 'ilustracao') r.setAttribute('stroke-dasharray', '4,4');

  r.addEventListener('pointerdown', e => e.stopPropagation());
  r.addEventListener('click', e => {
    e.stopPropagation();
    selecionar(no, 'anotacao', r, { x, y: y - 52 });
  });
  g.appendChild(r);

  if (d.tipo === 'pauta') {
    const pv   = d.paddingVertical  || 16;
    const ph   = d.paddingHorizontal || 20;
    const step = d.entrelinha || 26;
    for (let i = 1; i <= d.linhasFinais; i++) {
      const ly = y + pv + i * step;
      if (ly <= y + d.altura - pv)
        g.appendChild(el('line', {
          x1: x + ph, y1: ly,
          x2: x + d.largura - ph, y2: ly,
          stroke: t.pauta, 'stroke-width': 1, opacity: .8,
        }));
    }
  }

  adicionarHandleResize(no, pos, d, g, anexo, svg);
}

// ─── Interação de navegação (pan + pinch-to-zoom incremental) ─────────────────
function criarInteracaoViewport(svg, root, d) {
  const estado = {
    viewBox: { x: 0, y: 0, width: d.larguraTotal, height: d.alturaTotal },
    inicial: { width: d.larguraTotal, height: d.alturaTotal },
    pointers: new Map(),
    distanciaAnterior: null,    // ← incremental; NÃO é mais um viewBox congelado
  };

  const aplicar = () => {
    const v = estado.viewBox;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.width} ${v.height}`);
  };

  const limitar = () => {
    const v  = estado.viewBox;
    const mx = v.width  * 0.75;
    const my = v.height * 0.75;
    v.x = Math.max(-mx, Math.min(d.larguraTotal - v.width  + mx, v.x));
    v.y = Math.max(-my, Math.min(d.alturaTotal  - v.height + my, v.y));
  };

  // Converte coordenadas CSS → espaço SVG (respeita zoom e translação)
  const pontoSVG = (e) => {
    const inv = svg.getScreenCTM().inverse();
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
  };

  const distancia = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const centro    = (a, b) => ({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });

  const aplicarZoom = (fator, centroEvt) => {
    const antes  = pontoSVG(centroEvt);
    estado.viewBox.width  = Math.max(160, Math.min(estado.inicial.width  * 4, estado.viewBox.width  * fator));
    estado.viewBox.height = Math.max(160, Math.min(estado.inicial.height * 4, estado.viewBox.height * fator));
    const depois = pontoSVG(centroEvt);
    estado.viewBox.x += antes.x - depois.x;
    estado.viewBox.y += antes.y - depois.y;
    limitar();
    aplicar();
  };

  // ── pointerdown: captura APENAS se o alvo NÃO for elemento interativo ──────
  svg.addEventListener('pointerdown', e => {
    if (ehElementoInterativo(e.target)) return;   // NUNCA capturar sobre nó/caixa/handle/toolbar
    svg.setPointerCapture(e.pointerId);
    estado.pointers.set(e.pointerId, e);
    // Segundo dedo: inicializa distância incremental
    if (estado.pointers.size === 2) {
      const [a, b] = [...estado.pointers.values()];
      estado.distanciaAnterior = distancia(a, b);
    }
  });

  // ── pointermove: pan (1 pointer) ou pinch incremental (2 pointers) ─────────
  svg.addEventListener('pointermove', e => {
    // Resize tem prioridade: delegado ao handle via setPointerCapture
    if (resizeState && e.pointerId === resizeState.pointerId) {
      moverResize(e);
      return;
    }
    if (!estado.pointers.has(e.pointerId)) return;

    const anterior = estado.pointers.get(e.pointerId);
    estado.pointers.set(e.pointerId, e);

    if (estado.pointers.size === 1) {
      // Pan: delta em espaço SVG usando CTM inverso nos dois pontos
      const inv    = svg.getScreenCTM().inverse();
      const antes  = new DOMPoint(anterior.clientX, anterior.clientY).matrixTransform(inv);
      const atual  = new DOMPoint(e.clientX,        e.clientY       ).matrixTransform(inv);
      estado.viewBox.x += antes.x - atual.x;
      estado.viewBox.y += antes.y - atual.y;
      limitar();
      aplicar();
      return;
    }

    // Pinch-to-zoom INCREMENTAL: fator = distAnt / distAtual (frame-a-frame)
    const [a, b] = [...estado.pointers.values()];
    const distAtual = distancia(a, b);
    if (estado.distanciaAnterior !== null && distAtual > 0) {
      const fator = estado.distanciaAnterior / distAtual;
      aplicarZoom(fator, centro(a, b));
    }
    estado.distanciaAnterior = distAtual;
  });

  // ── pointerup / pointercancel: libera e zera distância anterior ────────────
  const liberar = e => {
    if (resizeState && e.pointerId === resizeState.pointerId) {
      finalizarResize();
      return;
    }
    estado.pointers.delete(e.pointerId);
    // Ao soltar qualquer dedo do pinch, reinicializa distância
    if (estado.pointers.size < 2) estado.distanciaAnterior = null;
  };
  svg.addEventListener('pointerup',     liberar);
  svg.addEventListener('pointercancel', liberar);

  // ── wheel: zoom com roda do mouse ─────────────────────────────────────────
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    aplicarZoom(e.deltaY > 0 ? 1.1 : 0.9, e);
  }, { passive: false });

  aplicar();
}

// ─── Renderização principal ──────────────────────────────────────────────────
function renderizarArvoreSVG(arvores, container) {
  container.textContent = '';
  const d   = arvores[0].canvasDimensoes;
  const t   = tema();
  const svg = el('svg', {
    id: 'svg-mapa',
    width: '100%', height: '100%',
    viewBox: `0 0 ${d.larguraTotal} ${d.alturaTotal}`,
    style: `background:${t.fundo}`,
    preserveAspectRatio: 'xMinYMin meet',
  });

  // Defs: dot-grid + estilos embutidos
  const defs = el('defs');
  const pat  = el('pattern', { id: 'dot-grid', width: 24, height: 24, patternUnits: 'userSpaceOnUse' });
  pat.appendChild(el('circle', { cx: 3, cy: 3, r: 1.5, fill: t.grid }));
  defs.appendChild(pat);
  const st = el('style');
  st.textContent = [
    '.mindnote-title-text{font:600 15px system-ui,sans-serif}',
    'svg{shape-rendering:geometricPrecision;touch-action:none;user-select:none}',
  ].join('');
  defs.appendChild(st);

  const root = el('g', { id: 'viewport-root' });
  svg.appendChild(defs);
  svg.appendChild(root);

  // Limpar seleção ao clicar no fundo
  root.addEventListener('click', e => {
    if (e.target === root || e.target === svg) limparSelecao();
  });

  // ── 1ª passagem: conectores (ficam atrás dos nós) ─────────────────────────
  arvores.forEach(a => percorrerArvore(a, no => {
    // Cor do conector: usa no.cor se definido, senão tema
    const corConector = no.cor || t.conector;

    no.conectoresFilhos.forEach(k => {
      const c = k.curva;
      root.appendChild(el('path', {
        d: `M${c.p0.x},${c.p0.y} C${c.p1.x},${c.p1.y} ${c.p2.x},${c.p2.y} ${c.p3.x},${c.p3.y}`,
        stroke: corConector,
        'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round',
      }));
    });
    if (no.conectorAnotacao)
      root.appendChild(el('line', {
        x1: no.conectorAnotacao.x1, y1: no.conectorAnotacao.y1,
        x2: no.conectorAnotacao.x2, y2: no.conectorAnotacao.y2,
        stroke: t.conector, 'stroke-width': 2,
      }));
    if (no.conectorAnexo)
      root.appendChild(el('line', {
        x1: no.conectorAnexo.x1, y1: no.conectorAnexo.y1,
        x2: no.conectorAnexo.x2, y2: no.conectorAnexo.y2,
        stroke: t.conector, 'stroke-width': 2,
      }));
  }));

  // ── 2ª passagem: nós (pílulas + caixas) ──────────────────────────────────
  arvores.forEach(a => percorrerArvore(a, no => {
    const dT  = no.dimensoes.titulo;
    const g   = el('g');
    const px  = no.posicao.x;
    const py  = no.posicao.y;

    // Cor de borda da pílula: usa no.cor se definido
    const bordaPilula = no.cor || t.borda;

    const r = el('rect', {
      x: px, y: py - dT.altura / 2,
      width: dT.largura, height: dT.altura,
      rx: 8, ry: 8,
      fill: t.pill,
      stroke: bordaPilula,
      'stroke-width': no.cor ? 2.5 : 2,   // borda ligeiramente mais grossa quando colorida
      class: 'mindnote-node',
    });

    // ── Duplo clique na pílula: renomear título ───────────────────────────
    r.addEventListener('dblclick', e => {
      e.stopPropagation();
      const novoTitulo = window.prompt('Editar título:', no.titulo);
      if (novoTitulo !== null) window.MindNoteApp?.atualizarTitulo(no, novoTitulo);
    });

    r.addEventListener('pointerdown', e => e.stopPropagation());
    r.addEventListener('click', e => {
      e.stopPropagation();
      selecionar(no, 'titulo', r, { x: px, y: py - dT.altura / 2 - 52 });
    });

    g.appendChild(r);
    texto(g, no, dT, px + dT.largura / 2, py);
    root.appendChild(g);

    // Caixas de anotação e anexo
    if (no.dimensoes.anotacao) {
      if (no.dimensoes.anotacao.anexo)
        caixa(no, no.posicaoAnexo, no.dimensoes.anotacao.anexo, root, true, svg);
      caixa(no, no.posicaoAnotacao, no.dimensoes.anotacao, root, false, svg);
    }
  }));

  container.appendChild(svg);
  criarInteracaoViewport(svg, root, d);
  return svg;
}
