import { resolverMatch, type ArchivoPartitura } from "@/lib/matching";
import { obtenerDecision, guardarDecision, borrarDecision } from "@/lib/store";

export const runtime = "nodejs";

interface ObraAEmparejar {
  titulo: string;
  compositor: string | null;
}

/**
 * Dada una lista de obras y los nombres de archivo disponibles en la biblioteca (local o
 * nube, según el modo), propone un emparejamiento por obra aplicando primero cualquier
 * decisión ya guardada, y si no existe, el ranking por similitud de nombre de archivo.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { obras: ObraAEmparejar[]; archivos: string[] };
  const archivos: ArchivoPartitura[] = body.archivos.map((nombre) => ({ nombre }));

  const resultados = await Promise.all(
    body.obras.map(async (obra) => {
      const decision = await obtenerDecision(obra.titulo, obra.compositor);
      const resultado = resolverMatch(
        obra.titulo,
        obra.compositor,
        archivos,
        decision ? { archivoNombre: decision.archivoNombre } : undefined
      );
      return { obra, resultado };
    })
  );

  return Response.json({ resultados });
}

/** Guarda la decisión de "recordar esta elección" para una obra concreta. */
export async function PUT(request: Request) {
  const body = (await request.json()) as {
    titulo: string;
    compositor: string | null;
    archivoNombre: string | null;
  };
  await guardarDecision(body.titulo, body.compositor, { archivoNombre: body.archivoNombre });
  return Response.json({ ok: true });
}

/** Olvida la decisión guardada de una obra (al desmarcar "fijar esta partitura"). */
export async function DELETE(request: Request) {
  const body = (await request.json()) as { titulo: string; compositor: string | null };
  await borrarDecision(body.titulo, body.compositor);
  return Response.json({ ok: true });
}
