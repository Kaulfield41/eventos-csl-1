"use client";

/**
 * Sube un PDF a la biblioteca en la nube troceándolo en fragmentos pequeños, porque las
 * funciones de Netlify tienen un límite de tamaño de petición (~4,5 MB efectivos) muy
 * por debajo de partituras reales (hasta 35 MB en una biblioteca real). El
 * servidor va guardando los fragmentos y los ensambla solo al recibir el último
 * (ver app/api/biblioteca/chunk/route.ts).
 */
const TAMANO_FRAGMENTO = 3 * 1024 * 1024; // 3 MB, con margen bajo el límite real

export interface ProgresoSubida {
  archivo: string;
  fragmentoActual: number;
  totalFragmentos: number;
}

export async function subirPartituraPorFragmentos(file: File, onProgreso?: (p: ProgresoSubida) => void): Promise<void> {
  const total = Math.max(1, Math.ceil(file.size / TAMANO_FRAGMENTO));
  for (let indice = 0; indice < total; indice++) {
    const inicio = indice * TAMANO_FRAGMENTO;
    const fragmento = file.slice(inicio, inicio + TAMANO_FRAGMENTO);
    const formData = new FormData();
    formData.append("nombre", file.name);
    formData.append("indice", String(indice));
    formData.append("total", String(total));
    formData.append("chunk", fragmento, file.name);

    const respuesta = await fetch("/api/biblioteca/chunk", { method: "POST", body: formData });
    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => ({}));
      throw new Error(detalle.error ?? `Error subiendo "${file.name}" (fragmento ${indice + 1}/${total}).`);
    }
    onProgreso?.({ archivo: file.name, fragmentoActual: indice + 1, totalFragmentos: total });
  }
}

/**
 * Sube varios PDF, uno detrás de otro (no en paralelo, para no saturar la conexión). Si
 * un archivo falla, no aborta la subida entera (con cientos de partituras reales, un
 * fallo puntual de red no debería obligar a repetir todo desde el principio) — sigue
 * con el resto y al final informa de cuáles no se pudieron subir.
 */
export async function subirPartiturasPorFragmentos(
  files: File[],
  onProgreso?: (archivoActual: number, totalArchivos: number, progreso: ProgresoSubida) => void
): Promise<{ nombre: string; error: string }[]> {
  const fallos: { nombre: string; error: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      await subirPartituraPorFragmentos(files[i], (p) => onProgreso?.(i + 1, files.length, p));
    } catch (e) {
      fallos.push({ nombre: files[i].name, error: (e as Error).message });
    }
  }
  return fallos;
}
