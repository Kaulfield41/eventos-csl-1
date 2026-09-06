"use client";

import { useEffect, useState } from "react";

interface FilaEstadistica {
  titulo: string;
  compositor: string | null;
  veces: number;
}

/** Equivalente al comando `stats` del prototipo Python: conteo de obras interpretadas. */
export default function Estadisticas() {
  const [filas, setFilas] = useState<FilaEstadistica[]>([]);
  const [totalEventos, setTotalEventos] = useState(0);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    fetch("/api/estadisticas")
      .then((r) => r.json())
      .then((d) => {
        setFilas(d.filas);
        setTotalEventos(d.totalEventos);
        setCargado(true);
      });
  }, []);

  return (
    <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Estadísticas</h1>
      <p className="text-sm opacity-70">
        Conteo de obras interpretadas a lo largo de {totalEventos} evento(s) importado(s).
      </p>

      {cargado && filas.length === 0 && <p className="text-sm opacity-60">Aún no hay eventos importados.</p>}

      <table className="text-sm w-full">
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.titulo}-${f.compositor}`} className="border-b">
              <td className="py-1 pr-3 text-right w-12 opacity-70">{f.veces}</td>
              <td className="py-1">
                {f.titulo}
                {f.compositor ? ` — ${f.compositor}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
