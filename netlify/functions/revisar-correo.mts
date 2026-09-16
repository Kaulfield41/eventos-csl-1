import type { Config } from "@netlify/functions";
import { buscarMensajesConAdjunto, descargarAdjunto, enviarRespuesta } from "../../lib/gmail";
import { extraerLineasDocx, lineasDeTexto } from "../../lib/docx";
import { extraerTextoDoc } from "../../lib/doc-legacy";
import { extraerEventoHeuristico } from "../../lib/extractor-heuristico";
import { claveObra } from "../../lib/models";
import {
  obtenerConfiguracionCorreo,
  guardarConfiguracionCorreo,
  idsMensajesProcesados,
  marcarMensajeProcesado,
  guardarPendiente,
  obtenerDecision,
  todasLasObrasResueltas,
  type DecisionEmparejamiento,
} from "../../lib/store";

/**
 * Función programada (cron): revisa la cuenta de Gmail conectada en busca de mensajes
 * nuevos con la etiqueta elegida y un adjunto .docx/.doc, los procesa con la misma
 * heurística que la subida manual (nunca llama a Claude), y deja el resultado en la
 * cola de "Pendientes de revisar" — nunca genera ni sube un .4ss sola. Si TODAS las
 * obras de la ficha ya tienen una partitura fijada de un evento anterior, además
 * responde al correo original avisando de que no hace falta revisar el emparejamiento
 * (la ficha se sigue guardando en Pendientes igual, esto es solo un aviso).
 */
const TEXTO_RESPUESTA_TODO_RESUELTO = "Hola, Gonzalo:\n\nFicha recibida, todo ok.\n\nUn abrazo.";
const HORAS_REVISION_MADRID = [9, 13, 17, 21];

/** Hora local de Madrid ahora mismo (0-23), ya con el cambio de horario de verano/invierno aplicado. */
function horaActualEnMadrid(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "numeric", hour12: false }).format(new Date()));
}

const revisarCorreo = async () => {
  // El cron se dispara cada hora en punto (ver `schedule` más abajo) y aquí se descarta
  // si no toca revisar todavía: fijar directamente las horas UTC en el cron rompería con
  // el cambio de horario de verano/invierno, así que la franja horaria se calcula en cada
  // ejecución a partir de la hora real de Madrid.
  if (!HORAS_REVISION_MADRID.includes(horaActualEnMadrid())) {
    return new Response("ok (fuera de horario)");
  }

  const config = await obtenerConfiguracionCorreo();
  if (!config || !config.etiquetaId) {
    console.log("[revisar-correo] Sin cuenta conectada o sin etiqueta elegida todavía; nada que hacer.");
    return new Response("ok");
  }

  const procesados = await idsMensajesProcesados();
  let mensajes;
  try {
    mensajes = await buscarMensajesConAdjunto(config.tokens, config.etiquetaId, config.prefijoAsunto, procesados);
  } catch (e) {
    console.error("[revisar-correo] Error consultando Gmail:", (e as Error).message);
    return new Response("error", { status: 500 });
  }

  for (const mensaje of mensajes) {
    let huboFicha = false;
    let todasResueltas = true;
    try {
      for (const adjunto of mensaje.adjuntos) {
        const buffer = await descargarAdjunto(config.tokens, mensaje.id, adjunto.attachmentId);
        const esDoc = adjunto.nombre.toLowerCase().endsWith(".doc");
        const lineas = esDoc ? lineasDeTexto(await extraerTextoDoc(buffer)) : await extraerLineasDocx(buffer);
        const texto = lineas.map((l) => l.texto).join("\n");
        if (!texto.trim()) continue;

        const evento = extraerEventoHeuristico(lineas);
        await guardarPendiente({
          mensajeId: mensaje.id,
          archivoOrigen: adjunto.nombre,
          remitente: mensaje.remitente,
          asunto: mensaje.asunto,
          fechaCorreo: mensaje.fechaIso,
          evento,
          texto,
        });
        console.log(`[revisar-correo] Nuevo pendiente: "${mensaje.asunto}" (${adjunto.nombre})`);

        huboFicha = true;
        const obras = evento.momentos.flatMap((m) => m.obras);
        const entradas = await Promise.all(
          obras.map(
            async (o) => [claveObra(o.titulo, o.compositor), await obtenerDecision(o.titulo, o.compositor)] as const
          )
        );
        const decisiones = new Map(
          entradas.filter((e): e is [string, DecisionEmparejamiento] => e[1] !== undefined)
        );
        if (!todasLasObrasResueltas(evento, decisiones)) todasResueltas = false;
      }

      // Aviso de cortesía, no sustituye a Pendientes: se manda solo si TODAS las fichas
      // de este correo (normalmente una) están ya completamente resueltas de memoria.
      if (huboFicha && todasResueltas) {
        try {
          await enviarRespuesta(config.tokens, {
            threadId: mensaje.threadId,
            messageIdOriginal: mensaje.messageIdHeader,
            destinatario: mensaje.remitente,
            remitenteCuenta: config.cuenta ?? "",
            asuntoOriginal: mensaje.asunto,
            cuerpo: TEXTO_RESPUESTA_TODO_RESUELTO,
          });
          console.log(`[revisar-correo] Respondido "${mensaje.asunto}" (todas las obras ya conocidas)`);
        } catch (e) {
          // No bloquea nada: la ficha ya quedó en Pendientes igualmente. Esto falla, por
          // ejemplo, si la cuenta todavía no se ha reconectado con el alcance gmail.send.
          console.error(`[revisar-correo] No se pudo responder al mensaje ${mensaje.id}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error(`[revisar-correo] Error procesando el mensaje ${mensaje.id}:`, (e as Error).message);
    } finally {
      // Se marca como procesado tanto si salió bien como si falló, para no reintentarlo
      // en bucle en cada pasada — un fallo puntual se revisaría a mano si hace falta.
      await marcarMensajeProcesado(mensaje.id);
    }
  }

  await guardarConfiguracionCorreo({ ...config, ultimaRevision: new Date().toISOString() });
  return new Response("ok");
};

export default revisarCorreo;

export const config: Config = {
  // Se dispara cada hora en punto; la función decide arriba si toca revisar de verdad
  // (9:00/13:00/17:00/21:00 hora de Madrid, ajustado ya al horario de verano/invierno).
  schedule: "0 * * * *",
};
