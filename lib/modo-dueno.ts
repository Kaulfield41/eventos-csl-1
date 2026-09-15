"use client";

const CLAVE_DUENO = "eventos-csl-1-dueno";

/**
 * Determina (y, si toca, activa) el modo "dueño" para este navegador concreto.
 * Visitar la app con ?dueno=1 una sola vez deja una marca en localStorage; a partir de
 * ahí, ESTE navegador se trata como el dueño (decisiones/preferencias en Netlify Blobs
 * como hasta ahora, biblioteca en la nube editable, acceso a Correo/Pendientes). Sin esa
 * marca (cualquier otro navegador, por defecto) la app trata a quien entra como
 * invitado: decisiones/preferencias solo en su propio navegador, sin poder subir nada a
 * la biblioteca en la nube ni ver Correo/Pendientes.
 *
 * OJO: esto NO es una medida de seguridad real. Toda la app sigue detrás de un único
 * usuario/contraseña compartido (`proxy.ts`); esta marca vive solo en el navegador y no
 * se verifica en el servidor, así que alguien con conocimientos técnicos podría saltarse
 * la restricción llamando a las rutas /api directamente. Es una salvaguarda de interfaz
 * para evitar que un invitado de confianza toque tus datos reales sin querer, no una
 * separación de permisos de verdad — eso requeriría cuentas reales (ver roadmap).
 */
export function determinarModoDueno(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dueno") === "1") {
      localStorage.setItem(CLAVE_DUENO, "1");
      params.delete("dueno");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    }
    return localStorage.getItem(CLAVE_DUENO) === "1";
  } catch {
    // localStorage no disponible (Safari privado, etc.): se trata como invitado.
    return false;
  }
}
