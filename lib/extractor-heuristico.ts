import type { EventoExtraido, MomentoExtraido, ObraExtraida } from "./models";

/**
 * Extracción alternativa SIN llamada a ningún modelo de IA: por reglas, aprovechando que
 * (a) los "momentos" de una boda/funeral salen de un vocabulario bastante cerrado, y
 * (b) las líneas de obra casi siempre llevan comillas y/o una coma antes del compositor.
 *
 * No pretende ser tan fiable como la extracción con Claude (lib/extractor.ts) — en
 * particular, no normaliza compositores (útil para las estadísticas) y falla en líneas
 * atípicas — pero permite un primer emparejamiento obra→partitura sin ningún coste ni
 * dependencia externa, apoyándose en que la persona revisa y confirma cada partitura
 * antes de generar la setlist.
 */

const MOMENTOS_CONOCIDOS = [
  "recepcion de invitados",
  "entrada del novio",
  "entrada de la novia",
  "entrada",
  "rito del matrimonio",
  "consentimiento",
  "aleluya",
  "bendicion de anillos y arras",
  "bendicion y entrega de anillos y arras",
  "ofertorio",
  "consagracion",
  "santo",
  "padre nuestro",
  "cordero de dios",
  "comunion",
  "accion de gracias",
  "bendicion final",
  "firmas de novios y testigos",
  "salida nupcial",
  "salida",
  "primera lectura",
  "segunda lectura",
  "salmo responsorial",
  "evangelio",
  "homilia",
  "oracion de los fieles",
  "preces",
  "peticiones",
  "ultima recomendacion",
  "despedida",
  "responso",
];

const MARCADORES_FIN_PROGRAMA = ["notas", "alborada eventos musicales", "organiza"];
const MARCADORES_CABECERA = [
  "tipo de evento",
  "dia:",
  "lugar:",
  "oficia:",
  "parroco:",
  "sacristan:",
  "colocacion:",
  "componente",
  "cita:",
  "calle",
  "tlf",
];

function normalizarLinea(linea: string): string {
  return linea
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esLineaDeCabecera(normalizada: string): boolean {
  return MARCADORES_CABECERA.some((m) => normalizada.startsWith(m) || normalizada.includes(m));
}

function esFinDelPrograma(normalizada: string): boolean {
  return MARCADORES_FIN_PROGRAMA.some((m) => normalizada.startsWith(m));
}

function esLineaDeTabla(lineaOriginal: string): boolean {
  return lineaOriginal.includes(" | ");
}

const CARACTERES_COMILLA = /["“”'’‘]/;

function esMomento(lineaOriginal: string, normalizada: string): boolean {
  if (CARACTERES_COMILLA.test(lineaOriginal)) return false;
  if (normalizada.split(" ").length > 8) return false;
  return MOMENTOS_CONOCIDOS.some((m) => normalizada === m || normalizada.startsWith(m + " ") || normalizada.includes(m));
}

function partirObra(lineaOriginal: string): ObraExtraida {
  // Quita paréntesis finales tipo "(Instrumental)", que no forman parte del título/compositor.
  const sinParentesisFinal = lineaOriginal.replace(/\s*\([^)]*\)\s*$/, "").trim();

  const comillas = sinParentesisFinal.match(/["“]([^"”]+)["”]/);
  const partes = sinParentesisFinal.split(",").map((p) => p.trim()).filter(Boolean);

  if (partes.length >= 2) {
    const compositor = partes[partes.length - 1];
    const titulo = comillas ? comillas[1] : partes.slice(0, -1).join(", ");
    return { titulo, compositor };
  }

  return { titulo: comillas ? comillas[1] : sinParentesisFinal, compositor: null };
}

export function extraerEventoHeuristico(texto: string): EventoExtraido {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);

  const momentos: MomentoExtraido[] = [];
  let momentoActual: MomentoExtraido | null = null;
  let dentroDelPrograma = false;

  for (const linea of lineas) {
    const normalizada = normalizarLinea(linea);

    if (esLineaDeTabla(linea) || esFinDelPrograma(normalizada)) break;
    if (!dentroDelPrograma) {
      if (esLineaDeCabecera(normalizada)) continue;
      if (!esMomento(linea, normalizada)) continue; // sigue en la cabecera hasta el primer momento reconocido
      dentroDelPrograma = true;
    }

    if (esMomento(linea, normalizada)) {
      momentoActual = { nombre: linea, obras: [] };
      momentos.push(momentoActual);
    } else if (momentoActual) {
      momentoActual.obras.push(partirObra(linea));
    }
  }

  return {
    tipo_evento: null,
    fecha: null,
    parroquia: null,
    poblacion: null,
    interpretes: [],
    momentos,
  };
}
