import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Cifrado en reposo (AES-256-GCM, nativo de Node, sin dependencias nuevas) para el token
 * de OAuth de Gmail guardado en Netlify Blobs (lib/store.ts) — un secreto real que, sin
 * cifrar, daría acceso de lectura y envío de correo a quien llegara al blob. La clave
 * vive en la variable de entorno GMAIL_TOKEN_ENCRYPTION_KEY (32 bytes en base64).
 */

export interface ValorCifrado {
  v: 1;
  iv: string; // base64
  tag: string; // base64, tag de autenticación GCM
  ciphertext: string; // base64
}

function clave(): Buffer {
  const b64 = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("Falta GMAIL_TOKEN_ENCRYPTION_KEY (clave de cifrado de 32 bytes en base64).");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256).");
  return buf;
}

export function cifrar(valor: unknown): ValorCifrado {
  const iv = randomBytes(12); // 96 bits, tamaño recomendado para GCM
  const cipher = createCipheriv("aes-256-gcm", clave(), iv);
  const texto = Buffer.from(JSON.stringify(valor), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(texto), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function descifrar<T>(sobre: ValorCifrado): T {
  const decipher = createDecipheriv("aes-256-gcm", clave(), Buffer.from(sobre.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sobre.tag, "base64"));
  const texto = Buffer.concat([decipher.update(Buffer.from(sobre.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(texto.toString("utf-8")) as T;
}

/** Distingue un sobre cifrado de un valor en texto plano (p.ej. Credentials sin cifrar
 * ya guardado antes de introducir este módulo — ver lib/store.ts). */
export function esValorCifrado(valor: unknown): valor is ValorCifrado {
  return (
    !!valor &&
    typeof valor === "object" &&
    (valor as ValorCifrado).v === 1 &&
    "iv" in valor &&
    "tag" in valor &&
    "ciphertext" in valor
  );
}
