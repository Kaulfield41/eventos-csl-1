import { describe, it, expect } from "vitest";
import { todasLasObrasResueltas, type DecisionEmparejamiento } from "./store";
import type { EventoExtraido } from "./models";

// Solo se cubre este helper puro: el resto de lib/store.ts toca Netlify Blobs (fuera del
// alcance de esta suite, igual que el resto de módulos con red/almacenamiento).

function eventoConObras(obras: { titulo: string; compositor: string | null }[]): EventoExtraido {
  return {
    tipo_evento: "Boda",
    fecha: null,
    hora: null,
    parroquia: null,
    poblacion: null,
    interpretes: [],
    momentos: [{ nombre: "Ofertorio", obras }],
  };
}

describe("todasLasObrasResueltas", () => {
  it("un evento sin obras nunca cuenta como resuelto", () => {
    const evento = eventoConObras([]);
    expect(todasLasObrasResueltas(evento, new Map())).toBe(false);
  });

  it("falso si falta la decisión de alguna obra", () => {
    const evento = eventoConObras([
      { titulo: "Ave María", compositor: "Schubert" },
      { titulo: "Obra Nueva", compositor: null },
    ]);
    const decisiones = new Map<string, DecisionEmparejamiento>([
      ["avemaria#schubert", { archivoNombre: "ave-maria.pdf" }],
    ]);
    expect(todasLasObrasResueltas(evento, decisiones)).toBe(false);
  });

  it("verdadero si todas tienen decisión, mezclando archivo real y 'sin partitura' explícito", () => {
    const evento = eventoConObras([
      { titulo: "Ave María", compositor: "Schubert" },
      { titulo: "Himno Anónimo", compositor: null },
    ]);
    const decisiones = new Map<string, DecisionEmparejamiento>([
      ["avemaria#schubert", { archivoNombre: "ave-maria.pdf" }],
      ["himnoanonimo#", { archivoNombre: null }],
    ]);
    expect(todasLasObrasResueltas(evento, decisiones)).toBe(true);
  });
});
