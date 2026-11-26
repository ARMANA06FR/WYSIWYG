(() => {
  "use strict";

  let codeEditor = null;
  let liveEdit = true;
  let layoutMode = "split";
  let ignoreUntil = 0; // timestamp until which we ignore syncs

  const visualEl = document.getElementById("visual-editor");
  const statusEl = document.getElementById("status");
  const wordCountEl = document.getElementById("word-count");
  const container = document.getElementById("editor-container");
  const resizer = document.getElementById("resizer");
  const liveEditCheckbox = document.getElementById("live-edit");

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

  function setStatus(msg) {
    statusEl.textContent = msg;
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => { statusEl.textContent = "Prêt"; }, 2000);
  }

  function updateStats() {
    const text = visualEl.innerText || "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCountEl.textContent = `${words} mot${words > 1 ? "s" : ""}`;
  }

  function shouldIgnore() {
    return Date.now() < ignoreUntil;
  }

  function ignoreFor(ms = 100) {
    ignoreUntil = Date.now() + ms;
  }

  // ---------- Visual → Code ----------
  function updateCodeFromVisual() {
    if (!codeEditor || !liveEdit || shouldIgnore()) return;

    const html = visualEl.innerHTML;
    const current = codeEditor.getValue();
    if (html === current) return;

    ignoreFor(120);
    try {
      const scrollInfo = codeEditor.getScrollInfo();
      codeEditor.setValue(html);
      try { codeEditor.scrollTo(scrollInfo.left, scrollInfo.top); } catch (_) {}
      updateStats();
      setStatus("Aperçu → Code");
    } catch (e) {
      console.error("updateCodeFromVisual error", e);
    }
  }

  // ---------- Code → Visual ----------
  function updateVisualFromCode() {
    if (!codeEditor || !liveEdit || shouldIgnore()) return;

    const html = codeEditor.getValue();
    if (html === visualEl.innerHTML) return;

    ignoreFor(120);
    try {
      visualEl.innerHTML = html;
      updateStats();
      setStatus("Code → Aperçu");
    } catch (e) {
      console.error("updateVisualFromCode error", e);
    }
  }

  // ---------- Init ----------
  function initCodeEditor(initialValue) {
    codeEditor = CodeMirror(document.getElementById("code-editor"), {
      value: initialValue || "",
      mode: "htmlmixed",
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: true,
      autoCloseTags: true,
      extraKeys: { "Ctrl-Space": "autocomplete", "Cmd-Space": "autocomplete" },
      indentUnit: 2,
      tabSize: 2,
    });

    codeEditor.on("change", () => {
      if (shouldIgnore()) return;
      updateVisualFromCode();
    });
  }

  function attachVisualListeners() {
    let timer = null;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(updateCodeFromVisual, 80);
    };

    visualEl.addEventListener("input", debounced);
    visualEl.addEventListener("keyup", debounced);
    visualEl.addEventListener("paste", () => setTimeout(updateCodeFromVisual, 20));

    const observer = new MutationObserver(() => {
      if (shouldIgnore()) return;
      debounced();
    });
    observer.observe(visualEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ---------- Toolbar ----------
  function exec(cmd, value = null) {
    visualEl.focus();
    try { document.execCommand(cmd, false, value); } catch (e) {}
    setTimeout(updateCodeFromVisual, 15);
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

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (document.activeElement !== visualEl && !visualEl.contains(document.activeElement)) return;
    const key = e.key.toLowerCase();
    if (key === "b") { e.preventDefault(); exec("bold"); }
    else if (key === "i") { e.preventDefault(); exec("italic"); }
    else if (key === "u") { e.preventDefault(); exec("underline"); }
    else if (key === "s" && e.shiftKey) { e.preventDefault(); exec("strikeThrough"); }
  });

  liveEditCheckbox.addEventListener("change", () => {
    liveEdit = liveEditCheckbox.checked;
    setStatus(liveEdit ? "Édition live activée" : "Édition live désactivée");
  });

  // Resizer
  let isDragging = false;
  resizer.addEventListener("mousedown", (e) => {
    isDragging = true;
    resizer.classList.add("dragging");
    document.body.style.cursor = container.classList.contains("stacked") ? "row-resize" : "col-resize";
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

  // Layout
  document.getElementById("btn-toggle-view").addEventListener("click", () => {
    const modes = ["split", "stacked", "source-only", "visual-only"];
    const idx = modes.indexOf(layoutMode);
    layoutMode = modes[(idx + 1) % modes.length];
    container.className = "editor-container";
    if (layoutMode === "stacked") container.classList.add("stacked");
    if (layoutMode === "source-only") container.classList.add("source-only");
    if (layoutMode === "visual-only") container.classList.add("visual-only");
    document.querySelector(".source-panel").style.flex = "";
    document.querySelector(".visual-panel").style.flex = "";
    setStatus({
      split: "Vue partagée (côte à côte)",
      stacked: "Vue empilée",
      "source-only": "Code uniquement",
      "visual-only": "Aperçu uniquement",
    }[layoutMode]);
    setTimeout(() => codeEditor && codeEditor.refresh(), 50);
  });

  // Clear
  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!confirm("Effacer tout le contenu ?")) return;
    ignoreFor(200);
    visualEl.innerHTML = "";
    codeEditor.setValue("");
    updateStats();
    setStatus("Contenu effacé");
  });

  // Import HTML file
  const fileInput = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        let content = reader.result || "";

        // If it's a full HTML document, try to extract the body content
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
          content = bodyMatch[1].trim();
        } else {
          // Remove doctype / html / head if present
          content = content
            .replace(/<!DOCTYPE[^>]*>/i, "")
            .replace(/<\/?html[^>]*>/gi, "")
            .replace(/<head[\s\S]*?<\/head>/i, "")
            .trim();
        }

        ignoreFor(200);
        codeEditor.setValue(content);
        visualEl.innerHTML = content;
        updateStats();
        setStatus("Fichier importé : " + file.name);
        scheduleSave();
      } catch (err) {
        console.error(err);
        setStatus("Erreur lors de l'import");
      }
    };
    reader.onerror = () => setStatus("Impossible de lire le fichier");
    reader.readAsText(file, "UTF-8");
  });

  // Download
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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "document.html";
    a.click();
    setStatus("Fichier HTML téléchargé");
  });

  // Format
  document.getElementById("btn-format").addEventListener("click", () => {
    try {
      let html = codeEditor.getValue();
      html = html
        .replace(/>\s*</g, ">\n<")
        .replace(/(<\/?(?:div|p|h[1-6]|ul|ol|li|blockquote|table|tr|thead|tbody|section|article|header|footer|nav)[^>]*>)/gi, "\n$1\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      ignoreFor(150);
      codeEditor.setValue(html);
      setStatus("Code formaté");
    } catch (err) {
      setStatus("Erreur de formatage");
    }
  });

  // Copy
  document.getElementById("btn-copy-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeEditor.getValue());
      setStatus("Code copié");
    } catch {
      setStatus("Impossible de copier");
    }
  });

  // Fullscreen
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
    if (!document.fullscreenElement) document.body.classList.remove("fullscreen");
  });

  // Persist
  function saveContent() {
    try {
      if (codeEditor) localStorage.setItem("split-wysiwyg-content", codeEditor.getValue());
    } catch (_) {}
  }
  function loadContent() {
    try { return localStorage.getItem("split-wysiwyg-content"); } catch (_) { return null; }
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveContent, 1000);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // ========== BOOT ==========
  const saved = loadContent();
  const initial = (saved && saved.trim()) ? saved : DEFAULT_HTML;

  // 1. Create CodeMirror
  initCodeEditor(initial);

  // 2. Set visual (with ignore so observer doesn't fight)
  ignoreFor(200);
  visualEl.innerHTML = initial;

  // 3. Attach listeners
  attachVisualListeners();

  updateStats();

  codeEditor.on("change", scheduleSave);
  visualEl.addEventListener("input", scheduleSave);

  window.addEventListener("resize", () => codeEditor && codeEditor.refresh());
  setTimeout(() => codeEditor && codeEditor.refresh(), 150);

  console.log("Split WYSIWYG ready v3");
})();
