import { guardarChunk, ensamblarSiCompleto } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Recibe un fragmento de un PDF grande (ver lib/upload-cliente.ts) y, cuando ya han
 * llegado todos los fragmentos de ese archivo, lo ensambla y lo guarda como partitura
 * completa en la biblioteca en la nube.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const nombre = formData.get("nombre");
  const indice = formData.get("indice");
  const total = formData.get("total");
  const chunk = formData.get("chunk");

  if (typeof nombre !== "string" || typeof indice !== "string" || typeof total !== "string" || !(chunk instanceof File)) {
    return Response.json({ error: "Petición de fragmento incompleta." }, { status: 400 });
  }
  if (!nombre.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: `"${nombre}" no es un PDF.` }, { status: 400 });
  }

  await guardarChunk(nombre, Number(indice), await chunk.arrayBuffer());
  const completo = await ensamblarSiCompleto(nombre, Number(total));

  return Response.json({ ok: true, completo });
}
