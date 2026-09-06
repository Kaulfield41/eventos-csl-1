"use client";

import { useEffect, useState } from "react";
import type { EventoExtraido } from "@/lib/models";
import type { ResultadoMatch, CandidatoMatch } from "@/lib/matching";
import { construir4ss, type EntradaSetlist } from "@/lib/forscore";
import {
  soportaFileSystemAccess,
  recuperarCarpetaGuardada,
  asegurarPermisoLectura,
  elegirCarpeta,
  listarPdfs,
  leerPdfComoBase64,
} from "@/lib/browser-fs";

type Modo = "local" | "nube";

interface ObraConMomento {
  momento: string;
  titulo: string;
  compositor: string | null;
}

interface FilaObra extends ObraConMomento {
  resultado: ResultadoMatch;
  archivoSeleccionado: string | null;
  recordar: boolean;
}

function descargarTexto(contenido: string, nombreArchivo: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function tituloSetlist(evento: EventoExtraido): string {
  const partes = [evento.tipo_evento, evento.fecha, evento.parroquia].filter(Boolean);
  return partes.length ? partes.join(" - ") : "Setlist";
}

export default function Home() {
  const [modo, setModo] = useState<Modo>("local");
  const [carpetaHandle, setCarpetaHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [archivosBiblioteca, setArchivosBiblioteca] = useState<string[]>([]);
  const [insertarSeparadores, setInsertarSeparadores] = useState(true);
  const [evento, setEvento] = useState<EventoExtraido | null>(null);
  const [filas, setFilas] = useState<FilaObra[]>([]);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textoFicha, setTextoFicha] = useState<string | null>(null);
  const [nombreFicha, setNombreFicha] = useState<string | null>(null);
  const [metodoExtraccion, setMetodoExtraccion] = useState<"heuristico" | "ia" | null>(null);

  // Al arrancar: recupera la carpeta local ya elegida en una sesión anterior (si la hay)
  // y carga la preferencia de separadores de momento.
  useEffect(() => {
    (async () => {
      const preferencias = await fetch("/api/preferencias").then((r) => r.json());
      setInsertarSeparadores(preferencias.preferencias.insertarSeparadoresMomento);

      if (soportaFileSystemAccess()) {
        const handle = await recuperarCarpetaGuardada();
        if (handle && (await asegurarPermisoLectura(handle))) {
          setCarpetaHandle(handle);
        }
      } else {
        setModo("nube");
      }
    })();
  }, []);

  // Recarga la lista de archivos disponibles cuando cambia el modo o la carpeta/biblioteca.
  useEffect(() => {
    (async () => {
      if (modo === "local") {
        if (!carpetaHandle) {
          setArchivosBiblioteca([]);
          return;
        }
        setArchivosBiblioteca(await listarPdfs(carpetaHandle));
      } else {
        const datos = await fetch("/api/biblioteca").then((r) => r.json());
        setArchivosBiblioteca(datos.archivos.map((a: { nombre: string }) => a.nombre));
      }
    })();
  }, [modo, carpetaHandle]);

  async function onElegirCarpeta() {
    setError(null);
    try {
      const handle = await elegirCarpeta();
      setCarpetaHandle(handle);
    } catch {
      // El usuario canceló el selector: no es un error a mostrar.
    }
  }

  async function onCambiarSeparadores(valor: boolean) {
    setInsertarSeparadores(valor);
    await fetch("/api/preferencias", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insertarSeparadoresMomento: valor }),
    });
  }

  async function emparejarTodas(obras: ObraConMomento[]) {
    const respuesta = await fetch("/api/emparejar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        obras: obras.map((o) => ({ titulo: o.titulo, compositor: o.compositor })),
        archivos: archivosBiblioteca,
      }),
    }).then((r) => r.json());

    const nuevasFilas: FilaObra[] = respuesta.resultados.map(
      (r: { obra: { titulo: string; compositor: string | null }; resultado: ResultadoMatch }, i: number) => {
        const resultado = r.resultado;
        let archivoSeleccionado: string | null = null;
        if (resultado.tipo === "automatico") archivoSeleccionado = resultado.archivo.nombre;
        else if (resultado.tipo === "recordado") archivoSeleccionado = resultado.archivo?.nombre ?? null;
        else if (resultado.tipo === "ambiguo") archivoSeleccionado = resultado.candidatos[0]?.archivo.nombre ?? null;
        return { ...obras[i], resultado, archivoSeleccionado, recordar: false };
      }
    );
    setFilas(nuevasFilas);
  }

  async function onSubirFicha(file: File) {
    setError(null);
    setEvento(null);
    setFilas([]);
    setTextoFicha(null);
    setMetodoExtraccion(null);
    setNombreFicha(file.name);
    setCargando("Leyendo la ficha y extrayendo el programa (sin IA, por reglas)...");
    try {
      const formData = new FormData();
      formData.append("ficha", file);
      const respuesta = await fetch("/api/extraer", { method: "POST", body: formData }).then((r) => r.json());
      if (respuesta.error) throw new Error(respuesta.error);
      setEvento(respuesta.evento as EventoExtraido);
      setTextoFicha(respuesta.texto as string);
      setMetodoExtraccion("heuristico");
      const obras: ObraConMomento[] = (respuesta.evento as EventoExtraido).momentos.flatMap((m) =>
        m.obras.map((o) => ({ momento: m.nombre, titulo: o.titulo, compositor: o.compositor }))
      );
      setCargando("Buscando partituras coincidentes...");
      await emparejarTodas(obras);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  async function onAfinarConIA() {
    if (!textoFicha) return;
    setError(null);
    setCargando("Afinando la extracción con Claude...");
    try {
      const respuesta = await fetch("/api/afinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoFicha, nombreArchivo: nombreFicha }),
      }).then((r) => r.json());
      if (respuesta.error) throw new Error(respuesta.error);
      setEvento(respuesta.evento as EventoExtraido);
      setMetodoExtraccion("ia");
      const obras: ObraConMomento[] = (respuesta.evento as EventoExtraido).momentos.flatMap((m) =>
        m.obras.map((o) => ({ momento: m.nombre, titulo: o.titulo, compositor: o.compositor }))
      );
      setCargando("Buscando partituras coincidentes...");
      await emparejarTodas(obras);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  async function onCambiarSeleccion(indice: number, archivoNombre: string | null) {
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, archivoSeleccionado: archivoNombre } : f)));
  }

  async function onCambiarRecordar(indice: number, recordar: boolean) {
    const fila = filas[indice];
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, recordar } : f)));
    if (recordar) {
      await fetch("/api/emparejar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: fila.titulo,
          compositor: fila.compositor,
          archivoNombre: fila.archivoSeleccionado,
        }),
      });
    }
  }

  async function onGenerarSetlist() {
    if (!evento) return;
    setError(null);
    setCargando("Generando la setlist para forScore...");
    try {
      const titulo = tituloSetlist(evento);
      const entradasPeticion: { tipo: "obra" | "separador"; titulo: string; archivoNombre?: string | null }[] = [];
      let ultimoMomento: string | null = null;
      for (const fila of filas) {
        if (insertarSeparadores && fila.momento !== ultimoMomento) {
          entradasPeticion.push({ tipo: "separador", titulo: fila.momento });
          ultimoMomento = fila.momento;
        }
        entradasPeticion.push({ tipo: "obra", titulo: fila.titulo, archivoNombre: fila.archivoSeleccionado });
      }

      if (modo === "nube") {
        const respuesta = await fetch("/api/setlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo, entradas: entradasPeticion }),
        });
        if (!respuesta.ok) throw new Error((await respuesta.json()).error ?? "Error generando la setlist.");
        const xml = await respuesta.text();
        descargarTexto(xml, `${titulo.replace(/[\\/:*?"<>|]/g, "_")}.4ss`, "application/xml");
      } else {
        if (!carpetaHandle) throw new Error("Elige primero la carpeta de partituras.");
        const entradas: EntradaSetlist[] = [];
        for (const entrada of entradasPeticion) {
          if (entrada.tipo === "separador") {
            entradas.push({ tipo: "separador", titulo: entrada.titulo });
            continue;
          }
          if (!entrada.archivoNombre) continue;
          const datosBase64 = await leerPdfComoBase64(carpetaHandle, entrada.archivoNombre);
          entradas.push({ tipo: "obra", titulo: entrada.titulo, nombreArchivo: entrada.archivoNombre, datosBase64 });
        }
        const xml = construir4ss(titulo, entradas);
        descargarTexto(xml, `${titulo.replace(/[\\/:*?"<>|]/g, "_")}.4ss`, "application/xml");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  const listaSinResolver = filas.filter((f) => f.resultado.tipo === "ambiguo" || f.resultado.tipo === "sin_match").length;

  return (
    <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Alborada · Setlists para forScore</h1>
        <p className="text-sm opacity-70">
          Sube la ficha del evento (Word), revisa qué partitura va con cada obra, y genera la
          setlist lista para importar en forScore.
        </p>
      </header>

      <section className="border rounded-lg p-4 flex flex-col gap-3">
        <h2 className="font-medium">1. Biblioteca de partituras</h2>
        <div className="flex gap-2 text-sm">
          <button
            className={`px-3 py-1.5 rounded border ${modo === "local" ? "bg-black text-white" : ""}`}
            onClick={() => setModo("local")}
            disabled={!soportaFileSystemAccess()}
          >
            Carpeta local
          </button>
          <button
            className={`px-3 py-1.5 rounded border ${modo === "nube" ? "bg-black text-white" : ""}`}
            onClick={() => setModo("nube")}
          >
            Biblioteca en la nube
          </button>
        </div>

        {!soportaFileSystemAccess() && (
          <p className="text-xs text-amber-700">
            Este navegador no permite acceder a una carpeta local (funciona en Chrome/Edge de
            escritorio). Usa la biblioteca en la nube.
          </p>
        )}

        {modo === "local" ? (
          <div className="flex items-center gap-3 text-sm">
            <button onClick={onElegirCarpeta} className="px-3 py-1.5 rounded border">
              {carpetaHandle ? "Cambiar carpeta" : "Elegir carpeta de partituras"}
            </button>
            <span className="opacity-70">
              {carpetaHandle ? `${archivosBiblioteca.length} PDF encontrados` : "Ninguna carpeta elegida"}
            </span>
          </div>
        ) : (
          <GestionBibliotecaNube
            archivos={archivosBiblioteca}
            onCambiado={() =>
              fetch("/api/biblioteca")
                .then((r) => r.json())
                .then((d) => setArchivosBiblioteca(d.archivos.map((a: { nombre: string }) => a.nombre)))
            }
          />
        )}
      </section>

      <section className="border rounded-lg p-4 flex flex-col gap-3">
        <h2 className="font-medium">2. Ficha del evento</h2>
        <input
          type="file"
          accept=".docx,.doc"
          onChange={(e) => e.target.files?.[0] && onSubirFicha(e.target.files[0])}
          className="text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={insertarSeparadores}
            onChange={(e) => onCambiarSeparadores(e.target.checked)}
          />
          Insertar una página separadora entre cada momento del evento
        </label>
      </section>

      {cargando && <p className="text-sm opacity-70">{cargando}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {evento && (
        <section className="border rounded-lg p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-medium">3. Revisar obras y partituras</h2>
            <div className="flex items-center gap-3">
              {listaSinResolver > 0 && (
                <span className="text-xs text-amber-700">{listaSinResolver} obra(s) por confirmar</span>
              )}
              <span className="text-xs opacity-60">
                {metodoExtraccion === "ia" ? "extraído con Claude" : "extraído por reglas (gratis)"}
              </span>
              {metodoExtraccion === "heuristico" && (
                <button onClick={onAfinarConIA} className="text-xs underline disabled:opacity-40" disabled={!!cargando}>
                  ¿No es correcto? Afinar con IA
                </button>
              )}
            </div>
          </div>

          {evento.momentos.map((momento) => (
            <div key={momento.nombre} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold opacity-80">{momento.nombre}</h3>
              {momento.obras.map((obra) => {
                const indice = filas.findIndex(
                  (f) => f.momento === momento.nombre && f.titulo === obra.titulo && f.compositor === obra.compositor
                );
                const fila = filas[indice];
                if (!fila) return null;
                return (
                  <FilaObraUI
                    key={`${momento.nombre}-${obra.titulo}-${obra.compositor}`}
                    fila={fila}
                    archivosBiblioteca={archivosBiblioteca}
                    onCambiarSeleccion={(nombre) => onCambiarSeleccion(indice, nombre)}
                    onCambiarRecordar={(recordar) => onCambiarRecordar(indice, recordar)}
                  />
                );
              })}
            </div>
          ))}

          <button
            onClick={onGenerarSetlist}
            className="self-start px-4 py-2 rounded bg-black text-white text-sm font-medium disabled:opacity-40"
            disabled={!!cargando || (modo === "local" && !carpetaHandle)}
          >
            Generar setlist (.4ss)
          </button>
        </section>
      )}
    </main>
  );
}

function FilaObraUI({
  fila,
  archivosBiblioteca,
  onCambiarSeleccion,
  onCambiarRecordar,
}: {
  fila: FilaObra;
  archivosBiblioteca: string[];
  onCambiarSeleccion: (nombre: string | null) => void;
  onCambiarRecordar: (recordar: boolean) => void;
}) {
  const candidatos: CandidatoMatch[] = fila.resultado.tipo === "ambiguo" ? fila.resultado.candidatos : [];
  const esAmbiguo = fila.resultado.tipo === "ambiguo";
  const sinMatch = fila.resultado.tipo === "sin_match" || (fila.resultado.tipo === "recordado" && !fila.resultado.archivo);

  return (
    <div className={`flex flex-col gap-1 rounded border p-2 text-sm ${esAmbiguo || sinMatch ? "border-amber-400" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span>
          {fila.titulo}
          {fila.compositor ? ` — ${fila.compositor}` : ""}
        </span>
        <span className="text-xs opacity-60">
          {fila.resultado.tipo === "automatico" && "coincidencia automática"}
          {fila.resultado.tipo === "recordado" && "elección recordada"}
          {fila.resultado.tipo === "ambiguo" && "varias posibles — elige una"}
          {fila.resultado.tipo === "sin_match" && "sin partitura encontrada"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <select
          className="border rounded px-2 py-1 flex-1"
          value={fila.archivoSeleccionado ?? ""}
          onChange={(e) => onCambiarSeleccion(e.target.value || null)}
        >
          <option value="">— No adjuntar ninguna partitura —</option>
          {(esAmbiguo ? candidatos.map((c) => c.archivo.nombre) : archivosBiblioteca).map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
          {!esAmbiguo &&
            fila.archivoSeleccionado &&
            !archivosBiblioteca.includes(fila.archivoSeleccionado) && (
              <option value={fila.archivoSeleccionado}>{fila.archivoSeleccionado}</option>
            )}
        </select>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs">
          <input type="checkbox" checked={fila.recordar} onChange={(e) => onCambiarRecordar(e.target.checked)} />
          recordar para la próxima vez
        </label>
      </div>
    </div>
  );
}

function GestionBibliotecaNube({ archivos, onCambiado }: { archivos: string[]; onCambiado: () => void }) {
  const [subiendo, setSubiendo] = useState(false);

  async function onSubirArchivos(files: FileList) {
    setSubiendo(true);
    try {
      const formData = new FormData();
      for (const f of Array.from(files)) formData.append("archivos", f);
      await fetch("/api/biblioteca", { method: "POST", body: formData });
      onCambiado();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <input
        type="file"
        accept=".pdf"
        multiple
        disabled={subiendo}
        onChange={(e) => e.target.files && onSubirArchivos(e.target.files)}
      />
      <span className="opacity-70">{archivos.length} partituras en la biblioteca en la nube</span>
    </div>
  );
}
