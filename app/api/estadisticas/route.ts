import { listarEventosHistorial } from "@/lib/store";
import { claveObra } from "@/lib/models";

export const runtime = "nodejs";

interface FilaEstadistica {
  titulo: string;
  compositor: string | null;
  veces: number;
}

/**
 * Equivalente al comando `stats` del prototipo Python (resumen_por_curso): cuenta cuántas
 * veces se ha interpretado cada obra a lo largo del historial de eventos importados.
 */
export async function GET() {
  const historial = await listarEventosHistorial();
  const conteos = new Map<string, FilaEstadistica>();

  for (const registro of historial) {
    for (const momento of registro.evento.momentos) {
      for (const obra of momento.obras) {
        const clave = claveObra(obra.titulo, obra.compositor);
        const existente = conteos.get(clave);
        if (existente) {
          existente.veces += 1;
        } else {
          conteos.set(clave, { titulo: obra.titulo, compositor: obra.compositor, veces: 1 });
        }
      }
    }
  }

  const filas = [...conteos.values()].sort((a, b) => b.veces - a.veces || a.titulo.localeCompare(b.titulo));
  return Response.json({ filas, totalEventos: historial.length });
}
