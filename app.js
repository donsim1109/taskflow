// ================================================
//  TaskFlow — AI Task Manager
//  Parses free-form text → structured task table
//  Syncs to Google Sheets
// ================================================

const DEFAULT_SHEET_ID = "1MA6djb09zkWRaEwLrMDJJbbh48jAKR0jsThn-pgxqg0";

// ---- State ----
let tasks = [];
let recognition = null;
let isRecording = false;
let voiceText = "";

// ---- DOM refs ----
const taskInput      = document.getElementById("taskInput");
const parseBtn       = document.getElementById("parseBtn");
const clearInputBtn  = document.getElementById("clearInputBtn");
const parseVoiceBtn  = document.getElementById("parseVoiceBtn");
const clearVoiceBtn  = document.getElementById("clearVoiceBtn");
const voiceBtn       = document.getElementById("voiceBtn");
const voiceStatus    = document.getElementById("voiceStatus");
const voiceTranscript= document.getElementById("voiceTranscript");
const voiceActions   = document.getElementById("voiceActions");
const voiceVisualizer= document.getElementById("voiceVisualizer");
const parsingStatus  = document.getElementById("parsingStatus");
const taskBody       = document.getElementById("taskBody");
const emptyRow       = document.getElementById("emptyRow");
const taskCount      = document.getElementById("taskCount");
const syncBtn        = document.getElementById("syncBtn");
const syncStatus     = document.getElementById("syncStatus");
const exportCsvBtn   = document.getElementById("exportCsvBtn");
const clearAllBtn    = document.getElementById("clearAllBtn");
const configToggle   = document.getElementById("configToggle");
const configBody     = document.getElementById("configBody");
const configArrow    = configToggle.querySelector(".config-arrow");
const sheetId        = document.getElementById("sheetId");
const apiKey         = document.getElementById("apiKey");
const anthropicKey   = document.getElementById("anthropicKey");
const toast          = document.getElementById("toast");

// ---- Load saved settings ----
(function loadSettings() {
  sheetId.value      = localStorage.getItem("tf_sheet_id")     || DEFAULT_SHEET_ID;
  apiKey.value       = localStorage.getItem("tf_api_key")      || "";
  anthropicKey.value = localStorage.getItem("tf_anthropic_key")|| "";
  const saved = localStorage.getItem("tf_tasks");
  if (saved) {
    try { tasks = JSON.parse(saved); renderTable(); } catch(e) {}
  }
})();

[sheetId, apiKey, anthropicKey].forEach(el => {
  el.addEventListener("change", () => {
    localStorage.setItem("tf_sheet_id",      sheetId.value);
    localStorage.setItem("tf_api_key",       apiKey.value);
    localStorage.setItem("tf_anthropic_key", anthropicKey.value);
  });
});

// ---- Tab switching ----
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("textTab").classList.toggle("hidden", target !== "text");
    document.getElementById("voiceTab").classList.toggle("hidden", target !== "voice");
  });
});

// ---- Config toggle ----
configToggle.addEventListener("click", () => {
  configBody.classList.toggle("hidden");
  configArrow.classList.toggle("open");
});

// ---- Example chips ----
document.querySelectorAll(".example-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    taskInput.value = chip.dataset.text;
    taskInput.focus();
  });
});

// ---- Parse (text) ----
parseBtn.addEventListener("click", () => {
  const text = taskInput.value.trim();
  if (!text) { showToast("Please enter some task text first", "info"); return; }
  parseTasks(text);
});

clearInputBtn.addEventListener("click", () => { taskInput.value = ""; });

// ---- Parse (voice) ----
parseVoiceBtn.addEventListener("click", () => {
  if (!voiceText.trim()) { showToast("No voice input to parse", "info"); return; }
  parseTasks(voiceText);
});

clearVoiceBtn.addEventListener("click", () => {
  voiceText = "";
  voiceTranscript.textContent = "";
  voiceActions.style.display = "none";
});

// ---- Voice recognition ----
function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceStatus.textContent = "Speech recognition not supported in this browser. Try Chrome or Edge.";
    voiceBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    if (final) voiceText += final + " ";
    voiceTranscript.textContent = voiceText + interim;
  };

  recognition.onerror = (e) => {
    voiceStatus.textContent = `Error: ${e.error}`;
    stopRecording();
  };

  recognition.onend = () => {
    if (isRecording) recognition.start(); // keep going
  };
}
setupVoice();

voiceBtn.addEventListener("click", () => {
  if (!recognition) { showToast("Speech recognition not available", "error"); return; }
  if (isRecording) stopRecording(); else startRecording();
});

function startRecording() {
  isRecording = true;
  voiceBtn.classList.add("active");
  voiceVisualizer.classList.add("recording");
  voiceStatus.textContent = "Listening… click mic to stop";
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  voiceBtn.classList.remove("active");
  voiceVisualizer.classList.remove("recording");
  voiceStatus.textContent = "Recording stopped. Review transcript below.";
  try { recognition.stop(); } catch(e) {}
  if (voiceText.trim()) {
    voiceActions.style.display = "flex";
  }
}

// ================================================
//  PARSE TASKS via Anthropic API (or fallback)
// ================================================
async function parseTasks(rawText) {
  parsingStatus.classList.remove("hidden");
  parseBtn.disabled = true;
  if (parseVoiceBtn) parseVoiceBtn.disabled = true;

  try {
    let parsed;
    const key = anthropicKey.value.trim();
    if (key) {
      parsed = await parseWithAI(rawText, key);
    } else {
      parsed = parseWithRegex(rawText);
      showToast("Add an Anthropic API key for smarter parsing. Using basic parser now.", "info");
    }
    addTasks(parsed);
    saveTasks();
  } catch (err) {
    console.error(err);
    showToast("Parse failed: " + err.message, "error");
  } finally {
    parsingStatus.classList.add("hidden");
    parseBtn.disabled = false;
    if (parseVoiceBtn) parseVoiceBtn.disabled = false;
  }
}

// ---- AI parser ----
async function parseWithAI(text, key) {
  const systemPrompt = `You are a task extraction assistant. Given a block of free-form text, extract all tasks and return ONLY a JSON array. Each task object must have these fields:
- title: string (concise task name, max 80 chars)
- assignee: string (person name if mentioned, else "")
- dueDate: string (ISO date YYYY-MM-DD if mentioned, else "")
- priority: "critical" | "high" | "medium" | "low" (infer from urgency words)
- category: string (infer a short category like "Engineering", "Marketing", "Admin", "Design", "Meeting", "Review", etc.)
- status: "todo"

Rules:
- Today's date: ${new Date().toISOString().slice(0,10)}
- "tomorrow" → next day, "next Monday" → compute date, "end of week" → upcoming Friday, "ASAP/urgent/critical" → critical priority, "high/important" → high, else → medium
- Return ONLY the JSON array, no markdown, no explanation.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: text }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
  const raw = data.content?.[0]?.text || "[]";
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---- Regex fallback parser ----
function parseWithRegex(text) {
  // Split on sentence boundaries / line breaks
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  return sentences.map(s => {
    const lower = s.toLowerCase();

    // Priority
    let priority = "medium";
    if (/critical|asap|urgent|immediately/i.test(s)) priority = "critical";
    else if (/high priority|important|soon/i.test(s))  priority = "high";
    else if (/low priority|whenever|eventually/i.test(s)) priority = "low";

    // Assignee
    let assignee = "";
    const assignMatch = s.match(/assign(?:ed)?\s+to\s+([A-Z][a-z]+)/i) ||
                        s.match(/(?:for|by|with)\s+([A-Z][a-z]+)/);
    if (assignMatch) assignee = assignMatch[1];

    // Due date
    let dueDate = "";
    const today = new Date();
    if (/tomorrow/i.test(s)) {
      const d = new Date(today); d.setDate(d.getDate()+1);
      dueDate = d.toISOString().slice(0,10);
    } else if (/end of week|friday/i.test(s)) {
      const d = new Date(today);
      const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilFriday);
      dueDate = d.toISOString().slice(0,10);
    } else if (/next monday/i.test(s)) {
      const d = new Date(today);
      const daysUntilMonday = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMonday);
      dueDate = d.toISOString().slice(0,10);
    }

    // Category (simple keyword match)
    let category = "General";
    if (/bug|fix|deploy|code|error|crash|login|api/i.test(s)) category = "Engineering";
    else if (/design|ui|ux|mockup|figma|prototype/i.test(s)) category = "Design";
    else if (/meeting|call|sync|standup|interview/i.test(s)) category = "Meeting";
    else if (/review|feedback|approve|check/i.test(s)) category = "Review";
    else if (/marketing|campaign|post|content|social/i.test(s)) category = "Marketing";
    else if (/doc|document|report|write|update|readme/i.test(s)) category = "Documentation";
    else if (/payment|invoice|billing|budget|finance/i.test(s)) category = "Finance";

    // Clean title
    let title = s
      .replace(/assign(?:ed)?\s+to\s+\w+/gi, "")
      .replace(/,?\s*(high|low|medium|critical)\s+priority/gi, "")
      .replace(/\b(ASAP|urgent|immediately)\b/gi, "")
      .trim()
      .replace(/[.,!]+$/, "")
      .trim();

    return { title, assignee, dueDate, priority, category, status: "todo" };
  }).filter(t => t.title.length > 3);
}

// ================================================
//  TABLE RENDERING
// ================================================
function addTasks(newTasks) {
  newTasks.forEach(t => {
    tasks.push({
      id: Date.now() + Math.random(),
      title: t.title || "Untitled",
      assignee: t.assignee || "",
      dueDate: t.dueDate || "",
      priority: t.priority || "medium",
      category: t.category || "General",
      status: t.status || "todo"
    });
  });
  renderTable();
  showToast(`✓ Added ${newTasks.length} task${newTasks.length !== 1 ? "s" : ""}`, "success");
}

function renderTable() {
  taskCount.textContent = `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`;

  if (tasks.length === 0) {
    emptyRow.classList.remove("hidden");
    // Remove all task rows
    document.querySelectorAll(".task-row").forEach(r => r.remove());
    return;
  }
  emptyRow.classList.add("hidden");

  // Rebuild tbody
  const existing = {};
  document.querySelectorAll(".task-row").forEach(r => {
    existing[r.dataset.id] = r;
  });

  const presentIds = new Set();
  tasks.forEach((task, idx) => {
    presentIds.add(String(task.id));
    if (existing[task.id]) return; // already in DOM
    const tr = buildRow(task);
    taskBody.insertBefore(tr, emptyRow);
  });

  // Remove deleted
  Object.keys(existing).forEach(id => {
    if (!presentIds.has(id)) existing[id].remove();
  });
}

function buildRow(task) {
  const tr = document.createElement("tr");
  tr.className = "task-row task-row-new";
  tr.dataset.id = task.id;

  const statusCycle = { todo: "doing", doing: "done", done: "todo" };
  const statusLabel = { todo: "● To Do", doing: "◑ Doing", done: "✓ Done" };

  tr.innerHTML = `
    <td>
      <button class="status-badge status-${task.status}" data-id="${task.id}" onclick="cycleStatus('${task.id}')">
        ${statusLabel[task.status]}
      </button>
    </td>
    <td>
      <span class="editable-cell" contenteditable="true" data-id="${task.id}" data-field="title">${escapeHtml(task.title)}</span>
    </td>
    <td>
      <span class="editable-cell" contenteditable="true" data-id="${task.id}" data-field="assignee">${escapeHtml(task.assignee)}</span>
    </td>
    <td>
      <span class="editable-cell" contenteditable="true" data-id="${task.id}" data-field="dueDate">${escapeHtml(task.dueDate)}</span>
    </td>
    <td>
      <span class="priority-badge priority-${task.priority}">${priorityDot(task.priority)} ${capitalize(task.priority)}</span>
    </td>
    <td>
      <span class="editable-cell" contenteditable="true" data-id="${task.id}" data-field="category">${escapeHtml(task.category)}</span>
    </td>
    <td>
      <div class="row-actions">
        <button class="row-btn delete" onclick="deleteTask('${task.id}')" title="Delete">✕</button>
      </div>
    </td>
  `;

  // Listen for edits
  tr.querySelectorAll(".editable-cell").forEach(cell => {
    cell.addEventListener("blur", () => {
      const id = cell.dataset.id;
      const field = cell.dataset.field;
      const val = cell.textContent.trim();
      const t = tasks.find(t => String(t.id) === String(id));
      if (t) { t[field] = val; saveTasks(); }
    });
    cell.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); cell.blur(); }
    });
  });

  return tr;
}

function cycleStatus(id) {
  const task = tasks.find(t => String(t.id) === String(id));
  if (!task) return;
  const cycle = { todo: "doing", doing: "done", done: "todo" };
  task.status = cycle[task.status];
  saveTasks();

  // Update cell in-place
  const btn = document.querySelector(`.status-badge[data-id="${id}"]`);
  if (btn) {
    const labels = { todo: "● To Do", doing: "◑ Doing", done: "✓ Done" };
    btn.className = `status-badge status-${task.status}`;
    btn.textContent = labels[task.status];
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => String(t.id) !== String(id));
  document.querySelector(`.task-row[data-id="${id}"]`)?.remove();
  saveTasks();
  renderTable();
  showToast("Task deleted", "info");
}

clearAllBtn.addEventListener("click", () => {
  if (tasks.length === 0) return;
  if (confirm("Clear all tasks?")) {
    tasks = [];
    saveTasks();
    renderTable();
    showToast("All tasks cleared", "info");
  }
});

// ================================================
//  GOOGLE SHEETS SYNC
// ================================================
syncBtn.addEventListener("click", syncToSheets);

async function syncToSheets() {
  const sid = sheetId.value.trim();
  const key = apiKey.value.trim();
  if (!sid) { showToast("Enter a Spreadsheet ID in settings", "error"); return; }
  if (!key) { showToast("Enter a Google API Key in settings", "error"); return; }
  if (tasks.length === 0) { showToast("No tasks to sync", "info"); return; }

  syncBtn.disabled = true;
  syncStatus.textContent = "Syncing…";
  syncStatus.className = "sync-status";

  try {
    // Build values: header + rows
    const header = ["Status", "Title", "Assignee", "Due Date", "Priority", "Category"];
    const rows = tasks.map(t => [
      capitalize(t.status),
      t.title,
      t.assignee,
      t.dueDate,
      capitalize(t.priority),
      t.category
    ]);
    const values = [header, ...rows];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/A1?valueInputOption=RAW&key=${key}`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range: "A1", majorDimension: "ROWS", values })
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error("Auth failed. The Google Sheets API key needs write access (use OAuth for writes). For read-only demo, data is structured correctly.");
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    syncStatus.textContent = "✓ Synced!";
    syncStatus.className = "sync-status sync-success";
    showToast(`✓ Synced ${tasks.length} tasks to Google Sheets`, "success");
  } catch (err) {
    syncStatus.textContent = "✕ Sync failed";
    syncStatus.className = "sync-status sync-error";
    showToast("Sync error: " + err.message, "error");
    console.error(err);
  } finally {
    syncBtn.disabled = false;
    setTimeout(() => { syncStatus.textContent = ""; syncStatus.className = "sync-status"; }, 4000);
  }
}

// ================================================
//  CSV EXPORT
// ================================================
exportCsvBtn.addEventListener("click", () => {
  if (tasks.length === 0) { showToast("No tasks to export", "info"); return; }
  const header = ["Status", "Title", "Assignee", "Due Date", "Priority", "Category"];
  const rows = tasks.map(t => [t.status, t.title, t.assignee, t.dueDate, t.priority, t.category]);
  const csv = [header, ...rows].map(r => r.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tasks-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast("CSV downloaded", "success");
});

// ================================================
//  HELPERS
// ================================================
function saveTasks() {
  localStorage.setItem("tf_tasks", JSON.stringify(tasks));
}

function showToast(msg, type = "info") {
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function priorityDot(p) {
  return { critical: "●●●", high: "●●○", medium: "●○○", low: "○○○" }[p] || "●○○";
}
