import { getStore } from "@netlify/blobs";
import { claveObra } from "./models";
import type { EventoExtraido } from "./models";
import type { Credentials } from "google-auth-library";

/**
 * Persistencia con Netlify Blobs. Se eligió en vez de aprovisionar ya una base de datos
 * Postgres (Netlify DB) para simplificar el primer despliegue: no requiere crear ni
 * migrar un esquema aparte, y el volumen de datos de un solo negocio (decisiones de
 * emparejamiento, preferencias) es pequeño.
 *
 * Requiere ejecutarse con contexto de Netlify (`netlify dev` en local, o desplegado en
 * Netlify) para que `getStore` resuelva las credenciales del sitio automáticamente.
 *
 * Los nombres de los stores (prefijo "alborada-") son claves reales ya en uso en
 * producción — no renombrarlos sin migrar los datos existentes al nombre nuevo, o la
 * app deja de ver la biblioteca/config/decisiones ya guardadas.
 */

export interface DecisionEmparejamiento {
  /** Nombre de archivo elegido, o null si se decidió explícitamente no adjuntar partitura. */
  archivoNombre: string | null;
}

export interface Preferencias {
  insertarSeparadoresMomento: boolean;
}

const PREFERENCIAS_POR_DEFECTO: Preferencias = { insertarSeparadoresMomento: true };

function storeDecisiones() {
  return getStore("alborada-decisiones-emparejamiento");
}

function storePreferencias() {
  return getStore("alborada-preferencias");
}

function storeBibliotecaMetadata() {
  return getStore("alborada-biblioteca-metadata");
}

function storeBibliotecaPdfs() {
  return getStore("alborada-biblioteca-pdfs");
}

function storeBibliotecaChunksTemp() {
  return getStore("alborada-biblioteca-chunks-temp");
}

export async function obtenerDecision(
  titulo: string,
  compositor: string | null
): Promise<DecisionEmparejamiento | undefined> {
  const clave = claveObra(titulo, compositor);
  const valor = await storeDecisiones().get(clave, { type: "json" });
  return (valor as DecisionEmparejamiento | null) ?? undefined;
}

export async function guardarDecision(
  titulo: string,
  compositor: string | null,
  decision: DecisionEmparejamiento
): Promise<void> {
  const clave = claveObra(titulo, compositor);
  await storeDecisiones().setJSON(clave, decision);
}

/** Olvida la decisión guardada para una obra: la próxima vez se trata como nueva. */
export async function borrarDecision(titulo: string, compositor: string | null): Promise<void> {
  const clave = claveObra(titulo, compositor);
  await storeDecisiones().delete(clave);
}

/**
 * ¿Tiene cada obra del evento una decisión ya guardada (archivo real, o fijada
 * explícitamente como "sin partitura")? Puro: recibe las decisiones ya resueltas, no
 * toca Blobs — usado por el agente de correo para saber si avisar por email de que una
 * ficha detectada no necesita revisión de emparejamiento (ver netlify/functions/
 * revisar-correo.mts). Un evento sin obras nunca cuenta como "resuelto".
 */
export function todasLasObrasResueltas(
  evento: EventoExtraido,
  decisiones: Map<string, DecisionEmparejamiento>
): boolean {
  const obras = evento.momentos.flatMap((m) => m.obras);
  if (obras.length === 0) return false;
  return obras.every((o) => decisiones.has(claveObra(o.titulo, o.compositor)));
}

export async function obtenerPreferencias(): Promise<Preferencias> {
  const valor = await storePreferencias().get("global", { type: "json" });
  return { ...PREFERENCIAS_POR_DEFECTO, ...((valor as Partial<Preferencias>) ?? {}) };
}

export async function guardarPreferencias(preferencias: Preferencias): Promise<void> {
  await storePreferencias().setJSON("global", preferencias);
}

export interface ArchivoBiblioteca {
  nombre: string;
  tamano: number;
  subidoEn: string;
}

export async function listarBibliotecaCloud(): Promise<ArchivoBiblioteca[]> {
  const { blobs } = await storeBibliotecaMetadata().list();
  const archivos = await Promise.all(
    blobs.map(async (b) => (await storeBibliotecaMetadata().get(b.key, { type: "json" })) as ArchivoBiblioteca)
  );
  return archivos.filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function subirPartituraCloud(nombre: string, datos: ArrayBuffer): Promise<void> {
  await storeBibliotecaPdfs().set(nombre, datos);
  await storeBibliotecaMetadata().setJSON(nombre, {
    nombre,
    tamano: datos.byteLength,
    subidoEn: new Date().toISOString(),
  } satisfies ArchivoBiblioteca);
}

export async function obtenerPartituraCloud(nombre: string): Promise<ArrayBuffer | null> {
  const valor = await storeBibliotecaPdfs().get(nombre, { type: "arrayBuffer" });
  return (valor as ArrayBuffer | null) ?? null;
}

export async function borrarPartituraCloud(nombre: string): Promise<void> {
  await storeBibliotecaPdfs().delete(nombre);
  await storeBibliotecaMetadata().delete(nombre);
}

/**
 * Subida troceada: las funciones de Netlify tienen un límite de tamaño de petición
 * (~4,5 MB efectivos) muy por debajo de partituras reales (hasta 35 MB en una biblioteca
 * real), así que el navegador divide cada PDF en fragmentos pequeños y aquí se
 * van guardando hasta tener todos, momento en el que se ensamblan y se guardan como un
 * único PDF (ver app/api/biblioteca/chunk/route.ts).
 */
function claveChunk(nombre: string, indice: number): string {
  return `${nombre}::${String(indice).padStart(6, "0")}`;
}

export async function guardarChunk(nombre: string, indice: number, datos: ArrayBuffer): Promise<void> {
  await storeBibliotecaChunksTemp().set(claveChunk(nombre, indice), datos);
}

/** Si ya están los `total` fragmentos de `nombre`, los ensambla, los guarda como partitura y borra los fragmentos. */
export async function ensamblarSiCompleto(nombre: string, total: number): Promise<boolean> {
  const store = storeBibliotecaChunksTemp();
  const { blobs } = await store.list({ prefix: `${nombre}::` });
  if (blobs.length < total) return false;

  const trozos = await Promise.all(
    Array.from({ length: total }, (_, i) => store.get(claveChunk(nombre, i), { type: "arrayBuffer" }))
  );
  if (trozos.some((t) => t === null)) return false; // por si acaso llegan repetidos/incompletos

  const tamanoTotal = trozos.reduce((suma, t) => suma + (t as ArrayBuffer).byteLength, 0);
  const completo = new Uint8Array(tamanoTotal);
  let offset = 0;
  for (const trozo of trozos) {
    completo.set(new Uint8Array(trozo as ArrayBuffer), offset);
    offset += (trozo as ArrayBuffer).byteLength;
  }

  await subirPartituraCloud(nombre, completo.buffer);
  await Promise.all(Array.from({ length: total }, (_, i) => store.delete(claveChunk(nombre, i))));
  return true;
}

// ---------------------------------------------------------------------------
// Agente de correo (Fase 2): conexión con Gmail, mensajes ya procesados, y la
// cola de "pendientes de revisar" que genera la función programada.
// ---------------------------------------------------------------------------

function storeCorreoConfig() {
  return getStore("alborada-correo-config");
}

function storeCorreoMensajesProcesados() {
  return getStore("alborada-correo-mensajes-procesados");
}

function storePendientes() {
  return getStore("alborada-pendientes");
}

export interface ConfiguracionCorreo {
  tokens: Credentials;
  cuenta: string | null;
  etiquetaId: string | null;
  etiquetaNombre: string | null;
  prefijoAsunto: string | null;
  ultimaRevision: string | null;
}

const CLAVE_CONFIG_CORREO = "global";

export async function obtenerConfiguracionCorreo(): Promise<ConfiguracionCorreo | null> {
  const valor = await storeCorreoConfig().get(CLAVE_CONFIG_CORREO, { type: "json" });
  return (valor as ConfiguracionCorreo | null) ?? null;
}

export async function guardarConfiguracionCorreo(config: ConfiguracionCorreo): Promise<void> {
  await storeCorreoConfig().setJSON(CLAVE_CONFIG_CORREO, config);
}

export async function desconectarCorreo(): Promise<void> {
  await storeCorreoConfig().delete(CLAVE_CONFIG_CORREO);
}

export async function idsMensajesProcesados(): Promise<Set<string>> {
  const { blobs } = await storeCorreoMensajesProcesados().list();
  return new Set(blobs.map((b) => b.key));
}

export async function marcarMensajeProcesado(id: string): Promise<void> {
  await storeCorreoMensajesProcesados().setJSON(id, { procesadoEn: new Date().toISOString() });
}

export interface Pendiente {
  id: string;
  mensajeId: string;
  archivoOrigen: string;
  remitente: string;
  asunto: string;
  fechaCorreo: string;
  detectadoEn: string;
  evento: EventoExtraido;
  texto: string;
}

export async function guardarPendiente(pendiente: Omit<Pendiente, "id" | "detectadoEn">): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const registro: Pendiente = { ...pendiente, id, detectadoEn: new Date().toISOString() };
  await storePendientes().setJSON(id, registro);
}

export async function listarPendientes(): Promise<Pendiente[]> {
  const { blobs } = await storePendientes().list();
  const registros = await Promise.all(
    blobs.map(async (b) => (await storePendientes().get(b.key, { type: "json" })) as Pendiente)
  );
  return registros.filter(Boolean).sort((a, b) => a.detectadoEn.localeCompare(b.detectadoEn));
}

export async function obtenerPendiente(id: string): Promise<Pendiente | null> {
  const valor = await storePendientes().get(id, { type: "json" });
  return (valor as Pendiente | null) ?? null;
}

export async function borrarPendiente(id: string): Promise<void> {
  await storePendientes().delete(id);
}
