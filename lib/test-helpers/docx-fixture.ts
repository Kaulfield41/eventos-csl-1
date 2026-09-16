import JSZip from "jszip";

/**
 * Construye un .docx sintético mínimo para tests, sin depender de Word ni de ninguna
 * ficha real: lib/docx.ts solo lee word/document.xml del zip, y el parser (preserveOrder,
 * sin validar namespaces) trata este XML igual que uno real, aunque le falten el resto de
 * partes de un .docx real (Content_Types, _rels...) y las declaraciones xmlns:w.
 */

export interface ParrafoFixture {
  text: string;
  bold?: boolean;
}

function escapeXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function empaquetarDocumentoXml(documentoXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", documentoXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Un .docx mínimo con un párrafo por entrada, cada uno con un único run. */
export async function construirDocxFixture(parrafos: ParrafoFixture[]): Promise<Buffer> {
  const cuerpo = parrafos
    .map((p) => {
      const rPr = p.bold ? "<w:rPr><w:b/></w:rPr>" : "";
      return `<w:p><w:r>${rPr}<w:t>${escapeXml(p.text)}</w:t></w:r></w:p>`;
    })
    .join("");
  return construirDocxFixtureDesdeCuerpo(cuerpo);
}

/** Para lo que construirDocxFixture no puede expresar (varios runs por párrafo, tablas):
 * recibe el XML interior de <w:body> ya escrito a mano. */
export async function construirDocxFixtureDesdeCuerpo(cuerpoXml: string): Promise<Buffer> {
  const documentoXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document><w:body>${cuerpoXml}</w:body></w:document>`;
  return empaquetarDocumentoXml(documentoXml);
}

/** Un .docx "corrupto" sin word/document.xml, para probar el manejo de errores. */
export async function construirDocxSinDocumento(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/otra-cosa.xml", "<vacio/>");
  return zip.generateAsync({ type: "nodebuffer" });
}
