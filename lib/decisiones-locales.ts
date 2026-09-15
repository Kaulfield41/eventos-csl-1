"use client";

import { claveObra } from "./models";

/**
 * Equivalente en el navegador (localStorage) de las decisiones de emparejamiento y
 * preferencias que, para el dueño, viven en Netlify Blobs (`lib/store.ts`). Solo se usa
 * en modo invitado (ver `lib/modo-dueno.ts`) para que quien prueba la app no toque los
 * datos reales del dueño — nunca sale de este navegador, no hay llamada al servidor.
 */

export interface DecisionLocal {
  archivoNombre: string | null;
}

export interface PreferenciasLocales {
  insertarSeparadoresMomento: boolean;
}

const CLAVE_DECISIONES = "eventos-csl-1-decisiones-invitado";
const CLAVE_PREFERENCIAS = "eventos-csl-1-preferencias-invitado";
const PREFERENCIAS_POR_DEFECTO: PreferenciasLocales = { insertarSeparadoresMomento: true };

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // localStorage lleno o no disponible: la decisión simplemente no se recuerda.
  }
}

export function obtenerDecisionesLocales(): Record<string, DecisionLocal> {
  return leer(CLAVE_DECISIONES, {});
}

export function guardarDecisionLocal(titulo: string, compositor: string | null, decision: DecisionLocal) {
  const decisiones = obtenerDecisionesLocales();
  decisiones[claveObra(titulo, compositor)] = decision;
  escribir(CLAVE_DECISIONES, decisiones);
}

export function borrarDecisionLocal(titulo: string, compositor: string | null) {
  const decisiones = obtenerDecisionesLocales();
  delete decisiones[claveObra(titulo, compositor)];
  escribir(CLAVE_DECISIONES, decisiones);
}

export function obtenerPreferenciasLocales(): PreferenciasLocales {
  return leer(CLAVE_PREFERENCIAS, PREFERENCIAS_POR_DEFECTO);
}

export function guardarPreferenciasLocales(preferencias: PreferenciasLocales) {
  escribir(CLAVE_PREFERENCIAS, preferencias);
}
