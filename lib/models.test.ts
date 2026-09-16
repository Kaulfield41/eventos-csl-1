import { describe, it, expect } from "vitest";
import {
  normalizar,
  claveObra,
  ObraExtraidaSchema,
  InterpreteExtraidoSchema,
  MomentoExtraidoSchema,
  EventoExtraidoSchema,
} from "./models";

describe("normalizar", () => {
  it("quita acentos", () => {
    expect(normalizar("María")).toBe("maria");
  });

  it("pasa a minúsculas", () => {
    expect(normalizar("BACH")).toBe("bach");
  });

  it("quita espacios y puntuación, deja solo [a-z0-9]", () => {
    expect(normalizar("Ave, María!")).toBe("avemaria");
  });

  it("conserva los dígitos", () => {
    expect(normalizar("Misa 2")).toBe("misa2");
  });

  it("es idempotente", () => {
    const una = normalizar("María, Ave!");
    expect(normalizar(una)).toBe(una);
  });
});

describe("claveObra", () => {
  it("combina titulo y compositor normalizados con '#'", () => {
    expect(claveObra("Ave María", "J.S. Bach")).toBe(
      `${normalizar("Ave María")}#${normalizar("J.S. Bach")}`
    );
  });

  it("sin compositor, termina en '#' (parte vacía)", () => {
    expect(claveObra("Ave María", null)).toBe(`${normalizar("Ave María")}#`);
  });

  it("insensible a acento/mayúscula: dos grafías de la misma obra dan la misma clave", () => {
    expect(claveObra("AVE MARÍA", "Bach")).toBe(claveObra("ave maria", "bach"));
  });
});

describe("Zod schemas", () => {
  it("ObraExtraidaSchema acepta compositor null o string", () => {
    expect(ObraExtraidaSchema.safeParse({ titulo: "Ave María", compositor: null }).success).toBe(true);
    expect(ObraExtraidaSchema.safeParse({ titulo: "Ave María", compositor: "Schubert" }).success).toBe(true);
  });

  it("ObraExtraidaSchema rechaza si falta titulo", () => {
    expect(ObraExtraidaSchema.safeParse({ compositor: null }).success).toBe(false);
  });

  it("ObraExtraidaSchema rechaza tipos incorrectos", () => {
    expect(ObraExtraidaSchema.safeParse({ titulo: 123, compositor: null }).success).toBe(false);
  });

  it("InterpreteExtraidoSchema rechaza si falta nombre", () => {
    expect(InterpreteExtraidoSchema.safeParse({ instrumento: "Violín" }).success).toBe(false);
  });

  it("MomentoExtraidoSchema aplica [] por defecto si falta obras", () => {
    expect(MomentoExtraidoSchema.parse({ nombre: "Ofertorio" }).obras).toEqual([]);
  });

  it("EventoExtraidoSchema aplica [] por defecto a interpretes y momentos", () => {
    const evento = EventoExtraidoSchema.parse({
      tipo_evento: "Boda",
      fecha: null,
      hora: null,
      parroquia: null,
      poblacion: null,
    });
    expect(evento.interpretes).toEqual([]);
    expect(evento.momentos).toEqual([]);
  });

  it("EventoExtraidoSchema rechaza fecha con tipo incorrecto", () => {
    const resultado = EventoExtraidoSchema.safeParse({
      tipo_evento: "Boda",
      fecha: 2026,
      hora: null,
      parroquia: null,
      poblacion: null,
    });
    expect(resultado.success).toBe(false);
  });

  it("un EventoExtraido sintético realista se valida de punta a punta", () => {
    const evento = {
      tipo_evento: "Boda",
      fecha: "2026-09-11",
      hora: "17:00",
      parroquia: "Parroquia de Prueba",
      poblacion: "Madrid",
      interpretes: [{ nombre: "Persona de Prueba", instrumento: "Violín" }],
      momentos: [
        {
          nombre: "Ofertorio",
          obras: [{ titulo: "Obra de Prueba", compositor: "Compositor de Prueba" }],
        },
      ],
    };
    expect(EventoExtraidoSchema.safeParse(evento).success).toBe(true);
  });
});
