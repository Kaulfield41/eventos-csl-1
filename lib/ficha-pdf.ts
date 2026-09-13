import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { EventoExtraido } from "./models";

/**
 * Genera un PDF-resumen de la ficha (evento, momentos, obras e intérpretes) para usarlo
 * como primera página del setlist en forScore. No es una réplica visual del Word
 * original (eso exigiría convertir .docx a PDF, algo pesado de hacer sin depender de
 * un servicio externo de pago) — es un resumen limpio generado a partir de los mismos
 * datos ya extraídos, que cumple el mismo propósito: tener el programa a mano antes de
 * empezar a tocar.
 */

const MARGEN = 50;
const ANCHO_PAGINA = 595.28; // A4
const ALTO_PAGINA = 841.89;

function formatearFechaLarga(fechaIso: string | null): string | null {
  if (!fechaIso) return null;
  const fecha = new Date(`${fechaIso}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return fechaIso;
  const texto = fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Título legible para el evento: "Boda X e Y - Viernes 4 de septiembre de 2026 · 18:30h". */
export function tituloEvento(evento: EventoExtraido): string {
  const partes = [evento.tipo_evento, formatearFechaLarga(evento.fecha)].filter(Boolean) as string[];
  let titulo = partes.join(" - ");
  if (evento.hora) titulo += ` · ${evento.hora}h`;
  return titulo || "Setlist";
}

function partirEnLineas(texto: string, font: PDFFont, tamano: number, anchoMaximo: number): string[] {
  const palabras = texto.split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(candidata, tamano) > anchoMaximo && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function construirFichaPdf(evento: EventoExtraido): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const anchoTexto = ANCHO_PAGINA - MARGEN * 2;

  let pagina: PDFPage = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  let y = ALTO_PAGINA - MARGEN;

  function nuevaPaginaSiHaceFalta(alturaNecesaria: number) {
    if (y - alturaNecesaria < MARGEN) {
      pagina = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
      y = ALTO_PAGINA - MARGEN;
    }
  }

  function escribir(texto: string, opciones: { tamano?: number; negrita?: boolean; sangria?: number; espacioAntes?: number } = {}) {
    const tamano = opciones.tamano ?? 11;
    const font = opciones.negrita ? fuenteNegrita : fuente;
    const sangria = opciones.sangria ?? 0;
    y -= opciones.espacioAntes ?? 0;

    const lineas = partirEnLineas(texto, font, tamano, anchoTexto - sangria);
    for (const linea of lineas) {
      nuevaPaginaSiHaceFalta(tamano * 1.4);
      pagina.drawText(linea, { x: MARGEN + sangria, y, size: tamano, font, color: rgb(0, 0, 0) });
      y -= tamano * 1.4;
    }
  }

  escribir(evento.tipo_evento ?? "Evento", { tamano: 20, negrita: true });
  const detalles = [formatearFechaLarga(evento.fecha), evento.hora ? `${evento.hora}h` : null, evento.parroquia, evento.poblacion]
    .filter(Boolean)
    .join(" · ");
  if (detalles) escribir(detalles, { tamano: 12, espacioAntes: 4 });

  for (const momento of evento.momentos) {
    escribir(momento.nombre, { tamano: 13, negrita: true, espacioAntes: 14 });
    for (const obra of momento.obras) {
      const texto = obra.compositor ? `${obra.titulo} — ${obra.compositor}` : obra.titulo;
      escribir(`•  ${texto}`, { tamano: 11, sangria: 12 });
    }
  }

  if (evento.interpretes.length > 0) {
    escribir("Intérpretes", { tamano: 13, negrita: true, espacioAntes: 18 });
    for (const interprete of evento.interpretes) {
      const texto = interprete.instrumento ? `${interprete.instrumento}: ${interprete.nombre}` : interprete.nombre;
      escribir(texto, { tamano: 11, sangria: 12 });
    }
  }

  return doc.save();
}
