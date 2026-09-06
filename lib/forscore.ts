/**
 * Construye el XML del formato .4ss de forScore (forScore 12+; datos embebidos en base64
 * requieren forScore 14.3+), confirmado contra la documentación oficial
 * (https://forscore.co/developers-file-types/):
 *
 *   <forScore kind="setlist" version="1.0" title="...">
 *     <score title="..." path="archivo.pdf" data="BASE64..." />
 *     <placeholder title="..." />
 *   </forScore>
 *
 * <score> sin "path" y con "data" no es válido para forScore (usa "path" como nombre de
 * archivo, aunque el contenido real vaya embebido); <placeholder> es una entrada sin
 * archivo, usada aquí como separador entre momentos del evento.
 */

export interface EntradaSetlistObra {
  tipo: "obra";
  titulo: string;
  /** Nombre de archivo a usar como "path" (debe terminar en .pdf). */
  nombreArchivo: string;
  /** Contenido del PDF en base64 (sin saltos de línea). */
  datosBase64: string;
}

export interface EntradaSetlistSeparador {
  tipo: "separador";
  titulo: string;
}

export type EntradaSetlist = EntradaSetlistObra | EntradaSetlistSeparador;

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function construir4ss(tituloSetlist: string, entradas: EntradaSetlist[]): string {
  const elementos = entradas
    .map((entrada) => {
      if (entrada.tipo === "separador") {
        return `    <placeholder title="${escaparXml(entrada.titulo)}" />`;
      }
      return (
        `    <score title="${escaparXml(entrada.titulo)}" ` +
        `path="${escaparXml(entrada.nombreArchivo)}" data="${entrada.datosBase64}" />`
      );
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<forScore kind="setlist" version="1.0" title="${escaparXml(tituloSetlist)}">\n` +
    `${elementos}\n` +
    `</forScore>\n`
  );
}
