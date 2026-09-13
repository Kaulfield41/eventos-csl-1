import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EventoExtraidoSchema, type EventoExtraido } from "./models";

/**
 * Port de app/extractor.py del prototipo Python (App obras Alborada/app/extractor.py):
 * mismo system prompt, mismo modelo por defecto. En vez de forzar una tool_choice como
 * hacía el prototipo, se usa client.messages.parse() + salida estructurada por Zod
 * (el enfoque recomendado en TypeScript), que valida la respuesta automáticamente.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `Extraes datos de fichas de eventos musicales (bodas, funerales, comuniones, conciertos...). \
El texto contiene un encabezado con tipo de evento, fecha y lugar, una tabla o lista de reparto de \
intérpretes (filas con instrumento/voz, nombre, teléfono y zona separados por '|'), y luego un programa \
musical organizado en 'momentos' (ej. 'Entrada de la Novia', 'Ofertorio'), cada uno seguido \
de una o varias obras en texto libre con título y compositor mezclados y con formato inconsistente \
(comillas, comas, 'de', opus, anónimos...).

Del reparto de intérpretes, extrae SOLO nombre e instrumento/voz de cada persona; ignora siempre \
teléfono, zona/población de residencia y cualquier otro dato de contacto. Ignora también notas y \
observaciones generales que no formen parte del evento o del programa musical.

Distintas fichas escriben el mismo compositor de formas distintas (abreviado, con o sin espacios, \
con distinta ortografía). Normaliza SIEMPRE el compositor a su nombre completo y estándar más conocido \
(ver descripción del campo), para que la misma persona real quede siempre escrita igual entre fichas.

Separa siempre la parroquia/iglesia de la localidad en dos campos distintos (parroquia y población), \
aunque en el texto original aparezcan juntas separadas por comas.

Extrae también la hora del evento (ej. de 'Hora de la Boda: 18:30h') en formato HH:MM; si hay varias \
horas en la cabecera (como una hora de cita/llegada distinta de la hora del propio evento), usa la del \
evento en sí, no la de cita.`;

export class ExtraccionFallidaError extends Error {}

export async function extraerEvento(texto: string, intentos = 3): Promise<EventoExtraido> {
  const client = new Anthropic();
  let ultimoError = "sin detalle";

  for (let intento = 0; intento < intentos; intento++) {
    const respuesta = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: texto }],
      output_config: { format: zodOutputFormat(EventoExtraidoSchema) },
    });

    if (!respuesta.parsed_output) {
      ultimoError = "el modelo no devolvió una salida estructurada válida";
      continue;
    }

    const evento = respuesta.parsed_output;
    const totalObras = evento.momentos.reduce((suma, m) => suma + m.obras.length, 0);
    if (totalObras > 0) return evento;

    ultimoError = "el modelo devolvió un resultado vacío (0 obras) pese a haber texto de entrada";
  }

  throw new ExtraccionFallidaError(`Extracción fallida tras ${intentos} intentos: ${ultimoError}`);
}
