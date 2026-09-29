(function () {
  "use strict";

  var LIMITE_HISTORICO = 40;
  var pilhaUndo = [];
  var pilhaRedo = [];
  var bloqueioHistorico = false;

  function clonar(valor) {
    if (typeof window.structuredClone === "function") {
      try {
        return window.structuredClone(valor);
      } catch (_) {
        // Alguns navegadores recusam objetos não clonáveis; o grafo é serializável.
      }
    }
    return JSON.parse(JSON.stringify(valor));
  }

  function limitar(pilha, entrada) {
    pilha.push(entrada);
    if (pilha.length > LIMITE_HISTORICO) pilha.shift();
  }

  function obterSnapshotAtual() {
    var arvores = window.MindNoteApp?.obterArvoresAtuais?.();
    if (!Array.isArray(arvores) || arvores.length === 0) return null;
    return clonar(arvores);
  }

  function atualizarBotoesHistorico() {
    var botaoUndo = document.getElementById("btn-undo");
    var botaoRedo = document.getElementById("btn-redo");
    var desfazerDisponivel = pilhaUndo.length > 0;
    var refazerDisponivel = pilhaRedo.length > 0;

    if (botaoUndo) {
      botaoUndo.disabled = !desfazerDisponivel;
      botaoUndo.setAttribute("aria-disabled", String(!desfazerDisponivel));
    }
    if (botaoRedo) {
      botaoRedo.disabled = !refazerDisponivel;
      botaoRedo.setAttribute("aria-disabled", String(!refazerDisponivel));
    }
  }

  function registrarSnapshot(origem) {
    if (bloqueioHistorico) return false;
    try {
      var estado = obterSnapshotAtual();
      if (!estado) return false;
      limitar(pilhaUndo, { origem: origem || "mutacao", estado: estado });
      pilhaRedo.length = 0;
      atualizarBotoesHistorico();
      return true;
    } catch (erro) {
      console.error("Falha ao registrar estado no histórico:", erro);
      return false;
    }
  }

  function restaurarDaPilha(origem, destino) {
    if (bloqueioHistorico || origem.length === 0) return false;
    var app = window.MindNoteApp;
    if (!app || typeof app.restaurarArvores !== "function") return false;

    var estadoAtual;
    try {
      estadoAtual = obterSnapshotAtual();
      if (!estadoAtual) return false;
    } catch (erro) {
      console.error("Falha ao capturar estado atual do histórico:", erro);
      return false;
    }

    var anterior = origem.pop();
    limitar(destino, { origem: anterior.origem, estado: estadoAtual });
    bloqueioHistorico = true;
    try {
      if (!app.restaurarArvores(clonar(anterior.estado))) {
        origem.push(anterior);
        destino.pop();
        return false;
      }
      return true;
    } catch (erro) {
      origem.push(anterior);
      destino.pop();
      console.error("Falha ao restaurar estado do histórico:", erro);
      return false;
    } finally {
      bloqueioHistorico = false;
      atualizarBotoesHistorico();
    }
  }

  function undo() {
    return restaurarDaPilha(pilhaUndo, pilhaRedo);
  }

  function redo() {
    return restaurarDaPilha(pilhaRedo, pilhaUndo);
  }

  function alvoEditavel(elemento) {
    if (!elemento) return false;
    return Boolean(
      elemento.matches?.("input, textarea, select, [contenteditable='true']") ||
      elemento.isContentEditable
    );
  }

  window.addEventListener("keydown", function (evento) {
    if (evento.altKey || alvoEditavel(document.activeElement)) return;
    var tecla = String(evento.key || "").toLowerCase();
    var modificador = evento.ctrlKey || evento.metaKey;
    if (!modificador) return;

    if (tecla === "z") {
      evento.preventDefault();
      if (evento.shiftKey) redo();
      else undo();
    } else if (tecla === "y" && evento.ctrlKey) {
      evento.preventDefault();
      redo();
    }
  });

  window.MindNoteHistory = {
    registrarSnapshot: registrarSnapshot,
    undo: undo,
    redo: redo,
    podeDesfazer: function () { return pilhaUndo.length > 0; },
    podeRefazer: function () { return pilhaRedo.length > 0; },
    limpar: function () {
      pilhaUndo.length = 0;
      pilhaRedo.length = 0;
      atualizarBotoesHistorico();
    },
  };

  var botaoUndo = document.getElementById("btn-undo");
  var botaoRedo = document.getElementById("btn-redo");
  if (botaoUndo) botaoUndo.addEventListener("click", undo);
  if (botaoRedo) botaoRedo.addEventListener("click", redo);
  atualizarBotoesHistorico();
}());
