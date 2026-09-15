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

function textoParrafo(parrafo: Node): string {
  // Un <w:p> contiene <w:r> (runs) que a su vez contienen <w:t>.
  let texto = "";
  const runsYTexto = extraerHijos(parrafo, "w:p");
  for (const hijo of runsYTexto) {
    if ("w:r" in hijo) {
      for (const t of extraerHijos(hijo, "w:r")) {
        if ("w:t" in t) {
          for (const nodoTexto of extraerHijos(t, "w:t")) {
            texto += textoDeNodo(nodoTexto);
          }
        }
      }
    } else if ("w:t" in hijo) {
      for (const nodoTexto of extraerHijos(hijo, "w:t")) {
        texto += textoDeNodo(nodoTexto);
      }
    }
  }
  return texto.trim();
}

function celdaTexto(celda: Node): string {
  let texto = "";
  for (const parrafo of buscarNodo(extraerHijos(celda, "w:tc"), "w:p")) {
    const t = textoParrafo(parrafo);
    if (t) texto += (texto ? " " : "") + t;
  }
  return texto.trim();
}

/** Extrae el texto de un .docx tal y como hace extraer_texto() en el prototipo Python. */
export async function extraerTextoDocx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("El .docx no contiene word/document.xml (archivo corrupto o no válido).");

  const arbol = parser.parse(xml) as Node[];
  const documento = buscarNodo(arbol, "w:document")[0];
  if (!documento) throw new Error("No se encontró el elemento raíz w:document.");
  const body = buscarNodo(extraerHijos(documento, "w:document"), "w:body")[0];
  if (!body) throw new Error("No se encontró w:body en el documento.");

  const lineas: string[] = [];

  // Párrafos "sueltos" (no dentro de una tabla), en orden de aparición.
  for (const nodo of extraerHijos(body, "w:body")) {
    if ("w:p" in nodo) {
      const t = textoParrafo(nodo);
      if (t) lineas.push(t);
    }
  }

  // Tablas: cada fila se añade como celdas unidas por " | ", igual que el prototipo.
  for (const tabla of buscarNodo(extraerHijos(body, "w:body"), "w:tbl")) {
    for (const fila of buscarNodo(extraerHijos(tabla, "w:tbl"), "w:tr")) {
      const celdas: string[] = [];
      for (const celda of buscarNodo(extraerHijos(fila, "w:tr"), "w:tc")) {
        celdas.push(celdaTexto(celda));
      }
      if (celdas.some((c) => c)) lineas.push(celdas.join(" | "));
    }
  }

  return lineas.join("\n");
}
