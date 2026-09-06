import { getStore } from "@netlify/blobs";
import { claveObra } from "./models";
import type { EventoExtraido } from "./models";

/**
 * Persistencia con Netlify Blobs. Se eligió en vez de aprovisionar ya una base de datos
 * Postgres (Netlify DB) para simplificar el primer despliegue: no requiere crear ni
 * migrar un esquema aparte, y el volumen de datos de Alborada (decisiones de
 * emparejamiento, preferencias, e historial de eventos) es pequeño. Si el histórico
 * crece mucho o se necesitan consultas relacionales más ricas para las estadísticas,
 * migrar a Netlify DB más adelante es sencillo.
 *
 * Requiere ejecutarse con contexto de Netlify (`netlify dev` en local, o desplegado en
 * Netlify) para que `getStore` resuelva las credenciales del sitio automáticamente.
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

function storeEventos() {
  return getStore("alborada-eventos");
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

export interface EventoHistorial {
  id: string;
  archivoOrigen: string;
  importadoEn: string;
  evento: EventoExtraido;
}

export async function guardarEventoHistorial(archivoOrigen: string, evento: EventoExtraido): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const registro: EventoHistorial = { id, archivoOrigen, importadoEn: new Date().toISOString(), evento };
  await storeEventos().setJSON(id, registro);
}

export async function listarEventosHistorial(): Promise<EventoHistorial[]> {
  const { blobs } = await storeEventos().list();
  const registros = await Promise.all(
    blobs.map(async (b) => (await storeEventos().get(b.key, { type: "json" })) as EventoHistorial)
  );
  return registros.filter(Boolean).sort((a, b) => a.importadoEn.localeCompare(b.importadoEn));
}
