import { intercambiarCodigo, obtenerCuentaConectada, urlCallbackDesdePeticion } from "@/lib/gmail";
import { guardarConfiguracionCorreo, obtenerConfiguracionCorreo } from "@/lib/store";

export const runtime = "nodejs";

/** Google vuelve aquí tras el consentimiento con un `code`; se cambia por los tokens reales. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(new URL(`/correo?error=${encodeURIComponent(error)}`, request.url), 302);
  }
  if (!code) {
    return Response.redirect(new URL("/correo?error=sin_codigo", request.url), 302);
  }

  const redirectUri = urlCallbackDesdePeticion(request);
  const tokens = await intercambiarCodigo(code, redirectUri);

  const anterior = await obtenerConfiguracionCorreo();
  const cuenta = await obtenerCuentaConectada(tokens).catch(() => null);
  await guardarConfiguracionCorreo({
    tokens,
    cuenta: cuenta ?? anterior?.cuenta ?? null,
    etiquetaId: anterior?.etiquetaId ?? null,
    etiquetaNombre: anterior?.etiquetaNombre ?? null,
    prefijoAsunto: anterior?.prefijoAsunto ?? null,
    ultimaRevision: anterior?.ultimaRevision ?? null,
  });

  return Response.redirect(new URL("/correo", request.url), 302);
}
