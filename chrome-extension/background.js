const MENUS = [
  { id: "save-page", title: "Save page to LifeFlow", contexts: ["page", "action"] },
  { id: "ask-page", title: "Ask LifeFlow about this page", contexts: ["page", "action"] },
  { id: "save-selection", title: "Save selection to LifeFlow", contexts: ["selection"] },
  { id: "notes-to-tasks", title: "Turn selection into LifeFlow tasks", contexts: ["selection"] },
];

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    for (const menu of MENUS) {
      chrome.contextMenus.create(menu);
    }
  });
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id == null) return;
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  installMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const command = {
    id: crypto.randomUUID(),
    action: info.menuItemId,
    selection: info.selectionText || "",
    url: info.pageUrl || tab?.url || "",
    title: tab?.title || "",
    tabId: tab?.id ?? null,
  };
  await chrome.storage.session.set({ pendingCommand: command });
  try {
    if (tab?.id != null) await chrome.sidePanel.open({ tabId: tab.id });
    else if (tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch {
    // Panel may already be open from a previous click.
  }
  chrome.runtime.sendMessage({ type: "command", command }).catch(() => {});
});
