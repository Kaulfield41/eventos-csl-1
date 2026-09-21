import { describe, it, expect } from "vitest";
import { cifrar, descifrar, esValorCifrado, type ValorCifrado } from "./token-cifrado";

// GMAIL_TOKEN_ENCRYPTION_KEY se fija en vitest.config.mts a una clave de prueba de 32 bytes.

describe("cifrar / descifrar", () => {
  it("cifrar seguido de descifrar recupera el valor original", () => {
    const original = { access_token: "abc", refresh_token: "def", expiry_date: 123 };
    const sobre = cifrar(original);
    expect(descifrar(sobre)).toEqual(original);
  });

  it("dos cifrados del mismo valor dan iv y ciphertext distintos (IV aleatorio)", () => {
    const valor = { access_token: "mismo-valor" };
    const uno = cifrar(valor);
    const dos = cifrar(valor);
    expect(uno.iv).not.toBe(dos.iv);
    expect(uno.ciphertext).not.toBe(dos.ciphertext);
  });

  it("descifrar con el tag de autenticación manipulado lanza", () => {
    const sobre = cifrar({ access_token: "abc" });
    const manipulado: ValorCifrado = { ...sobre, tag: cifrar({ otro: 1 }).tag };
    expect(() => descifrar(manipulado)).toThrow();
  });

  it("descifrar con el ciphertext manipulado lanza", () => {
    const sobre = cifrar({ access_token: "abc" });
    const manipulado: ValorCifrado = { ...sobre, ciphertext: cifrar({ otro: 1 }).ciphertext };
    expect(() => descifrar(manipulado)).toThrow();
  });
});

describe("esValorCifrado", () => {
  it("reconoce un sobre cifrado real", () => {
    const sobre = cifrar({ access_token: "abc" });
    expect(esValorCifrado(sobre)).toBe(true);
  });

  it("no confunde un Credentials en texto plano con un sobre cifrado", () => {
    expect(esValorCifrado({ access_token: "abc", refresh_token: "def" })).toBe(false);
  });

  it("no confunde null/undefined ni tipos primitivos", () => {
    expect(esValorCifrado(null)).toBe(false);
    expect(esValorCifrado(undefined)).toBe(false);
    expect(esValorCifrado("texto")).toBe(false);
  });
});
