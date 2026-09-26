import { lookup } from "dns/promises";
import { isIP } from "net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "host.docker.internal",
]);

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertSafeOutboundUrl(
  input: string | URL,
  options: { httpsOnly?: boolean } = {}
) {
  const url = input instanceof URL ? input : new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }
  if (options.httpsOnly && url.protocol !== "https:") {
    throw new Error("HTTPS is required");
  }
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Private hosts are not allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private IP addresses are not allowed");
    return url;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("URL resolves to a private or invalid address");
  }
  return url;
}

export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: { httpsOnly?: boolean; maxRedirects?: number } = {}
) {
  let current = await assertSafeOutboundUrl(input, options);
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirect === maxRedirects) throw new Error("Too many redirects");
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect is missing Location header");
    current = await assertSafeOutboundUrl(new URL(location, current), options);
  }

  throw new Error("Unable to fetch URL");
}
