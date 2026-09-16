import { extraerLineasDocx, lineasDeTexto, type LineaFicha } from "@/lib/docx";
import { extraerTextoDoc } from "@/lib/doc-legacy";
import { extraerEventoHeuristico } from "@/lib/extractor-heuristico";

export const runtime = "nodejs";

/**
 * Extracción por defecto: SIN IA, por reglas (lib/extractor-heuristico.ts) — gratis,
 * instantánea, sin necesitar ninguna clave de Anthropic. Devuelve también el texto plano
 * de la ficha para que, si la persona no queda conforme, pueda pedir un segundo pase con
 * Claude sin tener que volver a subir el archivo (ver /api/afinar).
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const ficha = formData.get("ficha");

  if (!(ficha instanceof File)) {
    return Response.json({ error: "Falta el campo 'ficha' con el archivo." }, { status: 400 });
  }

  const nombre = ficha.name;
  const extension = nombre.toLowerCase().split(".").pop();
  if (extension !== "docx" && extension !== "doc") {
    return Response.json({ error: "Solo se admiten archivos .docx o .doc." }, { status: 400 });
  }

  const buffer = Buffer.from(await ficha.arrayBuffer());

  let texto: string;
  let lineas: LineaFicha[];
  try {
    if (extension === "docx") {
      lineas = await extraerLineasDocx(buffer);
      texto = lineas.map((l) => l.texto).join("\n");
    } else {
      texto = await extraerTextoDoc(buffer);
      lineas = lineasDeTexto(texto); // .doc antiguo: sin formato disponible, negrita siempre false
    }
  } catch (error) {
    return Response.json(
      { error: `No se pudo leer el documento: ${(error as Error).message}` },
      { status: 400 }
    );
  }

  if (!texto.trim()) {
    return Response.json({ error: "El documento no contiene texto reconocible." }, { status: 400 });
  }

  const evento = extraerEventoHeuristico(lineas);

  return Response.json({ texto, evento, metodo: "heuristico" });
}
