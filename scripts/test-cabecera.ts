import { readFileSync } from "fs";
import { extraerLineasDocx, lineasDeTexto } from "../lib/docx";
import { extraerTextoDoc } from "../lib/doc-legacy";
import { extraerEventoHeuristico } from "../lib/extractor-heuristico";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const lineas = path.toLowerCase().endsWith(".doc")
    ? lineasDeTexto(await extraerTextoDoc(buf))
    : await extraerLineasDocx(buf);
  const evento = extraerEventoHeuristico(lineas);
  console.log({ tipo_evento: evento.tipo_evento, fecha: evento.fecha, hora: evento.hora });
}
main();
