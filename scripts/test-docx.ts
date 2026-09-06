import { readFileSync } from "fs";
import { extraerTextoDocx } from "../lib/docx";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const texto = await extraerTextoDocx(buf);
  console.log(texto);
}
main();
