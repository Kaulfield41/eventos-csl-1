import { listarEtiquetas } from "@/lib/gmail";
import { obtenerConfiguracionCorreo } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const config = await obtenerConfiguracionCorreo();
  if (!config) {
    return Response.json({ conectado: false });
  }

  let etiquetas: { id: string; nombre: string }[] = [];
  let errorEtiquetas: string | null = null;
  try {
    etiquetas = await listarEtiquetas(config.tokens);
  } catch (e) {
    errorEtiquetas = (e as Error).message;
  }

  return Response.json({
    conectado: true,
    cuenta: config.cuenta,
    etiquetas,
    errorEtiquetas,
    etiquetaId: config.etiquetaId,
    etiquetaNombre: config.etiquetaNombre,
    prefijoAsunto: config.prefijoAsunto,
    ultimaRevision: config.ultimaRevision,
  });
}
