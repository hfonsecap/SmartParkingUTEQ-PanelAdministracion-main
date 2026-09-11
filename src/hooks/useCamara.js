/**
 * Hook de acceso a la cámara del dispositivo.
 *
 * Encapsula navigator.mediaDevices.getUserMedia(), prefiere la cámara posterior
 * en teléfonos y libera el stream cuando el componente se desmonta o el usuario
 * cambia de vista, para que el indicador de grabación no quede encendido.
 *
 * @module hooks/useCamara
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** Restricciones de video: cámara posterior cuando el equipo la tenga. */
const RESTRICCIONES = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
}

/**
 * Traduce los errores de getUserMedia a instrucciones accionables.
 *
 * @param {Error} error
 * @returns {string}
 */
const mensajeDeError = (error) => {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permiso de cámara denegado. Habilítalo en los ajustes del navegador y vuelve a intentarlo.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ninguna cámara en este dispositivo. Sube una imagen desde el equipo.'
    case 'NotReadableError':
      return 'La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.'
    case 'OverconstrainedError':
      return 'La cámara no admite la resolución solicitada. Prueba con otro dispositivo.'
    default:
      return 'No se pudo iniciar la cámara. Revisa los permisos del navegador.'
  }
}

/**
 * @returns {{
 *   videoRef: React.RefObject<HTMLVideoElement>,
 *   activa: boolean,
 *   iniciando: boolean,
 *   error: string,
 *   soportada: boolean,
 *   iniciar: () => Promise<void>,
 *   detener: () => void,
 *   capturar: () => Promise<Blob|null>
 * }}
 */
export const useCamara = () => {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [activa, setActiva] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [error, setError] = useState('')

  const soportada =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)

  /** Corta todas las pistas y suelta el dispositivo. */
  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach((pista) => pista.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setActiva(false)
  }, [])

  /** Pide permiso y muestra la vista previa en tiempo real. */
  const iniciar = useCallback(async () => {
    if (!soportada) {
      setError(
        'Este navegador no permite el acceso a la cámara. Abre la aplicación por HTTPS o sube una imagen desde el dispositivo.',
      )
      return
    }

    setError('')
    setIniciando(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia(RESTRICCIONES)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      setActiva(true)
    } catch (errorCamara) {
      detener()
      setError(mensajeDeError(errorCamara))
    } finally {
      setIniciando(false)
    }
  }, [detener, soportada])

  /**
   * Dibuja el cuadro actual en un canvas y lo entrega como Blob JPEG,
   * que es el cuerpo binario que espera el endpoint.
   *
   * @returns {Promise<Blob|null>}
   */
  const capturar = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null

    const lienzo = document.createElement('canvas')
    lienzo.width = video.videoWidth
    lienzo.height = video.videoHeight
    lienzo.getContext('2d').drawImage(video, 0, 0, lienzo.width, lienzo.height)

    return new Promise((resolver) => {
      lienzo.toBlob((blob) => resolver(blob), 'image/jpeg', 0.92)
    })
  }, [])

  // Libera la cámara al desmontar la vista.
  useEffect(() => detener, [detener])

  return { videoRef, activa, iniciando, error, soportada, iniciar, detener, capturar }
}
