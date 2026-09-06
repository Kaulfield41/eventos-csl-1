import { readFileSync } from "fs";
import { extraerTextoDoc } from "../lib/doc-legacy";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const texto = await extraerTextoDoc(buf);
  console.log(texto);
}
main();
