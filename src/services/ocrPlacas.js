/**
 * Servicio de reconocimiento de placas (OCR)
 *
 * Consume el endpoint REST provisto por el docente. La URL y su código de
 * acceso viven exclusivamente en la variable de entorno VITE_OCR_ENDPOINT:
 * nunca se escriben dentro de los componentes ni se publican en el repositorio.
 *
 * @module services/ocrPlacas
 */

/** Tamaño máximo admitido por el servicio: 4 MiB. */
export const TAMANIO_MAXIMO_BYTES = 4 * 1024 * 1024

/** Formatos de imagen admitidos por el endpoint. */
export const FORMATOS_ADMITIDOS = ['image/jpeg', 'image/png']

/** Tiempo máximo de espera antes de abortar la solicitud (ms). */
const TIEMPO_MAXIMO_ESPERA_MS = 60000

const ENDPOINT = import.meta.env.VITE_OCR_ENDPOINT

/**
 * Error de negocio del servicio OCR. Incluye el código HTTP cuando existe.
 */
export class ErrorOcr extends Error {
  constructor(mensaje, { codigo = null, detalle = null } = {}) {
    super(mensaje)
    this.name = 'ErrorOcr'
    this.codigo = codigo
    this.detalle = detalle
  }
}

/**
 * Convierte los bytes a un texto legible para el usuario.
 *
 * @param {number} bytes
 * @returns {string} Por ejemplo "3,4 MB"
 */
export const formatearTamanio = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Valida formato y peso antes de gastar una llamada al endpoint.
 *
 * @param {File|Blob} archivo
 * @returns {string} Mensaje de error, o cadena vacía si la imagen es válida.
 */
export const validarImagen = (archivo) => {
  if (!archivo) {
    return 'Selecciona o captura una imagen antes de detectar la placa.'
  }

  if (archivo.type && !FORMATOS_ADMITIDOS.includes(archivo.type)) {
    return 'Formato no admitido. Usa una imagen JPG o PNG.'
  }

  if (archivo.size === 0) {
    return 'La imagen está vacía. Vuelve a capturarla.'
  }

  if (archivo.size > TAMANIO_MAXIMO_BYTES) {
    return `La imagen pesa ${formatearTamanio(archivo.size)} y el máximo permitido es 4 MB. Reduce la resolución e inténtalo de nuevo.`
  }

  return ''
}

/**
 * Traduce los códigos HTTP documentados a mensajes entendibles.
 *
 * @param {number} codigo
 * @param {string} cuerpo Texto crudo devuelto por el servicio.
 * @returns {string}
 */
const mensajeSegunCodigo = (codigo, cuerpo) => {
  switch (codigo) {
    case 400:
      return 'La imagen está vacía, dañada o tiene dimensiones no permitidas. Captura otra fotografía.'
    case 413:
      return 'La imagen supera los 4 MB permitidos. Reduce su tamaño e inténtalo de nuevo.'
    case 415:
      return 'Formato no admitido por el servicio. Envía la imagen en JPG o PNG.'
    case 502:
      return 'El servicio de reconocimiento o la base de datos no respondieron. Reintenta en unos segundos.'
    case 504:
      return 'El tiempo de espera se agotó. Reintenta con una imagen más liviana.'
    default:
      return `El servicio respondió con el código ${codigo}. ${cuerpo || 'Reintenta la operación.'}`.trim()
  }
}

/**
 * Normaliza la confianza a porcentaje sin alterar la información recibida.
 * El servicio puede entregarla como fracción (0.989) o como porcentaje (98.9).
 *
 * @param {unknown} valor
 * @returns {number|null}
 */
const normalizarConfianza = (valor) => {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return null
  return numero <= 1 ? numero * 100 : numero
}

/**
 * Arma el data URL de la imagen marcada devuelta en Base64 por la API.
 *
 * @param {{mime_type?: string, base64?: string}|null|undefined} imagenMarcada
 * @returns {string} Data URL listo para el atributo src, o cadena vacía.
 */
export const construirImagenMarcada = (imagenMarcada) => {
  if (!imagenMarcada?.base64) return ''
  const tipo = imagenMarcada.mime_type || 'image/jpeg'
  return `data:${tipo};base64,${imagenMarcada.base64}`
}

/**
 * Envía la imagen al endpoint OCR como cuerpo binario y devuelve la respuesta.
 *
 * La API recibe los bytes originales de la imagen; no se envía JSON con Base64
 * aunque el servicio use ese formato internamente.
 *
 * @param {File|Blob} archivo Imagen capturada o seleccionada por el usuario.
 * @returns {Promise<Object>} Respuesta cruda del servicio, sin modificaciones.
 * @throws {ErrorOcr} Cuando la validación falla o el servicio responde con error.
 */
export const detectarPlaca = async (archivo) => {
  if (!ENDPOINT) {
    throw new ErrorOcr(
      'Falta configurar VITE_OCR_ENDPOINT. Define la variable de entorno antes de usar el monitoreo.',
    )
  }

  const errorValidacion = validarImagen(archivo)
  if (errorValidacion) {
    throw new ErrorOcr(errorValidacion)
  }

  const controlador = new AbortController()
  const temporizador = setTimeout(
    () => controlador.abort(),
    TIEMPO_MAXIMO_ESPERA_MS,
  )

  let respuesta
  try {
    respuesta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': archivo.type || 'application/octet-stream',
      },
      body: archivo,
      signal: controlador.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ErrorOcr(
        'El tiempo de espera se agotó. Verifica tu conexión y reintenta.',
        { codigo: 504 },
      )
    }
    throw new ErrorOcr(
      'No se pudo contactar al servicio de reconocimiento. Revisa tu conexión a internet.',
      { detalle: error.message },
    )
  } finally {
    clearTimeout(temporizador)
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => '')
    throw new ErrorOcr(mensajeSegunCodigo(respuesta.status, cuerpo), {
      codigo: respuesta.status,
      detalle: cuerpo,
    })
  }

  try {
    return await respuesta.json()
  } catch {
    throw new ErrorOcr(
      'El servicio devolvió una respuesta que no pudo interpretarse. Reintenta la operación.',
      { codigo: respuesta.status },
    )
  }
}

/**
 * Extrae los campos que la interfaz necesita, tolerando variaciones de nombre
 * en la respuesta. No inventa ni completa datos: lo ausente queda en null.
 *
 * @param {Object} resultado Respuesta cruda del endpoint.
 * @returns {{estado: string, placa: string, confianza: number|null,
 *   vehiculoEncontrado: boolean, vehiculo: Object|null, imagenMarcada: string,
 *   mensaje: string, placas: Array}}
 */
export const interpretarResultado = (resultado) => {
  const estado = resultado?.estado ?? 'desconocido'
  const placa = resultado?.placa ?? resultado?.placa_detectada ?? ''

  const confianzaCruda =
    resultado?.confianza ??
    resultado?.confianza_ocr ??
    resultado?.ocr?.confianza ??
    null

  return {
    estado,
    placa,
    confianza: normalizarConfianza(confianzaCruda),
    vehiculoEncontrado: resultado?.vehiculo_encontrado === true,
    vehiculo: resultado?.vehiculo ?? null,
    imagenMarcada: construirImagenMarcada(resultado?.imagen_marcada),
    mensaje: resultado?.mensaje ?? '',
    placas: resultado?.placas ?? [],
  }
}
