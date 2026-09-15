"use client";

import { useEffect, useRef, useState } from "react";
import type { EventoExtraido } from "@/lib/models";
import type { ResultadoMatch, CandidatoMatch } from "@/lib/matching";
import { construir4ss, type EntradaSetlist } from "@/lib/forscore";
import { construirFichaPdf, tituloEvento } from "@/lib/ficha-pdf";
import {
  soportaFileSystemAccess,
  recuperarCarpetaGuardada,
  asegurarPermisoLectura,
  elegirCarpeta,
  listarPdfs,
  leerPdfComoBase64,
  bytesABase64,
} from "@/lib/browser-fs";
import { subirPartiturasPorFragmentos } from "@/lib/upload-cliente";
import { determinarModoDueno } from "@/lib/modo-dueno";
import {
  obtenerDecisionesLocales,
  guardarDecisionLocal,
  borrarDecisionLocal,
  obtenerPreferenciasLocales,
  guardarPreferenciasLocales,
} from "@/lib/decisiones-locales";

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

export default function Home() {
  const [modo, setModo] = useState<Modo>("local");
  const [carpetaHandle, setCarpetaHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [archivosBiblioteca, setArchivosBiblioteca] = useState<string[]>([]);
  const [insertarSeparadores, setInsertarSeparadores] = useState(true);
  const [evento, setEvento] = useState<EventoExtraido | null>(null);
  const [filas, setFilas] = useState<FilaObra[]>([]);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [textoFicha, setTextoFicha] = useState<string | null>(null);
  const [metodoExtraccion, setMetodoExtraccion] = useState<"heuristico" | "ia" | null>(null);
  const [bibliotecaLista, setBibliotecaLista] = useState(false);
  const [restauracionLista, setRestauracionLista] = useState(false);
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const [dueno, setDueno] = useState(false);
  const pendienteCargado = useRef(false);

  // Al arrancar: decide si este navegador es "el dueño" o un invitado (ver
  // lib/modo-dueno.ts), recupera la carpeta local ya elegida en una sesión anterior (si
  // la hay), y carga la preferencia de separadores de momento (del servidor si es el
  // dueño, o del propio navegador si es invitado). Se usa `esDuenoAhora` en vez de leer
  // el estado `dueno` en este mismo efecto porque `setDueno` no se refleja hasta el
  // siguiente render. `restauracionLista` marca cuándo termina este intento, para que la
  // recarga de la biblioteca (siguiente efecto) no arranque antes con `carpetaHandle`
  // todavía a null y deje la lista vacía a medias.
  useEffect(() => {
    (async () => {
      const esDuenoAhora = determinarModoDueno();
      setDueno(esDuenoAhora);

      if (esDuenoAhora) {
        const preferencias = await fetch("/api/preferencias").then((r) => r.json());
        setInsertarSeparadores(preferencias.preferencias.insertarSeparadoresMomento);
      } else {
        setInsertarSeparadores(obtenerPreferenciasLocales().insertarSeparadoresMomento);
      }

      if (soportaFileSystemAccess()) {
        const handle = await recuperarCarpetaGuardada();
        if (handle && (await asegurarPermisoLectura(handle))) {
          setCarpetaHandle(handle);
        }
      } else {
        setModo("nube");
      }
      setRestauracionLista(true);
    })();
  }, []);

  // Recarga la lista de archivos disponibles cuando cambia el modo o la carpeta/biblioteca.
  useEffect(() => {
    if (!restauracionLista) return;
    (async () => {
      if (modo === "local") {
        if (!carpetaHandle) {
          setArchivosBiblioteca([]);
          setBibliotecaLista(true);
          return;
        }
        setArchivosBiblioteca(await listarPdfs(carpetaHandle));
      } else {
        const datos = await fetch("/api/biblioteca").then((r) => r.json());
        setArchivosBiblioteca(datos.archivos.map((a: { nombre: string }) => a.nombre));
      }
      setBibliotecaLista(true);
    })();
  }, [modo, carpetaHandle, restauracionLista]);

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
    if (dueno) {
      await fetch("/api/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insertarSeparadoresMomento: valor }),
      });
    } else {
      guardarPreferenciasLocales({ insertarSeparadoresMomento: valor });
    }
  }

  async function emparejarTodas(obras: ObraConMomento[]) {
    const respuesta = await fetch("/api/emparejar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        obras: obras.map((o) => ({ titulo: o.titulo, compositor: o.compositor })),
        archivos: archivosBiblioteca,
        ...(dueno ? {} : { decisionesLocales: obtenerDecisionesLocales() }),
      }),
    }).then((r) => r.json());

    const nuevasFilas: FilaObra[] = respuesta.resultados.map(
      (r: { obra: { titulo: string; compositor: string | null }; resultado: ResultadoMatch }, i: number) => {
        const resultado = r.resultado;
        let archivoSeleccionado: string | null = null;
        if (resultado.tipo === "automatico") archivoSeleccionado = resultado.archivo.nombre;
        else if (resultado.tipo === "recordado") archivoSeleccionado = resultado.archivo?.nombre ?? null;
        else if (resultado.tipo === "ambiguo") archivoSeleccionado = resultado.candidatos[0]?.archivo.nombre ?? null;
        return { ...obras[i], resultado, archivoSeleccionado, recordar: resultado.tipo === "recordado" };
      }
    );
    setFilas(nuevasFilas);
  }

  // Si se llega con ?pendiente=<id> (desde /pendientes), carga esa ficha ya detectada
  // por correo en vez de esperar una subida manual.
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      setPendienteId(params.get("pendiente"));
    })();
  }, []);

  useEffect(() => {
    if (!pendienteId || !bibliotecaLista || pendienteCargado.current) return;
    pendienteCargado.current = true;
    (async () => {
      setError(null);
      setCargando("Cargando la ficha pendiente...");
      try {
        const respuesta = await fetch(`/api/pendientes/${pendienteId}`).then((r) => r.json());
        if (respuesta.error) throw new Error(respuesta.error);
        const pendiente = respuesta.pendiente as { evento: EventoExtraido; texto: string; archivoOrigen: string };
        setEvento(pendiente.evento);
        setTextoFicha(pendiente.texto);
        setMetodoExtraccion("heuristico");
        const obras: ObraConMomento[] = pendiente.evento.momentos.flatMap((m) =>
          m.obras.map((o) => ({ momento: m.nombre, titulo: o.titulo, compositor: o.compositor }))
        );
        setCargando("Buscando partituras coincidentes...");
        await emparejarTodas(obras);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCargando(null);
      }
    })();
    // emparejarTodas se recrea en cada render (cierra sobre archivosBiblioteca);
    // incluirla en las dependencias causaría un bucle, y ya se controla con el ref
    // pendienteCargado que esto se ejecute una sola vez por pendiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendienteId, bibliotecaLista]);

  async function onSubirFicha(file: File) {
    setError(null);
    setAviso(null);
    setEvento(null);
    setFilas([]);
    setTextoFicha(null);
    setMetodoExtraccion(null);
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
        body: JSON.stringify({ texto: textoFicha }),
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

  async function guardarDecisionSiFija(fila: FilaObra, archivoNombre: string | null) {
    if (dueno) {
      await fetch("/api/emparejar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: fila.titulo, compositor: fila.compositor, archivoNombre }),
      });
    } else {
      guardarDecisionLocal(fila.titulo, fila.compositor, { archivoNombre });
    }
  }

  async function onCambiarSeleccion(indice: number, archivoNombre: string | null) {
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, archivoSeleccionado: archivoNombre } : f)));
    // Si esta obra ya estaba "fijada", la elección guardada tiene que seguir el cambio,
    // o se quedaría apuntando a la partitura anterior sin que se note.
    const fila = filas[indice];
    if (fila?.recordar) await guardarDecisionSiFija(fila, archivoNombre);
  }

  async function onCambiarRecordar(indice: number, recordar: boolean) {
    const fila = filas[indice];
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, recordar } : f)));
    if (recordar) {
      await guardarDecisionSiFija(fila, fila.archivoSeleccionado);
    } else if (dueno) {
      // Desmarcar "fijar" debe olvidar de verdad la decisión guardada, no solo dejar de
      // sincronizarla — si no, la próxima vez que aparezca esta obra se seguiría aplicando.
      await fetch("/api/emparejar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: fila.titulo, compositor: fila.compositor }),
      });
    } else {
      borrarDecisionLocal(fila.titulo, fila.compositor);
    }
  }

  async function onGenerarSetlist() {
    if (!evento) return;
    setError(null);
    setAviso(null);
    setCargando("Generando la setlist para forScore...");
    try {
      const titulo = tituloEvento(evento);
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
          body: JSON.stringify({ evento, entradas: entradasPeticion }),
        });
        if (!respuesta.ok) throw new Error((await respuesta.json()).error ?? "Error generando la setlist.");
        const avisoHeader = respuesta.headers.get("X-Avisos-Partituras-No-Encontradas");
        if (avisoHeader) {
          const nombres = decodeURIComponent(avisoHeader);
          setAviso(`Se generó la setlist, pero estas partituras no estaban en la biblioteca en la nube y se omitieron: ${nombres}`);
        } else {
          setAviso(null);
        }
        const xml = await respuesta.text();
        descargarTexto(xml, `${titulo.replace(/[\\/:*?"<>|]/g, "_")}.4ss`, "application/octet-stream");
      } else {
        if (!carpetaHandle) throw new Error("Elige primero la carpeta de partituras.");
        const entradas: EntradaSetlist[] = [];

        // La ficha-resumen va siempre primera, antes que cualquier momento u obra.
        const fichaPdf = await construirFichaPdf(evento);
        entradas.push({
          tipo: "obra",
          titulo: "Ficha del evento",
          nombreArchivo: "Ficha del evento.pdf",
          datosBase64: bytesABase64(fichaPdf),
        });

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
        descargarTexto(xml, `${titulo.replace(/[\\/:*?"<>|]/g, "_")}.4ss`, "application/octet-stream");
      }

      // Si esta ficha venía de "Pendientes" (detectada por correo), al confirmarla
      // generando la setlist desaparece de la cola.
      if (pendienteId) {
        await fetch(`/api/pendientes/${pendienteId}`, { method: "DELETE" });
        // Quita "?pendiente=..." de la URL: si no, un refresco posterior intenta
        // recargar un pendiente que ya no existe y muestra un error falso.
        window.history.replaceState(null, "", window.location.pathname);
        setPendienteId(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  const listaSinResolver = filas.filter((f) => !f.recordar).length;

  return (
    <main className="mx-auto max-w-3xl w-full p-6 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Eventos-csl-1 para forScore</h1>
        <p className="text-sm opacity-70">
          Sube la ficha del evento (Word), revisa qué partitura va con cada obra, y genera la
          setlist lista para importar en forScore.
        </p>
        {!dueno && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 self-start">
            Modo invitado: tus decisiones y preferencias se guardan solo en este navegador, y
            no puedes subir partituras a la biblioteca en la nube del dueño.
          </p>
        )}
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
      {aviso && <p className="text-sm text-amber-700">{aviso}</p>}

      {evento && (
        <section className="border rounded-lg p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-medium">3. Revisar obras y partituras</h2>
            <div className="flex items-center gap-3">
              {listaSinResolver > 0 && (
                <span className="text-xs text-red-600">{listaSinResolver} obra(s) sin fijar</span>
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
  // Lo que se destaca es si la elección todavía no está fijada para siempre — no si hay
  // o no una partitura seleccionada ahora mismo (eso ya se ve en el propio buscador).
  const sinFijar = !fila.recordar;

  return (
    <div className={`flex flex-col gap-1 rounded border p-2 text-sm ${sinFijar ? "border-red-400 bg-red-50 dark:bg-red-950/30" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words">
          {fila.titulo}
          {fila.compositor ? ` — ${fila.compositor}` : ""}
        </span>
        <span className={`shrink-0 whitespace-nowrap text-xs ${sinFijar ? "text-red-600" : "opacity-60"}`}>
          {fila.resultado.tipo === "automatico" && "coincidencia automática"}
          {fila.resultado.tipo === "recordado" && "elección recordada"}
          {fila.resultado.tipo === "ambiguo" && "varias posibles — elige una"}
          {fila.resultado.tipo === "sin_match" && "sin partitura encontrada"}
          {sinFijar ? " · sin fijar" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BuscadorPartitura
          valor={fila.archivoSeleccionado}
          candidatos={candidatos}
          archivosBiblioteca={archivosBiblioteca}
          onCambiar={onCambiarSeleccion}
        />
        <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs">
          <input type="checkbox" checked={fila.recordar} onChange={(e) => onCambiarRecordar(e.target.checked)} />
          fijar esta partitura para esta obra siempre
        </label>
      </div>
    </div>
  );
}

/**
 * Buscador con autocompletado para elegir la partitura de una obra. Sustituye a un
 * <select> normal porque con bibliotecas de cientos de PDF (ej. una biblioteca real de
 * 439 partituras) un desplegable nativo es inmanejable — aquí se escribe y filtra al
 * momento, con "ninguna partitura" siempre disponible arriba del todo.
 */
function BuscadorPartitura({
  valor,
  candidatos,
  archivosBiblioteca,
  onCambiar,
}: {
  valor: string | null;
  candidatos: CandidatoMatch[];
  archivosBiblioteca: string[];
  onCambiar: (nombre: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");
  // Sincroniza el texto mostrado con `valor` cuando cambia desde fuera (patrón de React
  // para "ajustar el estado cuando cambia una prop", hecho durante el render en vez de
  // en un efecto: https://react.dev/learn/you-might-not-need-an-effect).
  const [ultimoValor, setUltimoValor] = useState(valor);
  if (valor !== ultimoValor) {
    setUltimoValor(valor);
    setTexto(valor ?? "");
  }
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alPulsarFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setTexto(valor ?? "");
      }
    }
    document.addEventListener("mousedown", alPulsarFuera);
    return () => document.removeEventListener("mousedown", alPulsarFuera);
  }, [valor]);

  function elegir(nombre: string | null) {
    onCambiar(nombre);
    setTexto(nombre ?? "");
    setAbierto(false);
  }

  const filtro = texto.trim().toLowerCase();
  const nombresSugeridos = new Set(candidatos.map((c) => c.archivo.nombre));
  const resto = archivosBiblioteca.filter((n) => !nombresSugeridos.has(n)).sort();
  const filtrar = (lista: string[]) => (filtro ? lista.filter((n) => n.toLowerCase().includes(filtro)) : lista);
  const sugeridasFiltradas = filtrar(candidatos.map((c) => c.archivo.nombre));
  const restoFiltrado = filtrar(resto);

  return (
    <div className="relative min-w-0 flex-1" ref={contenedorRef}>
      <input
        className="border rounded px-2 py-1 w-full"
        placeholder="— Ninguna partitura — (escribe para buscar)"
        value={texto}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAbierto(false);
            setTexto(valor ?? "");
          }
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
      />
      {abierto && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border bg-[var(--background)] text-[var(--foreground)] shadow-lg">
          <button
            type="button"
            className="block w-full break-words text-left px-2 py-1 italic opacity-70 hover:bg-black/5"
            onClick={() => elegir(null)}
          >
            — No adjuntar ninguna partitura —
          </button>
          {sugeridasFiltradas.length > 0 && (
            <>
              <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide opacity-50">Sugeridas</div>
              {sugeridasFiltradas.map((nombre) => (
                <button
                  key={nombre}
                  type="button"
                  className="block w-full break-words text-left px-2 py-1 hover:bg-black/5"
                  onClick={() => elegir(nombre)}
                >
                  {nombre}
                </button>
              ))}
            </>
          )}
          <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide opacity-50">
            {sugeridasFiltradas.length > 0 ? "Resto de la biblioteca" : "Biblioteca"}
          </div>
          {restoFiltrado.length === 0 ? (
            <div className="px-2 py-1 italic opacity-50">Sin resultados</div>
          ) : (
            restoFiltrado.map((nombre) => (
              <button
                key={nombre}
                type="button"
                className="block w-full break-words text-left px-2 py-1 hover:bg-black/5"
                onClick={() => elegir(nombre)}
              >
                {nombre}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GestionBibliotecaNube({ archivos, onCambiado }: { archivos: string[]; onCambiado: () => void }) {
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubirArchivos(files: FileList) {
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
      onCambiado();
    } finally {
      setProgreso(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <input
        type="file"
        multiple
        disabled={!!progreso}
        onChange={(e) => e.target.files && onSubirArchivos(e.target.files)}
      />
      {progreso && <span className="text-xs opacity-70">{progreso}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      <span className="opacity-70">{archivos.length} partituras en la biblioteca en la nube</span>
    </div>
  );
}
