import { describe, it, expect } from "vitest";
import { tituloEvento, construirFichaPdf } from "./ficha-pdf";
import type { EventoExtraido, MomentoExtraido } from "./models";

function eventoBase(overrides: Partial<EventoExtraido> = {}): EventoExtraido {
  return {
    tipo_evento: null,
    fecha: null,
    hora: null,
    parroquia: null,
    poblacion: null,
    interpretes: [],
    momentos: [],
    ...overrides,
  };
}

describe("tituloEvento", () => {
  it("boda con fecha y hora: 'Tipo - fecha larga · horah'", () => {
    const titulo = tituloEvento(eventoBase({ tipo_evento: "Boda", fecha: "2026-09-04", hora: "18:30" }));
    expect(titulo.startsWith("Boda - ")).toBe(true);
    expect(titulo).toContain("2026");
    expect(titulo.endsWith("· 18:30h")).toBe(true);
  });

  it("funeral con fecha y sin hora: no lleva sufijo de hora", () => {
    const titulo = tituloEvento(eventoBase({ tipo_evento: "Funeral", fecha: "2026-09-09", hora: null }));
    expect(titulo).not.toContain("·");
    expect(titulo.startsWith("Funeral - ")).toBe(true);
  });

  it("sin fecha: el resultado es solo el tipo de evento, sin separador suelto", () => {
    const titulo = tituloEvento(eventoBase({ tipo_evento: "Boda", fecha: null, hora: null }));
    expect(titulo).toBe("Boda");
  });

  it("todo null: recae en 'Setlist'", () => {
    expect(tituloEvento(eventoBase())).toBe("Setlist");
  });

  it("sin tipo_evento pero con fecha: el resultado es solo la fecha, sin separador inicial", () => {
    const titulo = tituloEvento(eventoBase({ tipo_evento: null, fecha: "2026-09-04" }));
    expect(titulo.startsWith("-")).toBe(false);
    expect(titulo).toContain("2026");
  });
});

function esPdfValido(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

describe("construirFichaPdf", () => {
  it("un evento sintético representativo resuelve sin lanzar y produce un PDF válido", async () => {
    const momentos: MomentoExtraido[] = [
      {
        nombre: "Recepción de Invitados",
        obras: [
          { titulo: "Obra de Prueba Uno", compositor: "Compositor Uno" },
          { titulo: "Obra de Prueba Dos", compositor: null },
        ],
      },
      { nombre: "Ofertorio", obras: [{ titulo: "Obra de Prueba Tres", compositor: "Compositor Tres" }] },
    ];
    const evento = eventoBase({
      tipo_evento: "Boda",
      fecha: "2026-09-11",
      hora: "17:00",
      parroquia: "Parroquia de Prueba",
      poblacion: "Madrid",
      interpretes: [{ nombre: "Persona de Prueba", instrumento: "Violín" }],
      momentos,
    });
    const pdf = await construirFichaPdf(evento);
    expect(esPdfValido(pdf)).toBe(true);
  });

  it("un evento vacío (sin momentos ni intérpretes) también resuelve sin lanzar", async () => {
    const pdf = await construirFichaPdf(eventoBase());
    expect(esPdfValido(pdf)).toBe(true);
  });

  it("un evento con muchos momentos (fuerza paginación) resuelve sin lanzar", async () => {
    const momentos: MomentoExtraido[] = Array.from({ length: 60 }, (_, i) => ({
      nombre: `Momento de Prueba ${i + 1}`,
      obras: [
        { titulo: `Obra de Prueba ${i + 1}A`, compositor: "Compositor de Prueba" },
        { titulo: `Obra de Prueba ${i + 1}B`, compositor: null },
      ],
    }));
    const pdf = await construirFichaPdf(eventoBase({ tipo_evento: "Boda", momentos }));
    expect(esPdfValido(pdf)).toBe(true);
  });
});
