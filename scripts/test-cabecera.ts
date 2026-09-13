import { readFileSync } from "fs";
import { extraerTextoDocx } from "../lib/docx";
import { extraerTextoDoc } from "../lib/doc-legacy";
import { extraerEventoHeuristico } from "../lib/extractor-heuristico";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const texto = path.toLowerCase().endsWith(".doc") ? await extraerTextoDoc(buf) : await extraerTextoDocx(buf);
  const evento = extraerEventoHeuristico(texto);
  console.log({ tipo_evento: evento.tipo_evento, fecha: evento.fecha, hora: evento.hora });
}
main();
