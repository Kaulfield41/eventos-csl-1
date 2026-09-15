"use client";

import { useEffect, useState } from "react";
import { subirPartiturasPorFragmentos } from "@/lib/upload-cliente";
import { determinarModoDueno } from "@/lib/modo-dueno";

interface ArchivoBiblioteca {
  nombre: string;
  tamano: number;
  subidoEn: string;
}

/**
 * Gestión de la biblioteca de partituras en la nube. El modo "carpeta local" no
 * necesita esta pantalla: la carpeta se elige directamente desde la página principal.
 */
export default function Biblioteca() {
  const [archivos, setArchivos] = useState<ArchivoBiblioteca[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [dueno, setDueno] = useState(false);

  async function recargar() {
    const datos = await fetch("/api/biblioteca").then((r) => r.json());
    setArchivos(datos.archivos);
    setCargado(true);
  }

  useEffect(() => {
    (async () => {
      setDueno(determinarModoDueno());
      await recargar();
    })();
  }, []);

  async function onSubir(files: FileList) {
    setError(null);
    try {
      const fallos = await subirPartiturasPorFragmentos(Array.from(files), (archivoActual, totalArchivos, p) => {
        setProgreso(
          `Subiendo ${archivoActual}/${totalArchivos}: ${p.archivo} (fragmento ${p.fragmentoActual}/${p.totalFragmentos})`
        );
      });
      if (fallos.length > 0) {
        setError(`${fallos.length} archivo(s) no se pudieron subir: ${fallos.map((f) => f.nombre).join(", ")}`);
      }
      await recargar();
    } finally {
      setProgreso(null);
    }
  }

  async function onBorrar(nombre: string) {
    await fetch("/api/biblioteca", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    await recargar();
  }

  return (
    <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Biblioteca en la nube</h1>
      <p className="text-sm opacity-70">
        Sube aquí una vez tus partituras (PDF) para tenerlas disponibles desde cualquier
        dispositivo sin depender de una carpeta local.
      </p>

      {dueno ? (
        <>
          <input type="file" multiple disabled={!!progreso} onChange={(e) => e.target.files && onSubir(e.target.files)} />
          {progreso && <p className="text-sm opacity-70">{progreso}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 self-start">
          Modo invitado: puedes ver la biblioteca, pero solo el dueño puede subir o borrar
          partituras aquí.
        </p>
      )}

      {cargado && archivos.length === 0 && <p className="text-sm opacity-60">Aún no hay partituras subidas.</p>}

      <ul className="flex flex-col gap-1 text-sm">
        {archivos.map((a) => (
          <li key={a.nombre} className="flex items-start justify-between gap-2 border-b py-1">
            <span className="min-w-0 break-words">{a.nombre}</span>
            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap opacity-70">
              <span>{(a.tamano / 1024).toFixed(0)} KB</span>
              {dueno && (
                <button onClick={() => onBorrar(a.nombre)} className="text-red-600 hover:underline">
                  Borrar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
