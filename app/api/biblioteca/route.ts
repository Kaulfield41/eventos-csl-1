import { listarBibliotecaCloud, subirPartituraCloud, borrarPartituraCloud } from "@/lib/store";

export const runtime = "nodejs";

/** Biblioteca de partituras en la nube (modo "nube"): listar, subir y borrar PDFs. */
export async function GET() {
  const archivos = await listarBibliotecaCloud();
  return Response.json({ archivos });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const archivos = formData.getAll("archivos").filter((a): a is File => a instanceof File);

  if (archivos.length === 0) {
    return Response.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  for (const archivo of archivos) {
    if (!archivo.name.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: `"${archivo.name}" no es un PDF.` }, { status: 400 });
    }
    await subirPartituraCloud(archivo.name, await archivo.arrayBuffer());
  }

  return Response.json({ ok: true, subidos: archivos.length });
}

export async function DELETE(request: Request) {
  const { nombre } = (await request.json()) as { nombre: string };
  await borrarPartituraCloud(nombre);
  return Response.json({ ok: true });
}
