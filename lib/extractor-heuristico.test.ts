import { describe, it, expect } from "vitest";
import { extraerEventoHeuristico } from "./extractor-heuristico";
import type { LineaFicha } from "./docx";

function l(texto: string, negrita = false): LineaFicha {
  return { texto, negrita };
}

describe("cabecera", () => {
  it("extrae el tipo de evento", () => {
    const evento = extraerEventoHeuristico([l("Tipo de Evento: Boda"), l("Ofertorio")]);
    expect(evento.tipo_evento).toBe("Boda");
  });

  it("extrae la fecha en ISO", () => {
    const evento = extraerEventoHeuristico([
      l("Día: 4 de septiembre de 2026"),
      l("Ofertorio"),
    ]);
    expect(evento.fecha).toBe("2026-09-04");
  });

  it("acepta la variante 'setiembre'", () => {
    const evento = extraerEventoHeuristico([
      l("Día: 10 de setiembre de 2026"),
      l("Ofertorio"),
    ]);
    expect(evento.fecha).toBe("2026-09-10");
  });

  it("extrae la hora del evento e ignora la hora de Cita", () => {
    const evento = extraerEventoHeuristico([
      l("Cita: 17:00h"),
      l("Hora de la Boda: 18:30h"),
      l("Ofertorio"),
    ]);
    expect(evento.hora).toBe("18:30");
  });

  it("corta la cabecera en el primer momento reconocido: campos posteriores se ignoran", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Tipo de Evento: Boda")]);
    expect(evento.tipo_evento).toBeNull();
  });

  it("fecha y hora quedan null si no hay nada que parsear", () => {
    const evento = extraerEventoHeuristico([l("Algo sin fecha ni hora"), l("Ofertorio")]);
    expect(evento.fecha).toBeNull();
    expect(evento.hora).toBeNull();
  });
});

describe("detección de momentos — vocabulario", () => {
  it("coincidencia exacta", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio")]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
  });

  it("coincidencia por prefijo (startsWith)", () => {
    const evento = extraerEventoHeuristico([l("Entrada de la Novia y su Padre")]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Entrada de la Novia y su Padre"]);
  });

  it("momentos encadenados por coma, ambos conocidos (includes)", () => {
    const evento = extraerEventoHeuristico([l("Rito del Matrimonio, Consentimiento")]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Rito del Matrimonio, Consentimiento"]);
  });
});

describe("negrita dentro del programa — regresión: 'La Paz' (bug de esta sesión)", () => {
  it("una línea en negrita no catalogada, ya dentro del programa, se detecta como momento nuevo", () => {
    const evento = extraerEventoHeuristico([
      l("Ofertorio"),
      l("Ave María, F. Schubert"),
      l("La Paz", true),
      l("Dona nobis pacem, W.A.Mozart"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio", "La Paz"]);
    expect(evento.momentos[1].obras).toEqual([
      { titulo: "Dona nobis pacem", compositor: "W.A.Mozart" },
    ]);
  });

  it("una línea no catalogada y sin negrita dentro del programa no crea un momento", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Algo cualquiera sin negrita")]);
    expect(evento.momentos).toHaveLength(1);
  });
});

describe("negrita como PRIMER momento de la ficha — regresión: 'Recepción' (bug real de producción, 2026-09-24)", () => {
  it("un momento no catalogado en negrita, como primera línea de la ficha, arranca el programa", () => {
    // Bug real: una ficha cuyo primer momento era simplemente "Recepción" (sin "de
    // Invitados"/"de feligreses", no está en MOMENTOS_CONOCIDOS) se perdía por completo,
    // junto con sus obras, porque antes solo el vocabulario podía arrancar el programa —
    // la negrita solo contaba para momentos DENTRO de un programa ya empezado.
    const evento = extraerEventoHeuristico([
      l("Recepción", true),
      l("Aria de la Suite nº3 en Re mayor, J.S.Bach"),
      l("Introito"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Recepción", "Introito"]);
    expect(evento.momentos[0].obras).toEqual([
      { titulo: "Aria de la Suite nº3 en Re mayor", compositor: "J.S.Bach" },
    ]);
  });

  it("una línea de cabecera en negrita (ej. la fila 'Componente') no arranca el programa", () => {
    const evento = extraerEventoHeuristico([
      l("Componente     Teléfono Vive en Zona", true),
      l("Recepción", true),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Recepción"]);
  });

  it("una nota larga en negrita (más de 8 palabras) antes del programa no se confunde con un momento", () => {
    const evento = extraerEventoHeuristico([
      l("Que no suene nada muy triste durante toda la ceremonia por favor gracias", true),
      l("Recepción de feligreses"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Recepción de feligreses"]);
  });
});

describe("pareceObraConCompositor — regresión: 'Aleluya, Misa Coral en Re, F. Palazón' (bug de esta sesión)", () => {
  it("una obra titulada igual que un momento (con compositor) no se confunde con el momento", () => {
    const evento = extraerEventoHeuristico([
      l("Ofertorio"),
      l("Aleluya, Misa Coral en Re, F. Palazón"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
    expect(evento.momentos[0].obras).toEqual([
      { titulo: "Aleluya, Misa Coral en Re", compositor: "F. Palazón" },
    ]);
  });

  it("dos momentos reales encadenados por coma se siguen detectando (el guard no los rompe)", () => {
    const evento = extraerEventoHeuristico([
      l("Ofertorio"),
      l("Rito del Matrimonio, Consentimiento"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual([
      "Ofertorio",
      "Rito del Matrimonio, Consentimiento",
    ]);
  });

  it("una línea con coma cuyo último trozo no acaba como nombre no activa el guard", () => {
    // "amén" empieza en minúscula: terminaComoNombre da false, así que
    // pareceObraConCompositor no la rechaza, y sigue el camino normal de vocabulario.
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Santo, amén")]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio", "Santo, amén"]);
  });
});

describe("partirObra (vía extraerEventoHeuristico, dentro de un momento abierto)", () => {
  it("título entre comillas + coma + compositor", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l('"Ave María", F. Schubert')]);
    expect(evento.momentos[0].obras).toEqual([{ titulo: "Ave María", compositor: "F. Schubert" }]);
  });

  it("coma sin comillas", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Panis Angelicus, C. Franck")]);
    expect(evento.momentos[0].obras).toEqual([
      { titulo: "Panis Angelicus", compositor: "C. Franck" },
    ]);
  });

  it("sin coma: obra anónima, compositor null", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Salve Popular Rociera")]);
    expect(evento.momentos[0].obras).toEqual([
      { titulo: "Salve Popular Rociera", compositor: null },
    ]);
  });

  it("quita el paréntesis final antes de parsear título/compositor", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Adagio (Instrumental)")]);
    expect(evento.momentos[0].obras).toEqual([{ titulo: "Adagio", compositor: null }]);
  });

  it("una continuación en minúscula se ignora, no se añade como obra", () => {
    const evento = extraerEventoHeuristico([
      l("Ofertorio"),
      l("de Bach, continuación en minúscula"),
    ]);
    expect(evento.momentos[0].obras).toEqual([]);
  });

  it("si el 'compositor' deducido no acaba pareciendo un nombre, la obra se descarta", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Preludio, para violín y piano")]);
    expect(evento.momentos[0].obras).toEqual([]);
  });
});

describe("fin del programa / cabecera / tablas", () => {
  it("una línea que empieza por 'Notas' detiene todo el análisis posterior", () => {
    const evento = extraerEventoHeuristico([
      l("Ofertorio"),
      l("Ave María, F. Schubert"),
      l("Notas:"),
      l("Bendición Final"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
  });

  it("una línea que empieza por 'Organiza' detiene el análisis", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Organiza"), l("Bendición Final")]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
  });

  it("la firma real 'Alborada Eventos Musicales' detiene el análisis", () => {
    const evento = extraerEventoHeuristico([
      l("Ofertorio"),
      l("Alborada Eventos Musicales:  /telfs: 655 49.39.91"),
      l("Bendición Final"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
  });

  it("una línea de tabla (con ' | ') corta el análisis inmediatamente", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio"), l("Violín | Carlos | 600000000")]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
  });

  it("las líneas de cabecera se saltan y no se confunden con obras", () => {
    const evento = extraerEventoHeuristico([
      l("Lugar: Parroquia de Santa Bárbara"),
      l("Colocación: Según se mira el altar a la izquierda."),
      l("Tlf: 123456"),
      l("Ofertorio"),
    ]);
    expect(evento.momentos.map((m) => m.nombre)).toEqual(["Ofertorio"]);
  });
});

describe("forma del resultado", () => {
  it("sin líneas, todos los campos quedan vacíos", () => {
    const evento = extraerEventoHeuristico([]);
    expect(evento).toEqual({
      tipo_evento: null,
      fecha: null,
      hora: null,
      parroquia: null,
      poblacion: null,
      interpretes: [],
      momentos: [],
    });
  });

  it("parroquia/poblacion/interpretes son siempre null/[] (limitación conocida)", () => {
    const evento = extraerEventoHeuristico([l("Ofertorio")]);
    expect(evento.parroquia).toBeNull();
    expect(evento.poblacion).toBeNull();
    expect(evento.interpretes).toEqual([]);
  });
});
