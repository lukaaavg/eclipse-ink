# Eclipse Ink

Sitio de Eclipse Ink — tatuajes en fineline, blackwork y neo tribal.
Garuhapé, Misiones.

**Producción:** https://eclipse-ink.vercel.app
**Repositorio:** https://github.com/lukaaavg/eclipse-ink

Sitio estático (HTML + CSS + JS sin framework) con una función
serverless para el análisis con IA.

---

## Estructura

```
index.html          Home
portfolio.html      Portfolio (carrusel)
contacto.html       Contacto y preguntas frecuentes
dashboard.html      "Mi seguimiento": estado de curación, diario,
                    análisis de síntomas y calculadora de presupuesto

style.css           Todos los estilos
main.js             Todo el comportamiento del sitio

api/analizar.js     Función serverless: habla con MiniMax.
                    Acá vive la clave de la API (nunca en el navegador).

servidor-local.js   Servidor para desarrollo. Sirve el sitio y expone
                    /api/analizar igual que en producción.

estudio/            Fotos del espacio de trabajo
tatuajes/           Fotos de tattoos
favicon-*.png       Iconos de la pestaña (sacados de logo-simplificado.png)
og-image.jpg        Imagen para compartir en redes
```

---

## Desarrollo local

```bash
npm start
```

Abre `http://localhost:8080`.

### Probar la IA real en local

```powershell
# PowerShell
$env:MINIMAX_API_KEY = "sk-..."
npm start
```

La calculadora usa la IA real por defecto. Con `?ia=mock` en la URL
fuerza la simulación, para trabajar en la interfaz sin gastar.

---

## Publicar

Hay dos destinos posibles. La calculadora necesita un backend (el
análisis con IA), así que en los dos casos hace falta una función
serverless.

### En el server con PHP (FileZilla)

1. Subí **todo** el contenido de la carpeta al `public_html` (o a la
   carpeta donde está el sitio).
2. Creá un archivo `.env` en la raíz del sitio con tu clave:

   ```
   MINIMAX_API_KEY=sk-cp-...
   ```

   Se puede bajar de `ejemplo-env.txt`. **No le pongas `.txt` al
   final.** El archivo tiene que llamarse `.env` exactamente.
3. Verificá que en `public_html` queden estas carpetas y archivos:

   ```
   api/analizar-php.php  ← el endpoint
   api/config.php        ← lee la clave
   api/prompt.txt        ← las reglas del análisis
   index.html, contacto.html, portfolio.html, dashboard.html
   style.css, main.js
   favicon-*.png, apple-touch-icon.png, og-image.jpg
   logo-blanco.png, logo-simplificado.png
   estudio/, tatuajes/
   ```

4. **No hace falta** subir `api/analizar.js`, `vercel.json`,
   `package.json`, `servidor-local.js` ni `.vercel/`. Son para Node y
   para Vercel, no para el server con PHP. Subirlos no rompe nada, pero
   tampoco sirven.

5. Probá la calculadora con una foto. Si el rango no aparece, el
   problema casi siempre es el `.env`: revisá que exista, que se llame
   `.env` y que no tenga un BOM (si lo abriste con el Bloc de notas y
   lo guardaste como "UTF-8 con BOM", la clave no se lee).

### En Vercel

```bash
npm run deploy
```

O a mano:

```bash
git add .
git commit -m "lo que sea"
git push              # si el auto-deploy está conectado, publica solo
vercel --prod --yes   # o subilo directo con el CLI
```

### Variables de entorno

| Variable | Para qué | Obligatoria |
|---|---|---|
| `MINIMAX_API_KEY` | La clave de la API | Sí |
| `MINIMAX_MODELO` | Modelo a usar (por defecto `MiniMax-M3.1-Flash`) | No |
| `MINIMAX_BASE_URL` | Endpoint (por defecto `https://api.minimax.io/anthropic`) | No |

En Vercel se definen en **Project → Settings → Environment Variables**.
En el server con PHP van en el archivo `.env`.

La clave **nunca va en el código**: vive solo en el servidor.

### La ruta del endpoint

El navegador prueba `/api/analizar` primero (Vercel) y si recibe un
404 prueba `/api/analizar-php.php` (hosting con PHP), y se queda con la
que funcione. Por eso el mismo sitio anda en los dos lugares sin
cambiar nada.

---

## Editar los precios

Todo está en un solo bloque de `main.js`, al principio:

```js
const PRECIOS = {
    moneda: 'ARS',
    estilos: { fineline: {...}, rellenado: {...}, mixto: {...} },
    zona:    { simple: 1.0, media: 1.15, compleja: 1.3 },
    factores:{ lineas: 1.15, sombreado: 1.1, greywash: 1.4, ... },
    tope: 2.0,
};
```

Los valores son **"desde"**: el precio final lo confirma el tatuador.

Los multiplicadores por zona y por factor están en `INCERTIDUMBRE` y
`PRECIOS.factores`. El rango que se muestra al cliente se calcula en
`calcularRango()`.

---

## Cómo funciona el análisis con IA

1. El cliente sube una foto y elige un tamaño (escala visual: moneda,
   billetera, palma, dos palmas).
2. La función `/api/analizar` le manda la imagen al modelo con el prompt
   de `api/analizar.js` (las reglas del tatuador).
3. El modelo devuelve **datos estructurados**: colores de tinta, estilo,
   zona, tamaño relativo, factores, nivel.
4. **El precio lo calcula el sitio**, no el modelo: la tabla de precios
   por estilo y tamaño, por zona, por factor.
5. El texto que ve el cliente lo arma el sitio con esos datos, así que
   nunca puede contradecir el precio.

Si el modelo detecta que la foto **no** muestra piel (una referencia
suelta), la zona y el tamaño se descartan y el rango se abre, porque no
hay forma de medirlos.

En el diario de síntomas, el análisis por palabras clave **manda
siempre**: la IA puede sumar una alerta, nunca levantarla.

---

## Dónde se guardan los datos del cliente

En el navegador (`localStorage`), no en ningún servidor. La foto que
sube el cliente **se envía a la API para analizarse y no se guarda en
ningún lado**.
