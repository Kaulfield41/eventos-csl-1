# Alborada · Setlists para forScore

Convierte la ficha de un evento musical (Word, con el programa organizado por momentos)
en una setlist de forScore (`.4ss`) lista para importar, con las partituras (PDF) ya
adjuntas dentro del archivo.

Hermano del prototipo original en `../App obras Alborada/` (extracción y conteo de
obras con Claude); esta app añade el emparejamiento con partituras reales y la
generación del `.4ss`.

## Cómo funciona

1. **Sube la ficha** (`.docx` o `.doc`) del evento.
2. El texto se extrae y, **por defecto, se analiza por reglas** (`lib/extractor-heuristico.ts`):
   sin ninguna IA, sin coste, sin necesitar clave de ningún tipo — usa que los "momentos"
   de una boda/funeral salen de un vocabulario bastante cerrado, y que las obras casi
   siempre llevan comillas y una coma antes del compositor. Si el resultado no convence
   para una ficha en concreto, hay un botón **opcional** "Afinar con IA" que manda ese
   mismo texto a Claude (`ANTHROPIC_API_KEY`, ver `lib/extractor.ts`) para un segundo
   pase más fiable — pero nunca se llama a la IA automáticamente, solo si se pulsa.
3. Cada obra se compara contra los nombres de archivo de tu biblioteca de partituras
   (`lib/matching.ts`). Si hay una única coincidencia clara, se adjunta sola; si hay
   varias candidatas (duplicados, versiones distintas...) o ninguna, tú decides en
   pantalla — y puedes marcar "recordar esta elección" para que la próxima vez que
   aparezca esa misma obra no haga falta volver a elegir (`lib/store.ts`,
   `app/api/emparejar/route.ts`).
4. Opcionalmente se inserta una página separadora (`<placeholder>`) entre cada momento
   del evento (Entrada, Ofertorio...); esta preferencia también se recuerda.
5. La primera página del setlist es siempre un PDF-resumen de la ficha generado por la
   app (`lib/ficha-pdf.ts`, con el título, fecha, hora, parroquia, momentos/obras e
   intérpretes) — no es una réplica visual del Word original, pero da la misma
   referencia rápida sin depender de convertir `.docx` a PDF.
6. Se genera el `.4ss` (`lib/forscore.ts`) con los PDF embebidos en base64 — un único
   archivo que, al abrirlo en forScore, trae ya todo.

### Dos modos de biblioteca de partituras

- **Carpeta local** (recomendado si trabajas siempre desde el mismo ordenador): el
  navegador (Chrome/Edge de escritorio — API `showDirectoryPicker`) lee los PDF
  directamente de una carpeta de tu equipo. Los PDF nunca se suben a ningún sitio; el
  `.4ss` se genera en el propio navegador.
- **Biblioteca en la nube** (`/biblioteca`): subes tus PDF una vez y quedan disponibles
  desde cualquier dispositivo/navegador, incluidos los que no soportan acceso a carpetas
  locales (Safari, Firefox, móvil).

## Puesta en marcha

```bash
npm install
cp .env.example .env
# ANTHROPIC_API_KEY es OPCIONAL: sin ella la app funciona igual (extracción por
# reglas), solo se necesita si quieres que el botón "Afinar con IA" funcione.
```

Este proyecto usa **Netlify Blobs** para guardar las decisiones de emparejamiento
recordadas, las preferencias, la biblioteca en la nube y el historial de eventos (ver
"Estado" más abajo sobre por qué se eligió Blobs en vez de una base de datos aparte).
Blobs necesita ejecutarse con contexto de Netlify, así que en local se usa la CLI de
Netlify en vez de `next dev` a secas:

```bash
npm install -g netlify-cli   # una sola vez
netlify link                 # conecta esta carpeta con un sitio de Netlify (o `netlify init` para crear uno)
netlify dev                  # arranca la app en local con Blobs funcionando
```

Recuerda configurar `ANTHROPIC_API_KEY` también como variable de entorno del sitio en
Netlify (Site configuration → Environment variables) para que funcione una vez
desplegado, no solo en local.

## Desplegar

```bash
netlify deploy --prod
```

## Scripts de comprobación manual

No hay todavía suite de tests automatizada; estos scripts sirven para verificar a mano
las partes que no dependen de Netlify/Claude:

```bash
npx tsx scripts/test-docx.ts "ruta/a/una/ficha.docx"     # extracción de texto de .docx
npx tsx scripts/test-doc.ts "ruta/a/una/ficha.doc"       # extracción de texto de .doc antiguos
npx tsx scripts/test-matching.ts                          # emparejamiento obra -> partitura y XML .4ss
npx tsx scripts/test-cabecera.ts "ruta/a/una/ficha.docx" # tipo_evento/fecha/hora extraídos de la cabecera
npx tsx scripts/test-ficha-pdf.ts "ruta/a/una/ficha.docx" # genera el PDF-resumen de una ficha real
```

## Estado y roadmap

Primera versión pensada para el uso propio de Alborada (sin cuentas de cliente
todavía, pero con el modelo de datos ya preparado para añadirlas). Pendiente de forma
explícita para más adelante:

- **Vigilancia de correo electrónico**: revisar automáticamente si ha llegado una ficha
  nueva por email y dejarla lista para revisar en la app, sin tener que subirla a mano.
- **Multi-cliente**: login, biblioteca y preferencias aisladas por cliente, pensado para
  vender la app a otras empresas de música.
- Migrar de Netlify Blobs a Netlify DB (Postgres) si el historial de eventos crece
  mucho o hacen falta consultas más ricas en la pantalla de estadísticas.

Ver `/Users/csl/.claude/plans/valiant-launching-wirth.md` para el plan original con más contexto.
