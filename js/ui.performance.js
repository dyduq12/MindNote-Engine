"use strict";

/* ============================================================
   MindNote Engine — js/ui.performance.js (Fase 4.1)
   Responsabilidade: desacoplar o custo visual (backdrop-filter)
   da interacao de pan/zoom do canvas.
   NAO manipula viewBox, SVG, nos, arvores ou camera.
   Compativel com Pointer Events (touch, S Pen, mouse).
   ============================================================ */

(function inicializarMindNoteUiPerformance() {
  const root = document.documentElement;
  let endTimer = null;
  let activeInteractions = 0;

  function setInteracting(isInteracting) {
    root.dataset.mnCanvasInteracting = String(isInteracting);
  }

  function beginInteraction() {
    activeInteractions += 1;
    if (endTimer) {
      window.clearTimeout(endTimer);
      endTimer = null;
    }
    setInteracting(true);
  }

  function endInteraction() {
    activeInteractions = Math.max(0, activeInteractions - 1);
    if (activeInteractions > 0) return;
    if (endTimer) window.clearTimeout(endTimer);
    endTimer = window.setTimeout(function () {
      setInteracting(false);
      endTimer = null;
    }, 160);
  }

  function setConserveMode(enabled) {
    root.dataset.mnPerformanceMode = enabled ? "conserve" : "normal";
  }

  function normalizarFase(evento) {
    const fase = evento.detail && evento.detail.phase;
    if (fase === "start") {
      beginInteraction();
    } else if (fase === "end" || fase === "cancel") {
      endInteraction();
    }
  }

  window.addEventListener("mindnote:canvas-interaction", normalizarFase);

  window.MindNoteUiPerformance = {
    beginInteraction: beginInteraction,
    endInteraction: endInteraction,
    setConserveMode: setConserveMode
  };
})();
