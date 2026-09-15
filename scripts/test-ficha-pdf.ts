import { readFileSync, writeFileSync } from "fs";
import { extraerTextoDocx } from "../lib/docx";
import { extraerEventoHeuristico } from "../lib/extractor-heuristico";
import { construirFichaPdf, tituloEvento } from "../lib/ficha-pdf";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const texto = await extraerTextoDocx(buf);
  const evento = extraerEventoHeuristico(texto);
  console.log("Título:", tituloEvento(evento));
  const pdf = await construirFichaPdf(evento);
  const salida = new URL("ficha-resumen-test.pdf", import.meta.url).pathname;
  writeFileSync(salida, pdf);
  console.log(`PDF generado (${pdf.length} bytes): ${salida}`);
}
main();
