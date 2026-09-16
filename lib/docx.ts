import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

/**
 * Port de extraer_texto() de un prototipo Python anterior (app/extractor.py):
 * recorre los párrafos del documento en orden y luego añade cada tabla, fila por fila,
 * con las celdas unidas por " | ". Se reimplementa a mano (en vez de usar una librería
 * genérica de conversión) para no perder la fidelidad de ese recorrido concreto.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
});

type Node = Record<string, unknown> & { ":@"?: Record<string, unknown> };

function textoDeNodo(nodo: Node): string {
  // Los nodos de texto de Word son <w:t>...</w:t>; con preserveOrder, el valor de texto
  // queda en la clave "#text".
  if ("#text" in nodo) return String((nodo as Record<string, unknown>)["#text"] ?? "");
  let texto = "";
  for (const clave of Object.keys(nodo)) {
    if (clave === ":@") continue;
    const valor = nodo[clave];
    if (Array.isArray(valor)) {
      for (const hijo of valor) texto += textoDeNodo(hijo as Node);
    }
  }
  return texto;
}

function extraerHijos(nodo: Node, etiqueta: string): Node[] {
  const valor = nodo[etiqueta];
  return Array.isArray(valor) ? (valor as Node[]) : [];
}

function buscarNodo(nodos: Node[], etiqueta: string): Node[] {
  const resultado: Node[] = [];
  for (const nodo of nodos) {
    if (etiqueta in nodo) resultado.push(nodo);
  }
  return resultado;
}

/** Cada línea de una ficha, con si el párrafo entero está en negrita en el .docx original
 * (señal real: en las fichas de verdad, el título de cada parte del evento va en negrita,
 * a veces también con un color distinto — ver `lib/extractor-heuristico.ts`). */
export interface LineaFicha {
  texto: string;
  negrita: boolean;
}

/** Las propiedades (`<w:rPr>`) de un run `<w:r>`, o [] si no tiene. */
function propiedadesRun(run: Node): Node[] {
  for (const hijo of extraerHijos(run, "w:r")) {
    if ("w:rPr" in hijo) return extraerHijos(hijo, "w:rPr");
  }
  return [];
}

/** `<w:b/>` = negrita, salvo que traiga `w:val="0"/"false"/"off"` explícito. */
function esRunNegrita(run: Node): boolean {
  const b = propiedadesRun(run).find((p) => "w:b" in p);
  if (!b) return false;
  const val = (b[":@"] as Record<string, unknown> | undefined)?.["@_w:val"];
  if (val === undefined) return true;
  return !["0", "false", "off"].includes(String(val).toLowerCase());
}

/**
 * Un <w:p> contiene <w:r> (runs) que a su vez contienen <w:t>. Un párrafo se considera
 * "en negrita" solo si TODOS los runs con texto real lo están (evita falsos positivos por
 * un run suelto en negrita dentro de una línea que en conjunto no lo es).
 */
function analizarParrafo(parrafo: Node): LineaFicha {
  let texto = "";
  let runsConTexto = 0;
  let runsNegrita = 0;
  const runsYTexto = extraerHijos(parrafo, "w:p");
  for (const hijo of runsYTexto) {
    if ("w:r" in hijo) {
      let textoRun = "";
      for (const t of extraerHijos(hijo, "w:r")) {
        if ("w:t" in t) {
          for (const nodoTexto of extraerHijos(t, "w:t")) {
            textoRun += textoDeNodo(nodoTexto);
          }
        }
      }
      if (textoRun) {
        texto += textoRun;
        runsConTexto++;
        if (esRunNegrita(hijo)) runsNegrita++;
      }
    } else if ("w:t" in hijo) {
      for (const nodoTexto of extraerHijos(hijo, "w:t")) {
        texto += textoDeNodo(nodoTexto);
      }
      runsConTexto++; // texto suelto sin <w:r>: no hay <w:rPr> que mirar, cuenta como no-negrita
    }
  }
  return { texto: texto.trim(), negrita: runsConTexto > 0 && runsNegrita === runsConTexto };
}

function celdaTexto(celda: Node): string {
  let texto = "";
  for (const parrafo of buscarNodo(extraerHijos(celda, "w:tc"), "w:p")) {
    const t = analizarParrafo(parrafo).texto;
    if (t) texto += (texto ? " " : "") + t;
  }
  return texto.trim();
}

/** Convierte texto plano ya partido en líneas (p.ej. de un .doc antiguo, sin formato
 * disponible) al mismo formato que `extraerLineasDocx`, siempre con `negrita: false`. */
export function lineasDeTexto(texto: string): LineaFicha[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((texto) => ({ texto, negrita: false }));
}

async function bodyDocumento(buffer: Buffer): Promise<Node> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("El .docx no contiene word/document.xml (archivo corrupto o no válido).");

  const arbol = parser.parse(xml) as Node[];
  const documento = buscarNodo(arbol, "w:document")[0];
  if (!documento) throw new Error("No se encontró el elemento raíz w:document.");
  const body = buscarNodo(extraerHijos(documento, "w:document"), "w:body")[0];
  if (!body) throw new Error("No se encontró w:body en el documento.");
  return body;
}

/** Como extraerTextoDocx, pero conservando si cada línea está en negrita en el original. */
export async function extraerLineasDocx(buffer: Buffer): Promise<LineaFicha[]> {
  const body = await bodyDocumento(buffer);
  const lineas: LineaFicha[] = [];

  // Párrafos "sueltos" (no dentro de una tabla), en orden de aparición.
  for (const nodo of extraerHijos(body, "w:body")) {
    if ("w:p" in nodo) {
      const linea = analizarParrafo(nodo);
      if (linea.texto) lineas.push(linea);
    }
  }

  // Tablas: cada fila se añade como celdas unidas por " | ", igual que el prototipo. No
  // llevan negrita propia — son las tablas de reparto, no el programa musical.
  for (const tabla of buscarNodo(extraerHijos(body, "w:body"), "w:tbl")) {
    for (const fila of buscarNodo(extraerHijos(tabla, "w:tbl"), "w:tr")) {
      const celdas: string[] = [];
      for (const celda of buscarNodo(extraerHijos(fila, "w:tr"), "w:tc")) {
        celdas.push(celdaTexto(celda));
      }
      if (celdas.some((c) => c)) lineas.push({ texto: celdas.join(" | "), negrita: false });
    }
  }

  return lineas;
}

/** Extrae el texto de un .docx tal y como hace extraer_texto() en el prototipo Python. */
export async function extraerTextoDocx(buffer: Buffer): Promise<string> {
  const lineas = await extraerLineasDocx(buffer);
  return lineas.map((l) => l.texto).join("\n");
}
