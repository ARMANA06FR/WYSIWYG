(() => {
  "use strict";

  // ---------- State ----------
  let codeEditor = null;
  let isSyncingFromCode = false;
  let isSyncingFromVisual = false;
  let liveEdit = true;
  let layoutMode = "split"; // split | stacked | source-only | visual-only
  let visualSyncTimer = null;

  const visualEl = document.getElementById("visual-editor");
  const statusEl = document.getElementById("status");
  const wordCountEl = document.getElementById("word-count");
  const container = document.getElementById("editor-container");
  const resizer = document.getElementById("resizer");
  const liveEditCheckbox = document.getElementById("live-edit");

  // ---------- Default content ----------
  const DEFAULT_HTML = `<h1>Bienvenue dans Split WYSIWYG</h1>
<p>Éditeur <strong>What You See Is What You Get</strong> à vue partagée.</p>
<p>Modifie le contenu ici à droite → le code source se met à jour automatiquement à gauche.</p>
<p>Ou édite le HTML à gauche → l'aperçu se rafraîchit en direct.</p>
<ul>
  <li>Gras, italique, listes, titres…</li>
  <li>Liens et images</li>
  <li>Redimensionnable et installable en PWA</li>
</ul>
<blockquote>Astuce : utilise la barre d'outils ou les raccourcis clavier (Ctrl+B, Ctrl+I…).</blockquote>
<hr>
<p>Commence à écrire !</p>`;

  // ---------- Helpers ----------
  function setStatus(msg) {
    statusEl.textContent = msg;
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => {
      statusEl.textContent = "Prêt";
    }, 2500);
  }

  function updateStats() {
    const text = visualEl.innerText || "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCountEl.textContent = `${words} mot${words > 1 ? "s" : ""}`;
  }

  // ---------- Visual → Code (robust + debounced) ----------
  function syncVisualToCode(immediate = false) {
    if (isSyncingFromCode || !codeEditor || !liveEdit) return;

    const doSync = () => {
      if (isSyncingFromCode || !codeEditor) return;

      isSyncingFromVisual = true;
      try {
        // Get a clean version of the current visual HTML
        let html = visualEl.innerHTML;

        // Avoid useless updates when content is identical (ignore pure whitespace diffs)
        const current = codeEditor.getValue();
        if (normalizeHtml(current) === normalizeHtml(html)) {
          updateStats();
          return;
        }

        // Preserve scroll position of the code editor
        const scrollInfo = codeEditor.getScrollInfo();
        const cursor = codeEditor.getCursor();

        codeEditor.setValue(html);

        // Restore approximate cursor / scroll
        try {
          codeEditor.setCursor(cursor);
          codeEditor.scrollTo(scrollInfo.left, scrollInfo.top);
        } catch (_) {}

        updateStats();
        setStatus("Aperçu → Code synchronisé");
      } finally {
        // Small delay so CodeMirror's own "change" event is ignored
        setTimeout(() => {
          isSyncingFromVisual = false;
        }, 50);
      }
    };

    if (immediate) {
      clearTimeout(visualSyncTimer);
      doSync();
    } else {
      clearTimeout(visualSyncTimer);
      visualSyncTimer = setTimeout(doSync, 120); // debounce
    }
  }

  // Light normalization to compare content meaningfully
  function normalizeHtml(str) {
    return (str || "")
      .replace(/\s+/g, " ")
      .replace(/>\s+</g, "><")
      .trim();
  }

  // ---------- Code → Visual ----------
  function syncCodeToVisual() {
    if (isSyncingFromVisual || !liveEdit || !codeEditor) return;

    isSyncingFromCode = true;
    try {
      const html = codeEditor.getValue();
      // Only update if different to avoid resetting caret in visual when possible
      if (normalizeHtml(visualEl.innerHTML) !== normalizeHtml(html)) {
        visualEl.innerHTML = html;
      }
      updateStats();
      setStatus("Code → Aperçu synchronisé");
    } finally {
      setTimeout(() => {
        isSyncingFromCode = false;
      }, 50);
    }
  }

  // ---------- Init CodeMirror ----------
  function initCodeEditor() {
    codeEditor = CodeMirror(document.getElementById("code-editor"), {
      value: DEFAULT_HTML,
      mode: "htmlmixed",
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: true,
      autoCloseTags: true,
      matchTags: { bothTags: true },
      extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Cmd-Space": "autocomplete",
      },
      indentUnit: 2,
      tabSize: 2,
    });

    codeEditor.on("change", () => {
      if (isSyncingFromVisual) return;
      syncCodeToVisual();
    });
  }

  // ---------- Listen to visual changes (multiple strategies for reliability) ----------
  // 1. Classic input / keyup / paste
  visualEl.addEventListener("input", () => syncVisualToCode());
  visualEl.addEventListener("keyup", () => syncVisualToCode());
  visualEl.addEventListener("paste", () => {
    setTimeout(() => syncVisualToCode(true), 20);
  });

  // 2. MutationObserver – catches almost everything (formatting, drag-drop, etc.)
  const observer = new MutationObserver(() => {
    if (isSyncingFromCode) return;
    syncVisualToCode();
  });
  observer.observe(visualEl, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });

  // ---------- Toolbar commands ----------
  function exec(cmd, value = null) {
    visualEl.focus();
    try {
      document.execCommand(cmd, false, value);
    } catch (e) {
      console.warn("execCommand failed:", cmd, e);
    }
    // Force immediate sync after toolbar action
    setTimeout(() => syncVisualToCode(true), 10);
  }

  document.querySelectorAll(".tool-btn[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const value = btn.dataset.value || null;

      if (cmd === "createLink") {
        const url = prompt("URL du lien :", "https://");
        if (url) exec("createLink", url);
        return;
      }
      if (cmd === "insertImage") {
        const url = prompt("URL de l'image :", "https://");
        if (url) exec("insertImage", url);
        return;
      }
      if (cmd === "formatBlock") {
        exec("formatBlock", value);
        return;
      }
      exec(cmd, value);
    });
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    // Only intercept when focus is in the visual editor
    if (document.activeElement !== visualEl && !visualEl.contains(document.activeElement)) {
      return;
    }
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      exec("bold");
    } else if (key === "i") {
      e.preventDefault();
      exec("italic");
    } else if (key === "u") {
      e.preventDefault();
      exec("underline");
    } else if (key === "s" && e.shiftKey) {
      e.preventDefault();
      exec("strikeThrough");
    }
  });

  // ---------- Live edit toggle ----------
  liveEditCheckbox.addEventListener("change", () => {
    liveEdit = liveEditCheckbox.checked;
    setStatus(liveEdit ? "Édition live activée" : "Édition live désactivée");
  });

  // ---------- Resizer ----------
  let isDragging = false;

  resizer.addEventListener("mousedown", (e) => {
    isDragging = true;
    resizer.classList.add("dragging");
    document.body.style.cursor = container.classList.contains("stacked")
      ? "row-resize"
      : "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const stacked = container.classList.contains("stacked");

    if (stacked) {
      const y = e.clientY - rect.top;
      const percent = Math.min(Math.max((y / rect.height) * 100, 15), 85);
      document.querySelector(".source-panel").style.flex = `0 0 ${percent}%`;
      document.querySelector(".visual-panel").style.flex = `0 0 ${100 - percent}%`;
    } else {
      const x = e.clientX - rect.left;
      const percent = Math.min(Math.max((x / rect.width) * 100, 15), 85);
      document.querySelector(".source-panel").style.flex = `0 0 ${percent}%`;
      document.querySelector(".visual-panel").style.flex = `0 0 ${100 - percent}%`;
    }
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  // ---------- Layout toggle ----------
  document.getElementById("btn-toggle-view").addEventListener("click", () => {
    const modes = ["split", "stacked", "source-only", "visual-only"];
    const idx = modes.indexOf(layoutMode);
    layoutMode = modes[(idx + 1) % modes.length];
    container.className = "editor-container";
    if (layoutMode === "stacked") container.classList.add("stacked");
    if (layoutMode === "source-only") container.classList.add("source-only");
    if (layoutMode === "visual-only") container.classList.add("visual-only");

    // Reset flex
    document.querySelector(".source-panel").style.flex = "";
    document.querySelector(".visual-panel").style.flex = "";

    setStatus(
      {
        split: "Vue partagée (côte à côte)",
        stacked: "Vue empilée",
        "source-only": "Code uniquement",
        "visual-only": "Aperçu uniquement",
      }[layoutMode]
    );

    setTimeout(() => codeEditor && codeEditor.refresh(), 50);
  });

  // ---------- Clear ----------
  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!confirm("Effacer tout le contenu ?")) return;
    isSyncingFromVisual = true;
    isSyncingFromCode = true;
    visualEl.innerHTML = "";
    codeEditor.setValue("");
    setTimeout(() => {
      isSyncingFromVisual = false;
      isSyncingFromCode = false;
    }, 50);
    updateStats();
    setStatus("Contenu effacé");
  });

  // ---------- Download ----------
  document.getElementById("btn-download").addEventListener("click", () => {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document exporté</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1e293b; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 4px solid #38bdf8; padding-left: 1rem; color: #64748b; }
  </style>
</head>
<body>
${codeEditor.getValue()}
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.html";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Fichier HTML téléchargé");
  });

  // ---------- Format code (basic pretty) ----------
  document.getElementById("btn-format").addEventListener("click", () => {
    try {
      let html = codeEditor.getValue();
      html = html
        .replace(/>\s*</g, ">\n<")
        .replace(/(<\/?(?:div|p|h[1-6]|ul|ol|li|blockquote|table|tr|thead|tbody|section|article|header|footer|nav)[^>]*>)/gi, "\n$1\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      isSyncingFromVisual = true;
      codeEditor.setValue(html);
      setTimeout(() => { isSyncingFromVisual = false; }, 50);
      setStatus("Code formaté");
    } catch (err) {
      setStatus("Erreur de formatage");
    }
  });

  // ---------- Copy code ----------
  document.getElementById("btn-copy-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeEditor.getValue());
      setStatus("Code copié dans le presse-papiers");
    } catch {
      setStatus("Impossible de copier");
    }
  });

  // ---------- Fullscreen ----------
  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      document.body.classList.add("fullscreen");
    } else {
      document.exitFullscreen();
      document.body.classList.remove("fullscreen");
    }
    setTimeout(() => codeEditor && codeEditor.refresh(), 100);
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("fullscreen");
    }
  });

  // ---------- Persist content (localStorage) ----------
  function saveContent() {
    try {
      if (codeEditor) {
        localStorage.setItem("split-wysiwyg-content", codeEditor.getValue());
      }
    } catch (_) {}
  }

  function loadContent() {
    try {
      const saved = localStorage.getItem("split-wysiwyg-content");
      if (saved) {
        codeEditor.setValue(saved);
        visualEl.innerHTML = saved;
        return true;
      }
    } catch (_) {}
    return false;
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveContent, 1500);
  }

  // ---------- Service Worker (PWA) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => console.log("SW registered", reg.scope))
        .catch((err) => console.warn("SW registration failed", err));
    });
  }

  // ---------- Boot ----------
  initCodeEditor();

  if (!loadContent()) {
    visualEl.innerHTML = DEFAULT_HTML;
  }

  updateStats();

  // Hook save on changes
  codeEditor.on("change", scheduleSave);
  visualEl.addEventListener("input", scheduleSave);

  // Refresh CM on window resize
  window.addEventListener("resize", () => {
    codeEditor && codeEditor.refresh();
  });

  // Initial refresh after layout
  setTimeout(() => {
    if (codeEditor) codeEditor.refresh();
  }, 100);

  console.log("Split WYSIWYG Editor ready – sync improved");
})();
