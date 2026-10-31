<?php
/**
 * Configuración de la API.
 *
 * La clave NUNCA va dentro de analizar.php ni en el navegador.
 * Se busca en este orden:
 *
 *   1) Variable de entorno del servidor:  MINIMAX_API_KEY
 *   2) Archivo .env en la raiz del sitio: MINIMAX_API_KEY=sk-...
 *   3) La constante de abajo, como ultimo recurso.
 *
 * Para hosting compartido lo normal es la opción 2: se sube un .env
 * al server con la clave adentro. Ese archivo esta en .gitignore y en
 * .vercelignore, asi que no se publica por error.
 *
 * Si el .env no existe, se puede poner la clave acá abajo. Es menos
 * limpio pero funciona. Si la pones, no subas este archivo a ningun
 * repositorio publico.
 */

declare(strict_types=1);

function leer_env(string $ruta): array
{
    $salida = [];

    if (!is_file($ruta)) {
        return $salida;
    }

    $lineas = @file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lineas === false) {
        return $salida;
    }

    foreach ($lineas as $linea) {
        /* Si el archivo fue guardado con BOM (pasa en Windows, y
           muchos editores lo agregan), el primer nombre de variable
           queda con unos bytes invisibles adelante y nunca coincide.
           Por eso se sacan al empezar. */
        $linea = str_replace("\xEF\xBB\xBF", '', $linea);
        $linea = trim($linea);
        if ($linea === '' || $linea[0] === '#') {
            continue;
        }
        $pos = strpos($linea, '=');
        if ($pos === false) {
            continue;
        }
        $clave = trim(substr($linea, 0, $pos));
        $valor = trim(substr($linea, $pos + 1));
        $valor = trim($valor, "\"' \t");
        $salida[$clave] = $valor;
    }

    return $salida;
}

/* La clave de la API. */
function api_key(): string
{
    $entorno = getenv('MINIMAX_API_KEY');
    if (is_string($entorno) && $entorno !== '') {
        return $entorno;
    }

    $env = leer_env(dirname(__DIR__) . '/.env');
    if (isset($env['MINIMAX_API_KEY']) && $env['MINIMAX_API_KEY'] !== '') {
        return $env['MINIMAX_API_KEY'];
    }

    return '';
}

/* El modelo a usar. */
function modelo(): string
{
    $entorno = getenv('MINIMAX_MODELO');
    if (is_string($entorno) && $entorno !== '') {
        return $entorno;
    }

    $env = leer_env(dirname(__DIR__) . '/.env');
    if (isset($env['MINIMAX_MODELO']) && $env['MINIMAX_MODELO'] !== '') {
        return $env['MINIMAX_MODELO'];
    }

    return 'MiniMax-M3.1-Flash';
}

/* El endpoint. */
function base_url(): string
{
    $entorno = getenv('MINIMAX_BASE_URL');
    if (is_string($entorno) && $entorno !== '') {
        return $entorno;
    }

    $env = leer_env(dirname(__DIR__) . '/.env');
    if (isset($env['MINIMAX_BASE_URL']) && $env['MINIMAX_BASE_URL'] !== '') {
        return $env['MINIMAX_BASE_URL'];
    }

    return 'https://api.minimax.io/anthropic';
}
