import { desconectarCorreo } from "@/lib/store";

export const runtime = "nodejs";

export async function POST() {
  await desconectarCorreo();
  return Response.json({ ok: true });
}
