import { apiErrorMessage, clipText, isReadablePage, normalizeAppUrl } from "./lib.js";

const $ = (id) => document.getElementById(id);
let busy = false;
let lastCommandId = "";

function setStatus(text, kind = "") {
  const node = $("status");
  node.textContent = text || "";
  node.className = kind;
}

function setBusy(next) {
  busy = next;
  for (const id of ["ask", "save", "selection", "task", "meeting", "test"]) {
    $(id).disabled = next;
  }
}

async function settings() {
  const stored = await chrome.storage.local.get(["apiUrl", "apiKey"]);
  const apiUrl = normalizeAppUrl($("apiUrl").value || stored.apiUrl || "");
  const apiKey = ($("apiKey").value || stored.apiKey || "").trim();
  if (!apiKey.startsWith("lf_live_")) {
    $("settings").open = true;
    throw new Error("Paste an API key that starts with lf_live_.");
  }
  $("apiUrl").value = apiUrl;
  await chrome.storage.local.set({ apiUrl, apiKey });
  return { apiUrl, apiKey };
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function readPage(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selection = (window.getSelection()?.toString() || "").replace(/\s+/g, " ").trim();
      const root = document.querySelector("article, main") || document.body;
      const text = (root?.innerText || "").replace(/\s+/g, " ").trim();
      return { selection, text };
    },
  });
  const payload = result?.result || { selection: "", text: "" };
  return {
    selection: clipText(payload.selection),
    text: clipText(payload.text),
  };
}

async function pageContext() {
  const tab = await activeTab();
  if (!tab?.url || !isReadablePage(tab.url)) {
    throw new Error("Open a normal web page first. Chrome’s own pages cannot be read.");
  }
  let extracted = { selection: "", text: "" };
  if (tab.id != null) {
    try {
      extracted = await readPage(tab.id);
    } catch {
      extracted = { selection: "", text: "" };
    }
  }
  return { tab, ...extracted };
}

async function api(path, { method = "POST", body } = {}) {
  const { apiUrl, apiKey } = await settings();
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can’t reach LifeFlow. Check the app URL and that the site is online.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(response.status, data));
  return data;
}

function renderRelated(related, alreadySaved) {
  const box = $("related");
  box.replaceChildren();
  if (alreadySaved?.title) {
    const note = document.createElement("div");
    const small = document.createElement("small");
    small.textContent = `Already in your vault as “${alreadySaved.title}”`;
    note.appendChild(small);
    box.appendChild(note);
  }
  if (!related?.length) return;
  const heading = document.createElement("div");
  const label = document.createElement("small");
  const strong = document.createElement("b");
  strong.textContent = "From your vault";
  label.appendChild(strong);
  heading.appendChild(label);
  box.appendChild(heading);
  for (const item of related) {
    const link = document.createElement("a");
    link.href = item.sourceUrl || "#";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `• ${item.title || "Untitled"}`;
    if (item.aiMemory) {
      const memo = document.createElement("small");
      memo.textContent = ` — ${item.aiMemory}`;
      link.appendChild(memo);
    }
    box.appendChild(link);
  }
}

function showAnswer(text) {
  const answer = $("answer");
  answer.hidden = !text;
  answer.textContent = text || "";
}

async function refreshPage() {
  const tab = await activeTab();
  if (!tab) {
    $("pageInfo").textContent = "No active tab";
    return;
  }
  const title = tab.title || "Untitled";
  const url = tab.url || "";
  $("pageInfo").textContent = isReadablePage(url) ? `${title} — ${url}` : `${title} — this page can’t be captured`;
  $("pageInfo").title = url;
}

async function ask(question) {
  const page = await pageContext();
  setStatus("Reading the page and searching your vault…");
  const data = await api("/api/v1/copilot", {
    body: {
      url: page.tab.url,
      title: page.tab.title || "",
      text: page.selection.length >= 40 ? page.selection : page.text,
      question: question || "",
    },
  });
  showAnswer(data.answer || "No answer returned.");
  renderRelated(data.related, data.alreadySaved);
  setStatus("");
}

async function savePage() {
  const page = await pageContext();
  setStatus("Saving this page to your vault…");
  const data = await api("/api/v1/knowledge", {
    body: {
      input: page.tab.url,
      title: page.tab.title || "",
      text: page.text,
      type: "link",
    },
  });
  const title = data.item?.title || "Saved";
  setStatus(data.alreadySaved ? `Already saved: ${title}` : `Saved: ${title}`, "ok");
  if (data.alreadySaved) renderRelated([], { title });
}

async function saveSelection(fallback = "") {
  const page = await pageContext();
  const selection = page.selection || clipText(fallback);
  if (selection.length < 2) {
    throw new Error("Select some text on the page first.");
  }
  setStatus("Saving the selection…");
  const data = await api("/api/v1/knowledge", {
    body: {
      input: selection,
      title: page.tab.title ? `Note from ${page.tab.title}` : "Clipped note",
      type: "note",
      sourceUrl: page.tab.url,
    },
  });
  setStatus(`Saved note: ${data.item?.title || "OK"}`, "ok");
}

async function createTask(presetTitle) {
  const page = await pageContext();
  const title = (presetTitle || $("question").value || `Follow up: ${page.tab.title || page.tab.url}`).trim();
  setStatus("Creating a task…");
  await api("/api/v1/tasks", {
    body: {
      title: title.slice(0, 120),
      description: page.tab.url,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  setStatus(`Task created: ${title.slice(0, 80)}`, "ok");
}

async function notesToTasks(fallback = "") {
  const page = await pageContext();
  const transcript = page.selection || clipText(fallback);
  if (transcript.length < 20) {
    throw new Error("Select the notes on the page first. LifeFlow needs at least a sentence.");
  }
  setStatus("Extracting tasks from your selection…");
  const data = await api("/api/v1/meetings", {
    body: { transcript, title: page.tab.title || "Browser notes" },
  });
  const result = data.result || {};
  const count = Array.isArray(result.actionItems) ? result.actionItems.length : 0;
  const lines = [result.summary || "Notes processed."];
  if (Array.isArray(result.decisions) && result.decisions.length) {
    lines.push("", "Decisions:", ...result.decisions.map((item) => `• ${item}`));
  }
  lines.push("", `Tasks created: ${count}`);
  showAnswer(lines.join("\n"));
  setStatus("Notes turned into tasks.", "ok");
}

async function testConnection() {
  setStatus("Checking LifeFlow…");
  const data = await api("/api/v1/me", { method: "GET" });
  if (!data.ok) throw new Error("LifeFlow did not confirm this API key.");
  $("settings").open = false;
  setStatus("Connected.", "ok");
}

async function run(action) {
  if (busy) return;
  setBusy(true);
  try {
    await action();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Something went wrong.", "error");
  } finally {
    setBusy(false);
  }
}

async function runCommand(command) {
  if (!command?.id || command.id === lastCommandId) return;
  lastCommandId = command.id;
  await chrome.storage.session.remove("pendingCommand");
  if (command.action === "ask-page") return ask(($("question").value || "").trim());
  if (command.action === "save-page") return savePage();
  if (command.action === "save-selection") return saveSelection(command.selection);
  if (command.action === "notes-to-tasks") return notesToTasks(command.selection);
}

async function consumePending() {
  const stored = await chrome.storage.session.get("pendingCommand");
  if (stored.pendingCommand) await run(() => runCommand(stored.pendingCommand));
}

$("ask").addEventListener("click", () => run(() => ask($("question").value.trim())));
$("save").addEventListener("click", () => run(savePage));
$("selection").addEventListener("click", () => run(() => saveSelection()));
$("task").addEventListener("click", () => run(() => createTask()));
$("meeting").addEventListener("click", () => run(() => notesToTasks()));
$("test").addEventListener("click", () => run(testConnection));
$("question").addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    run(() => ask($("question").value.trim()));
  }
});
$("toggleKey").addEventListener("click", () => {
  const input = $("apiKey");
  const hidden = input.type === "password";
  input.type = hidden ? "text" : "password";
  $("toggleKey").textContent = hidden ? "Hide" : "Show";
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "command") run(() => runCommand(message.command));
});
chrome.tabs.onActivated.addListener(() => refreshPage());
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === "complete" || info.title || info.url) refreshPage();
});

async function init() {
  const stored = await chrome.storage.local.get(["apiUrl", "apiKey"]);
  if (stored.apiUrl) $("apiUrl").value = stored.apiUrl;
  if (stored.apiKey) $("apiKey").value = stored.apiKey;
  if (!stored.apiUrl || !stored.apiKey) $("settings").open = true;
  await refreshPage();
  await consumePending();
}

init();
