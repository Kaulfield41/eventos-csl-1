import { obtenerPreferencias, guardarPreferencias } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const preferencias = await obtenerPreferencias();
  return Response.json({ preferencias });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { insertarSeparadoresMomento: boolean };
  await guardarPreferencias(body);
  return Response.json({ ok: true });
}
