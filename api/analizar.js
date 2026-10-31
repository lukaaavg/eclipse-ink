/**
 * /api/analizar — función serverless para Eclipse Ink (Node, para Vercel)
 *
 * Recibe {tarea, imagen, contexto} y devuelve {ok, datos} con el
 * análisis del modelo. La clave de la API vive SOLO acá, en la
 * variable de entorno del hosting. Nunca viaja al navegador.
 *
 * Para el hosting con PHP está api/analizar.php, que hace lo mismo.
 * Las dos leen el prompt de api/prompt.txt, así que no se desincronizan.
 *
 * VARIABLES DE ENTORNO:
 *   MINIMAX_API_KEY   -> tu clave de platform.minimax.io/console/plan
 *   MINIMAX_MODELO    -> opcional, por defecto MiniMax-M3.1-Flash
 *   MINIMAX_BASE_URL  -> opcional, por defecto https://api.minimax.io/anthropic
 *
 * Deploy en Vercel:  poné la variable en Settings > Environment Variables
 * y asociala a Production y Preview.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*Configuración por variable de entorno.
  Si no están definidas, se usan estos valores por defecto, así la
  función igual anda sin configurar nada.*/
const MODELO = process.env.MINIMAX_MODELO || 'MiniMax-M3.1-Flash';
const BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/anthropic';

/* El prompt vive en api/prompt.txt: es la fuente única y la comparten
   esta versión en Node y la de PHP (api/analizar-php.php). Si cambiás las
   reglas del tattoo artist, cambiás ese archivo y nada más.

   En Vercel la función se empaqueta, así que el .txt tiene que estar
   incluido en vercel.json (includeFiles) y puede caer en carpetas
   distintas según dónde se arme el paquete. Por eso se prueban varias. */
function leerPrompt() {
    const carpeta = path.dirname(fileURLToPath(import.meta.url));

    const candidatos = [
        path.join(carpeta, 'prompt.txt'),
        path.join(carpeta, 'api', 'prompt.txt'),
        path.join(process.cwd(), 'api', 'prompt.txt'),
        path.join(process.cwd(), 'prompt.txt'),
    ];

    for (const ruta of candidatos) {
        try {
            const texto = readFileSync(ruta, 'utf8').trim();
            if (texto) return texto;
        } catch (e) {
            /* sigue con la otra */
        }
    }

    throw new Error('No se encontró api/prompt.txt');
}

let promptEnCache = null;

function prompt() {
    if (promptEnCache === null) {
        promptEnCache = leerPrompt();
    }
    return promptEnCache;
}

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
    'boutons', 'resume', 'delineate', 'ornamentosigos', 'luneceantas',
];

/*Grupos de consonantes que no existen en español: delatan las
  palabras rotas que deja el modelo ("Aveustría" por "Ave mitológica").*/
const CLUSTERS_INVALIDAS = /\w(str|scl|stl|scr)\w/i;

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

/*Si el texto tiene una palabra rota, se descarta entero: es mejor
  quedarnos sin detalle que mostrarle al cliente "Aveustría".*/
function textoRoto(valor) {
    if (typeof valor !== 'string' || !valor.trim()) return true;
    if (CLUSTERS_INVALIDAS.test(valor)) return true;
    if (/[^\x20-\x7E¡¿áéíóúüñÁÉÍÓÚÜÑ°·—–"'(),.:;]/.test(valor)) return true;
    return false;
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

    /*El detalle es una lista de frases cortas. Cada una se valida por
      separado: si una sale rota, se descarta esa y se conservan las
      demás. Es degradación parcial, no todo o nada.*/
    if (Array.isArray(datos.detalle)) {
        datos.detalle = datos.detalle
            .map((d) => (typeof d === 'string' ? limpiarTexto(d) : ''))
            .filter((d) => d && d.length > 3 && d.length < 60 && !textoRoto(d))
            .slice(0, 5);
    } else {
        datos.detalle = [];
    }

    return datos;
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

    if (!tarea || tarea !== 'precio') {
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

    /* Armamos el contexto en texto plano para mandarlo junto a la imagen. */
    const detalles = contexto
        ? Object.entries(contexto)
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
        : '';

    /* El prompt se lee acá, antes de armar el pedido. */
    let promptTexto;
    try {
        promptTexto = prompt();
    } catch (e) {
        console.error('No se pudo leer el prompt:', e);
        return res.status(500).json({ ok: false, error: 'El análisis no está configurado en el servidor' });
    }

    const contenido = [
        {
            type: 'image',
            source: { type: 'base64', media_type: imagen.split(';')[0].split(':')[1], data: imagen.split(',')[1] },
        },
        {
            type: 'text',
            text: detalles ? `${promptTexto}\n\nContexto del cliente:\n${detalles}` : promptTexto,
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

/*Limpia los textos libres: quita caracteres de otros alfabetos y
  palabras en otro idioma. Los campos estructurados no se tocan.*/
function limpiarObjeto(datos) {
    if (!datos || typeof datos !== 'object') return datos;

    ['nota', 'mensaje'].forEach((k) => {
        if (typeof datos[k] === 'string') datos[k] = limpiarTexto(datos[k]);
    });

    ['colores', 'observaciones'].forEach((k) => {
        if (Array.isArray(datos[k])) datos[k] = datos[k].map(limpiarTexto);
    });

    return datos;
}
