"use client";

/**
 * Ayudantes para el modo "carpeta local" (API showDirectoryPicker del navegador).
 * Solo funciona en navegadores basados en Chromium de escritorio (Chrome/Edge); Safari
 * y Firefox no la soportan, y esta app debe avisarlo en pantalla en vez de fallar en silencio.
 */

const DB_NOMBRE = "alborada-setlists";
const DB_ALMACEN = "handles";
const CLAVE_HANDLE = "carpeta-partituras";

export function soportaFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function abrirIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(DB_ALMACEN);
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function guardarHandleEnIndexedDB(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await abrirIndexedDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_ALMACEN, "readwrite");
    tx.objectStore(DB_ALMACEN).put(handle, CLAVE_HANDLE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function recuperarCarpetaGuardada(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await abrirIndexedDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_ALMACEN, "readonly");
      const peticion = tx.objectStore(DB_ALMACEN).get(CLAVE_HANDLE);
      peticion.onsuccess = () => resolve((peticion.result as FileSystemDirectoryHandle) ?? null);
      peticion.onerror = () => reject(peticion.error);
    });
  } catch {
    return null;
  }
}

/** Pide permiso de lectura sobre un handle ya guardado (necesario cada nueva sesión del navegador). */
export async function asegurarPermisoLectura(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opciones = { mode: "read" as const };
  if ((await handle.queryPermission(opciones)) === "granted") return true;
  return (await handle.requestPermission(opciones)) === "granted";
}

export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: "read" });
  await guardarHandleEnIndexedDB(handle);
  return handle;
}

/** Lista los nombres de todos los PDF directamente dentro de la carpeta (sin recorrer subcarpetas). */
export async function listarPdfs(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const nombres: string[] = [];
  for await (const entrada of handle.values()) {
    if (entrada.kind === "file" && entrada.name.toLowerCase().endsWith(".pdf")) {
      nombres.push(entrada.name);
    }
  }
  return nombres.sort();
}

export function bytesABase64(bytes: Uint8Array): string {
  let binario = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binario);
}

export async function leerPdfComoBase64(handle: FileSystemDirectoryHandle, nombre: string): Promise<string> {
  const fileHandle = await handle.getFileHandle(nombre);
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();
  return bytesABase64(new Uint8Array(buffer));
}
