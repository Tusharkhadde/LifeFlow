import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1";

function keyMaterial() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
    }
    return null;
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string | null | undefined) {
  if (!value || value.startsWith(`${PREFIX}:`)) return value || null;
  const key = keyMaterial();
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const key = keyMaterial();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required to decrypt stored credentials");
  const [, , ivRaw, tagRaw, encryptedRaw] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedSecret(value: string | null | undefined) {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}
