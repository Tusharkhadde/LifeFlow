/** Pure helpers shared by the side panel. No chrome.* APIs. */

export function normalizeAppUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Add your LifeFlow app URL.");
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("That app URL is not valid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("App URL must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new Error("Remove the username and password from the app URL.");
  }
  return url.origin;
}

export function isReadablePage(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

export function clipText(text, max = 8000) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function apiErrorMessage(status, data) {
  const fromBody = data && typeof data.error === "string" ? data.error.trim() : "";
  if (fromBody) return fromBody;
  if (status === 401) return "Invalid or missing API key.";
  if (status === 403) return "This API key is missing a required permission.";
  if (status === 429) return "Rate limit exceeded. Try again in a few minutes.";
  if (status >= 500) return `LifeFlow returned an error (${status}).`;
  return `Request failed (${status}).`;
}
