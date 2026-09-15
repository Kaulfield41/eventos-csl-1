import { listarBibliotecaCloud, borrarPartituraCloud } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Biblioteca de partituras en la nube (modo "nube"): listar y borrar PDFs. La subida se
 * hace por fragmentos (ver app/api/biblioteca/chunk/route.ts) porque las funciones de
 * Netlify tienen un límite de tamaño de petición muy por debajo de partituras reales.
 */
export async function GET() {
  const archivos = await listarBibliotecaCloud();
  return Response.json({ archivos });
}

export async function DELETE(request: Request) {
  const { nombre } = (await request.json()) as { nombre: string };
  await borrarPartituraCloud(nombre);
  return Response.json({ ok: true });
}
