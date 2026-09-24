@AGENTS.md

# Eventos-csl-1 para forScore

App web (Next.js, desplegada en Netlify) que convierte la "ficha" de un evento
musical (Word, con el programa organizado por momentos) en una setlist de forScore
(`.4ss`) con las partituras ya adjuntas. Hermana de un prototipo Python anterior
(extracción y conteo de obras), pero es un proyecto independiente — no reutiliza su
código, solo su idea y sus datos de referencia.

Ver `README.md` para cómo funciona la app desde el punto de vista del usuario.

Toda la web (páginas y API) exige usuario/contraseña (`proxy.ts`, variables de entorno
`APP_USERNAME`/`APP_PASSWORD`) — no hay ningún sistema de cuentas todavía, así que esto
es lo mínimo para no dejarla abierta a cualquiera.

## Cómo se construyó (para orientarte rápido en el código)

- **Extracción por defecto es heurística, no IA** (`lib/extractor-heuristico.ts`):
  gratis, sin clave de ningún tipo. Detecta el título de cada parte del evento
  combinando dos señales: un vocabulario bastante cerrado (`MOMENTOS_CONOCIDOS`) y que
  la línea completa esté en negrita en el `.docx` original (`lib/docx.ts`,
  `LineaFicha.negrita`) — así se reconocen también títulos reales que no están en la
  lista, incluido el primer momento de la ficha (confirmado contra fichas reales: "La
  Paz", "Recepción" a secas sin "de Invitados/feligreses" — bug real de producción,
  2026-09-24 —, "Lecturas" con nombre de quien lee, "Condolencias y Salida"...). Las
  únicas guardas reales contra falsos positivos son el filtro de líneas de cabecera
  (`esLineaDeCabecera`) y el límite de 8 palabras — comprobado que ninguna nota/título
  en negrita antes del programa, en las fichas reales de este proyecto, sobrevive a
  esos dos filtros. El color del título no se usa como señal porque no es consistente
  entre fichas (solo la negrita lo es). Los `.doc` antiguos no tienen negrita
  disponible (`lib/doc-legacy.ts`), así que ahí sigue dependiendo solo del vocabulario.
  Y las obras casi siempre llevan comillas/coma antes del compositor. Claude
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
  ~4,5 MB por petición, muy por debajo de partituras reales (hasta 35 MB en una
  biblioteca real, 424 MB en total). Cada PDF se trocea en fragmentos de 3 MB en el
  navegador y se reensambla en el servidor.
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
- **Modo dueño vs. invitado** (`lib/modo-dueno.ts`, `lib/decisiones-locales.ts`): dos
  perfiles de uso sin necesitar cuentas reales todavía. El cómo y el porqué están
  comentados en esos dos archivos — léelos antes de tocar nada relacionado.
- **Agente de correo** (`netlify/functions/revisar-correo.mts`, `lib/gmail.ts`): función
  programada de Netlify que revisa la cuenta de Gmail conectada, extrae fichas nuevas con
  la misma heurística que la subida manual, y las deja en Pendientes — nunca genera ni
  sube un `.4ss` sola. Si **todas** las obras de la ficha ya tienen una decisión de
  emparejamiento fijada de antes (archivo real o "sin partitura" explícito —
  `lib/store.ts`, `todasLasObrasResueltas`), además responde al correo original (mismo
  hilo, `In-Reply-To`/`References`) avisando de que no hace falta revisar el
  emparejamiento; la ficha se sigue guardando en Pendientes igual, es solo un aviso de
  cortesía. Requiere el alcance `gmail.send` además del `gmail.readonly` original —
  cualquier cuenta conectada antes de este cambio necesita reconectarse en `/correo` para
  que el envío funcione (falla en silencio, solo con un log, mientras tanto). El texto de
  la respuesta ("Hola, Gonzalo: Ficha recibida, todo ok. Un abrazo.") lleva un nombre real
  a propósito — es quien manda las fichas, decisión explícita del usuario de dejarlo
  fijo en el código en vez de en una variable de entorno. El token de OAuth se cifra en
  reposo (AES-256-GCM, `lib/token-cifrado.ts`, clave en `GMAIL_TOKEN_ENCRYPTION_KEY`) —
  `lib/store.ts` lo hace de forma transparente para quien llama; una config ya guardada en
  texto plano (de antes de este cambio) se sigue leyendo igual, y se sobreescribe cifrada
  sola en la siguiente escritura, sin script de migración aparte.
- **No hay historial de eventos ni pantalla de estadísticas, a propósito**: existieron
  (`/estadisticas`, `guardarEventoHistorial` en `lib/store.ts`) y se quitaron — las
  estadísticas del negocio vivirán en otra app aparte. No reintroducir esa persistencia
  sin comprobar que esto sigue siendo así.
- **Quedan dos menciones a "alborada" en el código, y son intencionadas** (el resto
  del repo ya se genericizó al hacerlo público):
  - Los nombres de los stores en `lib/store.ts` (prefijo `alborada-`) son claves
    reales ya en uso en producción — renombrarlas sin migrar los datos existentes
    hace que la app deje de ver la biblioteca/config/decisiones ya guardadas.
  - `MARCADORES_FIN_PROGRAMA` en `lib/extractor-heuristico.ts` incluye la frase
    `"alborada eventos musicales"`: no es una marca puesta en el código, es el texto
    literal con el que las fichas reales usadas para probar la app firman al final
    del documento (p.ej. "Organiza: Alborada Eventos Musicales"). La heurística la
    usa para saber dónde termina la lista de obras/momentos y dejar de intentar
    extraer más piezas; quitarla rompe esa detección en esas fichas reales.

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

**Los despliegues a producción cuestan créditos de verdad** (plan gratuito: 300
créditos/mes, cada `netlify deploy --prod` consume ~15 — el uso normal de la app en sí,
peticiones/cómputo/ancho de banda, es prácticamente gratis en comparación). No
desplegar después de cada cambio pequeño: comitear y hacer `git push` no cuesta nada,
así que hay que acumular varios cambios y desplegar de una vez. Comprobar los créditos
restantes en el dashboard de Netlify (Billing → Usage) antes de un despliegue si hay
dudas.

```bash
npx tsc --noEmit -p tsconfig.json && npx eslint . && npm test   # antes de cualquier commit
npm run build                                                     # antes de desplegar
netlify deploy --prod                                              # despliegue real
```

**Suite de tests con Vitest** (`lib/*.test.ts`, `npm test`): cubre solo los módulos puros
de `lib/` (extracción heurística, matching, `.4ss`, modelos, PDF-resumen) — nada de UI ni
de los módulos con red/Blobs/DOM (`lib/store.ts`, `lib/gmail.ts`, `lib/extractor.ts`...).
Los fixtures son siempre inventados (el repo es público): para `.docx` sintéticos se usa
`lib/test-helpers/docx-fixture.ts` en vez de un archivo real. Los `scripts/test-*.ts`
siguen aparte, tal cual — sirven para depurar a ojo contra una ficha real que aportes tú
mismo, algo que la suite automática no puede hacer.
