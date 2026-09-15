import { listarPendientes } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const pendientes = await listarPendientes();
  return Response.json({ pendientes });
}
