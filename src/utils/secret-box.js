import crypto from "node:crypto";
import { env } from "../config/env.js";

// ======================================================
// Secret box
// ======================================================
//
// Encrypts small secrets (app-specific passwords, ICS
// subscription links) before they are stored in the
// database. AES-256-GCM with the key from
// CALENDAR_ENCRYPTION_KEY (32 bytes, base64).
//
// Stored format: v1.<iv>.<tag>.<ciphertext>, base64url.
//
// Never log the input or the output of decrypt.
// ======================================================

function getKey() {
  const raw = env.calendarEncryptionKey;

  if (!raw) {
    throw new Error("CALENDAR_ENCRYPTION_KEY is not set.");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "CALENDAR_ENCRYPTION_KEY must be 32 bytes (base64)."
    );
  }

  return key;
}

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(stored) {
  const [version, iv, tag, data] = stored.split(".");

  if (version !== "v1" || !iv || !tag || !data) {
    throw new Error("Unknown secret format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64url")
  );

  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
