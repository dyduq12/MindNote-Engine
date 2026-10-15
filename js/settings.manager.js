"use strict";

/* Preferências globais, BYOB, diagnóstico e backup do MindNote. */
const MindNoteSettings = (() => {
  const KEYS = {
    line: "mindnote_default_line_spacing",
    variant: "mindnote_visual_variant",
    sensitivity: "mindnote_camera_sensitivity",
    rotationLock: "mindnote_rotation_lock",
    zoomMin: "mindnote_zoom_min",
    sync: "mindnote_sync_config",
    dev: "dev_mode_unlocked",
    hitboxes: "mindnote_dev_hitboxes",
    hud: "mindnote_dev_hud_enabled",
    uiVariant: "mn_ui_variant",
    blur: "mn_blur_intensity",
    accent: "mn_accent_color",
    density: "mn_ui_density",
    ruling: "mn_default_ruling_type",
    lineHeight: "mn_ruling_line_height",
    rulingWidth: "mn_ruling_stroke_width",
    rulingOpacity: "mn_ruling_opacity",
    fontFamily: "mn_font_family_title",
    panSensitivity: "mn_pan_sensitivity",
    zoomCurve: "mn_zoom_curve",
    zoomMinPercent: "mn_zoom_min",
    zoomMaxPercent: "mn_zoom_max",
    lockRotation: "mn_lock_rotation",
    strictStylus: "mn_strict_stylus_mode",
    pdfMargin: "mn_pdf_margin",
    pdfFormat: "mn_pdf_format",
    pdfTheme: "mn_pdf_theme_parity",
    pdfLines: "mn_pdf_render_lines",
    pdfMetadata: "mn_pdf_embed_metadata",
    promptTemplate: "mn_prompt_template_active",
    sanitizerAggressive: "mn_sanitizer_aggressive",
    sanitizerMulti: "mn_sanitizer_multi_modal",
    markdownOutline: "mn_markdown_outline_support",
    layoutTemplate: "mn_layout_template",
    gapVertical: "mn_gap_vertical_siblings",
    gapHorizontal: "mn_gap_horizontal_levels",
    gapMultiRoots: "mn_gap_multi_roots",
    bezierTension: "mn_bezier_tension",
  };
  let abaAtual = "usuario";
  let feedbackTimer = 0;
  let fpsFrame = 0;
  let fpsFrames = 0;
  let fpsStart = 0;
  let fpsAtual = 0;
  let bboxAtual = null;
  let nosAtuais = 0;
  let blurTimer = 0;
  const ACCENTS = ["#8B5CF6", "#3B82F6", "#06B6D4", "#22C55E", "#F59E0B", "#EC4899"];
  const RULINGS = ["horizontal", "quadriculada", "pontos", "cornell"];
  const LAYOUTS = ["arvore-horizontal", "radial", "grid-livre", "study-briefing"];
  const PROMPTS = {
    vestibular: `Transforme a fonte em um resumo teórico para vestibular: conceitos centrais, definições precisas, palavras-chave atômicas e relações entre ideias. Evite redundâncias e não acrescente fatos externos.`,
    exatas: `Transforme a fonte em um mapa de demonstração e exatas: organize fórmulas, hipóteses, deduções passo a passo, variáveis e condições de validade. Preserve símbolos e dependências lógicas; não invente etapas.`,
    biologia: `Transforme a fonte em uma taxonomia de biologia: use ramificações hierárquicas profundas, ciclos e relações de classificação, causa e função. Preserve os níveis taxonômicos explicitamente presentes.`,
    historia: `Transforme a fonte em uma cronologia histórica: destaque causas, marcos temporais, agentes, acontecimentos e consequências, mantendo as relações cronológicas e causais sustentadas pelo material.`,
  };

  const obter = (id) => document.getElementById(id);
  function ler(chave, padrao) {
    try { const valor = localStorage.getItem(chave); return valor === null ? padrao : valor; }
    catch { return padrao; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, String(valor)); return true; }
    catch { return false; }
  }
  function anunciar(id, texto, erro = false) {
    const node = obter(id);
    if (!node) return;
    node.textContent = texto;
    node.classList.toggle("is-error", erro);
    window.clearTimeout(feedbackTimer);
    if (texto) feedbackTimer = window.setTimeout(() => { node.textContent = ""; }, 4800);
  }

  function devDesbloqueado() { return ler(KEYS.dev, "false") === "true"; }

  function obterCanvasConfig() {
    return {
      sensibilidade: Math.max(0.5, Math.min(2, Number(ler(KEYS.panSensitivity, ler(KEYS.sensitivity, "1"))) || 1)),
      travarRotacao: ler(KEYS.lockRotation, ler(KEYS.rotationLock, "true")) !== "false",
      modoCanetaEstrita: ler(KEYS.strictStylus, "false") === "true",
      curvaZoom: ler(KEYS.zoomCurve, "suave") === "linear" ? "linear" : "suave",
      zoomMin: Math.max(0.1, Math.min(0.5, (Number(ler(KEYS.zoomMinPercent, String(Number(ler(KEYS.zoomMin, "0.1")) * 100))) || 10) / 100)),
      zoomMax: Math.max(1, Math.min(8, (Number(ler(KEYS.zoomMaxPercent, "400")) || 400) / 100)),
    };
  }

  function obterPautaPadrao() {
    const saved = ler(KEYS.ruling, "horizontal");
    return RULINGS.includes(saved) ? saved : "horizontal";
  }

  function obterLayoutConfig() {
    const number = (key, fallback, min, max) => Math.max(min, Math.min(max, Number(ler(key, String(fallback))) || fallback));
    const layout = ler(KEYS.layoutTemplate, "arvore-horizontal");
    const tension = ler(KEYS.bezierTension, "suave");
    return {
      template: LAYOUTS.includes(layout) ? layout : "arvore-horizontal",
      gapVertical: number(KEYS.gapVertical, 60, 40, 120),
      gapHorizontal: number(KEYS.gapHorizontal, 120, 80, 240),
      gapMultiRoots: number(KEYS.gapMultiRoots, 160, 100, 320),
      bezierTension: ["suave", "rigida", "ortogonal"].includes(tension) ? tension : "suave",
    };
  }

  // Preferências podem ser editadas a partir da Home ou da própria Central de
  // Configurações. Não execute o motor geométrico até a view do Editor estar
  // efetivamente visível.
  function reprocessarCanvasSeEditorAtivo() {
    const editor = obter("view-editor");
    if (!editor || editor.hidden || editor.style.display === "none") return;
    window.MindNoteApp?.reprocessarERenderizar?.();
  }

  function obterPromptMestre() {
    const category = ler(KEYS.promptTemplate, "vestibular");
    const instruction = PROMPTS[category] || PROMPTS.vestibular;
    return `Você é um especialista em transformar fontes de estudo em mapas mentais claros. ${instruction}\n\nResponda exclusivamente com JSON válido, sem Markdown, saudações ou comentários. Use o schema MindNote em português: cada nó tem "titulo" (string não vazia), "anotacao" (null ou objeto com "tipo" igual a "pauta" ou "ilustracao"), "cor" (null ou cor válida) e "filhos" (array de nós recursivos). Use exatamente esses campos estruturais, preserve os fatos da fonte e não invente conteúdo. Formato: {"titulo":"Tema principal","anotacao":null,"cor":null,"filhos":[]}.`;
  }

  function atualizarPainelLayoutEIA() {
    const layout = obterLayoutConfig();
    document.querySelectorAll("#settings-layout-template [data-layout-template]").forEach((button) => {
      const selected = button.dataset.layoutTemplate === layout.template;
      button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("#settings-bezier-tension [data-bezier-tension]").forEach((button) => {
      const selected = button.dataset.bezierTension === layout.bezierTension;
      button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected));
    });
    const category = ler(KEYS.promptTemplate, "vestibular");
    document.querySelectorAll("#settings-prompt-category [data-prompt-category]").forEach((button) => {
      const selected = button.dataset.promptCategory === category;
      button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected));
    });
    const preview = obter("settings-prompt-preview");
    if (preview) preview.textContent = obterPromptMestre();
    [["settings-gap-vertical", KEYS.gapVertical, 60], ["settings-gap-horizontal", KEYS.gapHorizontal, 120], ["settings-gap-multi-roots", KEYS.gapMultiRoots, 160]].forEach(([id, key, fallback]) => {
      const value = String(layout[id === "settings-gap-vertical" ? "gapVertical" : id === "settings-gap-horizontal" ? "gapHorizontal" : "gapMultiRoots"]);
      const input = obter(id); if (input) input.value = value;
      const range = document.querySelector(`[data-range-for="${id}"]`); if (range) range.value = value;
      const output = obter(`${id}-value`); if (output) output.textContent = `${value} px`;
    });
  }

  function anunciarConfiguracaoIA(chave, valor, tipo) {
    emitirPreferencia(chave, valor, tipo || "mindnote:sanitizer-config-change");
  }

  function aplicarPreferencias() {
    const solid = ler(KEYS.uiVariant, "liquid-glass") === "solid-minimalist";
    document.body.classList.toggle("mn-solid-minimalist", solid);
    const layer = obter("mindnote-ui-layer");
    layer?.classList.toggle("mn-solid-minimalist", solid);
    layer?.classList.toggle("mn-liquid-glass", !solid);
    const root = document.documentElement;
    const blur = Math.max(8, Math.min(40, Number(ler(KEYS.blur, "24")) || 24));
    root.style.setProperty("--mn-backdrop-default", `blur(${blur}px) saturate(135%)`);
    const accent = ACCENTS.includes(ler(KEYS.accent, "#8B5CF6").toUpperCase()) ? ler(KEYS.accent, "#8B5CF6").toUpperCase() : "#8B5CF6";
    root.style.setProperty("--mn-action-primary", accent);
    root.style.setProperty("--mn-border-focus", accent);
    const density = ler(KEYS.density, "confortavel");
    root.style.setProperty("--mn-control-touch", density === "compacta" ? "36px" : "44px");
    root.style.setProperty("--mn-ruling-stroke-width", `${Math.max(.5, Math.min(1.5, Number(ler(KEYS.rulingWidth, "1")) || 1))}px`);
    root.style.setProperty("--mn-ruling-opacity", String(Math.max(10, Math.min(60, Number(ler(KEYS.rulingOpacity, "22")) || 22)) / 100));
    const font = ler(KEYS.fontFamily, "system-ui");
    root.style.setProperty("--mn-font-sans", `${font}, system-ui, sans-serif`);
    document.querySelectorAll(".mn-settings-section [data-setting-group]").forEach((button) => {
      const current = button.dataset.settingGroup === "theme" ? (window.MindNoteTheme?.obterPreferencia?.() || "sistema")
        : button.dataset.settingGroup === "variant" ? ler(KEYS.uiVariant, "liquid-glass")
          : button.dataset.settingGroup === "density" ? density : ler(KEYS.ruling, "horizontal");
      const selected = button.dataset.value === current;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".mn-color-swatch").forEach((button) => {
      const selected = button.dataset.color.toUpperCase() === accent;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    atualizarPreviewPauta();
  }

  function carregarPreferencias() {
    const value = (id, val) => { const control = obter(id); if (control) control.value = val; };
    const checked = (id, val) => { const control = obter(id); if (control) control.checked = val; };
    value("settings-theme-select", window.MindNoteTheme?.obterPreferencia?.() || "sistema");
    const oldVariant = ler(KEYS.variant, "liquid");
    const newVariant = ler(KEYS.uiVariant, oldVariant === "solid" ? "solid-minimalist" : "liquid-glass");
    value("settings-visual-variant", newVariant === "solid-minimalist" ? "solid" : "liquid");
    const line = Math.max(18, Math.min(36, Number(ler(KEYS.lineHeight, ler(KEYS.line, "26"))) || 26));
    guardar(KEYS.lineHeight, line);
    guardar(KEYS.line, line);
    value("settings-line-spacing", String(line));
    const editorSpacing = obter("entrada-escala");
    if (editorSpacing) editorSpacing.value = String(line);
    const canvas = obterCanvasConfig();
    value("settings-pan-sensitivity", String(canvas.sensibilidade));
    value("settings-zoom-curve", canvas.curvaZoom);
    value("settings-zoom-min", String(Math.round(canvas.zoomMin * 100)));
    value("settings-zoom-max", String(Math.round(canvas.zoomMax * 100)));
    checked("settings-lock-rotation", canvas.travarRotacao);
    checked("settings-strict-stylus", canvas.modoCanetaEstrita);
    value("settings-pdf-margin", ler(KEYS.pdfMargin, "60"));
    value("settings-pdf-format", ler(KEYS.pdfFormat, "continuo"));
    checked("settings-pdf-render-lines", ler(KEYS.pdfLines, "true") !== "false");
    checked("settings-pdf-embed-metadata", ler(KEYS.pdfMetadata, "true") !== "false");
    checked("settings-anti-chatter", ler(KEYS.sanitizerAggressive, "true") !== "false");
    checked("settings-multi-modal-json", ler(KEYS.sanitizerMulti, "true") !== "false");
    checked("settings-markdown-outline", ler(KEYS.markdownOutline, "true") !== "false");
    value("settings-blur-intensity", ler(KEYS.blur, "24"));
    value("settings-line-height", ler(KEYS.lineHeight, "26"));
    value("settings-ruling-width", ler(KEYS.rulingWidth, "1.0"));
    value("settings-ruling-opacity", ler(KEYS.rulingOpacity, "22"));
    value("settings-font-family", ler(KEYS.fontFamily, "system-ui"));
    atualizarPainelLayoutEIA();
    document.querySelectorAll("#settings-pdf-theme-parity [data-pdf-theme]").forEach((button) => {
      const selected = button.dataset.pdfTheme === ler(KEYS.pdfTheme, "tela");
      button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected));
    });
    atualizarRotulosCanvas();
    atualizarRotulosRange();
    aplicarPreferencias();
    atualizarRotulosAvancados();
  }

  function emitirPreferencia(chave, valor, evento = "mindnote:settings-change") {
    window.dispatchEvent(new CustomEvent(evento, { detail: { key: chave, value: valor } }));
    if (evento !== "mindnote:settings-change") window.dispatchEvent(new CustomEvent("mindnote:settings-change", { detail: { key: chave, value: valor } }));
  }

  function atualizarRotulosAvancados() {
    const text = (id, value) => { const node = obter(id); if (node) node.textContent = value; };
    text("settings-blur-intensity-value", `${obter("settings-blur-intensity")?.value || ler(KEYS.blur, "24")} px`);
    text("settings-line-height-value", `${obter("settings-line-height")?.value || ler(KEYS.lineHeight, "26")} px`);
    text("settings-ruling-width-value", `${Number(obter("settings-ruling-width")?.value || ler(KEYS.rulingWidth, "1.0")).toFixed(1)} px`);
    text("settings-ruling-opacity-value", `${obter("settings-ruling-opacity")?.value || ler(KEYS.rulingOpacity, "22")}%`);
  }

  function atualizarPreviewPauta() {
    const group = obter("settings-ruling-preview-content");
    if (!group) return;
    const type = RULINGS.includes(ler(KEYS.ruling, "horizontal")) ? ler(KEYS.ruling, "horizontal") : "horizontal";
    const line = Math.max(18, Math.min(36, Number(ler(KEYS.lineHeight, "26")) || 26));
    const stroke = Math.max(.5, Math.min(1.5, Number(ler(KEYS.rulingWidth, "1")) || 1));
    const opacity = Math.max(10, Math.min(60, Number(ler(KEYS.rulingOpacity, "22")) || 22)) / 100;
    const accent = ACCENTS.includes(ler(KEYS.accent, "#8B5CF6").toUpperCase()) ? ler(KEYS.accent, "#8B5CF6").toUpperCase() : "#8B5CF6";
    const fontOptions = ["system-ui", "Inter", "SF Pro, -apple-system, BlinkMacSystemFont", "Segoe UI", "Roboto"];
    const savedFont = obter("settings-font-family")?.value || ler(KEYS.fontFamily, "system-ui");
    const title = fontOptions.includes(savedFont) ? savedFont : "system-ui";
    const defs = `<defs><pattern id="mn-preview-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="${accent}" stroke-opacity="${opacity}" stroke-width="${stroke}"/></pattern><pattern id="mn-preview-dots" width="${line}" height="${line}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${accent}" fill-opacity="${opacity}"/></pattern></defs>`;
    const x0 = 48, y0 = 116, width = 424, height = 116;
    let ruling = "";
    if (type === "horizontal") {
      for (let y = y0 + line; y < y0 + height; y += line) ruling += `<path d="M${x0} ${y}H${x0 + width}"/>`;
    } else if (type === "quadriculada") ruling = `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="url(#mn-preview-grid)"/>`;
    else if (type === "pontos") ruling = `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="url(#mn-preview-dots)"/>`;
    else ruling = `<path d="M${x0 + 105} ${y0}V${y0 + height}"/><path d="M${x0} ${y0 + 3 * line}H${x0 + width}"/>`;
    group.innerHTML = `${defs}<rect x="34" y="24" width="452" height="50" rx="16" fill="${accent}" fill-opacity=".16" stroke="${accent}" stroke-width="1.5"/><text x="260" y="55" text-anchor="middle" font-family="${title}" font-size="18" font-weight="600" fill="currentColor">Anotação de exemplo</text><rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="8" fill="var(--mn-preview-paper,#fff)" stroke="${accent}" stroke-opacity=".35"/><g fill="none" stroke="${accent}" stroke-opacity="${opacity}" stroke-width="${stroke}">${ruling}</g><text x="54" y="${y0 + line - 5}" font-family="${title}" font-size="13" fill="var(--mn-preview-ink,#34313d)">Caligrafia alinhada à entrelinha de ${line}px</text>`;
  }

  function carregarCredenciais() {
    let config = {};
    try { config = JSON.parse(localStorage.getItem(KEYS.sync) || "{}"); } catch { config = {}; }
    obter("sync-input-url").value = typeof config.url === "string" ? config.url : "";
    obter("sync-input-key").value = typeof config.apiKey === "string" ? config.apiKey : "";
    obter("sync-input-senha").value = typeof config.senha === "string" ? config.senha : "";
    const status = obter("settings-sync-status");
    if (status) status.textContent = config.url && config.apiKey ? "Credenciais locais disponíveis · conexão ainda não testada." : "Não testada nesta sessão.";
  }

  function abrir(tab = "usuario") {
    if (window.MindNoteRouter?.navegarPara) window.MindNoteRouter.navegarPara("config", null, { tab });
    else mostrarPagina(tab);
  }

  function mostrarPagina(tab = "usuario") {
    const envelope = obter("mn-settings-envelope");
    if (!envelope) return;
    carregarPreferencias();
    carregarCredenciais();
    envelope.dataset.open = "true";
    envelope.setAttribute("aria-hidden", "false");
    sincronizarVisibilidadeDev();
    alternarAba(tab);
    obter(`settings-tab-${tab}`)?.focus();
  }

  function fechar() {
    const envelope = obter("mn-settings-envelope");
    if (!envelope || envelope.dataset.open !== "true") return;
    envelope.dataset.open = "false";
    envelope.setAttribute("aria-hidden", "true");
    controlarMonitorFPS();
    window.MindNoteRouter?.voltar?.();
  }

  function alternarAba(nome) {
    const aceitas = ["usuario", "canvas", "pdf", "sync", "layout", "iahub", "pautas", "dev"];
    if (!aceitas.includes(nome) || (nome === "dev" && !devDesbloqueado())) nome = "usuario";
    abaAtual = nome;
    document.querySelectorAll(".mn-settings-tab").forEach((tab) => {
      const selected = tab.dataset.tab === nome && !tab.hidden;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll(".mn-settings-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== nome; });
    if (nome === "dev") atualizarDiagnostico().catch((erro) => anunciar("settings-backup-feedback", `Falha no diagnóstico: ${erro.message}`, true));
    if (nome === "sync") carregarCredenciais();
    controlarMonitorFPS();
  }

  function sincronizarVisibilidadeDev() {
    const tab = obter("settings-tab-dev");
    const podeVer = devDesbloqueado();
    if (tab) tab.hidden = !podeVer;
    if (!podeVer && abaAtual === "dev") alternarAba("usuario");
    atualizarHUD();
    controlarMonitorFPS();
    window.MindNoteBackstage?.atualizarMetadados?.();
    window.MindNoteBackstage?.sincronizarTelemetria?.();
  }

  function atualizarRotulosRange() {
    const pairs = [["settings-pan-sensitivity", "settings-pan-sensitivity-value", (v) => `${Number(v).toFixed(1).replace(".", ",")}×`]];
    pairs.forEach(([inputId, outputId, fmt]) => { const input = obter(inputId); const output = obter(outputId); if (input && output) output.textContent = fmt(input.value); });
  }

  function atualizarRotulosCanvas() {
    const set = (id, value) => { const node = obter(id); if (node) node.textContent = value; };
    set("settings-zoom-min-value", `${obter("settings-zoom-min")?.value || 10}%`);
    set("settings-zoom-max-value", `${obter("settings-zoom-max")?.value || 400}%`);
    set("settings-pdf-margin-value", `${obter("settings-pdf-margin")?.value || 60} px`);
  }

  function aplicarLimiteCameraAtual() {
    const svg = document.querySelector("#canvas-container svg");
    const estado = window.MindNoteCamera?.capturarEstado?.(svg);
    if (svg && estado) window.MindNoteCamera?.restaurarEstado?.(svg, estado);
  }

  function salvarSync() {
    const url = obter("sync-input-url").value.trim();
    const apiKey = obter("sync-input-key").value.trim();
    const senha = obter("sync-input-senha").value.trim();
    let parsed;
    try { parsed = new URL(url); } catch { anunciar("settings-sync-feedback", "Informe uma URL válida do Supabase.", true); return; }
    if (parsed.protocol !== "https:" || !parsed.hostname) { anunciar("settings-sync-feedback", "A URL do projeto deve usar HTTPS.", true); return; }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) { anunciar("settings-sync-feedback", "Informe apenas a URL base do projeto Supabase.", true); return; }
    if (!apiKey) { anunciar("settings-sync-feedback", "Informe a chave pública anon.", true); return; }
    if (senha.length < 8) { anunciar("settings-sync-feedback", "Use uma senha E2EE com pelo menos 8 caracteres.", true); return; }
    obter("sync-input-senha").value = senha;
    if (!guardar(KEYS.sync, JSON.stringify({ url: parsed.origin, apiKey, senha }))) { anunciar("settings-sync-feedback", "Não foi possível salvar neste navegador.", true); return; }
    anunciar("settings-sync-feedback", "Salvo com sucesso.");
    const status = obter("settings-sync-status");
    if (status) status.textContent = "Credenciais salvas localmente · conexão ainda não testada.";
    window.dispatchEvent(new Event("mindnote:sync-config-changed"));
  }

  async function testarConexao() {
    const status = obter("settings-sync-status");
    const button = obter("btn-testar-sync");
    const url = obter("sync-input-url").value.trim().replace(/\/+$/, "");
    const apiKey = obter("sync-input-key").value.trim();
    const campoSenha = obter("sync-input-senha");
    campoSenha.value = campoSenha.value.trim();
    if (!url || !apiKey) { if (status) status.textContent = "Preencha URL e chave anon antes do teste."; return; }
    let parsed;
    try { parsed = new URL(url); } catch { if (status) status.textContent = "URL inválida."; return; }
    if (parsed.protocol !== "https:") { if (status) status.textContent = "A conexão exige HTTPS."; return; }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) { if (status) status.textContent = "Informe apenas a URL base do projeto Supabase."; return; }
    const baseUrl = parsed.origin;
    if (!guardar(KEYS.sync, JSON.stringify({ url: baseUrl, apiKey, senha: campoSenha.value }))) {
      if (status) status.textContent = "Não foi possível salvar as credenciais normalizadas neste navegador.";
      return;
    }
    obter("sync-input-url").value = baseUrl;
    button.disabled = true;
    if (status) status.textContent = "Testando endpoint REST do Supabase…";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${baseUrl}/rest/v1/`, { method: "GET", headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }, signal: controller.signal });
      if (response.status !== 200) throw new Error(`Supabase respondeu HTTP ${response.status}.`);
      if (status) status.textContent = "Conectado à API REST · HTTP 200; acesso à tabela de dados ainda não verificado.";
      window.dispatchEvent(new Event("mindnote:sync-config-changed"));
    } catch (erro) {
      if (status) status.textContent = erro.name === "AbortError" ? "Tempo limite ao testar a conexão." : `Falha na conexão: ${erro.message}`;
    } finally { window.clearTimeout(timeout); button.disabled = false; }
  }

  function salvarPreferencia(id, key, normalizar = (value) => value) {
    const input = obter(id);
    if (!input) return;
    const value = normalizar(input.type === "checkbox" ? input.checked : input.value);
    if (value === null) return;
    guardar(key, value);
    aplicarPreferencias();
  }

  function configurarPreferenciasUI() {
    obter("settings-theme-select")?.addEventListener("change", (event) => {
      const tema = window.MindNoteTheme?.guardar?.(event.target.value);
      if (tema) window.dispatchEvent(new CustomEvent("mindnote:theme-change", { detail: { theme: tema } }));
    });
    obter("settings-visual-variant")?.addEventListener("change", (event) => {
      const value = event.target.value === "solid" ? "solid-minimalist" : "liquid-glass";
      guardar(KEYS.variant, event.target.value); guardar(KEYS.uiVariant, value); aplicarPreferencias();
      emitirPreferencia(KEYS.uiVariant, value);
    });
    obter("settings-line-spacing")?.addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (!Number.isInteger(value) || value < 18 || value > 36) { event.target.value = ler(KEYS.lineHeight, "26"); return; }
      guardar(KEYS.line, value);
      guardar(KEYS.lineHeight, value);
      const editor = obter("entrada-escala");
      if (editor) editor.value = String(value);
      reprocessarCanvasSeEditorAtivo();
    });
    obter("settings-pan-sensitivity")?.addEventListener("input", (event) => {
      guardar(KEYS.panSensitivity, event.target.value); atualizarRotulosRange(); emitirPreferencia(KEYS.panSensitivity, Number(event.target.value));
    });
    obter("settings-zoom-curve")?.addEventListener("change", (event) => {
      guardar(KEYS.zoomCurve, event.target.value); emitirPreferencia(KEYS.zoomCurve, event.target.value);
    });
    obter("settings-zoom-min")?.addEventListener("input", (event) => {
      const value = Math.max(10, Math.min(50, Number(event.target.value) || 10));
      guardar(KEYS.zoomMinPercent, value); atualizarRotulosCanvas(); aplicarLimiteCameraAtual();
      emitirPreferencia(KEYS.zoomMinPercent, value);
    });
    obter("settings-zoom-max")?.addEventListener("input", (event) => {
      const value = Math.max(100, Math.min(800, Number(event.target.value) || 400));
      guardar(KEYS.zoomMaxPercent, value); atualizarRotulosCanvas(); aplicarLimiteCameraAtual();
      emitirPreferencia(KEYS.zoomMaxPercent, value);
    });
    obter("settings-lock-rotation")?.addEventListener("change", (event) => {
      guardar(KEYS.lockRotation, event.target.checked); emitirPreferencia(KEYS.lockRotation, event.target.checked);
    });
    obter("settings-strict-stylus")?.addEventListener("change", (event) => {
      guardar(KEYS.strictStylus, event.target.checked); emitirPreferencia(KEYS.strictStylus, event.target.checked);
    });
    obter("settings-pdf-margin")?.addEventListener("change", (event) => {
      const value = Math.max(20, Math.min(150, Number(event.target.value) || 60));
      event.target.value = String(value); guardar(KEYS.pdfMargin, value); atualizarRotulosCanvas(); emitirPreferencia(KEYS.pdfMargin, value);
    });
    document.querySelectorAll("[data-step-for='settings-pdf-margin']").forEach((button) => button.addEventListener("click", () => {
      const input = obter(button.dataset.stepFor); if (!input) return;
      input.value = String(Math.max(20, Math.min(150, Number(input.value || 60) + Number(button.dataset.step))));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    obter("settings-pdf-format")?.addEventListener("change", (event) => {
      const format = ["continuo", "a4-paisagem", "a3-estudo"].includes(event.target.value) ? event.target.value : "continuo";
      event.target.value = format; guardar(KEYS.pdfFormat, format); emitirPreferencia(KEYS.pdfFormat, format);
    });
    obter("settings-pdf-theme-parity")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-pdf-theme]"); if (!button) return;
      guardar(KEYS.pdfTheme, button.dataset.pdfTheme);
      document.querySelectorAll("#settings-pdf-theme-parity [data-pdf-theme]").forEach((item) => {
        const selected = item === button; item.classList.toggle("is-selected", selected); item.setAttribute("aria-pressed", String(selected));
      });
      emitirPreferencia(KEYS.pdfTheme, button.dataset.pdfTheme);
    });
    obter("settings-pdf-render-lines")?.addEventListener("change", (event) => {
      guardar(KEYS.pdfLines, event.target.checked); emitirPreferencia(KEYS.pdfLines, event.target.checked);
    });
    obter("settings-pdf-embed-metadata")?.addEventListener("change", (event) => {
      guardar(KEYS.pdfMetadata, event.target.checked); emitirPreferencia(KEYS.pdfMetadata, event.target.checked);
    });
    const mudarLayout = (key, value) => {
      guardar(key, value); atualizarPainelLayoutEIA();
      emitirPreferencia(key, value, "mindnote:layout-change");
      reprocessarCanvasSeEditorAtivo();
    };
    obter("settings-layout-template")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-layout-template]");
      if (button && LAYOUTS.includes(button.dataset.layoutTemplate)) mudarLayout(KEYS.layoutTemplate, button.dataset.layoutTemplate);
    });
    [["settings-gap-vertical", KEYS.gapVertical, 40, 120], ["settings-gap-horizontal", KEYS.gapHorizontal, 80, 240], ["settings-gap-multi-roots", KEYS.gapMultiRoots, 100, 320]].forEach(([id, key, min, max]) => {
      const update = (event) => {
        const step = Number(event.target.step) || 1;
        const value = Math.max(min, Math.min(max, Math.round(Number(event.target.value) / step) * step));
        guardar(key, value);
        const numeric = obter(id); if (numeric && event.target !== numeric) numeric.value = String(value);
        const range = document.querySelector(`[data-range-for="${id}"]`); if (range && event.target !== range) range.value = String(value);
        atualizarPainelLayoutEIA(); emitirPreferencia(key, value, "mindnote:layout-change");
        reprocessarCanvasSeEditorAtivo();
      };
      obter(id)?.addEventListener("change", update);
      document.querySelector(`[data-range-for="${id}"]`)?.addEventListener("input", update);
    });
    document.querySelectorAll("[data-step-for^='settings-gap-']").forEach((button) => button.addEventListener("click", () => {
      const input = obter(button.dataset.stepFor); if (!input) return;
      input.value = String(Number(input.value) + Number(button.dataset.step));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    obter("settings-bezier-tension")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-bezier-tension]");
      if (button && ["suave", "rigida", "ortogonal"].includes(button.dataset.bezierTension)) mudarLayout(KEYS.bezierTension, button.dataset.bezierTension);
    });
    obter("settings-prompt-category")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-prompt-category]");
      if (!button || !Object.prototype.hasOwnProperty.call(PROMPTS, button.dataset.promptCategory)) return;
      guardar(KEYS.promptTemplate, button.dataset.promptCategory); atualizarPainelLayoutEIA();
      emitirPreferencia(KEYS.promptTemplate, button.dataset.promptCategory, "mindnote:prompt-template-change");
    });
    [["settings-anti-chatter", KEYS.sanitizerAggressive], ["settings-multi-modal-json", KEYS.sanitizerMulti], ["settings-markdown-outline", KEYS.markdownOutline]].forEach(([id, key]) => {
      obter(id)?.addEventListener("change", (event) => {
        guardar(key, event.target.checked); emitirPreferencia(key, event.target.checked, "mindnote:sanitizer-config-change");
      });
    });
    obter("settings-theme-mode")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-value]");
      if (!button) return;
      const theme = window.MindNoteTheme?.guardar?.(button.dataset.value);
      document.documentElement.dataset.mnTheme = button.dataset.value;
      if (theme) window.dispatchEvent(new CustomEvent("mindnote:theme-change", { detail: { theme } }));
      emitirPreferencia("mindnote_theme_pref", button.dataset.value, "mindnote:theme-change");
      aplicarPreferencias();
    });
    obter("settings-ui-variant")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-value]"); if (!button) return;
      guardar(KEYS.uiVariant, button.dataset.value);
      guardar(KEYS.variant, button.dataset.value === "solid-minimalist" ? "solid" : "liquid");
      aplicarPreferencias(); emitirPreferencia(KEYS.uiVariant, button.dataset.value);
    });
    obter("settings-ui-density")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-value]"); if (!button) return;
      guardar(KEYS.density, button.dataset.value); aplicarPreferencias(); emitirPreferencia(KEYS.density, button.dataset.value);
    });
    obter("settings-default-ruling")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-value]"); if (!button || !RULINGS.includes(button.dataset.value)) return;
      guardar(KEYS.ruling, button.dataset.value); aplicarPreferencias(); emitirPreferencia(KEYS.ruling, button.dataset.value, "mindnote:ruling-change");
    });
    obter("settings-accent-color")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-color]"); if (!button || !ACCENTS.includes(button.dataset.color?.toUpperCase?.())) return;
      guardar(KEYS.accent, button.dataset.color.toUpperCase()); aplicarPreferencias(); emitirPreferencia(KEYS.accent, button.dataset.color.toUpperCase(), "mindnote:accent-change");
    });
    obter("settings-blur-intensity")?.addEventListener("input", (event) => {
      const value = Math.max(8, Math.min(40, Number(event.target.value) || 24));
      guardar(KEYS.blur, value); atualizarRotulosAvancados();
      window.clearTimeout(blurTimer); blurTimer = window.setTimeout(() => {
        document.documentElement.style.setProperty("--mn-backdrop-default", `blur(${value}px) saturate(135%)`);
        emitirPreferencia(KEYS.blur, value);
      }, 100);
    });
    obter("settings-line-height")?.addEventListener("input", (event) => {
      const value = Math.max(18, Math.min(36, Number(event.target.value) || 26));
      event.target.value = String(value); guardar(KEYS.lineHeight, value); guardar(KEYS.line, value);
      const legacy = obter("settings-line-spacing"); if (legacy) legacy.value = String(value);
      const editor = obter("entrada-escala"); if (editor) editor.value = String(value);
      atualizarRotulosAvancados(); aplicarPreferencias(); reprocessarCanvasSeEditorAtivo();
      emitirPreferencia(KEYS.lineHeight, value, "mindnote:ruling-change");
    });
    document.querySelectorAll("[data-step-for='settings-line-height']").forEach((button) => button.addEventListener("click", () => {
      const input = obter(button.dataset.stepFor); if (!input) return;
      input.value = String(Math.max(18, Math.min(36, Number(input.value || 26) + Number(button.dataset.step))));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }));
    [["settings-ruling-width", KEYS.rulingWidth], ["settings-ruling-opacity", KEYS.rulingOpacity]].forEach(([id, key]) => {
      obter(id)?.addEventListener("input", (event) => {
        guardar(key, event.target.value); atualizarRotulosAvancados(); aplicarPreferencias();
        emitirPreferencia(key, Number(event.target.value), "mindnote:ruling-change");
      });
    });
    obter("settings-font-family")?.addEventListener("change", (event) => {
      guardar(KEYS.fontFamily, event.target.value); aplicarPreferencias(); emitirPreferencia(KEYS.fontFamily, event.target.value);
    });
  }

  function validarNo(no, caminho) {
    const cores = ["#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626"];
    if (!no || typeof no !== "object" || Array.isArray(no) || typeof no.titulo !== "string" || !no.titulo.trim()) throw new Error(`${caminho}: nó inválido ou sem título.`);
    if (!Object.prototype.hasOwnProperty.call(no, "anotacao") || (no.anotacao !== null && (!no.anotacao || !["pauta", "ilustracao"].includes(no.anotacao.tipo)))) throw new Error(`${caminho}: anotação inválida.`);
    if (!Object.prototype.hasOwnProperty.call(no, "cor") || (no.cor !== null && !cores.includes(no.cor))) throw new Error(`${caminho}: cor inválida.`);
    if (!Array.isArray(no.filhos)) throw new Error(`${caminho}: filhos deve ser uma lista.`);
    no.filhos.forEach((child, index) => validarNo(child, `${caminho}.filhos[${index}]`));
  }

  function sanitizarMiniatura(svg) {
    if (svg == null || svg === "") return null;
    const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (xml.documentElement.localName !== "svg" || xml.querySelector("parsererror")) throw new Error("Miniatura SVG inválida no backup.");
    xml.querySelectorAll("script,foreignObject,iframe,object,embed,style").forEach((node) => node.remove());
    xml.querySelectorAll("*").forEach((node) => [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase(), value = attr.value.trim();
      if (name.startsWith("on") || /javascript\s*:/i.test(value) || ((name === "href" || name.endsWith(":href") || name === "src") && value && !value.startsWith("#")) || (name === "style" && /url\s*\(/i.test(value))) node.removeAttribute(attr.name);
    }));
    return new XMLSerializer().serializeToString(xml.documentElement);
  }

  async function reunirBackup() {
    const metas = await window.MindNoteDB.listarMetas();
    const mapas = [];
    for (const meta of metas) {
      const registro = await window.MindNoteDB.carregarMapa(meta.id);
      if (!registro) throw new Error(`O mapa “${meta.titulo}” está incompleto.`);
      mapas.push({ meta: registro.meta, arvores: registro.arvores, thumbnail: await window.MindNoteDB.carregarThumbnail(meta.id) });
    }
    return { format: "mindnote-backup", version: 2, exportedAt: new Date().toISOString(), categories: await window.MindNoteDB.listarCategorias(), maps: mapas };
  }

  async function atualizarDiagnostico() {
    const diag = await window.MindNoteDB.obterDiagnostico();
    const count = (id, key) => { const node = obter(id); if (node) node.textContent = String(diag.stores[key] || 0); };
    count("settings-map-count", "maps_meta");
    count("settings-record-count", "maps_data");
    count("settings-thumb-count", "maps_thumbnails");
    count("settings-category-count", "maps_categories");
    const version = obter("settings-db-version");
    if (version) version.textContent = `IndexedDB ${diag.nome} · versão ${diag.versao} · stores: ${Object.keys(diag.stores).length}`;
    const mem = performance.memory?.usedJSHeapSize;
    const arvores = window.MindNoteApp?.obterArvoresAtuais?.() || [];
    const contar = (no) => 1 + (Array.isArray(no?.filhos) ? no.filhos.reduce((sum, filho) => sum + contar(filho), 0) : 0);
    const nos = Array.isArray(arvores) ? arvores.reduce((sum, root) => sum + contar(root), 0) : 0;
    const memoria = obter("settings-memory-diagnostic");
    if (memoria) memoria.textContent = `Heap: ${mem ? `${(mem / 1048576).toFixed(1)} MB` : "não suportado"} · Nós no grafo ativo: ${nos}`;
    const storage = obter("settings-storage-estimate");
    if (storage) {
      if (navigator.storage?.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        storage.textContent = `Armazenamento do site: ${usage == null ? "—" : `${(usage / 1048576).toFixed(2)} MB`} usado de ${quota == null ? "—" : `${(quota / 1048576).toFixed(0)} MB`}.`;
      } else storage.textContent = "Estimativa de armazenamento não suportada neste navegador.";
    }
  }

  function obterSnapshotTelemetria() {
    const arvores = window.MindNoteApp?.obterArvoresAtuais?.() || [];
    const contar = (no) => 1 + (Array.isArray(no?.filhos) ? no.filhos.reduce((sum, filho) => sum + contar(filho), 0) : 0);
    nosAtuais = arvores.reduce((sum, raiz) => sum + contar(raiz), 0);
    let heap = null;
    try { heap = performance.memory?.usedJSHeapSize || null; } catch { heap = null; }
    const root = document.querySelector("#canvas-container svg #viewport-root");
    const helpers = root ? [...root.querySelectorAll(".mindnote-hitbox, .mindnote-handle, #micro-toolbar")] : [];
    const displays = helpers.map((element) => element.style.display);
    try {
      helpers.forEach((element) => { element.style.display = "none"; });
      const bounds = root?.getBBox?.();
      bboxAtual = bounds && bounds.width && bounds.height
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        : null;
    } catch { bboxAtual = null; }
    finally { helpers.forEach((element, index) => { element.style.display = displays[index]; }); }
    return { fps: fpsAtual, heapBytes: heap, nodes: nosAtuais, bounds: bboxAtual };
  }

  function formatarHeap(bytes) { return bytes == null ? "não suportado" : `${(bytes / 1048576).toFixed(1)} MB`; }

  function atualizarHUD() {
    let hud = obter("mn-dev-hud");
    if (!hud) {
      hud = document.createElement("output");
      hud.id = "mn-dev-hud";
      hud.className = "mn-dev-hud";
      hud.setAttribute("data-mindnote-ui", "");
      hud.setAttribute("aria-live", "off");
      obter("view-editor")?.appendChild(hud);
    }
    const habilitado = devDesbloqueado() && ler(KEYS.hud, "false") === "true";
    hud.hidden = !habilitado;
    if (habilitado) {
      const dados = obterSnapshotTelemetria();
      hud.textContent = `FPS: ${dados.fps}  |  Heap: ${formatarHeap(dados.heapBytes)}  |  Nós: ${dados.nodes}`;
    }
  }

  function monitorFPSAtivo() {
    const bastidoresAbertos = obter("json-backstage-envelope")?.dataset.open === "true";
    const metadadosAtivos = document.querySelector('#json-backstage [data-tab="meta"]')?.classList.contains("is-active");
    return devDesbloqueado() && (
      ler(KEYS.hud, "false") === "true" ||
      (obter("view-config")?.style.display !== "none" && obter("mn-settings-envelope")?.dataset.open === "true" && obter("settings-tab-dev")?.classList.contains("is-active")) ||
      (bastidoresAbertos && metadadosAtivos)
    );
  }

  function controlarMonitorFPS() {
    const ativo = monitorFPSAtivo();
    if (!ativo) {
      if (fpsFrame) cancelAnimationFrame(fpsFrame);
      fpsFrame = 0;
      fpsAtual = 0;
      atualizarHUD();
      return;
    }
    if (fpsFrame) return;
    fpsFrames = 0;
    fpsStart = performance.now();
    const tick = (now) => {
      if (!monitorFPSAtivo()) { fpsFrame = 0; atualizarHUD(); return; }
      fpsFrames += 1;
      if (now - fpsStart >= 500) {
        fpsAtual = Math.round(fpsFrames * 1000 / (now - fpsStart));
        fpsFrames = 0;
        fpsStart = now;
        const snapshot = obterSnapshotTelemetria();
        const output = obter("settings-fps-value");
        if (output) output.textContent = `${snapshot.fps} FPS`;
        const memory = obter("settings-memory-diagnostic");
        if (memory) memory.textContent = `Heap: ${formatarHeap(snapshot.heapBytes)} · Nós no grafo ativo: ${snapshot.nodes}`;
        atualizarHUD();
      }
      fpsFrame = requestAnimationFrame(tick);
    };
    fpsFrame = requestAnimationFrame(tick);
  }

  async function exportarBackup() {
    const button = obter("btn-backup-exportar");
    button.disabled = true;
    anunciar("settings-backup-feedback", "Preparando dump completo…");
    try {
      const data = await reunirBackup();
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `mindnote-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
      anunciar("settings-backup-feedback", `${data.maps.length} mapa(s) e ${data.categories.length} pasta(s) exportados.`);
    } catch (error) { anunciar("settings-backup-feedback", `Falha ao exportar: ${error.message}`, true); }
    finally { button.disabled = false; }
  }

  function validarBackup(backup) {
    if (!backup || backup.format !== "mindnote-backup" || ![1, 2].includes(backup.version) || !Array.isArray(backup.maps)) throw new Error("Arquivo inválido. Selecione um backup MindNote completo.");
    const ids = new Set();
    backup.maps.forEach((mapa, index) => {
      if (!mapa?.meta || typeof mapa.meta.id !== "string" || !mapa.meta.id || typeof mapa.meta.titulo !== "string" || !mapa.meta.titulo.trim()) throw new Error(`maps[${index}]: metadados inválidos.`);
      if (ids.has(mapa.meta.id)) throw new Error(`maps[${index}]: ID duplicado.`);
      ids.add(mapa.meta.id);
      if (!Array.isArray(mapa.arvores) || !mapa.arvores.length) throw new Error(`maps[${index}]: árvore inválida.`);
      mapa.arvores.forEach((root, rootIndex) => validarNo(root, `maps[${index}].arvores[${rootIndex}]`));
      mapa.thumbnail = sanitizarMiniatura(mapa.thumbnail);
      if (mapa.meta.tema != null && !["claro", "escuro"].includes(mapa.meta.tema)) throw new Error(`maps[${index}]: tema inválido.`);
    });
    if (backup.categories != null && (!Array.isArray(backup.categories) || backup.categories.some((category) => typeof category?.nome !== "string" || !category.nome.trim()))) throw new Error("Lista de pastas inválida no backup.");
    return backup;
  }

  async function importarBackup(file) {
    if (!file) return;
    anunciar("settings-backup-feedback", "Validando dump…");
    try {
      const backup = validarBackup(JSON.parse(await file.text()));
      const nomesCategoria = new Map();
      for (const category of backup.categories || []) {
        const categoriaCriada = await window.MindNoteDB.criarCategoria(category.nome);
        if (categoriaCriada) nomesCategoria.set(category.nome.toLocaleLowerCase("pt-BR"), categoriaCriada.nome);
      }
      for (const map of backup.maps) {
        await window.MindNoteDB.salvarMapa(map.meta.id, map.meta.titulo, map.arvores, map.thumbnail, map.meta.tema || "claro");
        let categoria = map.meta.categoria || null;
        if (categoria) {
          const categoriaCriada = await window.MindNoteDB.criarCategoria(categoria);
          categoria = nomesCategoria.get(categoria.toLocaleLowerCase("pt-BR")) || categoriaCriada?.nome || categoria;
        }
        await window.MindNoteDB.atualizarOrganizacao(map.meta.id, { favorito: map.meta.favorito === true, categoria });
      }
      await window.MindNoteHome?.atualizarListaDeMapas?.();
      await window.MindNoteSidebar?.atualizar?.(await window.MindNoteDB.listarMetas());
      await atualizarDiagnostico();
      anunciar("settings-backup-feedback", `${backup.maps.length} mapa(s) restaurados. IDs existentes foram atualizados.`);
    } catch (error) { anunciar("settings-backup-feedback", `Falha ao restaurar: ${error.message}`, true); }
  }

  async function resetarBanco() {
    if (!window.confirm("Isso apagará todos os mapas e pastas deste navegador.")) return;
    if (window.prompt('Digite exatamente "RESETAR" para confirmar o reset de fábrica:', "") !== "RESETAR") { anunciar("settings-backup-feedback", "Reset cancelado: confirmação não correspondeu.", true); return; }
    try {
      await window.MindNoteDB.limparBanco();
      await window.MindNoteHome?.atualizarListaDeMapas?.();
      await window.MindNoteSidebar?.atualizar?.([]);
      await atualizarDiagnostico();
      anunciar("settings-backup-feedback", "Banco local resetado.");
    } catch (error) { anunciar("settings-backup-feedback", `Falha ao resetar: ${error.message}`, true); }
  }

  function configurarHitboxes() {
    const toggle = obter("settings-hitboxes");
    if (!toggle) return;
    toggle.checked = ler(KEYS.hitboxes, "false") === "true";
    document.body.classList.toggle("mn-debug-hitboxes", toggle.checked);
    toggle.addEventListener("change", (event) => {
      guardar(KEYS.hitboxes, event.target.checked);
      document.body.classList.toggle("mn-debug-hitboxes", event.target.checked);
    });
  }

  function configurarHUD() {
    const toggle = obter("settings-hud-enabled");
    if (!toggle) return;
    toggle.checked = ler(KEYS.hud, "false") === "true";
    toggle.addEventListener("change", (event) => {
      guardar(KEYS.hud, event.target.checked);
      atualizarHUD();
      controlarMonitorFPS();
    });
  }

  function configurarRevelacao(buttonId, inputId) {
    obter(buttonId)?.addEventListener("click", () => {
      const input = obter(inputId), mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      obter(buttonId).textContent = mostrar ? "Ocultar" : "Mostrar";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    carregarPreferencias();
    configurarPreferenciasUI();
    configurarHitboxes();
    configurarHUD();
    controlarMonitorFPS();
    obter("btn-settings-close")?.addEventListener("click", fechar);
    obter("config-nav-home")?.addEventListener("click", () => window.MindNoteRouter?.navegarPara?.("home"));
    obter("config-theme-toggle")?.addEventListener("click", () => window.MindNoteTheme?.alternar?.());
    obter("btn-editor-settings")?.addEventListener("click", () => window.MindNoteRouter?.navegarPara?.("config"));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && obter("view-config")?.style.display !== "none" && obter("mn-settings-envelope")?.dataset.open === "true") fechar();
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const tab = event.target.closest?.(".mn-settings-tab");
      if (!tab) return;
      const tabs = [...document.querySelectorAll(".mn-settings-tab:not([hidden])")];
      const index = tabs.indexOf(tab), step = event.key === "ArrowRight" ? 1 : -1;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length];
      alternarAba(next.dataset.tab); next.focus();
    });
    document.querySelectorAll(".mn-settings-tab").forEach((tab) => tab.addEventListener("click", () => alternarAba(tab.dataset.tab)));
    window.addEventListener("mindnote:dev-mode-change", sincronizarVisibilidadeDev);
    window.addEventListener("mindnote:backstage-change", controlarMonitorFPS);
    obter("btn-salvar-sync")?.addEventListener("click", salvarSync);
    obter("btn-testar-sync")?.addEventListener("click", testarConexao);
    configurarRevelacao("sync-toggle-key", "sync-input-key");
    configurarRevelacao("sync-toggle-senha", "sync-input-senha");
    obter("btn-backup-exportar")?.addEventListener("click", exportarBackup);
    obter("btn-backup-importar")?.addEventListener("click", () => obter("input-backup-importar")?.click());
    obter("input-backup-importar")?.addEventListener("change", async (event) => { await importarBackup(event.target.files?.[0]); event.target.value = ""; });
    obter("btn-backup-reset")?.addEventListener("click", resetarBanco);
    sincronizarVisibilidadeDev();
  });

  return {
    abrir,
    fechar,
    mostrarPagina,
    alternarAba,
    sincronizarVisibilidadeDev,
    obterCanvasConfig,
    obterPautaPadrao,
    obterLayoutConfig,
    obterPromptMestre,
    obterSnapshotTelemetria,
    atualizarDiagnostico,
    devDesbloqueado,
  };
})();

window.MindNoteSettings = MindNoteSettings;
window.MindNoteDevTelemetry = { obterSnapshot: () => MindNoteSettings.obterSnapshotTelemetria() };
