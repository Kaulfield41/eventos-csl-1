import { urlAutorizacion, urlCallbackDesdePeticion } from "@/lib/gmail";

export const runtime = "nodejs";

/** Redirige a la pantalla de consentimiento de Google para conectar la cuenta de Gmail. */
export async function GET(request: Request) {
  const redirectUri = urlCallbackDesdePeticion(request);
  return Response.redirect(urlAutorizacion(redirectUri), 302);
}
