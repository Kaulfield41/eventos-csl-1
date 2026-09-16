import { describe, it, expect } from "vitest";
import { construir4ss, type EntradaSetlist } from "./forscore";

describe("construir4ss", () => {
  it("estructura completa con una lista vacía de entradas", () => {
    expect(construir4ss("Boda de Prueba", [])).toBe(
      '<?xml version="1.0" encoding="UTF-8" ?>\n' +
        '<forScore kind="setlist" version="1.0" title="Boda de Prueba">\n' +
        "\n" +
        "</forScore>\n"
    );
  });

  it("una obra se renderiza como <score> con title/path/data, sin <placeholder>", () => {
    const entradas: EntradaSetlist[] = [
      { tipo: "obra", titulo: "Ave María", nombreArchivo: "ave-maria.pdf", datosBase64: "QUFB" },
    ];
    const xml = construir4ss("Boda", entradas);
    expect(xml).toContain('<score title="Ave María" path="ave-maria.pdf" data="QUFB" />');
    expect(xml).not.toContain("<placeholder");
  });

  it("un separador se renderiza como <placeholder> con solo title, sin path/data", () => {
    const entradas: EntradaSetlist[] = [{ tipo: "separador", titulo: "Ofertorio" }];
    const xml = construir4ss("Boda", entradas);
    expect(xml).toContain('<placeholder title="Ofertorio" />');
    expect(xml).not.toContain("path=");
    expect(xml).not.toContain("data=");
  });

  it("el orden de las entradas en el XML sigue el orden de entrada", () => {
    const entradas: EntradaSetlist[] = [
      { tipo: "separador", titulo: "Uno" },
      { tipo: "obra", titulo: "Dos", nombreArchivo: "dos.pdf", datosBase64: "AAAA" },
      { tipo: "separador", titulo: "Tres" },
      { tipo: "obra", titulo: "Cuatro", nombreArchivo: "cuatro.pdf", datosBase64: "BBBB" },
    ];
    const xml = construir4ss("Boda", entradas);
    const posiciones = ["Uno", "Dos", "Tres", "Cuatro"].map((t) => xml.indexOf(`title="${t}"`));
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
  });

  it("escapa & < > \" ' en el título del setlist y en los títulos/rutas de cada entrada", () => {
    const entradas: EntradaSetlist[] = [
      {
        tipo: "obra",
        titulo: 'Boda "Ana" & Luis',
        nombreArchivo: "Ana & Luis.pdf",
        datosBase64: "AAAA",
      },
    ];
    const xml = construir4ss(`Setlist "Ana" & Luis`, entradas);
    expect(xml).toContain('title="Setlist &quot;Ana&quot; &amp; Luis"');
    expect(xml).toContain('title="Boda &quot;Ana&quot; &amp; Luis"');
    expect(xml).toContain('path="Ana &amp; Luis.pdf"');
  });

  it("datosBase64 pasa sin escapar, aunque contenga caracteres especiales de XML", () => {
    const entradas: EntradaSetlist[] = [
      { tipo: "obra", titulo: "Obra", nombreArchivo: "obra.pdf", datosBase64: 'AB&CD"EF' },
    ];
    const xml = construir4ss("Boda", entradas);
    expect(xml).toContain('data="AB&CD"EF"');
  });
});
