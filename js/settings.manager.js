"use strict";

/* Preferências globais, BYOB, diagnóstico e backup do MindNote. */
const MindNoteSettings = (() => {
  const KEYS = {
    line: "mindnote_default_line_spacing",
    variant: "mindnote_visual_variant",
    sensitivity: "mindnote_camera_sensitivity",
    rotationLock: "mindnote_rotation_lock",
    zoomMin: "mindnote_zoom_min",
    zoomMax: "mindnote_zoom_max",
    sync: "mindnote_sync_config",
    dev: "dev_mode_unlocked",
    hitboxes: "mindnote_dev_hitboxes",
    hud: "mindnote_dev_hud_enabled",
  };
  let abaAtual = "usuario";
  let feedbackTimer = 0;
  let fpsFrame = 0;
  let fpsFrames = 0;
  let fpsStart = 0;
  let fpsAtual = 0;
  let bboxAtual = null;
  let nosAtuais = 0;

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
      sensibilidade: Math.max(0.5, Math.min(2, Number(ler(KEYS.sensitivity, "1")) || 1)),
      travarRotacao: ler(KEYS.rotationLock, "true") !== "false",
      zoomMin: Math.max(0.1, Math.min(1, Number(ler(KEYS.zoomMin, "0.1")) || 0.1)),
      zoomMax: Math.max(1.5, Math.min(10, Number(ler(KEYS.zoomMax, "4")) || 4)),
    };
  }

  function aplicarPreferencias() {
    document.body.classList.toggle("mn-solid-minimalist", ler(KEYS.variant, "liquid") === "solid");
  }

  function carregarPreferencias() {
    const value = (id, val) => { const control = obter(id); if (control) control.value = val; };
    const checked = (id, val) => { const control = obter(id); if (control) control.checked = val; };
    value("settings-theme-select", window.MindNoteTheme?.obterPreferencia?.() || "sistema");
    value("settings-visual-variant", ler(KEYS.variant, "liquid"));
    const line = Math.max(26, Math.min(120, Number(ler(KEYS.line, "26")) || 26));
    value("settings-line-spacing", String(line));
    const editorSpacing = obter("entrada-escala");
    if (editorSpacing) editorSpacing.value = String(line);
    const canvas = obterCanvasConfig();
    value("settings-camera-sensitivity", String(canvas.sensibilidade));
    checked("settings-rotation-lock", canvas.travarRotacao);
    value("settings-zoom-min", String(canvas.zoomMin));
    value("settings-zoom-max", String(canvas.zoomMax));
    atualizarRotulosRange();
    aplicarPreferencias();
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
    mostrarPagina(tab);
  }

  function mostrarPagina(tab = "usuario") {
    const envelope = obter("mn-settings-envelope");
    const main = obter("mn-home-main");
    if (!envelope || !main) return;
    document.querySelectorAll(".mn-nav-item[data-home-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.homeNav === "settings"));
    document.querySelectorAll(".mn-nav-category").forEach((item) => item.classList.remove("is-active"));
    obter("mn-nav-categories")?.setAttribute("hidden", "");
    obter("mn-nav-new-folder")?.setAttribute("hidden", "");
    carregarPreferencias();
    carregarCredenciais();
    main.dataset.view = "settings";
    envelope.dataset.mode = "page";
    envelope.dataset.open = "true";
    envelope.setAttribute("aria-hidden", "false");
    sincronizarVisibilidadeDev();
    alternarAba(tab);
    obter("settings-tab-usuario")?.focus();
  }

  function fechar() {
    const envelope = obter("mn-settings-envelope");
    if (!envelope || envelope.dataset.open !== "true") return;
    envelope.dataset.open = "false";
    envelope.setAttribute("aria-hidden", "true");
    const main = obter("mn-home-main");
    if (main) main.dataset.view = "maps";
    document.querySelectorAll(".mn-nav-item[data-home-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.homeNav === "todos"));
    window.MindNoteHome?.definirFiltroSidebar?.({ tipo: "todos" });
    controlarMonitorFPS();
    obter("mn-nav-settings")?.focus();
  }

  function alternarAba(nome) {
    const aceitas = ["usuario", "canvas", "pdf", "sync", "dev"];
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
  }

  function atualizarRotulosRange() {
    const pairs = [["settings-camera-sensitivity", "settings-camera-sensitivity-value", (v) => `${Number(v).toFixed(1).replace(".", ",")}×`]];
    pairs.forEach(([inputId, outputId, fmt]) => { const input = obter(inputId); const output = obter(outputId); if (input && output) output.textContent = fmt(input.value); });
  }

  function salvarSync() {
    const url = obter("sync-input-url").value.trim();
    const apiKey = obter("sync-input-key").value.trim();
    const senha = obter("sync-input-senha").value.trim();
    let parsed;
    try { parsed = new URL(url); } catch { anunciar("settings-sync-feedback", "Informe uma URL válida do Supabase.", true); return; }
    if (parsed.protocol !== "https:" || !parsed.hostname) { anunciar("settings-sync-feedback", "A URL do projeto deve usar HTTPS.", true); return; }
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
    button.disabled = true;
    if (status) status.textContent = "Testando endpoint REST do Supabase…";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${parsed.origin}/rest/v1/`, { method: "GET", headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }, signal: controller.signal });
      if (response.status !== 200) throw new Error(`Supabase respondeu HTTP ${response.status}.`);
      if (status) status.textContent = `Conexão validada · HTTP ${response.status}.`;
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
    obter("settings-visual-variant")?.addEventListener("change", (event) => { guardar(KEYS.variant, event.target.value); aplicarPreferencias(); });
    obter("settings-line-spacing")?.addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (!Number.isInteger(value) || value < 26 || value > 120) { event.target.value = String(Math.max(26, Number(ler(KEYS.line, "26")))); return; }
      guardar(KEYS.line, value);
      const editor = obter("entrada-escala");
      if (editor) editor.value = String(value);
    });
    obter("settings-camera-sensitivity")?.addEventListener("input", (event) => { guardar(KEYS.sensitivity, event.target.value); atualizarRotulosRange(); });
    obter("settings-rotation-lock")?.addEventListener("change", (event) => guardar(KEYS.rotationLock, event.target.checked));
    obter("settings-zoom-min")?.addEventListener("change", (event) => {
      const value = Number(event.target.value), max = Number(obter("settings-zoom-max").value);
      if (!Number.isFinite(value) || value < .1 || value > 1 || value >= max) { event.target.value = ler(KEYS.zoomMin, "0.1"); return; }
      guardar(KEYS.zoomMin, value);
    });
    obter("settings-zoom-max")?.addEventListener("change", (event) => {
      const value = Number(event.target.value), min = Number(obter("settings-zoom-min").value);
      if (!Number.isFinite(value) || value < 1.5 || value > 10 || value <= min) { event.target.value = ler(KEYS.zoomMax, "4"); return; }
      guardar(KEYS.zoomMax, value);
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
    return devDesbloqueado() && (
      ler(KEYS.hud, "false") === "true" ||
      (obter("mn-settings-envelope")?.dataset.open === "true" && obter("settings-tab-dev")?.classList.contains("is-active")) ||
      obter("json-backstage-envelope")?.dataset.open === "true"
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
        if (obter("json-backstage-envelope")?.dataset.open === "true") window.MindNoteBackstage?.atualizarMetadados?.();
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
    obter("mn-settings-envelope")?.addEventListener("click", (event) => { if (event.target === obter("mn-settings-envelope")) fechar(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && obter("mn-settings-envelope")?.dataset.open === "true") fechar();
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
    atualizarDiagnostico,
    devDesbloqueado,
  };
})();

window.MindNoteSettings = MindNoteSettings;
window.MindNoteDevTelemetry = { obterSnapshot: () => obterSnapshotTelemetria() };
