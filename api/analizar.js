/**
 * /api/analizar — función serverless para Eclipse Ink
 *
 * Recibe {tarea, imagen, contexto} y devuelve {ok, datos} con el
 * análisis del modelo. La clave de la API vive SOLO acá, en la
 * variable de entorno del hosting. Nunca viaja al navegador.
 *
 * Compatible con Vercel (carpeta /api) y Netlify (carpeta /netlify/functions).
 *
 * VARIABLES DE ENTORNO:
 *   MINIMAX_API_KEY   -> tu clave de platform.minimax.io/console/plan
 *
 * Deploy en Vercel:  poné la variable en Settings > Environment Variables
 * y asociala a Production y Preview.
 */

const MODELO = 'MiniMax-M3.1-Flash';
const BASE_URL = 'https://api.minimax.io/anthropic';

/* Los prompts viven acá en el servidor. El navegador nunca los ve.
   Se mantienen sincronizados con los de main.js (PROMPT_PRECIO y
   PROMPT_SINTOMA). Si cambiás las reglas, cambiás los dos lados. */
const PROMPT_PRECIO = `Sos un asistente que analiza diseños de tatuaje para un tattoo artist argentino.

Tu trabajo NO es dar un precio. Es DESCRIBIR con precisión el diseño, porque de esa descripción depende el precio.

=== IMPORTANTE: ENUMERÁ, NO JUGUES ===
Cuando te pidan algo que se pueda contar, contá. No digas "sí" o "no" a algo que se puede listar.
Si te preguntan qué colores hay, listalos. Si te preguntan qué zona del cuerpo es, nombrala.
Enumerar es mucho más confiable que juzgar, y no podés "olvidarte" de algo que estás listando.

=== CATEGORÍAS ===
Cada rasgo va en una sola categoría. No se mezclan.

"lineas"
  Trazos finos, con o sin cambios de grosor. Ej: filete, tribal de líneas,
  contornos, el trazo de una caligrafía.

"rellenado"
  Áreas de tinta SÓLIDA y compacta: negro macizo o color plano dentro de
  una forma, SIN degradado. Ej: las plumas negras de un ave, el cuerpo de
  un personaje, un tribal con las partes negras tapadas.

"sombreado"
  SOLO si hay DEGRADADO: tonos que van del claro al oscuro dentro de una
  misma forma, o difuminado tipo greywash. Ej: el volumen de una flor
  hecho con grises.

"color"
  Más de un color de TINTA en el diseño.

"multiaguja"
  Algún relleno necesita más de una aguja o más de una pasada para quedar
  sólido. Es el relleno grande y tapado, no cualquier línea gruesa.

"grande"
  El diseño ocupa un área grande tipo manga o media manga.

"realismo"
  El diseño es realista: rostros, animales, retratos. Se marca SIEMPRE
  cuando el pedido ES realismo, aunque se pueda simplificar.

=== PRUEBAS NEGATIVAS ===
Estas son las confusiones más comunes. Seguí las al pie de la letra.

1. Un trazo GRUESO de tinta sólida (el trazo gordo de una caligrafía, una
   letra pesada, un borde de 3mm) NO es "sombreado". Es "rellenado" y
   además "variación de grosor de línea". Jamás lo marques como sombreado.

2. Si la forma es de un SOLO tono uniforme (todo negro, todo rojo), NO es
   "sombreado". Es "rellenado". Si no hay gris ni degradado visible en la
   imagen, no hay sombreado.

3. "multiaguja" NO es "rellenado". Un relleno chico o mediano entra en una
   pasada. Solo cuenta como multiaguja si la superficie es grande y densa
   y claramente va a necesitar varias agujas o varias pasadas.

4. La tinta ROJA o de color con los bordes suaves NO es "sombreado": es
   "color". Si hay tinta de más de un color, el "color" va en la lista
   aunque el otro tono sea un degradado.

5. Los colores de la PIEL, del fondo y de la ropa NO son colores de tinta.
   Solo contá los que forman parte del diseño.

=== IDIOMA Y ALCANCE ===
Este texto es para un sitio web argentino. Escribí todo en español rioplatense.
Nunca uses palabras en inglés ni de ningún otro idioma. Si no sabés cómo
decir algo en español, decilo de forma simple.
No te inventes datos que no veas en la imagen: si no está claro, va null.

=== REGLAS DE IDIOMA ===
Todos los textos que escribas van en español rioplatense. No uses ninguna
palabra en inglés, ni aunque sea una sola. Si una palabra te sale en
inglés, cambiala por la equivalente en español antes de escribirla.

=== LA PIEZA QUE FALTA ===
Antes que nada, fijate si la imagen muestra PIEL alrededor del tattoo.
Esto decide si podés decir algo sobre la zona del cuerpo y el tamaño.

"se_ve_piel": true
  La imagen muestra piel con el tattoo ya hecho en una parte del cuerpo.
  Solo en este caso completá "zona_detectada" y "tamano_relativo".
"se_ve_piel": false
  Es una imagen de un diseño suelto, un dibujo, o una foto donde no se
  distingue la piel. En este caso "zona_detectada" y "tamano_relativo"
  van SIEMPRE en null. Sin excepciones. Es preferible dejar null que
  inventar un valor.

=== TAMAÑO: NO LO ADIVINES ===
El tamaño de un tattoo no se puede deducir de una foto: depende de la
distancia y del encuadre. Si "se_ve_piel" es false, "tamano_relativo" va
null. Si es true, compáralo SOLO con la parte del cuerpo donde está
(una muñeca, un antebrazo) y nunca con la foto entera.

=== ZONA DEL CUERPO ===
Usá SOLO uno de estos valores exactos, o null si no se ve piel:
"antebrazo", "pantorrilla", "brazo", "pierna", "muslo", "hombro",
"costado", "espalda", "torso", "dedos", "mano", "muñeca", "cuello", "pecho"

Ojo: la espalda es "espalda" o "torso", nunca "antebrazo".

=== ESTILO ===
"fineline": predomina el trazo fino. Aunque tenga unos rellenos chicos.
"rellenado": predomina la tinta sólida.
"mixto": hay cantidades COMPARABLES de trazo fino y de tinta sólida,
  o hay rellenos grandes. Si los rellenos son chicos y el diseño es
  casi todo línea, es "fineline", no "mixto".

=== SALIDA ===
Devolvé SOLO un JSON válido, sin texto alrededor, con esta forma exacta:

{
  "se_ve_piel": true | false,
  "colores": ["negro", "rojo"],
  "estilo_detectado": "fineline" | "rellenado" | "mixto" | null,
  "zona_detectada": "antebrazo" | null,
  "tamano_relativo": "moneda" | "billetera" | "palma" | "dos palmas" | null,
  "nivel": "simple" | "medio" | "alto",
  "factores": ["lineas", "rellenado", "sombreado", "color", "multiaguja", "grande"],
  "grosor": true | false,
  "greywash": true | false,
  "realismo": true | false,
  "detalle": "una frase de máximo 25 palabras que describa qué tiene el diseño"
}

Sobre "colores": es la lista de colores de TINTA del diseño. Si el diseño es
monocromo, es una lista con un solo color. Los colores de la PIEL, del
fondo y de la ropa NO son colores de tinta.

Sobre "nivel":
- "simple": solo líneas finas, sin relleno, sin color, sin sombreado.
- "medio": hay relleno o sombreado simple, o dos colores.
- "alto": hay relleno pesado o denso, greywash, mezcla de estilos, o
  muchos elementos separados.

Sobre "greywash": poné true solo si el sombreado es un degradado suave
tipo volumen. El sombreado plano o de un solo tono NO es greywash.

Sobre "detalle": describí el diseño en una sola frase. Decí qué hay:
el motivo, los rellenos, las líneas. No opines sobre el trabajo, no
opines sobre el precio y no hables de sesiones ni de la piel.

=== IMPORTANTE ===
NO escribas el campo "nota". Ese campo lo arma el sitio por su cuenta a
partir de los datos que devuelves. Si lo escribís, se duplica.
`;

const PROMPT_SINTOMA = `Sos un asistente que ayuda a un tattoo artist a orientar a sus clientes durante la curación de un tatuaje.

NO sos médico y NO hacés diagnósticos. Tu función es OBSERVAR y CLASIFICAR.

Recibís una imagen de un tatuaje en proceso de curación y una descripción escrita por el cliente de cómo se siente.

Lo que se considera NORMAL en una curación (no lo marques como preocupante):
- Picazón
- Enrojecimiento leve o piel un poco moretoneada, sobre todo los primeros días u horas
- Hinchazón: varía mucho según la zona; un rellenado en la mano se hincha muchísimo más que en el antebrazo y eso es esperable
- Si es un rellenado pesado, es normal que expulsa un poco de tinta o un poco de sangre las primeras horas, antes de que empiece a formar la cáscara
- Dolor fuerte los primeros dos o tres días en zonas como la mano: es insoportable pero es lo esperado. NO lo marques como preocupante mientras no venga acompañado de otros síntomas.

Lo que NO es normal y hay que consultar:
- Fiebre
- Secreciones, pus, o secreción amarillenta/verdosa
- Infección
- Síntomas de gripe
- Dolor que empeora en lugar de mejorar
- Piel demasiado tirante (suele deberse a poca hidratación del tatuaje, no es una complicación)

Cuando veas uno de estos, marcá "consultar": true y "urgente": true.

Regla para el dolor: si el cliente describe un dolor fuerte, preguntate si el texto menciona fiebre, pus, secreción o empeoramiento. Si NO los menciona, el dolor por sí solo (aunque sea insoportable) NO es motivo de consulta: marcá "consultar": false.

Devolvé SOLO un JSON válido, sin texto alrededor:

{
  "consultar": true | false,
  "urgente": true | false,
  "observaciones": ["qué se ve en la foto", "qué coincide con lo que describe el cliente"],
  "mensaje": "una o dos frases en español, para el cliente, con tono tranquilo. Si hay que consultar, decí que escriba al tattoo artist. Si todo parece normal, decí que sigue dentro de lo esperado y que siga con los cuidados."
}

Si la imagen no es clara o no se ve un tatuaje, poné "consultar": false, "urgente": false y en observaciones que la imagen no es interpretable, y que la descripción escrita es la que se está usando.`;

/* ---------- Límites de uso ----------
   Esta función es pública y la clave tiene costo. Sin límites, cualquiera
   puede quemarla con un bucle. Es un freno simple, no un muro: sirve
   para el abuso casual, que es el caso real. */

const LIMITE_POR_HORA = 20;        // requests por IP por hora
const MAX_IMAGEN_BYTES = 4 * 1024 * 1024;  // 4 MB en base64

const usos = new Map();

function ipDe(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket?.remoteAddress || 'desconocida';
}

function exceedsLimite(ip) {
    const ahora = Date.now();
    const hora = Math.floor(ahora / 3600000);
    const registro = usos.get(ip);

    if (!registro || registro.hora !== hora) {
        usos.set(ip, { hora, n: 1 });
        return false;
    }

    registro.n++;
    return registro.n > LIMITE_POR_HORA;
}

/* Limpieza periódica: si nadie usa la función, el mapa crece sin control. */
if (typeof setInterval !== 'undefined') {
    const limpiar = setInterval(() => {
        const hora = Math.floor(Date.now() / 3600000);
        for (const [ip, r] of usos) if (r.hora !== hora) usos.delete(ip);
    }, 60000);
    if (typeof limpiar.unref === 'function') limpiar.unref();
}

/*Revisa que la respuesta tenga la forma esperada. Si el modelo devuelve
  algo raro, se completa con valores seguros en vez de romper la web.*/
function validarDatos(datos) {
    if (!datos || typeof datos !== 'object') return null;

    const estiloOk = ['fineline', 'rellenado', 'mixto', null];
    const nivelOk = ['simple', 'medio', 'alto'];
    const zonaOk = [
        'antebrazo', 'pantorrilla', 'brazo', 'pierna', 'muslo', 'hombro',
        'costado', 'espalda', 'torso', 'dedos', 'mano', 'muñeca', 'cuello', 'pecho',
    ];
    const tamOk = ['moneda', 'billetera', 'palma', 'dos palmas', null];
    const factoresOk = ['lineas', 'rellenado', 'sombreado', 'color', 'multiaguja', 'grande'];

    if (!estiloOk.includes(datos.estilo_detectado)) datos.estilo_detectado = null;
    if (!nivelOk.includes(datos.nivel)) datos.nivel = 'medio';
    if (!zonaOk.includes(datos.zona_detectada)) datos.zona_detectada = null;
    if (!tamOk.includes(datos.tamano_relativo)) datos.tamano_relativo = null;

    if (!Array.isArray(datos.colores)) datos.colores = [];
    if (!Array.isArray(datos.factores)) datos.factores = [];
    datos.factores = datos.factores.filter((f) => factoresOk.includes(f));

    if (typeof datos.grosor !== 'boolean') datos.grosor = false;
    if (typeof datos.greywash !== 'boolean') datos.greywash = false;
    if (typeof datos.realismo !== 'boolean') datos.realismo = false;
    if (typeof datos.se_ve_piel !== 'boolean') datos.se_ve_piel = false;

    /*Sin estilo no hay forma de calcular: es preferible fallar antes
      que inventar un precio con una base que no corresponde.*/
    if (!datos.estilo_detectado) datos.estilo_detectado = 'fineline';

    return datos;
}

/* ---------- utilidades ---------- */

/*El modelo a veces mete un salto de línea REAL dentro de un string
  JSON, que es JSON inválido ("…en la \nparte inferior…"). Esto lo
  repara: escapa los saltos de línea que caen dentro de un string.*/
function repararJSON(texto) {
    let salida = '';
    let enTexto = false;
    let escapado = false;

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];

        if (escapado) { salida += c; escapado = false; continue; }
        if (c === '\\') { salida += c; escapado = true; continue; }
        if (c === '"') { enTexto = !enTexto; salida += c; continue; }

        if (enTexto && (c === '\n' || c === '\r')) {
            salida += ' ';
            if (c === '\r' && texto[i + 1] === '\n') i++;
            continue;
        }

        salida += c;
    }
    return salida;
}

/*Palabras en inglés y francés que se le escapan al modelo. Se
  detectan y se sacan: son el rastro visible de que el modelo se
  desvió de idioma.*/
const PALABRAS_FUERA = [
    'requires', 'aggregates', 'distributed', 'emphasized', 'transitions',
    'boutons', 'resume', 'delineate', 'delicateas', 'luneceantas',
    'ornamentosigos', 'black', 'style', 'lines', 'tattoo', 'design',
];

/*Quita caracteres de otros alfabetos que se le escapan al modelo en los
  textos libres (el chino aparece pegado al español). Los campos
  estructurados nunca se tocan.*/
function limpiarTexto(valor) {
    if (typeof valor !== 'string') return valor;

    let salida = valor
        .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/g, '');

    PALABRAS_FUERA.forEach((p) => {
        const re = new RegExp('\\b' + p + '\\b', 'gi');
        salida = salida.replace(re, '');
    });

    return salida
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .trim();
}

function limpiarObjeto(datos) {
    if (!datos || typeof datos !== 'object') return datos;

    ['nota', 'mensaje'].forEach((k) => {
        if (typeof datos[k] === 'string') datos[k] = limpiarTexto(datos[k]);
    });

    ['colores', 'observaciones'].forEach((k) => {
        if (Array.isArray(datos[k])) datos[k] = datos[k].map(limpiarTexto);
    });

    if (datos.detalle && typeof datos.detalle === 'object') {
        Object.keys(datos.detalle).forEach((k) => {
            datos.detalle[k] = limpiarTexto(datos.detalle[k]);
        });
    }

    return datos;
}

/* Saca el ```json ... ``` si el modelo lo envuelve, y extrae el objeto. */
function extraerJSON(texto) {
    if (!texto) return null;

    let limpio = texto.trim();

    const bloque = limpio.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (bloque) limpio = bloque[1].trim();

    /* Primero el intento directo, después con la reparación.*/
    for (const textoPrueba of [limpio, repararJSON(limpio)]) {
        try {
            return JSON.parse(textoPrueba);
        } catch (e) {
            /* sigue */
        }
    }

    /* A veces el modelo mete texto antes o después del objeto.
       Buscamos el primer { que cierre balanceado.*/
    const reparado = repararJSON(limpio);
    const inicio = reparado.indexOf('{');
    if (inicio === -1) return null;

    let nivel = 0;
    let enTexto = false;
    let escapado = false;

    for (let i = inicio; i < reparado.length; i++) {
        const c = reparado[i];

        if (escapado) { escapado = false; continue; }
        if (c === '\\') { escapado = true; continue; }
        if (c === '"') { enTexto = !enTexto; continue; }
        if (enTexto) continue;

        if (c === '{') nivel++;
        if (c === '}') {
            nivel--;
            if (nivel === 0) {
                try {
                    return JSON.parse(reparado.slice(inicio, i + 1));
                } catch (e) {
                    return null;
                }
            }
        }
    }
    return null;
}

function respuestaJSON(codigo, cuerpo) {
    return {
        statusCode: codigo,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
        body: JSON.stringify(cuerpo),
    };
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Método no permitido' });
    }

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
        console.error('Falta la variable de entorno MINIMAX_API_KEY');
        return res.status(500).json({ ok: false, error: 'La IA no está configurada en el servidor' });
    }

    let cuerpo;
    try {
        cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ ok: false, error: 'Cuerpo inválido' });
    }

    const { tarea, imagen, contexto } = cuerpo || {};

    if (!tarea || !['precio', 'sintoma'].includes(tarea)) {
        return res.status(400).json({ ok: false, error: 'Tarea desconocida' });
    }

    if (!imagen || typeof imagen !== 'string' || !imagen.startsWith('data:image/')) {
        return res.status(400).json({ ok: false, error: 'Falta la imagen' });
    }

    if (imagen.length > MAX_IMAGEN_BYTES) {
        return res.status(413).json({ ok: false, error: 'La imagen es demasiado grande' });
    }

    const ip = ipDe(req);
    if (exceedsLimite(ip)) {
        console.warn('Límite de uso alcanzado para', ip);
        return res.status(429).json({ ok: false, error: 'Demasiadas consultas seguidas. Probá de nuevo en un rato.' });
    }

    const prompt = tarea === 'precio' ? PROMPT_PRECIO : PROMPT_SINTOMA;

    /* Armamos el contexto en texto plano para mandarlo junto a la imagen. */
    const detalles = contexto
        ? Object.entries(contexto)
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
        : '';

    const contenido = [
        {
            type: 'image',
            source: { type: 'base64', media_type: imagen.split(';')[0].split(':')[1], data: imagen.split(',')[1] },
        },
        {
            type: 'text',
            text: detalles ? `${prompt}\n\nContexto del cliente:\n${detalles}` : prompt,
        },
    ];

    try {
        const llamada = await fetch(`${BASE_URL}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODELO,
                /* El thinking cuenta para max_tokens. Con 1024 el modelo
                   podía cortarse a mitad del JSON. 2048 deja margen. */
                max_tokens: 2048,
                /* Sin esto el modelo se le cuelan palabras en inglés y
                   hasta fragmentos rotos ("SeIPLICAR") en los textos
                   libres. Es un problema de muestreo, no de prompt. */
                temperature: 0,
                /* effort bajo: para clasificar un tatuaje no hace falta
                   razonar en profundidad, y baja la latencia y el costo. */
                output_config: { effort: 'low' },
                /* El system prompt ancla el idioma de toda la respuesta.
                   Sin esto, los textos libres se le escapan al español. */
                system:
                    'Respondé exclusivamente en español rioplatense (Argentina). ' +
                    'Todos los textos libres tienen que estar escritos en español: ' +
                    'no uses ni una sola palabra en inglés ni en ningún otro idioma. ' +
                    'Si una palabra te sale en otro idioma, cambiala por la equivalente ' +
                    'en español antes de escribirla. Devolvé únicamente el JSON pedido.',
                messages: [{ role: 'user', content: contenido }],
            }),
        });

        if (!llamada.ok) {
            const detalle = await llamada.text();
            console.error('MiniMax error', llamada.status, detalle);
            return res.status(502).json({ ok: false, error: 'El análisis no se pudo completar' });
        }

        const json = await llamada.json();

        /* En el formato Anthropic, el texto viene en los bloques de
           tipo "text". Puede haber bloques de thinking antes. */
        const bloques = (json.content || []).filter((b) => b.type === 'text');
        const texto = bloques.map((b) => b.text).join('\n');

        const datos = extraerJSON(texto);
        if (!datos) {
            console.error('No se pudo extraer JSON. Respuesta:', texto);
            return res.status(502).json({ ok: false, error: 'El análisis no se pudo completar' });
        }

        return res.status(200).json({ ok: true, datos: validarDatos(limpiarObjeto(datos)) });
    } catch (err) {
        console.error('Error en /api/analizar:', err);
        return res.status(500).json({ ok: false, error: 'El análisis no se pudo completar' });
    }
}
