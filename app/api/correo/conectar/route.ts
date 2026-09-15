import { urlAutorizacion } from "@/lib/gmail";

export const runtime = "nodejs";

/** Redirige a la pantalla de consentimiento de Google para conectar la cuenta de Gmail. */
export async function GET(request: Request) {
  const redirectUri = new URL("/api/correo/callback", request.url).toString();
  return Response.redirect(urlAutorizacion(redirectUri), 302);
}
