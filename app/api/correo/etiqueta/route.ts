import { obtenerConfiguracionCorreo, guardarConfiguracionCorreo } from "@/lib/store";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const body = (await request.json()) as { etiquetaId: string; etiquetaNombre: string; prefijoAsunto: string | null };
  const config = await obtenerConfiguracionCorreo();
  if (!config) {
    return Response.json({ error: "No hay ninguna cuenta de Gmail conectada." }, { status: 400 });
  }
  await guardarConfiguracionCorreo({
    ...config,
    etiquetaId: body.etiquetaId,
    etiquetaNombre: body.etiquetaNombre,
    prefijoAsunto: body.prefijoAsunto?.trim() || null,
  });
  return Response.json({ ok: true });
}
