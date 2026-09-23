"use strict";

/*
 * js/db.js — Fase 2 (v2.0)
 *
 * Camada de persistencia local via IndexedDB, com Promises puras (sem
 * dependencias externas). Isola completamente o armazenamento em 3
 * object stores para que a Home nunca precise carregar a arvore JSON
 * completa apenas para listar cartoes.
 *
 * Este modulo e 100% aditivo: nao importa nem referencia nenhuma linha
 * de engine.geometry.js, engine.text.js, render.svg.js ou render.pdf.js.
 */

const MindNoteDB = (() => {
  const NOME_BANCO = "MindNoteDB";
  const VERSAO_BANCO = 1;
  const STORE_META = "maps_meta";
  const STORE_THUMB = "maps_thumbnails";
  const STORE_DATA = "maps_data";

  let dbPromise = null;

  function abrirBanco() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

      req.onupgradeneeded = (evento) => {
        const db = evento.target.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_THUMB)) {
          db.createObjectStore(STORE_THUMB, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_DATA)) {
          db.createObjectStore(STORE_DATA, { keyPath: "id" });
        }
      };

      req.onsuccess = (evento) => resolve(evento.target.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function transacao(nomesStores, modo) {
    const db = await abrirBanco();
    return db.transaction(nomesStores, modo);
  }

  function promisificarRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function promisificarTransacao(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transação abortada."));
    });
  }

  // ─── Contagem de nós (apenas para metadados de listagem) ───────────
  function contarNos(no) {
    if (!no) return 0;
    const filhos = Array.isArray(no.filhos) ? no.filhos : [];
    return 1 + filhos.reduce((acumulado, filho) => acumulado + contarNos(filho), 0);
  }

  function contarNosArvores(arvores) {
    if (!Array.isArray(arvores)) return 0;
    return arvores.reduce((acumulado, raiz) => acumulado + contarNos(raiz), 0);
  }

  // ─── UUID (usa crypto nativo quando disponível) ──────────────────
  function gerarUUID() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2);
  }

  // ─── Escrita: cria ou atualiza os registros das 3 stores atomicamente ────
  async function salvarMapa(id, titulo, arvores, svgString, tema) {
    if (!id) throw new Error("salvarMapa requer um id válido.");
    const agora = Date.now();

    const tx = await transacao([STORE_META, STORE_THUMB, STORE_DATA], "readwrite");
    const storeMeta = tx.objectStore(STORE_META);
    const storeThumb = tx.objectStore(STORE_THUMB);
    const storeData = tx.objectStore(STORE_DATA);

    const metaExistente = await promisificarRequest(storeMeta.get(id));
    const dataCriacao = metaExistente ? metaExistente.dataCriacao : agora;

    const meta = {
      id,
      titulo: titulo && String(titulo).trim() ? String(titulo).trim() : "Sem título",
      dataCriacao,
      dataModificacao: agora,
      tema: tema === "escuro" ? "escuro" : "claro",
      totalNos: contarNosArvores(arvores),
    };

    storeMeta.put(meta);
    if (typeof svgString === "string" && svgString.length > 0) {
      storeThumb.put({ id, svgString });
    }
    storeData.put({ id, arvores });

    await promisificarTransacao(tx);
    return meta;
  }

  // ─── Leitura: lista todos os metadados, mais recentes primeiro ─────────
  async function listarMetas() {
    const tx = await transacao([STORE_META], "readonly");
    const todos = await promisificarRequest(tx.objectStore(STORE_META).getAll());
    return todos.sort((a, b) => (b.dataModificacao || 0) - (a.dataModificacao || 0));
  }

  // ─── Leitura: metadados + árvore completa de um mapa ─────────────
  async function carregarMapa(id) {
    const tx = await transacao([STORE_META, STORE_DATA], "readonly");
    const meta = await promisificarRequest(tx.objectStore(STORE_META).get(id));
    const dados = await promisificarRequest(tx.objectStore(STORE_DATA).get(id));
    if (!meta || !dados) return null;
    return { meta, arvores: dados.arvores };
  }

  // ─── Leitura: apenas a miniatura SVG leve (para o card da Home) ──────
  async function carregarThumbnail(id) {
    const tx = await transacao([STORE_THUMB], "readonly");
    const registro = await promisificarRequest(tx.objectStore(STORE_THUMB).get(id));
    return registro ? registro.svgString : null;
  }

  // ─── Duplicação: clona os 3 registros sob um novo id ─────────────
  async function duplicarMapa(id) {
    const original = await carregarMapa(id);
    if (!original) throw new Error("Mapa original não encontrado para duplicar.");
    const svgOriginal = await carregarThumbnail(id);
    const novoId = gerarUUID();
    const novoTitulo = `${original.meta.titulo} (Cópia)`;
    await salvarMapa(novoId, novoTitulo, original.arvores, svgOriginal, original.meta.tema);
    return novoId;
  }

  // ─── Remoção: apaga os 3 registros correspondentes ─────────────
  async function eliminarMapa(id) {
    const tx = await transacao([STORE_META, STORE_THUMB, STORE_DATA], "readwrite");
    tx.objectStore(STORE_META).delete(id);
    tx.objectStore(STORE_THUMB).delete(id);
    tx.objectStore(STORE_DATA).delete(id);
    await promisificarTransacao(tx);
    return true;
  }

  return {
    salvarMapa,
    listarMetas,
    carregarMapa,
    carregarThumbnail,
    duplicarMapa,
    eliminarMapa,
    gerarUUID,
  };
})();

window.MindNoteDB = MindNoteDB;
