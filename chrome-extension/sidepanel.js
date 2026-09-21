const $ = (id) => document.getElementById(id);
const status = (text) => ($("status").textContent = text);

async function settings() {
  const stored = await chrome.storage.local.get(["apiUrl", "apiKey"]);
  const apiUrl = ($("apiUrl").value || stored.apiUrl || "").replace(/\/$/, "");
  const apiKey = ($("apiKey").value || stored.apiKey || "").trim();
  return { apiUrl, apiKey };
}

async function init() {
  const stored = await chrome.storage.local.get(["apiUrl", "apiKey"]);
  if (stored.apiUrl) $("apiUrl").value = stored.apiUrl;
  if (stored.apiKey) $("apiKey").value = stored.apiKey;
  if (!stored.apiUrl || !stored.apiKey) $("settings").open = true;
  $("apiUrl").addEventListener("change", (e) => chrome.storage.local.set({ apiUrl: e.target.value.trim() }));
  $("apiKey").addEventListener("change", (e) => chrome.storage.local.set({ apiKey: e.target.value.trim() }));
  const tab = await activeTab();
  $("pageInfo").textContent = tab ? `${tab.title || ""} — ${tab.url || ""}` : "No active tab";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pageText(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selection = window.getSelection()?.toString();
        if (selection && selection.length > 80) return selection;
        const main = document.querySelector("article, main") || document.body;
        return (main?.innerText || "").replace(/\s+/g, " ").slice(0, 8000);
      },
    });
    return result?.result || "";
  } catch {
    return "";
  }
}

async function api(path, body) {
  const { apiUrl, apiKey } = await settings();
  if (!apiUrl || !apiKey) {
    $("settings").open = true;
    throw new Error("Add your LifeFlow URL and API key first.");
  }
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function renderRelated(related, alreadySaved) {
  const box = $("related");
  box.innerHTML = "";
  if (alreadySaved) {
    const note = document.createElement("div");
    note.innerHTML = `<small>✅ Already in your vault as “${alreadySaved.title}”</small>`;
    box.appendChild(note);
  }
  if (!related?.length) return;
  const heading = document.createElement("div");
  heading.innerHTML = "<small><b>From your vault</b></small>";
  box.appendChild(heading);
  for (const item of related) {
    const link = document.createElement("a");
    link.href = item.sourceUrl || "#";
    link.target = "_blank";
    link.textContent = `• ${item.title}`;
    if (item.aiMemory) {
      const memo = document.createElement("small");
      memo.textContent = ` — ${item.aiMemory}`;
      link.appendChild(memo);
    }
    box.appendChild(link);
  }
}

$("ask").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  $("ask").disabled = true;
  status("Reading page and searching your vault…");
  try {
    const text = await pageText(tab.id);
    const data = await api("/api/v1/copilot", { url: tab.url, title: tab.title, text, question: $("question").value.trim() });
    $("answer").hidden = false;
    $("answer").textContent = data.answer;
    renderRelated(data.related, data.alreadySaved);
    status("");
  } catch (error) {
    status(error.message);
  } finally {
    $("ask").disabled = false;
  }
});

$("save").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.url) return;
  $("save").disabled = true;
  status("Saving to vault…");
  try {
    const data = await api("/api/v1/knowledge", { input: tab.url });
    status(`Saved: ${data.item?.title || "OK"}`);
  } catch (error) {
    status(error.message);
  } finally {
    $("save").disabled = false;
  }
});

$("task").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab) return;
  const title = $("question").value.trim() || `Follow up: ${tab.title || tab.url}`;
  status("Creating task…");
  try {
    await api("/api/v1/tasks", { title: title.slice(0, 120), description: tab.url, dueAt: new Date(Date.now() + 86400000).toISOString() });
    status(`Task created: ${title.slice(0, 60)}`);
  } catch (error) {
    status(error.message);
  }
});

$("meeting").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  status("Extracting decisions and tasks from this page…");
  try {
    const text = await pageText(tab.id);
    if (text.length < 40) throw new Error("Select the notes on the page first (or the page has too little text).");
    const data = await api("/api/v1/meetings", { transcript: text, title: tab.title });
    $("answer").hidden = false;
    $("answer").textContent = `${data.result.summary}\n\nTasks created: ${data.result.actionItems.length}`;
    status("Meeting processed.");
  } catch (error) {
    status(error.message);
  }
});

init();
