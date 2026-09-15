import { google } from "googleapis";
import type { Credentials } from "google-auth-library";

/**
 * Integración con Gmail (OAuth de solo lectura) para el agente de correo: conectar
 * una cuenta, listar sus etiquetas, y buscar mensajes nuevos con un adjunto
 * .docx/.doc dentro de la etiqueta elegida. Nunca escribe nada en el correo (alcance
 * `gmail.readonly`).
 */

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function clienteOAuth(redirectUri: string) {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
}

/** URL de consentimiento de Google a la que mandar al usuario para conectar su cuenta. */
export function urlAutorizacion(redirectUri: string): string {
  const client = clienteOAuth(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline", // imprescindible para recibir un refresh_token
    prompt: "consent", // fuerza a que Google lo devuelva también si ya se había autorizado antes
    scope: SCOPES,
  });
}

/** Cambia el código que devuelve Google tras el consentimiento por los tokens reales. */
export async function intercambiarCodigo(code: string, redirectUri: string): Promise<Credentials> {
  const client = clienteOAuth(redirectUri);
  const { tokens } = await client.getToken(code);
  return tokens;
}

function clienteConTokens(tokens: Credentials) {
  const client = clienteOAuth("");
  client.setCredentials(tokens);
  return client;
}

export async function obtenerCuentaConectada(tokens: Credentials): Promise<string | null> {
  const auth = clienteConTokens(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const { data } = await gmail.users.getProfile({ userId: "me" });
  return data.emailAddress ?? null;
}

export interface EtiquetaGmail {
  id: string;
  nombre: string;
}

export async function listarEtiquetas(tokens: Credentials): Promise<EtiquetaGmail[]> {
  const auth = clienteConTokens(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const { data } = await gmail.users.labels.list({ userId: "me" });
  return (data.labels ?? [])
    .filter((l): l is { id: string; name: string } => !!l.id && !!l.name)
    .map((l) => ({ id: l.id, nombre: l.name }));
}

export interface AdjuntoGmail {
  nombre: string;
  attachmentId: string;
}

export interface MensajeConAdjunto {
  id: string;
  asunto: string;
  remitente: string;
  fechaIso: string;
  adjuntos: AdjuntoGmail[];
}

function extraerAdjuntosDocx(
  part: { filename?: string | null; body?: { attachmentId?: string | null } | null; parts?: unknown[] } | undefined | null
): AdjuntoGmail[] {
  const encontrados: AdjuntoGmail[] = [];
  function recorrer(p: typeof part) {
    if (!p) return;
    if (p.filename && /\.(docx|doc)$/i.test(p.filename) && p.body?.attachmentId) {
      encontrados.push({ nombre: p.filename, attachmentId: p.body.attachmentId });
    }
    for (const hijo of (p.parts ?? []) as (typeof part)[]) recorrer(hijo);
  }
  recorrer(part);
  return encontrados;
}

/**
 * Busca mensajes con la etiqueta indicada que tengan un adjunto .docx/.doc. El filtro
 * de Gmail (`q`) ya reduce bastante, pero el prefijo de asunto se comprueba también a
 * mano en JS porque la búsqueda de Gmail no hace un prefijo estricto.
 */
export async function buscarMensajesConAdjunto(
  tokens: Credentials,
  etiquetaId: string,
  prefijoAsunto: string | null,
  idsYaProcesados: Set<string>
): Promise<MensajeConAdjunto[]> {
  const auth = clienteConTokens(tokens);
  const gmail = google.gmail({ version: "v1", auth });

  const { data: listado } = await gmail.users.messages.list({
    userId: "me",
    labelIds: [etiquetaId],
    q: "has:attachment (filename:docx OR filename:doc)",
    maxResults: 25,
  });

  const resultado: MensajeConAdjunto[] = [];
  for (const referencia of listado.messages ?? []) {
    if (!referencia.id || idsYaProcesados.has(referencia.id)) continue;

    const { data: mensaje } = await gmail.users.messages.get({ userId: "me", id: referencia.id, format: "full" });
    const cabeceras = mensaje.payload?.headers ?? [];
    const asunto = cabeceras.find((h) => h.name === "Subject")?.value ?? "(sin asunto)";
    const remitente = cabeceras.find((h) => h.name === "From")?.value ?? "";

    if (prefijoAsunto && !asunto.toLowerCase().startsWith(prefijoAsunto.toLowerCase())) continue;

    const adjuntos = extraerAdjuntosDocx(mensaje.payload);
    if (adjuntos.length === 0) continue;

    resultado.push({
      id: referencia.id,
      asunto,
      remitente,
      fechaIso: mensaje.internalDate ? new Date(Number(mensaje.internalDate)).toISOString() : new Date().toISOString(),
      adjuntos,
    });
  }
  return resultado;
}

export async function descargarAdjunto(tokens: Credentials, messageId: string, attachmentId: string): Promise<Buffer> {
  const auth = clienteConTokens(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const { data } = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  return Buffer.from(data.data ?? "", "base64url");
}
