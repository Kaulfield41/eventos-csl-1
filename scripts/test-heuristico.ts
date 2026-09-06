import { readFileSync } from "fs";
import { extraerTextoDocx } from "../lib/docx";
import { extraerTextoDoc } from "../lib/doc-legacy";
import { extraerEventoHeuristico } from "../lib/extractor-heuristico";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const texto = path.toLowerCase().endsWith(".doc") ? await extraerTextoDoc(buf) : await extraerTextoDocx(buf);
  const evento = extraerEventoHeuristico(texto);
  for (const momento of evento.momentos) {
    console.log(`\n## ${momento.nombre}`);
    for (const obra of momento.obras) {
      console.log(`  - "${obra.titulo}" | ${obra.compositor ?? "(sin compositor)"}`);
    }
  }
}
main();
