"use client";

import { useEffect, useState } from "react";
import { determinarModoDueno } from "@/lib/modo-dueno";

interface EstadoCorreo {
  conectado: boolean;
  cuenta?: string | null;
  etiquetas?: { id: string; nombre: string }[];
  errorEtiquetas?: string | null;
  etiquetaId?: string | null;
  etiquetaNombre?: string | null;
  prefijoAsunto?: string | null;
  ultimaRevision?: string | null;
}

/**
 * Conectar la cuenta de Gmail del negocio y elegir qué etiqueta (y, opcionalmente,
 * qué prefijo de asunto) vigilar para detectar fichas nuevas automáticamente.
 */
export default function Correo() {
  const [estado, setEstado] = useState<EstadoCorreo | null>(null);
  const [etiquetaId, setEtiquetaId] = useState("");
  const [prefijoAsunto, setPrefijoAsunto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [dueno, setDueno] = useState<boolean | null>(null);

  async function cargar() {
    const datos = (await fetch("/api/correo/estado").then((r) => r.json())) as EstadoCorreo;
    setEstado(datos);
    setEtiquetaId(datos.etiquetaId ?? "");
    setPrefijoAsunto(datos.prefijoAsunto ?? "");
  }

  useEffect(() => {
    (async () => {
      const esDuenoAhora = determinarModoDueno();
      setDueno(esDuenoAhora);
      // Esta pantalla controla la cuenta de Gmail del negocio (conectar/desconectar,
      // etiqueta vigilada) — información y acciones que un invitado no necesita ni debe
      // ver, así que ni se pide el estado al servidor si no es el dueño.
      if (!esDuenoAhora) return;
      await cargar();
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) setMensaje(`No se pudo conectar: ${error}`);
    })();
  }, []);

  if (dueno === null) return null;

  if (!dueno) {
    return (
      <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Correo</h1>
        <p className="text-sm opacity-70">Esta sección es solo para el dueño de la app.</p>
      </main>
    );
  }

  async function onGuardarEtiqueta() {
    if (!etiquetaId) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const etiqueta = estado?.etiquetas?.find((e) => e.id === etiquetaId);
      await fetch("/api/correo/etiqueta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etiquetaId, etiquetaNombre: etiqueta?.nombre ?? "", prefijoAsunto: prefijoAsunto || null }),
      });
      setMensaje("Guardado.");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function onDesconectar() {
    await fetch("/api/correo/desconectar", { method: "POST" });
    await cargar();
  }

  if (!estado) return null;

  return (
    <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Correo</h1>
      <p className="text-sm opacity-70">
        Conecta la cuenta de Gmail del negocio para que la app detecte sola las fichas
        nuevas que lleguen con la etiqueta que elijas — nunca genera ni sube la setlist
        final sola, solo las deja preparadas en &quot;Pendientes&quot; para que las revises.
      </p>

      {mensaje && <p className="text-sm text-amber-700">{mensaje}</p>}

      {!estado.conectado ? (
        <a href="/api/correo/conectar" className="self-start px-4 py-2 rounded bg-black text-white text-sm font-medium">
          Conectar Gmail
        </a>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-sm">
            <span className="opacity-70">Cuenta conectada: </span>
            <strong>{estado.cuenta ?? "(desconocida)"}</strong>
            <button onClick={onDesconectar} className="ml-4 text-red-600 hover:underline text-xs">
              Desconectar
            </button>
          </div>

          {estado.errorEtiquetas && <p className="text-sm text-red-600">Error leyendo etiquetas: {estado.errorEtiquetas}</p>}

          <label className="flex flex-col gap-1 text-sm">
            Etiqueta de Gmail a vigilar
            <select
              className="border rounded px-2 py-1"
              value={etiquetaId}
              onChange={(e) => setEtiquetaId(e.target.value)}
            >
              <option value="">— Elige una etiqueta —</option>
              {estado.etiquetas?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            El asunto empieza por (opcional, para filtrar más)
            <input
              className="border rounded px-2 py-1"
              placeholder='ej. "Ficha Boda"'
              value={prefijoAsunto}
              onChange={(e) => setPrefijoAsunto(e.target.value)}
            />
          </label>

          <button
            onClick={onGuardarEtiqueta}
            disabled={!etiquetaId || guardando}
            className="self-start px-4 py-2 rounded bg-black text-white text-sm font-medium disabled:opacity-40"
          >
            Guardar
          </button>

          {estado.etiquetaNombre && (
            <p className="text-xs opacity-60">
              Vigilando &quot;{estado.etiquetaNombre}&quot;
              {estado.prefijoAsunto && ` (asunto empieza por "${estado.prefijoAsunto}")`} · última revisión:{" "}
              {estado.ultimaRevision ? new Date(estado.ultimaRevision).toLocaleString("es-ES") : "todavía ninguna"}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
