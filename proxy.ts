import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Autenticación básica (usuario/contraseña) para toda la app: como no hay ningún
 * sistema de cuentas todavía (ver plan, fase multi-cliente pendiente), esto es lo
 * mínimo para que la web no quede abierta a cualquiera que tenga o adivine la URL,
 * sobre todo con el repositorio en un lugar público.
 */
export function proxy(request: NextRequest) {
  const usuario = process.env.APP_USERNAME;
  const clave = process.env.APP_PASSWORD;

  // Sin credenciales configuradas no hay forma de verificar nada: se bloquea por
  // defecto en vez de dejar la app abierta por un despiste de configuración.
  if (!usuario || !clave) {
    return new Response("Acceso no configurado (faltan APP_USERNAME/APP_PASSWORD).", { status: 503 });
  }

  const cabecera = request.headers.get("authorization");
  if (cabecera?.startsWith("Basic ")) {
    const decodificado = Buffer.from(cabecera.slice("Basic ".length), "base64").toString("utf-8");
    const separador = decodificado.indexOf(":");
    const usuarioRecibido = decodificado.slice(0, separador);
    const claveRecibida = decodificado.slice(separador + 1);
    if (usuarioRecibido === usuario && claveRecibida === clave) {
      return NextResponse.next();
    }
  }

  return new Response("Autenticación requerida.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Eventos-csl-1"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
