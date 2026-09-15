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
  "recepcion de feligreses",
  "recepcion del cuerpo",
  "recepcion del feretro",
  "introito",
  "kyrie",
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

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Busca un patrón "4 de septiembre de 2026" y lo convierte a ISO (YYYY-MM-DD). */
function extraerFechaIso(linea: string): string | null {
  const sinAcentos = linea
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const m = sinAcentos.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Busca "Hora de la Boda: 18:30h" (o similar); ignora "Cita:" (hora de llegada, no del evento). */
function extraerHora(linea: string): string | null {
  const m = linea.match(/hora[^:\n]*:\s*(\d{1,2})[.:](\d{2})/i);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function extraerCabecera(lineas: string[]): { tipo_evento: string | null; fecha: string | null; hora: string | null } {
  let tipo_evento: string | null = null;
  let fecha: string | null = null;
  let hora: string | null = null;

  for (const linea of lineas) {
    const normalizada = normalizarLinea(linea);
    if (esMomento(linea, normalizada)) break; // ya terminó la cabecera

    if (tipo_evento === null && normalizada.startsWith("tipo de evento")) {
      const m = linea.match(/tipo de evento\s*:\s*(.+)/i);
      if (m) tipo_evento = m[1].trim();
    }
    if (fecha === null && normalizada.startsWith("dia")) {
      fecha = extraerFechaIso(linea);
    }
    if (hora === null) {
      hora = extraerHora(linea);
    }
  }

  return { tipo_evento, fecha, hora };
}

/**
 * Detecta si una línea es en realidad la continuación de una frase suelta del programa
 * (ej. una nota editorial de varias líneas que también lleva coma) en vez de un título u
 * compositor real: estos casi siempre empiezan por mayúscula, mientras que la
 * continuación de una frase empieza por minúscula.
 */
function empiezaEnMinuscula(texto: string): boolean {
  const letra = texto.match(/\p{L}/u)?.[0];
  if (!letra) return false;
  return letra === letra.toLowerCase() && letra !== letra.toUpperCase();
}

/**
 * El compositor real siempre acaba en un nombre (con mayúscula), aunque empiece por un
 * conector en minúscula (ej. "de 'Los Chicos del Coro'. B.Coulais"). Si ni siquiera la
 * última palabra parece un nombre, es que no es un compositor de verdad.
 */
function terminaComoNombre(texto: string): boolean {
  const palabras = texto.trim().split(/\s+/);
  const letra = (palabras[palabras.length - 1] ?? "").match(/\p{L}/u)?.[0];
  if (!letra) return false;
  return letra === letra.toUpperCase() && letra !== letra.toLowerCase();
}

function partirObra(lineaOriginal: string): ObraExtraida | null {
  if (empiezaEnMinuscula(lineaOriginal)) return null; // continuación de una frase, no una obra

  // Quita paréntesis finales tipo "(Instrumental)", que no forman parte del título/compositor.
  const sinParentesisFinal = lineaOriginal.replace(/\s*\([^)]*\)\s*$/, "").trim();

  const comillas = sinParentesisFinal.match(/["“]([^"”]+)["”]/);
  const partes = sinParentesisFinal.split(",").map((p) => p.trim()).filter(Boolean);

  if (partes.length >= 2) {
    const compositor = partes[partes.length - 1];
    if (!terminaComoNombre(compositor)) return null; // el "compositor" deducido no acaba pareciendo un nombre
    const titulo = comillas ? comillas[1] : partes.slice(0, -1).join(", ");
    return { titulo, compositor };
  }

  return { titulo: comillas ? comillas[1] : sinParentesisFinal, compositor: null };
}

export function extraerEventoHeuristico(texto: string): EventoExtraido {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const cabecera = extraerCabecera(lineas);

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
      const obra = partirObra(linea);
      if (obra) momentoActual.obras.push(obra);
    }
  }

  return {
    tipo_evento: cabecera.tipo_evento,
    fecha: cabecera.fecha,
    hora: cabecera.hora,
    parroquia: null,
    poblacion: null,
    interpretes: [],
    momentos,
  };
}
