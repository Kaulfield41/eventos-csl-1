import { obtenerPendiente, borrarPendiente } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pendiente = await obtenerPendiente(id);
  if (!pendiente) return Response.json({ error: "No encontrado." }, { status: 404 });
  return Response.json({ pendiente });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await borrarPendiente(id);
  return Response.json({ ok: true });
}
