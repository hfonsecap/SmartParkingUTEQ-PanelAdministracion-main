# Monitoreo de entrada — guía de instalación y prueba

Vista nueva en `/parqueadero/monitoreo-entrada`. La vista de vehículos y
propietarios queda intacta.

## 1. Archivos

| Archivo | Estado |
|---|---|
| `src/views/parqueadero/MonitoreoEntrada.jsx` | nuevo |
| `src/services/ocrPlacas.js` | nuevo |
| `src/hooks/useCamara.js` | nuevo |
| `src/_nav.jsx` | modificado (nuevo ítem del menú) |
| `src/routes.js` | modificado (nueva ruta) |
| `vite.config.mjs` | modificado (HTTPS local opcional) |
| `package.json` | modificado (script `start:movil`) |
| `.env.example` | nuevo |
| `.github/workflows/azure-static-web-apps.yml` | nuevo |

Copia todo respetando las rutas y luego ejecuta `npm install`.

## 2. Variables de entorno

Crea `.env.local` en la raíz (ya está ignorado por git):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_OCR_ENDPOINT=https://.../api/detectar-placa?code=...
```

La URL con su `code` nunca aparece en el código fuente: el servicio la lee de
`import.meta.env.VITE_OCR_ENDPOINT`. Si falta, la vista muestra un aviso y
deshabilita el botón en lugar de fallar.

## 3. Probar la cámara desde el celular

`navigator.mediaDevices.getUserMedia()` solo existe en orígenes seguros: HTTPS o
`localhost`. Por eso, si abres `http://192.168.x.x:3000` desde el teléfono, el
navegador ni siquiera expone `mediaDevices` y el botón de cámara no funciona.
Tres formas de resolverlo, de la más práctica a la más laboriosa:

### Opción A — Túnel HTTPS (recomendada)

No instala certificados ni toca la red local, y sirve también para enseñar la
app a alguien fuera de tu casa. Con Cloudflare, que no pide cuenta:

```bash
npm start                      # deja Vite corriendo en el puerto 3000
cloudflared tunnel --url http://localhost:3000   # en otra terminal
```

Te devuelve una URL tipo `https://algo-random.trycloudflare.com`. Ábrela en el
celular y la cámara pedirá permiso con normalidad. Instalación de `cloudflared`:
descárgalo desde el repositorio oficial de Cloudflare, o con `winget install
Cloudflare.cloudflared` en Windows y `brew install cloudflared` en Mac.

`ngrok http 3000` hace exactamente lo mismo si ya lo tienes; requiere crear una
cuenta gratuita para obtener el token.

### Opción B — HTTPS local en tu red WiFi

Ya lo dejé configurado. El teléfono y la computadora deben estar en la misma red:

```bash
npm run start:movil
```

Vite imprime una dirección `https://192.168.x.x:3000`. Ábrela en el celular: como
el certificado es autofirmado, Chrome muestra una advertencia; entra en
**Configuración avanzada → Continuar al sitio**. A partir de ahí la cámara
funciona. Es la opción más rápida cuando no hay internet, pero la advertencia
reaparece cada cierto tiempo y en iOS Safari es más insistente.

### Opción C — Marcar el origen como seguro en Chrome Android

Sin instalar nada, pero es manual y solo aplica a ese teléfono. En el celular,
entra a `chrome://flags`, busca `#unsafely-treat-insecure-origin-as-secure`,
escribe `http://192.168.x.x:3000` en el campo, activa la bandera y reinicia
Chrome. Úsalo solo para pruebas.

### Y para las capturas del PDF

Las capturas deben mostrar la URL pública en la barra del navegador, así que la
foto de "cámara funcionando" conviene tomarla ya contra el despliegue de Azure,
que tiene HTTPS propio. Las opciones A–C son para desarrollar sin tener que
publicar en cada cambio.

Detalle a tener en cuenta: la vista pide `facingMode: { ideal: 'environment' }`,
es decir la cámara posterior. En un portátil se abre la cámara frontal porque es
la única disponible; en el teléfono se abre la trasera, que es la que sirve para
apuntar a la placa.

## 4. Despliegue en Azure

1. Sube el proyecto a tu repositorio de GitHub.
2. En Azure crea un recurso **Static Web App** enlazado a ese repositorio.
3. En GitHub, ve a *Settings → Secrets and variables → Actions* y crea:
   - `VITE_OCR_ENDPOINT`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `AZURE_STATIC_WEB_APPS_API_TOKEN` (Azure suele crearlo solo al enlazar)
4. El workflow compila con `npm run build` inyectando esas variables y publica la
   carpeta `build`.

Las variables `VITE_*` se resuelven al compilar, no en el navegador, por eso van
en el paso de build y no en la configuración del sitio en Azure.

El proyecto usa `HashRouter`, así que la URL pública queda como
`https://tu-app.azurestaticapps.net/#/parqueadero/monitoreo-entrada` y no hace
falta configurar reescrituras para rutas profundas.

## 5. Estados que cubre la vista

| Estado de la API | Qué se muestra |
|---|---|
| `encontrado` | Datos del vehículo, fotos, propietario y autorización |
| `no_registrado` | Banner rojo, placa, confianza e ingreso no autorizado |
| `sin_placa` | Aviso ámbar pidiendo capturar de nuevo |
| `baja_confianza` | Aviso ámbar sobre iluminación y encuadre |
| `multiples_placas` | Aviso de encuadrar un solo vehículo |
| 400 / 413 / 415 / 502 / 504 | Mensaje específico y opción de reintentar |

Los datos del vehículo se leen tal cual vienen de la API. Cuando un campo no
llega, aparece un guion; nada se rellena con valores de ejemplo.
