/* =========================================================
   ECLIPSE INK — main.js
   Todo el comportamiento del sitio. Cada bloque arranca con una
   guarda (if (!elemento)) así el dashboard no rompe las páginas
   que no lo tienen.
   ========================================================= */

/* ---------- ANIMACIONES AL HACER SCROLL ---------- */
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            const el = entry.target;
            const grupo = el.closest('[data-stagger]');
            if (grupo) {
                grupo.querySelectorAll('[data-animate]').forEach((child, index) => {
                    child.style.setProperty('--i', index);
                    child.classList.add('visible');
                });
            } else {
                el.classList.add('visible');
            }
            observer.unobserve(el);
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));

const heroContent = document.querySelector('#hero [data-animate]');
if (heroContent) heroContent.classList.add('visible');


/* ---------- MENÚ HAMBURGUESA (mobile) ---------- */
const navToggle = document.querySelector('#navToggle');
const navMenu = document.querySelector('#navMenu');

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        const isOpen = navMenu.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', isOpen);
    });

    navMenu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}


/* ---------- CARRUSEL DEL PORTFOLIO ---------- */
const carouselTrack = document.querySelector('#carouselTrack');
const carouselPrev = document.querySelector('#carouselPrev');
const carouselNext = document.querySelector('#carouselNext');
const carouselCounter = document.querySelector('#carouselCounter');
const carouselTotal = document.querySelector('#carouselTotal');

if (carouselTrack && carouselPrev && carouselNext) {
    const slides = Array.from(carouselTrack.querySelectorAll('.carousel-slide'));
    const total = slides.length;
    let current = 0;

    /*El total se cuenta solo: si se agrega o se saca una foto, el
      contador no hay que tocarlo a mano.*/
    if (carouselTotal) carouselTotal.textContent = total;


    function updateCarousel() {
        slides.forEach((slide, i) => {
            // distancia mas corta al centro, considerando el "loop" circular
            let offset = i - current;
            if (offset > total / 2) offset -= total;
            if (offset < -total / 2) offset += total;

            slide.style.setProperty('--offset', offset);
            slide.style.setProperty('--offset-abs', Math.abs(offset));
            slide.classList.toggle('active', offset === 0);
        });
        if (carouselCounter) carouselCounter.textContent = current + 1;
    }

    carouselPrev.addEventListener('click', () => {
        current = (current - 1 + total) % total;
        updateCarousel();
    });

    carouselNext.addEventListener('click', () => {
        current = (current + 1) % total;
        updateCarousel();
    });

    updateCarousel();
}


/* ---------- FAQ PLEGABLE ----------
   <details> se abre y cierra de golpe: el navegador no interpola la
   altura. Acá se intercepta el click y se anima con la Web Animations
   API. Sin JS sigue funcionando igual, solo que sin animación. */
const faqRows = document.querySelectorAll('.faq-row');
const sinAnimacion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DURACION_FAQ = 320;
const CURVA_FAQ = 'cubic-bezier(0.4, 0, 0.2, 1)';

faqRows.forEach((row) => {
    const summary = row.querySelector('summary');
    const answer = row.querySelector('.faq-answer');
    if (!summary || !answer) return;

    let animando = false;

    summary.addEventListener('click', (e) => {
        e.preventDefault();
        if (animando) return;

        if (sinAnimacion) {
            row.open = !row.open;
            return;
        }

        animando = true;

        if (!row.open) {
            row.open = true;
            const alto = answer.scrollHeight;
            answer
                .animate(
                    [
                        { height: '0px', opacity: 0 },
                        { height: alto + 'px', opacity: 1 },
                    ],
                    { duration: DURACION_FAQ, easing: CURVA_FAQ }
                )
                .onfinish = () => {
                    animando = false;
                };
        } else {
            const alto = answer.scrollHeight;
            answer
                .animate(
                    [
                        { height: alto + 'px', opacity: 1 },
                        { height: '0px', opacity: 0 },
                    ],
                    { duration: DURACION_FAQ, easing: CURVA_FAQ }
                )
                .onfinish = () => {
                    row.open = false;
                    animando = false;
                };
        }
    });
});


/* =========================================================
   PROMPTS PARA LA IA
   Son las reglas del tatuador escritas para el modelo. Si cambia el
   criterio del tattoo artist, se edita acá y nada más.
   ========================================================= */

/* El prompt del analisis vive en api/prompt.txt, que es la fuente unica
   y la comparten el endpoint de Node (api/analizar.js) y el de PHP
   (api/analizar.php). El navegador nunca lo ve: lo usa el servidor.
   Para cambiar las reglas del tattoo artist se edita ese archivo. */






/* =========================================================
   MOTOR DE ANÁLISIS CON IA
   ========================================================= */

/*MODO MOCK
  Por defecto la IA es REAL: el sitio llama a la función y anda
  siempre, sin tener que agregar nada a la URL.

  Con ?ia=mock en la URL se fuerza la simulación, que sirve para
  trabajar en la interfaz sin gastar ni depender del servidor.

  Cuando la función esté deployada con MINIMAX_API_KEY configurada,
  esto puede quedarse en false tranquilamente.*/
const MODO_MOCK = new URLSearchParams(location.search).get('ia') === 'mock';

/*Endpoint de la IA.
  No todas las plataformas resuelven igual una ruta sin extensión:
  Vercel sirve /api/analizar (función de Node) y un server con PHP
  necesita /api/analizar.php. Así que se prueban las dos y se recuerda
  cuál anda, para no fallar en cada pedido.*/
const ENDPOINT_ANALISIS = ['/api/analizar', '/api/analizar-php.php'];
let endpointQueFunciona = null;

/*Devuelve la ruta que responde. Si la que ya sabemos no funciona,
  prueba la otra y se queda con esa.*/
async function resolverEndpoint() {
    if (endpointQueFunciona) return endpointQueFunciona;

    for (const ruta of ENDPOINT_ANALISIS) {
        try {
            const probe = await fetch(ruta, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                /* sin imagen: la función contesta 400, que sirve para
                   saber que llegó. Un 404 significa que no hay nada. */
                body: JSON.stringify({ tarea: 'precio' }),
            });
            if (probe.status !== 404) {
                endpointQueFunciona = ruta;
                return ruta;
            }
        } catch (e) {
            /* sigue con la otra */
        }
    }

    return ENDPOINT_ANALISIS[0];
}

/*Respuestas simuladas, para probar el circuito sin IA.
  OJO: son datos de EJEMPLO, fijos, no un análisis de la imagen.
  El aviso de modo prueba lo dice en pantalla. Se Arma para el caso
  más común: una referencia suelta, sin cuerpo visible.*/
const MOCK = {
    precio: {
        colores: ['negro'],
        estilo_detectado: 'fineline',
        se_ve_piel: false,
        zona_detectada: null,
        tamano_relativo: null,
        nivel: 'medio',
        factores: ['rellenado', 'sombreado'],
        grosor: false,
        greywash: false,
        realismo: false,
        detalle: ['ejemplo de motivo', 'relleno compacto', 'líneas finas'],
    },

};

/*Llama al modelo y devuelve {ok, datos} o {ok:false, error}.*/
async function analizarConIA(tarea, imagenDataUrl, contexto) {
    if (MODO_MOCK) {
        await new Promise((r) => setTimeout(r, 1400)); // simula la latencia
        return { ok: true, datos: { ...MOCK[tarea] } };
    }

    try {
        const ruta = await resolverEndpoint();

        const resp = await fetch(ruta, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tarea, imagen: imagenDataUrl, contexto }),
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const json = await resp.json();
        if (!json || !json.ok) throw new Error(json && json.error ? json.error : 'Respuesta inválida');

        return { ok: true, datos: json.datos };
    } catch (err) {
        console.error('Error de análisis:', err);
        return { ok: false, error: 'No se pudo completar el análisis. Probá de nuevo.' };
    }
}

/*Palabras que el modelo se inventa de otros idiomas. Si aparecen en
  un texto, ese texto no se muestra: se usa el generado con los datos.*/
const PALABRAS_FUERA = [
    'raising', 'requires', 'aggregates', 'distributed', 'emphasized',
    'transitions', 'boutons', 'delineate', 'ornamentosigos', 'luneceantas',
];

/*Grupos de consonantes que no existen en español. Sirven para
  detectar las palabras rotas que deja el modelo: "Aveustría" en vez de
  "Ave mitológica", por ejemplo.*/
const CLUSTERS_INVALIDAS = /\w(str|scl|stl|scr)\w/i;

/*Un texto se considera sano si no tiene caracteres de otros alfabetos,
  ni palabras en otro idioma, ni grupos de consonantes imposibles.*/
function textoSano(texto) {
    if (!texto || texto.length < 8) return false;
    if (/[^\x20-\x7E¡¿áéíóúüñÁÉÍÓÚÜÑ°·—–"'(),.:;]/.test(texto)) return false;
    if (CLUSTERS_INVALIDAS.test(texto)) return false;
    const enMinuscula = texto.toLowerCase();
    return !PALABRAS_FUERA.some((p) => enMinuscula.includes(p));
}

/*Arma el texto que ve el cliente a partir de los datos estructurados.
  El modelo no escribe este texto: lo arma el sitio. Así nunca puede
  contradecir al precio, que sale de los mismos datos.*/
function armarNota(analisisIA) {
    if (!analisisIA) return '';

    const partes = [];
    const colores = Array.isArray(analisisIA.colores) ? analisisIA.colores : [];

    if (colores.length === 1) {
        partes.push(`El diseño es de una sola tinta: ${colores[0]}.`);
    } else if (colores.length > 1) {
        /*"negro, rojo y violeta", no "negro y rojo y violeta"*/
        const lista = colores.length === 2
            ? `${colores[0]} y ${colores[1]}`
            : `${colores.slice(0, -1).join(', ')} y ${colores[colores.length - 1]}`;
        partes.push(`El diseño usa ${colores.length} tintas: ${lista}. Eso significa cambiar de aguja a mitad del trabajo.`);
    }

    const factores = Array.isArray(analisisIA.factores) ? analisisIA.factores : [];
    if (factores.includes('rellenado')) partes.push('Tiene áreas de tinta sólida.');
    if (analisisIA.greywash) partes.push('El sombreado es con degradado, que es lo que más trabajo lleva.');
    else if (factores.includes('sombreado')) partes.push('Tiene sombreado simple.');
    if (analisisIA.grosor) partes.push('Las líneas cambian de grosor, así que hay que usar agujas de distinto calibre.');
    if (factores.includes('multiaguja')) partes.push('Los rellenos son grandes y necesitan varias pasadas.');
    if (factores.includes('grande')) partes.push('Es un diseño grande.');

    if (analisisIA.realismo) {
        partes.push('El realismo es un tipo de trabajo que todavía no hago, pero el diseño se puede simplificar a un estilo más lineal.');
    }

    if (partes.length === 0) {
        partes.push('Es un diseño de líneas finas, sin rellenos ni colores.');
    }

    return partes.join(' ');
}

/*Calcula el RANGO estimado.
  La IA aporta atributos; el número sale siempre de acá.
  Devuelve un rango porque el tamaño y la zona losdice el cliente:
  no hay información para ser exacto, y un rango honesto siempre
  contiene el precio final, mientras que un número falso preciso
  puede quedar muy lejos.*/
function calcularRango(estilo, tam, zona, analisisIA) {
    const base = (PRECIOS.estilos[estilo] || {})[tam];
    if (base == null) return null;

    const multZona = PRECIOS.zona[zona] ?? 1;
    const filas = [
        { concepto: `Base · ${ETIQUETAS_TAMANO[tam]}`, valor: formatear(base), mult: 1 },
    ];

    let multIA = 1;
    const factores = [];
    const descriptores = [];
    let colores = [];
    let detalle = '';

    if (analisisIA) {
        const detectados = Array.isArray(analisisIA.factores) ? analisisIA.factores : [];
        colores = Array.isArray(analisisIA.colores) ? analisisIA.colores : [];
        detalle = typeof analisisIA.detalle === 'string' ? analisisIA.detalle : '';

        /*El color NO se juzga: se cuenta. Si el modelo enumeró más de
          un color de tinta, son dos agujas.*/
        if (colores.length > 1) {
            const f = PRECIOS.factores.color;
            factores.push(f);
            multIA *= f.mult;
        }

        /*La variación de grosor solo cuenta si es notoria.*/
        if (detectados.includes('lineas') && analisisIA.grosor) {
            const f = PRECIOS.factores.lineas;
            factores.push(f);
            multIA *= f.mult;
        }

        /*El greywash reemplaza al sombreado: no se suman.*/
        if (analisisIA.greywash) {
            const f = PRECIOS.factores.greywash;
            factores.push(f);
            multIA *= f.mult;
        } else if (detectados.includes('sombreado')) {
            const f = PRECIOS.factores.sombreado;
            factores.push(f);
            multIA *= f.mult;
        }

        ['multiaguja', 'grande'].forEach((clave) => {
            if (!detectados.includes(clave)) return;
            const f = PRECIOS.factores[clave];
            if (!f) return;
            factores.push(f);
            multIA *= f.mult;
        });

        /*Los descriptores se muestran pero no suman: el rellenado ya
          está incluido en el precio base del estilo.*/
        if (detectados.includes('rellenado')) {
            const d = PRECIOS.descriptores.rellenado;
            if (d) descriptores.push(d);
        }
    }

    if (multZona !== 1) {
        filas.push({ concepto: `Zona · ${GRUPO_ZONA[zona]}`, valor: `× ${multZona}`, mult: multZona });
    }

    /*El tope es del ajuste por IA. La zona no entra en el tope: es un
      factor conocido de antemano, no una estimación.*/
    const multIAFinal = Math.min(multIA, PRECIOS.tope);

    if (multIAFinal !== 1) {
        filas.push({ concepto: 'Ajuste por análisis', valor: `× ${multIAFinal.toFixed(2).replace('.', ',')}`, mult: multIAFinal });
    }

    const centro = base * multZona * multIAFinal;

    /*Si la IA vio una piel con el tattoo, hay más datos y el rango se
      puede acotar. Si mandó una referencia suelta, no hay ni zona ni
      escala: el rango tiene que ser ancho.*/
    const conCuerpo = !!(analisisIA && analisisIA.se_ve_piel !== false && analisisIA.zona_detectada);
    const margen = conCuerpo ? INCERTIDUMBRE.con_cuerpo : INCERTIDUMBRE.sin_cuerpo;

    const min = Math.round((centro * (1 - margen)) / 100) * 100;
    const max = Math.round((centro * (1 + margen)) / 100) * 100;

    return {
        min: Math.max(min, 1000),
        max,
        centro: Math.round(centro),
        filas,
        factores,
        descriptores,
        colores,
        detalle,
        margen,
        conCuerpo,
        multIA: multIAFinal,
        limitado: multIA > PRECIOS.tope,
    };
}


/* ---------- Aviso de modo prueba ----------
  Si la IA está simulada, hay que decirlo en pantalla. Si no, el usuario
  cree que está hablando con el modelo y toma los resultados como
  reales. Se inserta al cargar la página, arriba de la calculadora.*/
(function avisarModoPrueba() {
    if (!MODO_MOCK) return;

    const seccion = document.querySelector('#budget-calculator');
    if (!seccion) return;

    const aviso = document.createElement('p');
    aviso.className = 'mock-banner';
    aviso.innerHTML =
        '<strong>Modo prueba.</strong> La IA está simulada: devuelve un resultado de ejemplo ' +
        'sin mirar la imagen. Para probar el análisis real hay que abrir la página con ' +
        '<code>?ia=real</code> y tener la función <code>/api/analizar</code> deployada.';

    const heading = seccion.querySelector('.section-heading');
    if (heading && heading.nextSibling) {
        seccion.insertBefore(aviso, heading.nextSibling);
    } else {
        seccion.insertBefore(aviso, seccion.firstChild);
    }
})();

/* =========================================================
   DASHBOARD
   Los datos viven en localStorage: se guardan en el navegador del
   cliente y no salen de su dispositivo. Sin backend.
   ========================================================= */

/* --- Tabla de precios de la calculadora ---
   EDITÁ SOLO ESTE BLOQUE cuando los precios suban.
   Son valores MÍNIMOS ("desde"): lo que se cobra siempre depende del
   diseño, el detalle y el tiempo de sesión.

   La clave de cada estilo es el value del <select> de estilo, y la de
   cada tamaño el value del <select> de tamaño. Si agregás una
   combinación, agregá también su <option> en el formulario. */
const PRECIOS = {
    moneda: 'ARS',
    locale: 'es-AR',
    estilos: {
        fineline: {
            mini: 8000,
            pequeno: 10000,
            mediano: 15000,
            grande: 20000,
        },
        rellenado: {
            // no hay rellenados mini
            pequeno: 12000,
            mediano: 18000,
            grande: 25000,
        },
        /*ESTILO MIXTO: cuando el diseño tiene línea y relleno en parecido
          peso. Es el promedio entre fineline y rellenado, y NO tiene
          formato mini (igual que rellenado, porque tiene tinta sólida).
          REVISAR: estos números son un promedio, ajustalos a tu criterio.*/
        mixto: {
            pequeno: 11000,
            mediano: 16500,
            grande: 22500,
        },
    },

    /*ZONA DEL CUERPO
      Las zonas complejas de tatuar (dedos, mano, cuello) salen más
      que las simples (antebrazo, pantorrilla).*/
    zona: {
        simple: 1.0,
        media: 1.15,
        compleja: 1.3,
    },

    /*FACTORES QUE SUMAN PRECIO, DETECTADOS POR LA IA
      Cada factor devuelve su propio multiplicador. La IA NUNCA tira
      un precio: solo dice qué factores están presentes. El número
      sale de acá.*/
    factores: {
        /*La variación de grosor SOLO suma si el modelo detectó que
          es notoria (grosor: true).*/
        lineas: {
            mult: 1.15,
            etiqueta: 'Variación de grosor de línea',
            desc: 'Requiere needles de distinto calibre en una misma pieza',
        },
        /*El sombreado simple sube poco; el greywash sube más y
          reemplaza al sombreado, no se suma con él.*/
        sombreado: {
            mult: 1.1,
            etiqueta: 'Sombreado',
            desc: 'Sombreado simple; el greywash denso sube más',
        },
        greywash: {
            mult: 1.4,
            etiqueta: 'Greywash',
            desc: 'Sombreado con degradado, tipo volumen',
        },
        /*Este NO se lee de la lista de factores: sale de la cantidad de
          colores de tinta que enumeró el modelo. Dos tintas o más
          significa dos agujas.*/
        color: {
            mult: 1.2,
            etiqueta: 'Varios colores de tinta',
            desc: 'Más de un color de tinta en el diseño',
        },
        multiaguja: {
            mult: 1.15,
            etiqueta: 'Rellenado multi-aguja',
            desc: 'Relleno que requiere más de una aguja',
        },
        grande: {
            mult: 1.3,
            etiqueta: 'Diseño grande',
            desc: 'Manga o media manga',
        },
    },

    /*DESCRIPTORES
      Se detectan y se muestran, pero NO multiplican: el rellenado
      ya está en el precio base del estilo, sumarlo otra vez sería
      cobrar dos veces lo mismo.*/
    descriptores: {
        rellenado: {
            etiqueta: 'Rellenado',
            desc: 'Áreas de tinta sólida',
        },
    },

    /*Tope del ajuste por IA. El modelo nunca puede pasar de acá.*/
    tope: 2.0,
};

const ETIQUETAS_ESTILO = {
    fineline: 'Fineline',
    rellenado: 'Rellenado',
    mixto: 'Mixto',
};

const ETIQUETAS_TAMANO = {
    mini: 'Mini (3-5 cm)',
    pequeno: 'Pequeño (6-8 cm)',
    mediano: 'Mediano (9-12 cm)',
    grande: 'Grande (+12 cm)',
};

/*ESCALA VISUAL DEL TAMAÑO
  El cliente no dice centímetros: dice del tamaño de qué. Nadie discute
  cuánto mide una moneda, y eso hace que la respuesta sea可靠的.
  La clave interna sigue siendo la de la tabla de precios.*/
const ESCALA_TAMANO = [
    { valor: 'mini', etiqueta: 'Del tamaño de una moneda', ref: '3-5 cm' },
    { valor: 'pequeno', etiqueta: 'Del tamaño de una billetera', ref: '6-8 cm' },
    { valor: 'mediano', etiqueta: 'Del tamaño de mi palma', ref: '9-12 cm' },
    { valor: 'grande', etiqueta: 'Del tamaño de dos palmas', ref: '+12 cm' },
];

/*ZONAS DEL CUERPO
  La IA devuelve la parte del cuerpo que VE. Acá se traduce al grupo
  que multiplica. La lógica de precio queda en código, auditable; la
  percepción queda en el modelo.*/
const GRUPO_ZONA = {
    simple: 'Zona simple',
    media: 'Zona media',
    compleja: 'Zona compleja',
};

const ZONA_POR_PARTE = {
    antebrazo: 'simple',
    pantorrilla: 'simple',
    brazo: 'simple',
    pierna: 'simple',
    muslo: 'media',
    hombro: 'media',
    costado: 'media',
    espalda: 'media',
    torso: 'media',
    dedos: 'compleja',
    mano: 'compleja',
    muñeca: 'compleja',
    cuello: 'compleja',
    pecho: 'compleja',
};

/*INCERTIDUMBRE DEL RANGO
  Cuánto nos podemos tirar. Depende de la evidencia que mandó el
  cliente: si en la foto se ve una piel con el tattoo, la IA sabe la
  zona y la escala. Si mandó una referencia suelta, no sabe nada de
  eso y el rango tiene que ser ancho.*/
const INCERTIDUMBRE = {
    con_cuerpo: 0.18,
    sin_cuerpo: 0.35,
};

const ETIQUETAS_ZONA = GRUPO_ZONA;




/* ---------- Almacenamiento ---------- */
const GUARDAR = {
    fecha: 'eclipse:fecha-sesion',
    frecuencia: 'eclipse:frecuencia',
    ultimoAviso: 'eclipse:ultimo-aviso',
};

function leer(clave, porDefecto = null) {
    try {
        const bruto = localStorage.getItem(clave);
        return bruto === null ? porDefecto : JSON.parse(bruto);
    } catch (e) {
        return porDefecto;
    }
}

function escribir(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
        return true;
    } catch (e) {
        return false;
    }
}

function borrar(clave) {
    try {
        localStorage.removeItem(clave);
    } catch (e) {
        /* sin espacio o sin permisos: no hay nada más que hacer */
    }
}


/* ---------- Achicar imagen ----------
   Antes de guardar o enviar se reduce la imagen: localStorage tiene
   un límite (~5 MB) y una foto de teléfono lo desborda enseguida.
   Además sirve para no mandar por la red una imagen de 4 MB.*/
function achicarImagen(file, maxLado = 1000, calidad = 0.82) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
        lector.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
            img.onload = () => {
                const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * escala));
                const h = Math.max(1, Math.round(img.height * escala));

                const lienzo = document.createElement('canvas');
                lienzo.width = w;
                lienzo.height = h;

                const ctx = lienzo.getContext('2d');
                ctx.fillStyle = '#0A0A0A';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);

                resolve(lienzo.toDataURL('image/jpeg', calidad));
            };
            img.src = lector.result;
        };
        lector.readAsDataURL(file);
    });
}

/* ---------- Utilidades de fecha ---------- *//*OJO: no usar toISOString() para esto. Devuelve la fecha en UTC, así que
  cerca de la medianoche guardaría el día equivocado. Esto arma el
  "YYYY-MM-DD" con la hora local, que es lo que espera el date input
  y lo que compare el usuario.*/
function hoyISO() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}

function diasDesde(fechaISO) {
    if (!fechaISO || typeof fechaISO !== 'string') return null;
    const partes = fechaISO.split('-').map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;

    const inicio = new Date(partes[0], partes[1] - 1, partes[2]);
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    return Math.round((hoy - inicio) / 86400000);
}

function fechaLarga(fechaISO) {
    const partes = fechaISO.split('-').map(Number);
    const d = new Date(partes[0], partes[1] - 1, partes[2]);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ETAPAS = [
    { hasta: 3, titulo: 'Etapa inicial', texto: 'La sensibilidad, el enrojecimiento leve y la sensación de calor son habituales en estos primeros días.' },
    { hasta: 7, titulo: 'Descamación', texto: 'Puede aparecer picazón y descamación mientras la piel se recupera. No retires la piel a mano.' },
    { hasta: 14, titulo: 'Regeneración', texto: 'La piel se estabiliza. El tatuaje puede verse más apagado que el primer día: es parte del proceso.' },
    { hasta: 30, titulo: 'Etapa final', texto: 'La piel se acerca progresivamente a su estado habitual y el color se asienta.' },
];


/* ---------- Estado de curación + rastro de fases ---------- */
const dayEl = document.querySelector('#healingDay');
const stageEl = document.querySelector('#healingStage');
const messageEl = document.querySelector('#healingMessage');
const trackEl = document.querySelector('#healingTrack');
const dateEl = document.querySelector('#session-date');

if (dayEl && trackEl) {
    const phases = Array.from(trackEl.querySelectorAll('.healing-phase'));

    function pintarEstado() {
        const guardada = leer(GUARDAR.fecha);

        if (dateEl && guardada && guardada !== dateEl.value) {
            dateEl.value = guardada;
        }

        const faltan = !guardada || diasDesde(guardada) === null;

        if (faltan) {
            dayEl.textContent = '—';
            stageEl.textContent = 'Sin fecha de sesión';
            messageEl.textContent = 'Indicá abajo la fecha de tu sesión para ver el seguimiento y el rastro de fases.';
            phases.forEach((p) => p.classList.remove('pasada', 'actual'));
            return;
        }

        const transcurridos = diasDesde(guardada);

        if (transcurridos < 0) {
            dayEl.textContent = '—';
            stageEl.textContent = 'Sesión programada';
            messageEl.textContent = `Tu sesión es el ${fechaLarga(guardada)}. El seguimiento arranca ese día.`;
            phases.forEach((p) => p.classList.remove('pasada', 'actual'));
            return;
        }

        const dia = transcurridos + 1;
        const total = 30;
        const actual = Math.min(8, Math.max(1, Math.ceil((dia / total) * 8)));

        dayEl.textContent = dia <= total ? String(dia).padStart(2, '0') : String(dia);

        if (dia > total) {
            stageEl.textContent = 'Curación completa';
            messageEl.textContent = 'Pasaron los 30 días de seguimiento. Si todavía notás algo inusual, escribime y lo vemos.';
        } else {
            const etapa = ETAPAS.find((e) => dia <= e.hasta);
            stageEl.textContent = etapa.titulo;
            messageEl.textContent = etapa.texto;
        }

        phases.forEach((p, i) => {
            p.classList.toggle('pasada', i < actual - 1);
            p.classList.toggle('actual', i === actual - 1);
        });
    }

    if (dateEl) {
        dateEl.addEventListener('change', () => {
            if (!dateEl.value) {
                borrar(GUARDAR.fecha);
            } else {
                escribir(GUARDAR.fecha, dateEl.value);
            }
            pintarEstado();
        });
    }

    pintarEstado();
}


/* ---------- Componente de subida de imagen reutilizable ---------- */
function crearSubidaImagen(inputId, thumbId, thumbImgId, removeId, alCambiar) {
    const input = document.getElementById(inputId);
    const thumb = document.getElementById(thumbId);
    const thumbImg = document.getElementById(thumbImgId);
    const remove = document.getElementById(removeId);
    if (!input || !thumb || !thumbImg) return null;

    let dataUrl = null;

    async function manejarArchivo(file) {
        if (!file) return;
        dataUrl = await achicarImagen(file, 900, 0.8);
        thumbImg.src = dataUrl;
        thumb.hidden = false;
        if (remove) remove.hidden = false;
        if (alCambiar) alCambiar(dataUrl);
    }

    input.addEventListener('change', () => manejarArchivo(input.files && input.files[0]));

    if (remove) {
        remove.addEventListener('click', () => {
            dataUrl = null;
            input.value = '';
            thumb.hidden = true;
            remove.hidden = true;
            if (alCambiar) alCambiar(null);
        });
    }

    return {
        obtener: () => dataUrl,
        limpiar() {
            dataUrl = null;
            input.value = '';
            thumb.hidden = true;
            if (remove) remove.hidden = true;
        },
    };
}

/* ---------- FIN DEL COMPONENTE ---------- */

/* ---------- Recordatorios ---------- */
const notifForm = document.querySelector('#notification-form');
const notifSelect = document.querySelector('#notification-frequency');
const reminderBox = document.querySelector('#reminder-next');
const reminderText = document.querySelector('#reminder-text');

if (notifForm && notifSelect && reminderBox && reminderText) {
    const INTERVALOS = { daily: 1, 'two-days': 2, weekly: 7 };
    const NOMBRES = { daily: 'Recordatorio diario', 'two-days': 'Recordatorio cada 2 días', weekly: 'Recordatorio semanal' };

    function pintarRecordatorio() {
        const frecuencia = leer(GUARDAR.frecuencia, 'daily');
        if (notifSelect.value !== frecuencia) notifSelect.value = frecuencia;

        const dias = INTERVALOS[frecuencia] || 1;
        const ultimo = leer(GUARDAR.ultimoAviso);

        if (!ultimo) {
            reminderBox.classList.remove('due');
            reminderText.textContent = `${NOMBRES[frecuencia]}. Se activa la primera vez que guardes tus preferencias.`;
            return;
        }

        const faltan = dias - diasDesde(ultimo);

        if (faltan <= 0) {
            reminderBox.classList.add('due');
            reminderText.textContent = `${NOMBRES[frecuencia]}: tenés un recordatorio de cuidado pendiente.`;
        } else {
            reminderBox.classList.remove('due');
            const proximo = new Date();
            proximo.setDate(proximo.getDate() + faltan);
            reminderText.textContent = `${NOMBRES[frecuencia]}: el ${proximo.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}.`;
        }
    }

    notifForm.addEventListener('submit', (e) => {
        e.preventDefault();
        escribir(GUARDAR.frecuencia, notifSelect.value);
        escribir(GUARDAR.ultimoAviso, hoyISO());
        pintarRecordatorio();
    });

    pintarRecordatorio();
}


/* ---------- Calculadora de presupuesto ---------- */
const budgetForm = document.querySelector('#budget-form');
const styleSelect = document.querySelector('#tattoo-style');
const zoneSelect = document.querySelector('#tattoo-zone');
const budgetResult = document.querySelector('#budget-result');
const pricePending = document.querySelector('#price-pending');

function formatear(valor) {
    try {
        return new Intl.NumberFormat(PRECIOS.locale, {
            style: 'currency',
            currency: PRECIOS.moneda,
            maximumFractionDigits: 0,
        }).format(valor);
    } catch (e) {
        return '$' + Math.round(valor);
    }
}



if (budgetForm && styleSelect && zoneSelect && budgetResult) {
    /*El valor y la descripción se toman por id y no por position: el
      panel tiene un <p> dentro del bloque de carga, y con un
      querySelector('p') se tomaba ese en vez del texto del
      resultado.*/
    const strong = document.querySelector('#budget-value');
    const desc = document.querySelector('#budget-desc');
    const panel = document.querySelector('#detection-panel');
    const chips = document.querySelector('#detection-chips');
    const detNote = document.querySelector('#detection-note');

    let analisisIA = null;
    const sizeRadios = () => Array.from(budgetForm.querySelectorAll('input[name="tattoo-size"]'));

    function tamElegido() {
        const r = sizeRadios().find((x) => x.checked);
        return r ? r.value : '';
    }

    const subida = crearSubidaImagen('budget-image', 'budget-thumb', 'budget-thumb-img', 'budget-image-remove', () => {
        /*Si cambia la foto, el análisis anterior ya no corresponde:
          se descarta para no mezclar el precio viejo con la foto nueva.*/
        analisisIA = null;
        if (panel) panel.hidden = true;
        pintar();
    });

    function limpiarDesglose() {
        const viejo = budgetResult.querySelector('.price-breakdown');
        if (viejo) viejo.remove();
    }

    function pintarDesglose(pares) {
        limpiarDesglose();
        const caja = document.createElement('div');
        caja.className = 'price-breakdown';
        pares.forEach(([concepto, valor]) => {
            const fila = document.createElement('div');
            const izq = document.createElement('span');
            const der = document.createElement('span');
            izq.textContent = concepto;
            der.textContent = valor;
            fila.append(izq, der);
            caja.appendChild(fila);
        });
        budgetResult.appendChild(caja);
    }

    function pintarFactores(factores, descriptores, nota, limitado) {
        /*Se limpian TODOS los elementos que se vuelven a pintar. Si no,
          cada recálculo deja una copia más de la nota y el texto se
          va acumulando.*/
        const viejo = budgetResult.querySelector('.factor-list');
        if (viejo) viejo.remove();
        const viejaNota = budgetResult.querySelector('.ai-nota');
        if (viejaNota) viejaNota.remove();

        const caja = document.createElement('div');
        caja.className = 'factor-list';

        factores.forEach((f) => {
            const tag = document.createElement('span');
            tag.className = 'factor-tag';
            tag.textContent = f.etiqueta;
            caja.appendChild(tag);
        });

        descriptores.forEach((d) => {
            const tag = document.createElement('span');
            tag.className = 'factor-tag descriptivo';
            tag.textContent = d.etiqueta;
            caja.appendChild(tag);
        });

        if (limitado) {
            const tag = document.createElement('span');
            tag.className = 'factor-tag descriptivo';
            tag.textContent = 'Ajuste máximo aplicado';
            caja.appendChild(tag);
        }

        budgetResult.appendChild(caja);

        if (nota) {
            const p = document.createElement('p');
            p.className = 'ai-nota';
            p.textContent = nota;
            budgetResult.appendChild(p);
        }
    }

    /*Muestra lo que detectó la IA y deja corregirlo.*/
    function pintarDeteccion() {
        if (!panel || !chips) return;

        if (!analisisIA) {
            panel.hidden = true;
            return;
        }

        panel.hidden = false;
        chips.textContent = '';

        /*Si el modelo dice que no se ve piel, se descarta todo lo que
          haya dicho sobre zona y tamaño: no hay con qué compararlo y
          cualquier valor ahí sería inventado.*/
        const hayPiel = analisisIA.se_ve_piel !== false;
        const zona = hayPiel ? analisisIA.zona_detectada : null;
        const grupo = zona ? ZONA_POR_PARTE[zona.toLowerCase()] : null;
        const tamRel = hayPiel ? analisisIA.tamano_relativo : null;

        const agregar = (texto, tipo) => {
            const chip = document.createElement('span');
            chip.className = 'detection-chip' + (tipo ? ' ' + tipo : '');
            chip.textContent = texto;
            chips.appendChild(chip);
        };

        if (analisisIA.estilo_detectado) {
            agregar(`Estilo: ${ETIQUETAS_ESTILO[analisisIA.estilo_detectado] || analisisIA.estilo_detectado}`);
        }
        if (grupo) {
            agregar(`Zona: ${zona}`);
        }
        if (analisisIA.colores && analisisIA.colores.length) {
            agregar(`Tintas: ${analisisIA.colores.join(' + ')}`);
        }
        if (tamRel) {
            const ref = ESCALA_TAMANO.find((e) => e.valor === tamRel);
            agregar(`Tamaño relativo: ${ref ? ref.etiqueta.replace('Del tamaño de ', '') : tamRel}`);
        }
        if (analisisIA.realismo) {
            agregar('Realismo', 'alerta');
        }

        /*Lo que vio el modelo, para que el cliente entienda de dónde
          sale el rango. Cada frase se valida por separado: si una sale
          rota se descarta, y si no queda ninguna se usa la nota que
          arma el sitio, que nunca falla.*/
        const det = document.querySelector('#detection-detail');
        if (det) {
            const lista = Array.isArray(analisisIA.detalle) ? analisisIA.detalle : [];
            const limpias = lista.filter((d) => typeof d === 'string' && textoSano(d) && d.length > 3);

            if (limpias.length) {
                det.textContent = '';
                const ul = document.createElement('ul');
                limpias.forEach((frase) => {
                    const li = document.createElement('li');
                    li.textContent = frase.charAt(0).toUpperCase() + frase.slice(1);
                    ul.appendChild(li);
                });
                det.appendChild(ul);
                det.hidden = false;
            } else {
                det.textContent = armarNota(analisisIA);
                det.hidden = false;
            }
        }

        /*Los selects quedan pre-cargados con lo que detectó la IA.
          El cliente puede corregirlos.*/
        if (analisisIA.estilo_detectado && ETIQUETAS_ESTILO[analisisIA.estilo_detectado]) {
            styleSelect.value = analisisIA.estilo_detectado;
        }
        if (grupo) zoneSelect.value = grupo;

        /*Si el tamaño que dice el cliente no coincide con lo que se ve
          en la foto, se avisa. Es la contradicción más común.*/
        if (detNote) {
            const escalaElegida = tamElegido();
            if (tamRel && escalaElegida && tamRel !== escalaElegida) {
                const ref = ESCALA_TAMANO.find((e) => e.valor === tamRel);
                detNote.textContent = `En la foto el tattoo se ve más parecido a "${ref ? ref.etiqueta.toLowerCase() : tamRel}" que a lo que marcaste. Revisalo antes de calcular.`;
                detNote.hidden = false;
            } else if (tamRel) {
                detNote.textContent = 'El tamaño que marcaste coincide con lo que se ve en la foto.';
                detNote.hidden = false;
            } else {
                detNote.hidden = true;
            }
        }
    }

    function pintar() {
        const tam = tamElegido();
        const estilo = styleSelect.value;
        const zona = zoneSelect.value;

        if (!tam) {
            pricePending.hidden = true;
            limpiarDesglose();
            strong.textContent = '$—';
            desc.textContent = 'Elegí un tamaño para ver el rango estimado';
            return;
        }

        const calc = calcularRango(estilo, tam, zona || 'simple', analisisIA);

        if (!calc) {
            pricePending.hidden = true;
            limpiarDesglose();
            strong.textContent = 'No disponible';
            strong.classList.remove('rango');
            desc.textContent = `No hay ${(ETIQUETAS_ESTILO[estilo] || estilo || 'ese estilo').toLowerCase()} en ese tamaño.`;
            return;
        }

        pricePending.hidden = true;

        strong.textContent = `${formatear(calc.min)} – ${formatear(calc.max)}`;
        strong.classList.add('rango');
        desc.textContent = calc.conCuerpo
            ? 'Rango estimado. Se ve la zona del cuerpo en la foto, así que el rango es más ajustado.'
            : 'Rango estimado. Con una foto del tattoo en tu cuerpo se puede acotar.';

        pintarDesglose(calc.filas.map((f) => [f.concepto, f.valor]));

        if (analisisIA) {
            pintarFactores(calc.factores, calc.descriptores, armarNota(analisisIA), calc.limitado);
        }
    }

    /*Muestra u oculta el estado de carga.
      El botón también cambia: es la señal más importante de que el
      click se registró, aunque la barra esté fuera de pantalla.*/
    const panelCarga = document.querySelector('#ai-carga');
    const botonCalcular = budgetForm.querySelector('button[type="submit"]');

    function mostrarCarga(activo) {
        if (panelCarga) panelCarga.hidden = !activo;
        budgetResult.classList.toggle('cargando', activo);

        if (botonCalcular) {
            botonCalcular.disabled = activo;
            botonCalcular.textContent = activo ? 'Analizando…' : 'Calcular presupuesto';
        }
    }

    budgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tam = tamElegido();
        const imagen = subida ? subida.obtener() : null;

        if (!tam) {
            pintar();
            return;
        }

        /*Sin foto: se calcula con la tabla sola, sin gastar nada.*/
        if (!imagen) {
            analisisIA = null;
            pintarDeteccion();
            pintar();
            return;
        }

        /*Con foto: primero se calcula el rango base, y en paralelo se
          pide el análisis. Cuando vuelve, se recalcula con los factores.*/
        analisisIA = null;
        pintarDeteccion();
        pintar();

        /*La respuesta tarda varios segundos. Se avisa: si no, el sitio
          parece colgado y la gente vuelve a apretar el botón.*/
        mostrarCarga(true);
        budgetResult.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const res = await analizarConIA('precio', imagen, {
            tamanoElegido: (ESCALA_TAMANO.find((x) => x.valor === tam) || {}).etiqueta || tam,
        });

        mostrarCarga(false);

        if (!res.ok) {
            pintar();
            const p = document.createElement('p');
            p.className = 'ai-error';
            p.textContent = res.error;
            budgetResult.appendChild(p);
            return;
        }

        analisisIA = res.datos;
        pintarDeteccion();
        pintar();

        /*El resultado queda lejos en la página (o en el celular, fuera de
          pantalla). Lo trayemos a la vista.*/
        budgetResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /*Si cambian los overrides, se recalcula al instante.*/
    styleSelect.addEventListener('change', pintar);
    zoneSelect.addEventListener('change', pintar);
    sizeRadios().forEach((r) => r.addEventListener('change', pintar));
}