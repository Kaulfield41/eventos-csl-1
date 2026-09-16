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
  for (const momento of evento.momentos) {
    console.log(`\n## ${momento.nombre}`);
    for (const obra of momento.obras) {
      console.log(`  - "${obra.titulo}" | ${obra.compositor ?? "(sin compositor)"}`);
    }
  }
}
main();
