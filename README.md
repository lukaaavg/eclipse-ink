# Eclipse Ink

Sitio de Eclipse Ink — tatuajes en fineline, blackwork y neo tribal.
Garuhapé, Misiones.

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
assets/             Logos originales (no se usan en el sitio)
favicon.svg         Ícono
og-image.jpg        Imagen para compartir en redes
```

---

## Desarrollo local

```bash
npm start
```

Abre `http://localhost:8080`.

### Probar la IA real

Sin esto, la calculadora funciona en **modo prueba**: devuelve un
resultado de ejemplo y lo avisa en pantalla.

```bash
# PowerShell
$env:MINIMAX_API_KEY = "sk-..."
npm start
```

Después entrá a `http://localhost:8080/dashboard.html?ia=real`.

Sin la variable, el sitio avisa que está en modo prueba.

---

## Deploy en Vercel

1. Subí el proyecto a un repositorio de GitHub.
   Los archivos pesados (`_originales/`, `foto1-3.jpg`) ya están en
   `.gitignore`: no subas 25 MB de backups.

2. Entrá a [vercel.com](https://vercel.com) y conectá el repositorio.
   Vercel detecta el proyecto solo: no hay build step.

3. Agregá la variable de entorno:
   **Settings → Environment Variables → `MINIMAX_API_KEY`**
   Marcá **Production** y **Preview**. Sin esto la IA no funciona.

4. Deploy. Vercel publica el sitio y la función `/api/analizar`
   queda disponible en el mismo dominio.

### Después del primer deploy

- La calculadora sigue en **modo prueba** hasta que en `main.js`
  cambie la línea:

  ```js
  const MODO_MOCK = new URLSearchParams(location.search).get('ia') !== 'real';
  ```

  Para que en producción use la IA real siempre, reemplazala por:

  ```js
  const MODO_MOCK = false;
  ```

  Si querés poder probarla en local con `?ia=real`, dejala como está
  y en producción la variable de entorno manda igual.

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

---

## Dónde se guardan los datos del cliente

En el navegador (`localStorage`), no en ningún servidor. La foto que
sube el cliente para el análisis **se envía a la API para analizarse y
no se guarda en ningún lado**.

---

## Despliegue con git

```bash
git init
git add .
git commit -m "Eclipse Ink"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/REPO.git
git push -u origin main
```

Luego en Vercel: **Add New → Project → importá el repo**.
