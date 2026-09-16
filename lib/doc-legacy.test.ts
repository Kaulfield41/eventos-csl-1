import { vi, describe, it, expect } from "vitest";

// Nunca un .doc binario real como fixture: se mockea word-extractor para probar solo la
// lógica propia de este módulo (trim/filtrado de líneas en blanco/unión cuerpo+notas).
// vi.hoisted es necesario porque las factories de vi.mock se izan por encima de los imports.
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock("word-extractor", () => ({
  default: vi.fn().mockImplementation(function () {
    return { extract: extractMock };
  }),
}));

import { extraerTextoDoc } from "./doc-legacy";

describe("extraerTextoDoc", () => {
  it("usa solo el cuerpo si no hay notas al pie", async () => {
    extractMock.mockResolvedValueOnce({
      getBody: () => "Recepción de Invitados\nOfertorio",
      getFootnotes: () => "",
    });
    expect(await extraerTextoDoc(Buffer.from(""))).toBe("Recepción de Invitados\nOfertorio");
  });

  it("añade las notas al pie después del cuerpo", async () => {
    extractMock.mockResolvedValueOnce({
      getBody: () => "Ofertorio",
      getFootnotes: () => "Nota al pie",
    });
    expect(await extraerTextoDoc(Buffer.from(""))).toBe("Ofertorio\nNota al pie");
  });

  it("recorta espacios y descarta líneas en blanco intermedias", async () => {
    extractMock.mockResolvedValueOnce({
      getBody: () => "  Ofertorio  \n\n   \nBendición Final  ",
      getFootnotes: () => "",
    });
    expect(await extraerTextoDoc(Buffer.from(""))).toBe("Ofertorio\nBendición Final");
  });

  it("funciona si el mock no expone getFootnotes (usa el fallback)", async () => {
    extractMock.mockResolvedValueOnce({ getBody: () => "Ofertorio" });
    expect(await extraerTextoDoc(Buffer.from(""))).toBe("Ofertorio");
  });
});
