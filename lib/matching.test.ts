import { describe, it, expect } from "vitest";
import { candidatosParaObra, resolverMatch, type ArchivoPartitura } from "./matching";

const archivos: ArchivoPartitura[] = [
  { nombre: "Ave Maria - Schubert.pdf" },
  { nombre: "Ave Maria - Bach Gounod.pdf" },
  { nombre: "Panis Angelicus - Franck.pdf" },
];

describe("candidatosParaObra", () => {
  it("puntúa más alto el archivo que coincide en título y compositor", () => {
    const candidatos = candidatosParaObra("Ave Maria", "Schubert", archivos);
    expect(candidatos.map((c) => c.archivo.nombre)).toEqual([
      "Ave Maria - Schubert.pdf",
      "Ave Maria - Bach Gounod.pdf",
    ]);
    expect(candidatos[0].puntuacion).toBeCloseTo(1, 5);
    expect(candidatos[1].puntuacion).toBeCloseTo(0.7, 5);
  });

  it("excluye archivos sin relación con el título (puntuación <= 0.3)", () => {
    const candidatos = candidatosParaObra("Ave Maria", "Schubert", archivos);
    expect(candidatos.some((c) => c.archivo.nombre === "Panis Angelicus - Franck.pdf")).toBe(false);
  });

  it("compositor: null usa solo el recall del título (sin penalizar ni premiar)", () => {
    const candidatos = candidatosParaObra("Ave Maria", null, archivos);
    const schubert = candidatos.find((c) => c.archivo.nombre === "Ave Maria - Schubert.pdf");
    const bachGounod = candidatos.find((c) => c.archivo.nombre === "Ave Maria - Bach Gounod.pdf");
    expect(schubert?.puntuacion).toBeCloseTo(1, 5);
    expect(bachGounod?.puntuacion).toBeCloseTo(1, 5);
  });

  it("un compositor distinto cambia el orden entre dos archivos con el mismo título", () => {
    const conSchubert = candidatosParaObra("Ave Maria", "Schubert", archivos);
    const conBach = candidatosParaObra("Ave Maria", "Bach", archivos);
    expect(conSchubert[0].archivo.nombre).toBe("Ave Maria - Schubert.pdf");
    expect(conBach[0].archivo.nombre).toBe("Ave Maria - Bach Gounod.pdf");
  });

  it("insensible a acentos", () => {
    const conAcento = candidatosParaObra("María", null, archivos);
    const sinAcento = candidatosParaObra("Maria", null, archivos);
    expect(conAcento[0].puntuacion).toBeCloseTo(sinAcento[0].puntuacion, 5);
  });

  it("insensible a mayúsculas", () => {
    const mayusculas = candidatosParaObra("AVE MARIA", null, archivos);
    const minusculas = candidatosParaObra("ave maria", null, archivos);
    expect(mayusculas[0].puntuacion).toBeCloseTo(minusculas[0].puntuacion, 5);
  });

  it("PALABRAS_VACIAS: compartir solo conectores ('de', 'la') no genera un match falso", () => {
    const candidatos = candidatosParaObra("Recepción de la Iglesia", null, [
      { nombre: "Salida de la Tarde.pdf" },
    ]);
    expect(candidatos).toEqual([]);
  });

  it("match difuso por distancia de Levenshtein (typo de una letra en palabra larga)", () => {
    const candidatos = candidatosParaObra("Angelicus", null, [
      { nombre: "Angelicvs - Franck.pdf" },
    ]);
    expect(candidatos[0]?.puntuacion).toBeCloseTo(1, 5);
  });

  it("match por contención de substring (palabra de 3+ letras dentro de otra más larga)", () => {
    const candidatos = candidatosParaObra("Panis", null, [{ nombre: "Panisico - Test.pdf" }]);
    expect(candidatos[0]?.puntuacion).toBeCloseTo(1, 5);
  });

  it("ordena los candidatos de mayor a menor puntuación", () => {
    const candidatos = candidatosParaObra("Ave Maria", "Schubert", archivos);
    for (let i = 1; i < candidatos.length; i++) {
      expect(candidatos[i - 1].puntuacion).toBeGreaterThanOrEqual(candidatos[i].puntuacion);
    }
  });
});

describe("resolverMatch", () => {
  it("decisionGuardada con archivo que existe → recordado con ese archivo", () => {
    const resultado = resolverMatch("Ave Maria", "Schubert", archivos, {
      archivoNombre: "Ave Maria - Schubert.pdf",
    });
    expect(resultado).toEqual({ tipo: "recordado", archivo: archivos[0] });
  });

  it("decisionGuardada con archivo que ya no existe → recordado con archivo:null", () => {
    const resultado = resolverMatch("Ave Maria", "Schubert", archivos, {
      archivoNombre: "Ya No Existe.pdf",
    });
    expect(resultado).toEqual({ tipo: "recordado", archivo: null });
  });

  it("decisionGuardada explícita a null → recordado con archivo:null, sin mirar la biblioteca", () => {
    const resultado = resolverMatch("Ave Maria", "Schubert", archivos, { archivoNombre: null });
    expect(resultado).toEqual({ tipo: "recordado", archivo: null });
  });

  it("sin ningún candidato por encima del umbral → sin_match", () => {
    const resultado = resolverMatch("Sinfonía Fantástica Completamente Distinta", null, archivos, undefined);
    expect(resultado).toEqual({ tipo: "sin_match" });
  });

  it("un único candidato con puntuación alta → automatico (cubre también el caso sin 'segundo')", () => {
    const resultado = resolverMatch("Ave Maria", "Schubert", archivos, undefined);
    expect(resultado).toEqual({ tipo: "automatico", archivo: archivos[0] });
  });

  it("dos candidatos con puntuación alta y margen insuficiente entre ellos → ambiguo", () => {
    const resultado = resolverMatch("Ave Maria", null, archivos, undefined);
    expect(resultado.tipo).toBe("ambiguo");
    if (resultado.tipo === "ambiguo") {
      expect(resultado.candidatos).toHaveLength(2);
      expect(resultado.candidatos[0].puntuacion - resultado.candidatos[1].puntuacion).toBeLessThan(0.1);
    }
  });

  it("un único candidato que no llega al umbral de 0.82 → ambiguo, no automatico", () => {
    const resultado = resolverMatch("Ave Maria Bella", null, [{ nombre: "Ave Maria - Test.pdf" }], undefined);
    expect(resultado.tipo).toBe("ambiguo");
    if (resultado.tipo === "ambiguo") {
      expect(resultado.candidatos[0].puntuacion).toBeLessThan(0.82);
    }
  });

  it("el resultado ambiguo lleva la lista completa de candidatosParaObra", () => {
    const directos = candidatosParaObra("Ave Maria", null, archivos);
    const resultado = resolverMatch("Ave Maria", null, archivos, undefined);
    expect(resultado.tipo).toBe("ambiguo");
    if (resultado.tipo === "ambiguo") {
      expect(resultado.candidatos).toEqual(directos);
    }
  });
});
