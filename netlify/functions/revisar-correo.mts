import type { Config } from "@netlify/functions";
import { buscarMensajesConAdjunto, descargarAdjunto } from "../../lib/gmail";
import { extraerTextoDocx } from "../../lib/docx";
import { extraerTextoDoc } from "../../lib/doc-legacy";
import { extraerEventoHeuristico } from "../../lib/extractor-heuristico";
import {
  obtenerConfiguracionCorreo,
  guardarConfiguracionCorreo,
  idsMensajesProcesados,
  marcarMensajeProcesado,
  guardarPendiente,
} from "../../lib/store";

/**
 * Función programada (cron): revisa la cuenta de Gmail conectada en busca de mensajes
 * nuevos con la etiqueta elegida y un adjunto .docx/.doc, los procesa con la misma
 * heurística que la subida manual (nunca llama a Claude), y deja el resultado en la
 * cola de "Pendientes de revisar" — nunca genera ni sube un .4ss sola.
 */
const revisarCorreo = async () => {
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
    try {
      for (const adjunto of mensaje.adjuntos) {
        const buffer = await descargarAdjunto(config.tokens, mensaje.id, adjunto.attachmentId);
        const esDoc = adjunto.nombre.toLowerCase().endsWith(".doc");
        const texto = esDoc ? await extraerTextoDoc(buffer) : await extraerTextoDocx(buffer);
        if (!texto.trim()) continue;

        const evento = extraerEventoHeuristico(texto);
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
  // 9:00, 13:00, 17:00 y 21:00 hora de Madrid. Netlify evalúa el cron en UTC, así que
  // esto son las 7,11,15,19 en horario de verano (CEST, UTC+2) — pendiente de ajustar
  // a 8,12,16,20 en horario de invierno (CET, UTC+1) cuando llegue, o de confirmar si
  // Netlify permite fijar una zona horaria en vez de convertir a mano.
  schedule: "0 7,11,15,19 * * *",
};
