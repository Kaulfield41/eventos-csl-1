@AGENTS.md

# Alborada · Setlists para forScore

App web (Next.js, desplegada en Netlify) que convierte la "ficha" de un evento
musical (Word, con el programa organizado por momentos) en una setlist de forScore
(`.4ss`) con las partituras ya adjuntas. Hermana del prototipo Python en
`../App obras Alborada/` (extracción y conteo de obras), pero es un proyecto
independiente — no reutiliza su código, solo su idea y sus datos de referencia.

Producción: **https://alborada-csl-1.netlify.app**

Ver `README.md` para cómo funciona la app desde el punto de vista del usuario, y
`/Users/csl/.claude/plans/valiant-launching-wirth.md` para el plan original y el del
agente de correo (Fase 2), con el razonamiento detrás de cada decisión.

## Cómo se construyó (para orientarte rápido en el código)

- **Extracción por defecto es heurística, no IA** (`lib/extractor-heuristico.ts`):
  gratis, sin clave de ningún tipo. Se apoya en que los "momentos" de una
  boda/funeral son un vocabulario bastante cerrado (`MOMENTOS_CONOCIDOS`) y en que
  las obras casi siempre llevan comillas/coma antes del compositor. Claude
  (`lib/extractor.ts`) solo entra si la persona pulsa "Afinar con IA" para una
  ficha en concreto — decisión explícita del usuario tras varias vueltas de
  conversación, no asumas que hace falta una clave de Anthropic para que la app
  funcione.
- **Persistencia con Netlify Blobs** (`lib/store.ts`), no una base de datos —
  decisión deliberada para simplificar el primer despliegue (ver el plan).
- **Emparejamiento obra→partitura** (`lib/matching.ts`): por palabras (no por
  distancia de texto sobre la cadena completa), porque los nombres de archivo reales
  llevan texto extra (compositor, tonalidad...) alrededor del título. Las palabras
  muy cortas están excluidas de la comparación por substring (ver `PALABRAS_VACIAS`)
  porque causaban falsos positivos reales.
- **Subida de partituras a la nube troceada** (`lib/upload-cliente.ts` +
  `app/api/biblioteca/chunk/route.ts`): las funciones de Netlify tienen un límite de
  ~4,5 MB por petición, muy por debajo de partituras reales (hasta 35 MB en la
  biblioteca real de Alborada, 424 MB en total). Cada PDF se trocea en fragmentos de
  3 MB en el navegador y se reensambla en el servidor.
- **`.4ss` autocontenido** (`lib/forscore.ts`): PDFs embebidos en base64 (confirmado
  contra la documentación oficial de forScore), con la ficha-resumen
  (`lib/ficha-pdf.ts`, generada con `pdf-lib`) siempre como primera página, y
  separadores `<placeholder>` entre momentos si esa preferencia está activada.
- **`accept` de los `<input type="file">` quitado a propósito**: en iOS Safari,
  incluso con el MIME type correcto, el selector de archivos dejaba todos los
  archivos "en gris" e inseleccionables desde "En mi iPad" (funcionaba desde
  "Recientes"). Se quitó el filtro del todo — el servidor ya valida la extensión y
  devuelve un error claro si el archivo no es el que toca.
- **Descargas como `application/octet-stream`, no `application/xml`**: Safari
  "corregía" la extensión del `.4ss` añadiendo `.xml` al final si se servía como XML.

## Rutina de desarrollo

Este proyecto usa Netlify Blobs, así que hace falta contexto de Netlify incluso en
local — `next dev` a secas no sirve para las rutas que usan `lib/store.ts`:

```bash
netlify dev      # arranca todo en local (http://localhost:8888) con Blobs funcionando
```

**Importante:** cada `netlify deploy --prod` dejaba el `netlify dev` en marcha con la
caché de funciones rota (error `ENOENT: run-config.json`, o peticiones que 404 en
~6ms sin log de error). Si vas a desplegar y seguir trabajando en local, para el
`netlify dev` antes de desplegar y vuelve a arrancarlo después.

```bash
npx tsc --noEmit -p tsconfig.json && npx eslint .   # antes de cualquier commit
npm run build                                        # antes de desplegar
netlify deploy --prod                                 # despliegue real
```
