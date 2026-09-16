import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import type { Credentials } from "google-auth-library";

/**
 * Integración con Gmail para el agente de correo: conectar una cuenta, listar sus
 * etiquetas, buscar mensajes nuevos con un adjunto .docx/.doc dentro de la etiqueta
 * elegida, y descargarlos. También puede responder (`enviarRespuesta`) cuando una ficha
 * detectada ya está 100% resuelta de memoria — el único caso en que este agente escribe
 * en el correo, y nunca genera ni sube nada por su cuenta (ver netlify/functions/
 * revisar-correo.mts).
 */

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

/**
 * URL de callback a partir de la petición entrante. Usa las cabeceras de host/protocolo
 * (fiables tras el proxy de Netlify) en vez de `request.url`, que en producción refleja
 * la URL específica de ese despliegue concreto (que cambia en cada `deploy`) y no el
 * dominio fijo registrado como redirect URI autorizado en Google Cloud Console.
 */
export function urlCallbackDesdePeticion(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const protocolo = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${protocolo}://${host}/api/correo/callback`;
}

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
  threadId: string;
  /** Cabecera RFC "Message-ID" del mensaje (con los < >), para enlazar una respuesta al hilo. */
  messageIdHeader: string;
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

  // Gmail solo devuelve 100 mensajes como mucho por página: se recorren todas las
  // páginas (con un tope de seguridad) para no perder para siempre los mensajes más
  // antiguos de un backlog grande — cada uno ya se descarta enseguida si está en
  // `idsYaProcesados`, así que en el caso normal (poco backlog) esto es una sola página.
  const referencias: gmail_v1.Schema$Message[] = [];
  let pageToken: string | undefined;
  const TOPE_PAGINAS = 20;
  for (let pagina = 0; pagina < TOPE_PAGINAS; pagina++) {
    const { data: listado } = await gmail.users.messages.list({
      userId: "me",
      labelIds: [etiquetaId],
      q: "has:attachment (filename:docx OR filename:doc)",
      maxResults: 100,
      pageToken,
    });
    referencias.push(...(listado.messages ?? []));
    if (!listado.nextPageToken) break;
    pageToken = listado.nextPageToken;
  }

  const resultado: MensajeConAdjunto[] = [];
  for (const referencia of referencias) {
    if (!referencia.id || idsYaProcesados.has(referencia.id)) continue;

    // Primero solo las cabeceras (barato): si el asunto no cumple el prefijo, se descarta
    // sin gastar la llamada "full" (que trae también los adjuntos en base64).
    const { data: cabecera } = await gmail.users.messages.get({
      userId: "me",
      id: referencia.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Message-ID"],
    });
    const cabeceras = cabecera.payload?.headers ?? [];
    const asunto = cabeceras.find((h) => h.name === "Subject")?.value ?? "(sin asunto)";
    const remitente = cabeceras.find((h) => h.name === "From")?.value ?? "";
    const messageIdHeader = cabeceras.find((h) => h.name?.toLowerCase() === "message-id")?.value ?? "";

    if (prefijoAsunto && !asunto.toLowerCase().startsWith(prefijoAsunto.toLowerCase())) continue;

    const { data: mensaje } = await gmail.users.messages.get({ userId: "me", id: referencia.id, format: "full" });
    const adjuntos = extraerAdjuntosDocx(mensaje.payload);
    if (adjuntos.length === 0) continue;

    resultado.push({
      id: referencia.id,
      threadId: mensaje.threadId ?? referencia.id,
      messageIdHeader,
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

function codificarAsuntoUtf8(asunto: string): string {
  return `=?UTF-8?B?${Buffer.from(asunto, "utf-8").toString("base64")}?=`;
}

function conAngulos(messageId: string): string {
  const recortado = messageId.trim();
  return recortado.startsWith("<") ? recortado : `<${recortado}>`;
}

export interface OpcionesRespuesta {
  threadId: string;
  /** Cabecera Message-ID cruda del mensaje original (con o sin < >). */
  messageIdOriginal: string;
  /** "Nombre <email>", tal cual viene de MensajeConAdjunto.remitente. */
  destinatario: string;
  /** La propia cuenta conectada (config.cuenta). */
  remitenteCuenta: string;
  asuntoOriginal: string;
  /** Texto plano. */
  cuerpo: string;
}

/**
 * Responde (reply, no un correo nuevo) dentro del mismo hilo que el mensaje original —
 * único caso en que este módulo escribe en el correo (alcance `gmail.send`). Se usa solo
 * cuando una ficha detectada ya está 100% resuelta de memoria; nunca genera ni adjunta
 * ningún `.4ss` (ver netlify/functions/revisar-correo.mts).
 */
export async function enviarRespuesta(tokens: Credentials, opts: OpcionesRespuesta): Promise<void> {
  const auth = clienteConTokens(tokens);
  const gmail = google.gmail({ version: "v1", auth });

  const asunto = /^re:/i.test(opts.asuntoOriginal) ? opts.asuntoOriginal : `Re: ${opts.asuntoOriginal}`;
  const messageIdOriginal = conAngulos(opts.messageIdOriginal);

  const cabeceras = [
    `To: ${opts.destinatario}`,
    `From: ${opts.remitenteCuenta}`,
    `Subject: ${codificarAsuntoUtf8(asunto)}`,
    `In-Reply-To: ${messageIdOriginal}`,
    `References: ${messageIdOriginal}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ].join("\r\n");
  const mensajeCrudo = `${cabeceras}\r\n\r\n${opts.cuerpo}`;

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: opts.threadId,
      raw: Buffer.from(mensajeCrudo, "utf-8").toString("base64url"),
    },
  });
}
