import { extraerEvento, ExtraccionFallidaError } from "@/lib/extractor";

export const runtime = "nodejs";

/**
 * Segundo pase OPCIONAL con Claude, solo cuando la persona decide pulsar "Afinar con IA"
 * porque la extracción por reglas (/api/extraer) no le convence para una ficha concreta.
 * Recibe el texto ya extraído (no hace falta volver a subir el archivo) para no repetir
 * la lectura del .docx/.doc.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { texto: string };

  if (!body.texto?.trim()) {
    return Response.json({ error: "Falta el texto de la ficha a afinar." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "No hay ninguna clave de Anthropic configurada en el servidor (ANTHROPIC_API_KEY)." },
      { status: 501 }
    );
  }

  try {
    const evento = await extraerEvento(body.texto);
    return Response.json({ evento, metodo: "ia" });
  } catch (error) {
    if (error instanceof ExtraccionFallidaError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    return Response.json(
      { error: `Error llamando a Claude: ${(error as Error).message}` },
      { status: 502 }
    );
  }
}
