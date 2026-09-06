import { distance } from "fastest-levenshtein";

/** Un fichero de partitura disponible, sea de una carpeta local o de la biblioteca en la nube. */
export interface ArchivoPartitura {
  /** Nombre de archivo tal cual (ej. "Ave Maria - Schubert.pdf"), usado como identificador. */
  nombre: string;
}

export interface CandidatoMatch {
  archivo: ArchivoPartitura;
  /** 1 = coincidencia perfecta, 0 = sin relación. */
  puntuacion: number;
}

/**
 * Los nombres de archivo de partituras suelen llevar texto extra (compositor, tonalidad,
 * arreglista...) alrededor del título, ej. "Ave Maria - Schubert.pdf". Comparar por
 * palabras (en vez de por distancia de edición sobre la cadena completa) hace que ese
 * texto añadido no penalice el match: lo que importa es si las palabras del título (y,
 * si se conoce, del compositor) aparecen en el nombre de archivo, no cuánto texto extra
 * lo rodea.
 */
// Conectores sin valor discriminativo para emparejar título/compositor con un nombre de
// archivo (y, además, cadenas tan cortas que aparecerían "contenidas" en casi cualquier
// palabra más larga por pura casualidad, ej. "en" dentro de "inexistente").
const PALABRAS_VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "en", "y", "a", "al", "que", "con",
  "nº", "no", "op", "un", "una", "para",
]);

function palabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PALABRAS_VACIAS.has(p));
}

/** Una palabra "aparece" en el archivo si coincide, si una contiene a la otra (con al menos
 * 3 caracteres, para que una palabra corta no "aparezca" por casualidad dentro de otra más
 * larga), o si difiere por poco (typos/abreviaturas), evitando exigir coincidencia exacta. */
function palabraEncontrada(palabra: string, palabrasArchivo: string[]): boolean {
  return palabrasArchivo.some((p) => {
    if (p === palabra) return true;
    const minLen = Math.min(p.length, palabra.length);
    if (minLen >= 3 && (p.includes(palabra) || palabra.includes(p))) return true;
    const maxLen = Math.max(p.length, palabra.length);
    if (maxLen < 5) return false;
    return distance(p, palabra) <= 1;
  });
}

function recall(palabrasBuscadas: string[], palabrasArchivo: string[]): number {
  if (palabrasBuscadas.length === 0) return 0;
  const encontradas = palabrasBuscadas.filter((p) => palabraEncontrada(p, palabrasArchivo)).length;
  return encontradas / palabrasBuscadas.length;
}

function normalizarNombreArchivo(nombre: string): string {
  return nombre.replace(/\.[a-zA-Z0-9]+$/, "");
}

/**
 * Ordena los archivos de la biblioteca por similitud con "título (compositor)". El título
 * pesa más que el compositor porque es el dato más fiable de la ficha; el compositor ayuda
 * a desempatar entre piezas homónimas de autores distintos.
 */
export function candidatosParaObra(
  titulo: string,
  compositor: string | null,
  archivos: ArchivoPartitura[]
): CandidatoMatch[] {
  const palabrasTitulo = palabras(titulo);
  const palabrasCompositor = compositor ? palabras(compositor) : [];

  const candidatos = archivos.map((archivo) => {
    const palabrasArchivo = palabras(normalizarNombreArchivo(archivo.nombre));
    const recallTitulo = recall(palabrasTitulo, palabrasArchivo);
    const recallCompositor = palabrasCompositor.length > 0 ? recall(palabrasCompositor, palabrasArchivo) : null;

    const puntuacion =
      recallCompositor === null ? recallTitulo : recallTitulo * 0.7 + recallCompositor * 0.3;

    return { archivo, puntuacion };
  });

  return candidatos.filter((c) => c.puntuacion > 0.3).sort((a, b) => b.puntuacion - a.puntuacion);
}

export type ResultadoMatch =
  | { tipo: "automatico"; archivo: ArchivoPartitura }
  | { tipo: "ambiguo"; candidatos: CandidatoMatch[] }
  | { tipo: "sin_match" }
  | { tipo: "recordado"; archivo: ArchivoPartitura | null };

const UMBRAL_AUTOMATICO = 0.82;
const UMBRAL_SEGUNDO_CANDIDATO = 0.1; // diferencia mínima con el 2º para considerar "sin ambigüedad"

/**
 * Decide qué proponer para una obra dada la biblioteca disponible y (si existe) una decisión
 * de emparejamiento ya guardada para esa misma obra en un evento anterior.
 */
export function resolverMatch(
  titulo: string,
  compositor: string | null,
  archivos: ArchivoPartitura[],
  decisionGuardada: { archivoNombre: string | null } | undefined
): ResultadoMatch {
  if (decisionGuardada !== undefined) {
    if (decisionGuardada.archivoNombre === null) return { tipo: "recordado", archivo: null };
    const archivo = archivos.find((a) => a.nombre === decisionGuardada.archivoNombre);
    return { tipo: "recordado", archivo: archivo ?? null };
  }

  const candidatos = candidatosParaObra(titulo, compositor, archivos);
  if (candidatos.length === 0) return { tipo: "sin_match" };

  const mejor = candidatos[0];
  const segundo = candidatos[1];
  const claramenteMejor = !segundo || mejor.puntuacion - segundo.puntuacion >= UMBRAL_SEGUNDO_CANDIDATO;

  if (mejor.puntuacion >= UMBRAL_AUTOMATICO && claramenteMejor) {
    return { tipo: "automatico", archivo: mejor.archivo };
  }
  return { tipo: "ambiguo", candidatos };
}
