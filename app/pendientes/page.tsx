"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { determinarModoDueno } from "@/lib/modo-dueno";

interface Pendiente {
  id: string;
  archivoOrigen: string;
  remitente: string;
  asunto: string;
  fechaCorreo: string;
  detectadoEn: string;
  evento: {
    tipo_evento: string | null;
    fecha: string | null;
    hora: string | null;
    momentos: { obras: unknown[] }[];
  };
}

/** Fichas detectadas automáticamente por correo, a la espera de revisión humana. */
export default function Pendientes() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cargado, setCargado] = useState(false);
  const [dueno, setDueno] = useState<boolean | null>(null);

  async function cargar() {
    const datos = await fetch("/api/pendientes").then((r) => r.json());
    setPendientes(datos.pendientes);
    setCargado(true);
  }

  useEffect(() => {
    (async () => {
      const esDuenoAhora = determinarModoDueno();
      setDueno(esDuenoAhora);
      // Las fichas pendientes vienen de correos reales del negocio (remitente, asunto,
      // programa del evento) — no es algo que un invitado deba ver, así que ni se pide
      // la lista al servidor si no es el dueño.
      if (esDuenoAhora) await cargar();
    })();
  }, []);

  async function onDescartar(id: string) {
    await fetch(`/api/pendientes/${id}`, { method: "DELETE" });
    await cargar();
  }

  if (dueno === null) return null;

  if (!dueno) {
    return (
      <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Pendientes de revisar</h1>
        <p className="text-sm opacity-70">Esta sección es solo para el dueño de la app.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pendientes de revisar</h1>
      <p className="text-sm opacity-70">
        Fichas detectadas automáticamente por correo, a la espera de que las revises y
        generes la setlist — nunca se genera ni se sube nada sin que lo confirmes aquí.
      </p>

      {cargado && pendientes.length === 0 && <p className="text-sm opacity-60">No hay ninguna ficha pendiente.</p>}

      <ul className="flex flex-col gap-3">
        {pendientes.map((p) => {
          const totalObras = p.evento.momentos.reduce((suma, m) => suma + m.obras.length, 0);
          return (
            <li key={p.id} className="border rounded-lg p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  {p.evento.tipo_evento ?? p.archivoOrigen}
                  {p.evento.fecha ? ` — ${p.evento.fecha}` : ""}
                </span>
                <span className="opacity-70">
                  De: {p.remitente} · Asunto: {p.asunto}
                </span>
                <span className="opacity-50 text-xs">
                  {totalObras} obra(s) detectadas · llegó el {new Date(p.fechaCorreo).toLocaleString("es-ES")}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Link href={`/?pendiente=${p.id}`} className="px-3 py-1.5 rounded bg-black text-white text-sm font-medium">
                  Revisar
                </Link>
                <button onClick={() => onDescartar(p.id)} className="text-red-600 hover:underline text-sm">
                  Descartar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
