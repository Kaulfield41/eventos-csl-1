import { describe, it, expect } from "vitest";
import { extraerLineasDocx, extraerTextoDocx, lineasDeTexto } from "./docx";
import {
  construirDocxFixture,
  construirDocxFixtureDesdeCuerpo,
  construirDocxSinDocumento,
} from "./test-helpers/docx-fixture";

describe("extraerLineasDocx", () => {
  it("extrae un párrafo normal como no-negrita", async () => {
    const buf = await construirDocxFixture([{ text: "Ofertorio" }]);
    expect(await extraerLineasDocx(buf)).toEqual([{ texto: "Ofertorio", negrita: false }]);
  });

  it("extrae un párrafo con un único run en negrita como negrita", async () => {
    const buf = await construirDocxFixture([{ text: "Ofertorio", bold: true }]);
    expect(await extraerLineasDocx(buf)).toEqual([{ texto: "Ofertorio", negrita: true }]);
  });

  it("un párrafo con runs mixtos (no todos en negrita) da negrita: false", async () => {
    const cuerpo =
      "<w:p>" +
      "<w:r><w:rPr><w:b/></w:rPr><w:t>Bold part </w:t></w:r>" +
      "<w:r><w:t>not bold part</w:t></w:r>" +
      "</w:p>";
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    expect(await extraerLineasDocx(buf)).toEqual([
      { texto: "Bold part not bold part", negrita: false },
    ]);
  });

  it("un párrafo vacío (sin texto) se excluye del resultado", async () => {
    const cuerpo = "<w:p><w:r><w:t></w:t></w:r></w:p><w:p><w:r><w:t>Ofertorio</w:t></w:r></w:p>";
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    expect(await extraerLineasDocx(buf)).toEqual([{ texto: "Ofertorio", negrita: false }]);
  });

  it("una fila de tabla se extrae como negrita:false aunque la celda esté en negrita", async () => {
    const cuerpo =
      "<w:tbl><w:tr>" +
      '<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Nombre</w:t></w:r></w:p></w:tc>' +
      "<w:tc><w:p><w:r><w:t>Instrumento</w:t></w:r></w:p></w:tc>" +
      "</w:tr></w:tbl>";
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    expect(await extraerLineasDocx(buf)).toEqual([
      { texto: "Nombre | Instrumento", negrita: false },
    ]);
  });

  it("una fila de tabla con una celda vacía se conserva (el separador ' | ' se inserta igual)", async () => {
    const cuerpo =
      "<w:tbl><w:tr>" +
      "<w:tc><w:p><w:r><w:t>Violín</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p></w:p></w:tc>" +
      "</w:tr></w:tbl>";
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    expect(await extraerLineasDocx(buf)).toEqual([{ texto: "Violín | ", negrita: false }]);
  });

  it("una fila de tabla con todas las celdas vacías se excluye", async () => {
    const cuerpo = "<w:tbl><w:tr><w:tc><w:p></w:p></w:tc><w:tc><w:p></w:p></w:tc></w:tr></w:tbl>";
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    expect(await extraerLineasDocx(buf)).toEqual([]);
  });

  it("los párrafos salen todos antes que las filas de tabla, aunque estén intercalados en el documento", async () => {
    const cuerpo =
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Fila 1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "<w:p><w:r><w:t>Párrafo 1</w:t></w:r></w:p>" +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Fila 2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "<w:p><w:r><w:t>Párrafo 2</w:t></w:r></w:p>";
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    const lineas = await extraerLineasDocx(buf);
    expect(lineas.map((l) => l.texto)).toEqual(["Párrafo 1", "Párrafo 2", "Fila 1", "Fila 2"]);
  });

  it("varios párrafos se devuelven en el orden del documento", async () => {
    const buf = await construirDocxFixture([{ text: "Uno" }, { text: "Dos" }, { text: "Tres" }]);
    expect((await extraerLineasDocx(buf)).map((l) => l.texto)).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("rechaza si el .docx no contiene word/document.xml", async () => {
    const buf = await construirDocxSinDocumento();
    await expect(extraerLineasDocx(buf)).rejects.toThrow(/word\/document\.xml/);
  });
});

describe("extraerTextoDocx", () => {
  it("equivale a unir con saltos de línea el .texto de extraerLineasDocx", async () => {
    const cuerpo =
      "<w:p><w:r><w:t>Recepción de Invitados</w:t></w:r></w:p>" +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Violín</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const buf = await construirDocxFixtureDesdeCuerpo(cuerpo);
    const texto = await extraerTextoDocx(buf);
    const lineas = await extraerLineasDocx(buf);
    expect(texto.split("\n")).toEqual(lineas.map((l) => l.texto));
  });
});

describe("lineasDeTexto", () => {
  it("descarta líneas en blanco y conserva el orden, siempre con negrita:false", () => {
    const texto = "Ofertorio\n\n  \nAve María\nBendición Final";
    expect(lineasDeTexto(texto)).toEqual([
      { texto: "Ofertorio", negrita: false },
      { texto: "Ave María", negrita: false },
      { texto: "Bendición Final", negrita: false },
    ]);
  });

  it("una sola línea sin salto final produce una entrada", () => {
    expect(lineasDeTexto("Ofertorio")).toEqual([{ texto: "Ofertorio", negrita: false }]);
  });
});
