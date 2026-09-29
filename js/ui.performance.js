(function () {
  "use strict";

  var debounceTimer = null;
  var debounceDelay = 160;

  function beginInteraction() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    document.documentElement.dataset.mnCanvasInteracting = "true";
  }

  function endInteraction() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(function () {
      document.documentElement.dataset.mnCanvasInteracting = "false";
      debounceTimer = null;
    }, debounceDelay);
  }

  window.addEventListener("mindnote:canvas-interaction", function (event) {
    var phase = event && event.detail && event.detail.phase;
    if (phase === "start") {
      beginInteraction();
    } else if (phase === "end" || phase === "cancel") {
      endInteraction();
    }
  });

  window.MindNoteUiPerformance = {
    beginInteraction: beginInteraction,
    endInteraction: endInteraction,
    setConserveMode: function (enabled) {
      document.documentElement.dataset.mnPerformanceMode = enabled ? "conserve" : "normal";
    }
  };
}());
