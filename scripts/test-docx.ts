import { readFileSync } from "fs";
import { extraerLineasDocx } from "../lib/docx";

async function main() {
  const path = process.argv[2];
  const buf = readFileSync(path);
  const lineas = await extraerLineasDocx(buf);
  for (const { texto, negrita } of lineas) {
    console.log(`${negrita ? "[N]" : "   "} ${texto}`);
  }
}
main();
