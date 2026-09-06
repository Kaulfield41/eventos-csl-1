// @ts-expect-error: word-extractor no publica tipos propios.
import WordExtractor from "word-extractor";

/**
 * Extrae texto de un .doc antiguo (formato OLE binario, pre-2007) usando una librería
 * JS pura, sin dependencias nativas ni "textutil" (que solo existe en macOS y no sirve
 * en un servidor Linux de Netlify). Se pierde la estructura de tablas del .docx moderno
 * (texto plano únicamente); aceptable porque estos ficheros ya son casos raros y la app
 * mira hacia adelante en .docx.
 */
export async function extraerTextoDoc(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const documento = await extractor.extract(buffer);
  const cuerpo = documento.getBody?.() ?? "";
  const notasAlPie = documento.getFootnotes?.() ?? "";
  return [cuerpo, notasAlPie]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean)
    .join("\n");
}
