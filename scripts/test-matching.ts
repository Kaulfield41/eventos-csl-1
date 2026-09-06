import { resolverMatch } from "../lib/matching";
import { construir4ss } from "../lib/forscore";

const archivos = [
  { nombre: "Ave Maria - Schubert.pdf" },
  { nombre: "Agnus Dei - Bach (Cantata 208).pdf" },
  { nombre: "Agnus Dei - Bach (Misa).pdf" },
  { nombre: "Canon en Re - Pachelbel.pdf" },
];

console.log("--- match exacto ---");
console.log(resolverMatch("Ave María", "Franz Schubert", archivos, undefined));

console.log("--- match ambiguo (dos Agnus Dei de Bach) ---");
console.log(resolverMatch("Agnus Dei", "Johann Sebastian Bach", archivos, undefined));

console.log("--- sin match ---");
console.log(resolverMatch("Obra Inexistente", null, archivos, undefined));

console.log("--- decision recordada (ninguna) ---");
console.log(resolverMatch("Agnus Dei", "Johann Sebastian Bach", archivos, { archivoNombre: null }));

console.log("--- .4ss de ejemplo ---");
console.log(
  construir4ss("Boda de prueba", [
    { tipo: "separador", titulo: "Entrada de la Novia" },
    { tipo: "obra", titulo: "Canon en Re", nombreArchivo: "Canon en Re - Pachelbel.pdf", datosBase64: "AAAA" },
  ])
);
