"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { determinarModoDueno } from "@/lib/modo-dueno";

/**
 * Barra de navegación. "Biblioteca en la nube", "Pendientes" y "Correo" tocan datos o
 * acciones del dueño (subir/borrar partituras, la cuenta de Gmail del negocio, fichas
 * reales detectadas por correo) — se ocultan para cualquiera que no tenga el modo
 * "dueño" activado en su navegador (ver lib/modo-dueno.ts). No es un control de acceso
 * real (esas rutas siguen respondiendo si se llaman directamente), solo evita que un
 * invitado se encuentre con pantallas que no le corresponden.
 */
export default function Nav() {
  const [dueno, setDueno] = useState(false);

  useEffect(() => {
    (async () => {
      setDueno(determinarModoDueno());
    })();
  }, []);

  return (
    <nav className="border-b px-6 py-3 flex gap-4 text-sm">
      <Link href="/" className="font-medium hover:underline">
        Setlist
      </Link>
      {dueno && (
        <>
          <Link href="/biblioteca" className="hover:underline">
            Biblioteca en la nube
          </Link>
          <Link href="/pendientes" className="hover:underline">
            Pendientes
          </Link>
          <Link href="/correo" className="hover:underline">
            Correo
          </Link>
        </>
      )}
    </nav>
  );
}
