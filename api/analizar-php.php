<?php
/**
 * /api/analizar — endpoint de análisis con IA para Eclipse Ink
 *
 * Recibe {tarea, imagen, contexto} y devuelve {ok, datos}.
 * La clave de la API nunca sale del servidor: vive en api/config.php
 * o en un archivo .env, y nunca se envía al navegador.
 *
 * Pensado para hosting compartido con PHP (cPanel). No necesita cURL:
 * si está disponible lo usa, y si no, cae a file_get_contents.
 *
 * El prompt vive en api/prompt.txt, que es la fuente única para
 * esta versión en PHP y la de Node en api/analizar.js.
 */

declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/* ---------- utilidades ---------- */

/* El modelo a veces mete un salto de línea REAL dentro de un string
   JSON, que es JSON inválido. Esto lo repara. */
function reparar_json(string $texto): string
{
    $salida = '';
    $largo = strlen($texto);
    $enTexto = false;
    $escapado = false;

    for ($i = 0; $i < $largo; $i++) {
        $c = $texto[$i];

        if ($escapado) { $salida .= $c; $escapado = false; continue; }
        if ($c === '\\') { $salida .= $c; $escapado = true; continue; }
        if ($c === '"') { $enTexto = !$enTexto; $salida .= $c; continue; }

        if ($enTexto && ($c === "\n" || $c === "\r")) {
            $salida .= ' ';
            if ($c === "\r" && $i + 1 < $largo && $texto[$i + 1] === "\n") { $i++; }
            continue;
        }

        $salida .= $c;
    }

    return $salida;
}

/* Saca el ```json ... ``` si el modelo lo envuelve, y extrae el objeto. */
function extraer_json(?string $texto): ?array
{
    if ($texto === null || trim($texto) === '') {
        return null;
    }

    $limpio = trim($texto);

    if (preg_match('/```(?:json)?\s*([\s\S]*?)```/i', $limpio, $m)) {
        $limpio = trim($m[1]);
    }

    /* Primero el intento directo, después con la reparación. */
    foreach ([$limpio, reparar_json($limpio)] as $prueba) {
        $obj = json_decode($prueba, true);
        if (is_array($obj)) {
            return $obj;
        }
    }

    /* A veces el modelo mete texto antes o después del objeto.
       Buscamos el primer { que cierre balanceado. */
    $reparado = reparar_json($limpio);
    $inicio = strpos($reparado, '{');
    if ($inicio === false) {
        return null;
    }

    $nivel = 0;
    $enTexto = false;
    $escapado = false;
    $largo = strlen($reparado);

    for ($i = $inicio; $i < $largo; $i++) {
        $c = $reparado[$i];

        if ($escapado) { $escapado = false; continue; }
        if ($c === '\\') { $escapado = true; continue; }
        if ($c === '"') { $enTexto = !$enTexto; continue; }
        if ($enTexto) { continue; }

        if ($c === '{') { $nivel++; }
        if ($c === '}') {
            $nivel--;
            if ($nivel === 0) {
                $obj = json_decode(substr($reparado, $inicio, $i - $inicio + 1), true);
                return is_array($obj) ? $obj : null;
            }
        }
    }

    return null;
}

/* Palabras en inglés y francés que se le escapan al modelo. */
const PALABRAS_FUERA = [
    'requires', 'aggregates', 'distributed', 'emphasized', 'transitions',
    'boutons', 'resume', 'delineate', 'ornamentosigos', 'luneceantas',
];

/* Grupos de consonantes que no existen en español: delatan las
   palabras rotas ("Aveustría" por "Ave mitológica"). */
const CLUSTERS_INVALIDAS = '/\w(str|scl|stl|scr)\w/i';

/* Quita caracteres de otros alfabetos y palabras en otro idioma. */
function limpiar_texto($valor)
{
    if (!is_string($valor)) {
        return $valor;
    }

    $salida = preg_replace('/[\x{2E80}-\x{9FFF}\x{AC00}-\x{D7AF}\x{F900}-\x{FAFF}\x{FF00}-\x{FFEF}]/u', '', $valor);
    if ($salida === null) {
        $salida = $valor;
    }

    foreach (PALABRAS_FUERA as $p) {
        $salida = preg_replace('/\b' . preg_quote($p, '/') . '\b/iu', '', $salida);
    }

    $salida = preg_replace('/\s+/u', ' ', $salida);
    $salida = preg_replace('/\s+([,.;:])/u', '$1', $salida);

    return trim($salida);
}

/* Si el texto tiene una palabra rota, se descarta entero. */
function texto_roto(string $valor): bool
{
    if (trim($valor) === '') {
        return true;
    }
    if (preg_match('/[^\x20-\x7E¡¿áéíóúüñÁÉÍÓÚÜÑ°·—–"\'(),.:;]/u', $valor)) {
        return true;
    }
    return (bool) preg_match(CLUSTERS_INVALIDAS, $valor);
}

/* Revisa que la respuesta tenga la forma esperada. */
function validar_datos(?array $datos): ?array
{
    if ($datos === null) {
        return null;
    }

    $estilos = ['fineline', 'rellenado', 'mixto', null];
    $niveles = ['simple', 'medio', 'alto'];
    $zonas = [
        'antebrazo', 'pantorrilla', 'brazo', 'pierna', 'muslo', 'hombro',
        'costado', 'espalda', 'torso', 'dedos', 'mano', 'muñeca', 'cuello', 'pecho',
    ];
    $tamanos = ['moneda', 'billetera', 'palma', 'dos palmas', null];
    $factores = ['lineas', 'rellenado', 'sombreado', 'color', 'multiaguja', 'grande'];

    if (!in_array($datos['estilo_detectado'] ?? null, $estilos, true)) {
        $datos['estilo_detectado'] = null;
    }
    if (!in_array($datos['nivel'] ?? null, $niveles, true)) {
        $datos['nivel'] = 'medio';
    }
    if (!in_array($datos['zona_detectada'] ?? null, $zonas, true)) {
        $datos['zona_detectada'] = null;
    }
    if (!in_array($datos['tamano_relativo'] ?? null, $tamanos, true)) {
        $datos['tamano_relativo'] = null;
    }

    if (!is_array($datos['colores'] ?? null)) {
        $datos['colores'] = [];
    }
    if (!is_array($datos['factores'] ?? null)) {
        $datos['factores'] = [];
    }
    $datos['factores'] = array_values(array_filter(
        $datos['factores'],
        static fn($f) => in_array($f, $factores, true)
    ));

    foreach (['grosor', 'greywash', 'realismo', 'se_ve_piel'] as $booleano) {
        if (!is_bool($datos[$booleano] ?? null)) {
            $datos[$booleano] = false;
        }
    }

    /* Sin estilo no hay forma de calcular. */
    if (empty($datos['estilo_detectado'])) {
        $datos['estilo_detectado'] = 'fineline';
    }

    /* El detalle es una lista de frases cortas. Cada una se valida por
       separado: si una sale rota se descarta esa y quedan las demás. */
    if (is_array($datos['detalle'] ?? null)) {
        $limpias = [];
        foreach ($datos['detalle'] as $d) {
            if (!is_string($d)) { continue; }
            $d = limpiar_texto($d);
            /* mbstring puede no estar cargada en el hosting: se mide
               con strlen como respaldo para que el endpoint no muera. */
            $largo = function_exists('mb_strlen') ? mb_strlen($d) : strlen($d);
            if ($d === '' || $largo < 4 || $largo > 80) { continue; }
            if (texto_roto($d)) { continue; }
            $limpias[] = $d;
        }
        $datos['detalle'] = array_slice($limpias, 0, 5);
    } else {
        $datos['detalle'] = [];
    }

    return $datos;
}

/* ---------- pedir al modelo ---------- */

function pedir_al_modelo(string $modelo, string $baseUrl, string $apiKey, array $contenido, int $maxTokens = 2048, string $effort = 'low'): ?string
{
    $cuerpo = [
        'model' => $modelo,
        'max_tokens' => $maxTokens,
        'temperature' => 0,
        'output_config' => ['effort' => $effort],
        'system' => 'Respondé exclusivamente en español rioplatense (Argentina). '
            . 'Todos los textos libres tienen que estar escritos en español: '
            . 'no uses ni una sola palabra en inglés ni en ningún otro idioma. '
            . 'Si una palabra te sale en otro idioma, cambiala por la equivalente '
            . 'en español antes de escribirla. Devolvé únicamente el JSON pedido.',
        'messages' => [['role' => 'user', 'content' => $contenido]],
    ];

    $json = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $url = rtrim($baseUrl, '/') . '/v1/messages';
    $cabeceras = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
    ];

    /* Con cURL si está; si no, cae a file_get_contents.
       Y si cURL está pero falla la conexión (código 0, típico cuando
       falta el CA bundle), también cae a file_get_contents: en muchos
       hostings shared esa función anda sin configurar nada. */
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $cabeceras,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $respuesta = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errorCurl = curl_error($ch);
        curl_close($ch);

        if ($codigo >= 200 && $codigo < 300 && $respuesta !== false) {
            return (string) $respuesta;
        }

        if ($codigo !== 0) {
            error_log('MiniMax error HTTP ' . $codigo);
            return null;
        }

        error_log('cURL no pudo conectar (' . $errorCurl . '), se prueba con file_get_contents');
    }

    $contexto = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $cabeceras),
            'content' => $json,
            'timeout' => 60,
            'ignore_errors' => true,
        ],
    ]);

    $respuesta = @file_get_contents($url, false, $contexto);
    if ($respuesta === false) {
        error_log('No se pudo llamar a MiniMax');
        return null;
    }
    return (string) $respuesta;
}

/* ---------- handler ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido']);
    exit;
}

$apiKey = api_key();
if ($apiKey === '') {
    error_log('Falta la clave de la API');
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'La IA no está configurada en el servidor']);
    exit;
}

$crudo = file_get_contents('php://input');
$cuerpo = json_decode($crudo === false ? '' : $crudo, true);

if (!is_array($cuerpo)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Cuerpo inválido']);
    exit;
}

$tarea = $cuerpo['tarea'] ?? '';
$imagen = $cuerpo['imagen'] ?? '';
$contexto = $cuerpo['contexto'] ?? [];

if ($tarea !== 'precio') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Tarea desconocida']);
    exit;
}

if (!is_string($imagen) || strpos($imagen, 'data:image/') !== 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Falta la imagen']);
    exit;
}

/* 4 MB en base64 es plenty para una foto de celular. */
if (strlen($imagen) > 4 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'La imagen es demasiado grande']);
    exit;
}

/* Límite de uso por IP. Como PHP no guarda estado entre pedidos,
   se anota en un archivo del directorio temporal. */
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'desconocida');
$ip = trim(explode(',', $ip)[0]);
$marca = (int) floor(time() / 3600);
$archivoUso = sys_get_temp_dir() . '/eclipse-uso-' . md5($ip) . '.txt';

if (is_file($archivoUso)) {
    $registro = @file_get_contents($archivoUso);
    $partes = $registro === false ? [] : explode(':', $registro);
    if ((int) ($partes[0] ?? 0) === $marca && (int) ($partes[1] ?? 0) >= 20) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Demasiadas consultas seguidas. Probá de nuevo en un rato.']);
        exit;
    }
}
@file_put_contents($archivoUso, $marca . ':' . ((int) ((explode(':', (string) @file_get_contents($archivoUso))[1] ?? 0)) + 1));

/* El prompt vive en api/prompt.txt, la misma fuente que usa la
   versión de Node. */
$prompt = trim((string) @file_get_contents(__DIR__ . '/prompt.txt'));

if ($prompt === '') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Falta el prompt del análisis']);
    exit;
}

/* El contexto del cliente se arma en texto plano. */
$detalles = '';
if (is_array($contexto)) {
    $lineas = [];
    foreach ($contexto as $clave => $valor) {
        if ($valor === null || $valor === '') { continue; }
        $lineas[] = $clave . ': ' . $valor;
    }
    if ($lineas) {
        $detalles = "\n\nContexto del cliente:\n" . implode("\n", $lineas);
    }
}

/* La imagen viene como data URL: data:image/jpeg;base64,XXXX
   El tipo MIME está en el prefijo, antes del primer ";". Agarrar el
   pedazo equivocado manda "base64" como tipo y el API lo rechaza. */
$partes = explode(',', $imagen, 2);
$prefijo = $partes[0] ?? '';
$mediotipo = 'image/jpeg';
if (preg_match('#^data:([^;]+)#', $prefijo, $m)) {
    $mediotipo = $m[1];
}
$base64 = $partes[1] ?? '';

$contenido = [
    [
        'type' => 'image',
        'source' => [
            'type' => 'base64',
            'media_type' => $mediotipo,
            'data' => $base64,
        ],
    ],
    [
        'type' => 'text',
        'text' => $detalles !== '' ? $prompt . $detalles : $prompt,
    ],
];

$modelo = modelo();
$baseUrl = base_url();

$respuesta = pedir_al_modelo($modelo, $baseUrl, $apiKey, $contenido);

if ($respuesta === null) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'El análisis no se pudo completar']);
    exit;
}

$json = json_decode($respuesta, true);

/* En el formato Anthropic, el texto viene en los bloques de tipo
   "text". Puede haber bloques de thinking antes. */
$texto = '';
if (is_array($json) && isset($json['content']) && is_array($json['content'])) {
    foreach ($json['content'] as $bloque) {
        if (is_array($bloque) && ($bloque['type'] ?? '') === 'text') {
            $texto .= ($bloque['text'] ?? '');
        }
    }
}

$datos = extraer_json($texto);

if ($datos === null) {
    error_log('No se pudo extraer JSON. Texto extraido: [' . substr($texto, 0, 300) . ']');
    error_log('Respuesta cruda: [' . substr($respuesta, 0, 600) . ']');
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'El análisis no se pudo completar']);
    exit;
}

$datos = validar_datos($datos);

http_response_code(200);
echo json_encode(['ok' => true, 'datos' => $datos], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
