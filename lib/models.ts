import { z } from "zod";

/**
 * Espejo en TypeScript de app/models.py de un prototipo Python anterior.
 * Misma forma, mismos campos.
 */

export const ObraExtraidaSchema = z.object({
  titulo: z.string().describe("Título de la obra o pieza musical, sin comillas decorativas."),
  compositor: z
    .string()
    .nullable()
    .describe(
      "Nombre del compositor en su forma canónica/estándar más conocida (ej. 'Johann Sebastian Bach', " +
        "no 'J.S.Bach' ni 'J.S. Bach'; 'Georg Friedrich Händel', no 'Haendel' ni 'G.F.Haendel'). " +
        "Normaliza siempre a la misma grafía aunque la ficha original abrevie o varíe el formato. " +
        "null si no se indica (ej. himnos o piezas anónimas)."
    ),
});
export type ObraExtraida = z.infer<typeof ObraExtraidaSchema>;

export const InterpreteExtraidoSchema = z.object({
  nombre: z.string().describe("Nombre y apellido del intérprete, tal como aparece."),
  instrumento: z
    .string()
    .nullable()
    .describe("Instrumento o voz que interpreta (ej. 'Violín', 'Soprano'). null si no se indica."),
});
export type InterpreteExtraido = z.infer<typeof InterpreteExtraidoSchema>;

export const MomentoExtraidoSchema = z.object({
  nombre: z.string().describe("Momento de la ceremonia/evento, ej. 'Entrada de la Novia', 'Ofertorio'."),
  obras: z.array(ObraExtraidaSchema).default([]),
});
export type MomentoExtraido = z.infer<typeof MomentoExtraidoSchema>;

export const EventoExtraidoSchema = z.object({
  tipo_evento: z.string().nullable().describe("Ej. 'Boda', 'Funeral', 'Comunión'."),
  fecha: z.string().nullable().describe("Fecha del evento en formato ISO (YYYY-MM-DD)."),
  hora: z.string().nullable().describe("Hora del evento en formato HH:MM (24h), ej. '18:30'. null si no se indica."),
  parroquia: z
    .string()
    .nullable()
    .describe("Nombre de la parroquia/iglesia/sala, sin la localidad (ej. 'Parroquia de Santa Bárbara')."),
  poblacion: z
    .string()
    .nullable()
    .describe("Localidad/ciudad del evento (ej. 'Madrid', 'Meco'), sin el nombre de la parroquia."),
  interpretes: z
    .array(InterpreteExtraidoSchema)
    .default([])
    .describe("Reparto de músicos/cantantes del evento (nombre e instrumento/voz), sin teléfono ni zona."),
  momentos: z.array(MomentoExtraidoSchema).default([]),
});
export type EventoExtraido = z.infer<typeof EventoExtraidoSchema>;

/** Clave normalizada de una obra (misma idea que database._normalizar en el prototipo Python). */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]/g, ""); // solo letras y números
}

export function claveObra(titulo: string, compositor: string | null): string {
  return `${normalizar(titulo)}#${normalizar(compositor ?? "")}`;
}
