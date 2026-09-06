import { construir4ss, type EntradaSetlist } from "@/lib/forscore";
import { obtenerPartituraCloud } from "@/lib/store";

export const runtime = "nodejs";

interface EntradaPeticion {
  tipo: "obra" | "separador";
  titulo: string;
  /** Solo para tipo "obra": nombre de archivo en la biblioteca en la nube, o null si no se adjunta. */
  archivoNombre?: string | null;
}

/**
 * Ensambla el .4ss en el servidor a partir de la biblioteca en la nube (modo "nube").
 * En modo local, el .4ss se genera directamente en el navegador (ver app/page.tsx),
 * porque los PDFs nunca salen del equipo del usuario.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { titulo: string; entradas: EntradaPeticion[] };

  const entradas: EntradaSetlist[] = [];
  for (const entrada of body.entradas) {
    if (entrada.tipo === "separador") {
      entradas.push({ tipo: "separador", titulo: entrada.titulo });
      continue;
    }
    if (!entrada.archivoNombre) continue; // obra sin partitura adjunta: se omite del .4ss
    const datos = await obtenerPartituraCloud(entrada.archivoNombre);
    if (!datos) {
      return Response.json(
        { error: `No se encontró en la biblioteca el archivo "${entrada.archivoNombre}".` },
        { status: 404 }
      );
    }
    entradas.push({
      tipo: "obra",
      titulo: entrada.titulo,
      nombreArchivo: entrada.archivoNombre,
      datosBase64: Buffer.from(datos).toString("base64"),
    });
  }

  const xml = construir4ss(body.titulo, entradas);
  const nombreArchivo = `${body.titulo.replace(/[\\/:*?"<>|]/g, "_")}.4ss`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
