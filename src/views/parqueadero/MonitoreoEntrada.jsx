/**
 * Monitoreo de entrada
 *
 * Captura la fotografía de un vehículo con la cámara del dispositivo o desde un
 * archivo, la envía al endpoint de reconocimiento de placas y muestra si el
 * vehículo está registrado en Supabase.
 *
 * Ruta: /parqueadero/monitoreo-entrada
 *
 * @module views/parqueadero/MonitoreoEntrada
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilCamera,
  cilCarAlt,
  cilCheckCircle,
  cilCloudUpload,
  cilDescription,
  cilImage,
  cilMediaStop,
  cilReload,
  cilUser,
  cilWarning,
  cilXCircle,
} from '@coreui/icons'

import { useCamara } from '../../hooks/useCamara'
import {
  ErrorOcr,
  FORMATOS_ADMITIDOS,
  detectarPlaca,
  formatearTamanio,
  interpretarResultado,
  validarImagen,
} from '../../services/ocrPlacas'

/**
 * Configuración visual de cada estado devuelto por la API.
 * El texto describe qué pasó y qué debe hacer el operador.
 */
const ESTADOS = {
  encontrado: {
    color: 'success',
    icono: cilCheckCircle,
    titulo: 'VEHÍCULO REGISTRADO',
    detalle: 'La placa existe en la base de datos de Supabase.',
  },
  no_registrado: {
    color: 'danger',
    icono: cilWarning,
    titulo: 'VEHÍCULO NO REGISTRADO',
    detalle: 'La placa no existe en la base de datos de Supabase.',
  },
  sin_placa: {
    color: 'warning',
    icono: cilXCircle,
    titulo: 'NO SE DETECTÓ UNA PLACA',
    detalle:
      'Acerca la cámara a la parte frontal del vehículo y captura otra imagen.',
  },
  baja_confianza: {
    color: 'warning',
    icono: cilWarning,
    titulo: 'LECTURA POCO CONFIABLE',
    detalle:
      'La placa se leyó con baja confianza. Mejora la iluminación y captura la imagen nuevamente.',
  },
  multiples_placas: {
    color: 'warning',
    icono: cilWarning,
    titulo: 'SE DETECTARON VARIAS PLACAS',
    detalle:
      'Encuadra un solo vehículo a la vez para identificar la placa correcta.',
  },
}

const ESTADO_DESCONOCIDO = {
  color: 'secondary',
  icono: cilWarning,
  titulo: 'ESTADO NO RECONOCIDO',
  detalle: 'El servicio devolvió un estado que la aplicación no contempla.',
}

/** Fila de la tabla de resultados. */
const FilaDato = ({ icono, etiqueta, children }) => (
  <div className="d-flex align-items-center justify-content-between gap-3 py-2 px-3 border-bottom">
    <span className="d-flex align-items-center gap-2 text-body-secondary">
      <CIcon icon={icono} size="lg" />
      {etiqueta}
    </span>
    <span className="fw-semibold text-end">{children}</span>
  </div>
)

const MonitoreoEntrada = () => {
  const camara = useCamara()
  const entradaArchivoRef = useRef(null)

  const [archivo, setArchivo] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState('')
  const [origen, setOrigen] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  const faltaEndpoint = !import.meta.env.VITE_OCR_ENDPOINT

  // Evita fugas de memoria con las URLs temporales de vista previa.
  useEffect(() => {
    return () => {
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
    }
  }, [vistaPrevia])

  /** Reemplaza la imagen en preparación y limpia el resultado anterior. */
  const establecerImagen = useCallback((nuevoArchivo, nuevoOrigen) => {
    setArchivo(nuevoArchivo)
    setOrigen(nuevoOrigen)
    setResultado(null)
    setError('')
    setVistaPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior)
      return URL.createObjectURL(nuevoArchivo)
    })
  }, [])

  const alSeleccionarArchivo = (evento) => {
    const seleccionado = evento.target.files?.[0]
    evento.target.value = ''
    if (!seleccionado) return

    const mensaje = validarImagen(seleccionado)
    if (mensaje) {
      setError(mensaje)
      return
    }

    camara.detener()
    establecerImagen(seleccionado, 'archivo')
  }

  const alCapturar = async () => {
    const blob = await camara.capturar()
    if (!blob) {
      setError('La cámara aún no entrega imagen. Espera un momento y reintenta.')
      return
    }

    const capturada = new File([blob], `captura-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    })

    const mensaje = validarImagen(capturada)
    if (mensaje) {
      setError(mensaje)
      return
    }

    camara.detener()
    establecerImagen(capturada, 'camara')
  }

  const alDetectarPlaca = async () => {
    setProcesando(true)
    setError('')

    try {
      const respuesta = await detectarPlaca(archivo)
      setResultado(interpretarResultado(respuesta))
    } catch (errorDeteccion) {
      setResultado(null)
      setError(
        errorDeteccion instanceof ErrorOcr
          ? errorDeteccion.message
          : 'Ocurrió un error inesperado al procesar la imagen.',
      )
    } finally {
      setProcesando(false)
    }
  }

  /** Vuelve al estado inicial para analizar otro vehículo. */
  const reiniciar = () => {
    setVistaPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior)
      return ''
    })
    setArchivo(null)
    setOrigen('')
    setResultado(null)
    setError('')
  }

  const nuevaCaptura = () => {
    reiniciar()
    camara.iniciar()
  }

  const subirOtraImagen = () => {
    reiniciar()
    entradaArchivoRef.current?.click()
  }

  const estadoVisual = resultado
    ? (ESTADOS[resultado.estado] ?? ESTADO_DESCONOCIDO)
    : null
  const vehiculo = resultado?.vehiculo ?? null
  const imagenIzquierda = resultado?.imagenMarcada || vistaPrevia

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div className="border-start border-4 border-success ps-3">
          <h2 className="mb-0">Monitoreo de entrada</h2>
          <div className="text-body-secondary">
            Reconocimiento automático de placas en el ingreso al parqueadero.
          </div>
        </div>
      </div>

      {faltaEndpoint && (
        <CAlert color="warning" className="d-flex align-items-center gap-2">
          <CIcon icon={cilWarning} />
          <span>
            Falta la variable <code>VITE_OCR_ENDPOINT</code>. Configúrala en{' '}
            <code>.env.local</code> o en los secretos del despliegue para activar
            el reconocimiento.
          </span>
        </CAlert>
      )}

      <CRow className="g-4">
        {/* ---------- Columna izquierda: captura ---------- */}
        <CCol xs={12} lg={6}>
          <CCard className="h-100">
            <CCardHeader className="d-flex align-items-center gap-2">
              <CIcon icon={cilImage} className="text-success" />
              <strong>
                {resultado ? 'Imagen procesada' : 'Captura del vehículo'}
              </strong>
            </CCardHeader>

            <CCardBody className="d-flex flex-column gap-3">
              <div
                className="bg-body-tertiary rounded d-flex align-items-center justify-content-center overflow-hidden position-relative"
                style={{ minHeight: '320px' }}
              >
                {/* El video permanece montado para que el stream siempre tenga destino */}
                <video
                  ref={camara.videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-100"
                  style={{
                    display: camara.activa && !imagenIzquierda ? 'block' : 'none',
                    maxHeight: '460px',
                    objectFit: 'contain',
                  }}
                />

                {imagenIzquierda && (
                  <img
                    src={imagenIzquierda}
                    alt={
                      resultado?.imagenMarcada
                        ? 'Vehículo con la placa detectada'
                        : 'Vista previa de la imagen seleccionada'
                    }
                    className="w-100"
                    style={{ maxHeight: '460px', objectFit: 'contain' }}
                  />
                )}

                {!imagenIzquierda && !camara.activa && (
                  <div className="text-center text-body-secondary p-4">
                    <CIcon icon={cilCamera} size="3xl" className="mb-3" />
                    <p className="mb-0">
                      Enciende la cámara o sube una fotografía del vehículo.
                    </p>
                  </div>
                )}

                {procesando && (
                  <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-dark bg-opacity-50 text-white">
                    <CSpinner color="light" />
                    <span className="mt-3">Reconociendo la placa...</span>
                  </div>
                )}
              </div>

              {camara.error && (
                <CAlert color="warning" className="mb-0 py-2">
                  {camara.error}
                </CAlert>
              )}

              {error && (
                <CAlert color="danger" className="mb-0 py-2">
                  {error}
                </CAlert>
              )}

              {archivo && (
                <div className="small text-body-secondary">
                  {origen === 'camara' ? 'Capturada con la cámara' : archivo.name}{' '}
                  · {formatearTamanio(archivo.size)}
                </div>
              )}

              <input
                ref={entradaArchivoRef}
                type="file"
                accept={FORMATOS_ADMITIDOS.join(',')}
                onChange={alSeleccionarArchivo}
                className="d-none"
              />

              {/* Controles: cambian según haya o no un resultado en pantalla */}
              {resultado ? (
                <div className="d-flex flex-wrap gap-2">
                  <CButton
                    color="success"
                    className="flex-fill d-flex align-items-center justify-content-center gap-2"
                    onClick={nuevaCaptura}
                  >
                    <CIcon icon={cilCamera} /> Nueva captura
                  </CButton>
                  <CButton
                    color="secondary"
                    variant="outline"
                    className="flex-fill d-flex align-items-center justify-content-center gap-2"
                    onClick={subirOtraImagen}
                  >
                    <CIcon icon={cilCloudUpload} /> Subir otra imagen
                  </CButton>
                </div>
              ) : (
                <>
                  <div className="d-flex flex-wrap gap-2">
                    {camara.activa ? (
                      <>
                        <CButton
                          color="success"
                          className="flex-fill d-flex align-items-center justify-content-center gap-2"
                          onClick={alCapturar}
                          disabled={procesando}
                        >
                          <CIcon icon={cilCamera} /> Tomar fotografía
                        </CButton>
                        <CButton
                          color="danger"
                          variant="outline"
                          className="d-flex align-items-center justify-content-center gap-2"
                          onClick={camara.detener}
                        >
                          <CIcon icon={cilMediaStop} /> Detener cámara
                        </CButton>
                      </>
                    ) : (
                      <>
                        <CButton
                          color="success"
                          className="flex-fill d-flex align-items-center justify-content-center gap-2"
                          onClick={camara.iniciar}
                          disabled={camara.iniciando || procesando}
                        >
                          {camara.iniciando ? (
                            <CSpinner size="sm" />
                          ) : (
                            <CIcon icon={cilCamera} />
                          )}
                          {camara.iniciando ? 'Abriendo cámara' : 'Encender cámara'}
                        </CButton>
                        <CButton
                          color="secondary"
                          variant="outline"
                          className="flex-fill d-flex align-items-center justify-content-center gap-2"
                          onClick={() => entradaArchivoRef.current?.click()}
                          disabled={procesando}
                        >
                          <CIcon icon={cilCloudUpload} /> Subir imagen
                        </CButton>
                      </>
                    )}
                  </div>

                  <CButton
                    color="primary"
                    size="lg"
                    className="d-flex align-items-center justify-content-center gap-2"
                    onClick={alDetectarPlaca}
                    disabled={!archivo || procesando || faltaEndpoint}
                  >
                    {procesando ? (
                      <>
                        <CSpinner size="sm" /> Procesando...
                      </>
                    ) : (
                      <>
                        <CIcon icon={cilCarAlt} /> Detectar placa
                      </>
                    )}
                  </CButton>

                  <div className="small text-body-secondary">
                    Formatos JPG o PNG, hasta 4 MB.
                  </div>
                </>
              )}
            </CCardBody>
          </CCard>
        </CCol>

        {/* ---------- Columna derecha: resultados ---------- */}
        <CCol xs={12} lg={6}>
          <CCard className="h-100">
            <CCardHeader className="d-flex align-items-center gap-2">
              <CIcon icon={cilDescription} className="text-success" />
              <strong>Resultado del reconocimiento</strong>
            </CCardHeader>

            <CCardBody>
              {!resultado && !procesando && (
                <div className="text-center text-body-secondary py-5">
                  <CIcon icon={cilCarAlt} size="3xl" className="mb-3" />
                  <p className="mb-0">
                    Los datos del vehículo aparecerán aquí después de detectar la
                    placa.
                  </p>
                </div>
              )}

              {procesando && (
                <div className="text-center py-5">
                  <CSpinner color="success" />
                  <p className="mt-3 mb-0">Consultando el servicio OCR...</p>
                </div>
              )}

              {resultado && !procesando && (
                <>
                  <div
                    className={`bg-${estadoVisual.color} text-white rounded d-flex align-items-center justify-content-center gap-3 py-3 px-3 mb-4`}
                  >
                    <CIcon icon={estadoVisual.icono} size="xxl" />
                    <h4 className="mb-0 fw-bold">{estadoVisual.titulo}</h4>
                  </div>

                  <div className="border rounded mb-4">
                    <FilaDato icono={cilDescription} etiqueta="Placa detectada">
                      {resultado.placa || <span className="text-body-secondary">—</span>}
                    </FilaDato>

                    <FilaDato icono={cilCheckCircle} etiqueta="Confianza OCR">
                      {resultado.confianza !== null ? (
                        `${resultado.confianza.toFixed(1).replace('.', ',')} %`
                      ) : (
                        <span className="text-body-secondary">—</span>
                      )}
                    </FilaDato>

                    <FilaDato icono={cilReload} etiqueta="Estado">
                      {resultado.estado}
                    </FilaDato>

                    <div className="d-flex align-items-center justify-content-between gap-3 py-2 px-3">
                      <span className="d-flex align-items-center gap-2 text-body-secondary">
                        <CIcon icon={cilCarAlt} size="lg" />
                        Vehículo encontrado
                      </span>
                      <span
                        className={`fw-semibold text-${resultado.vehiculoEncontrado ? 'success' : 'danger'}`}
                      >
                        {resultado.vehiculoEncontrado ? 'Sí' : 'No'}
                      </span>
                    </div>
                  </div>

                  {/* Vehículo registrado: datos reales devueltos por la API */}
                  {resultado.vehiculoEncontrado && vehiculo && (
                    <>
                      <CRow className="g-3 mb-4">
                        {vehiculo.foto_url && (
                          <CCol xs={6}>
                            <img
                              src={vehiculo.foto_url}
                              alt={`Vehículo de placa ${resultado.placa}`}
                              className="w-100 rounded border"
                              style={{ height: '150px', objectFit: 'cover' }}
                            />
                            <div className="small text-body-secondary mt-1">
                              Fotografía del vehículo
                            </div>
                          </CCol>
                        )}

                        {vehiculo.foto_propietario_url && (
                          <CCol xs={6}>
                            <img
                              src={vehiculo.foto_propietario_url}
                              alt={`Propietario ${vehiculo.propietario_nombre ?? ''}`}
                              className="w-100 rounded border"
                              style={{ height: '150px', objectFit: 'cover' }}
                            />
                            <div className="small text-body-secondary mt-1">
                              Fotografía del propietario
                            </div>
                          </CCol>
                        )}
                      </CRow>

                      <div className="border rounded">
                        <FilaDato icono={cilCarAlt} etiqueta="Marca">
                          {vehiculo.marca ?? '—'}
                        </FilaDato>
                        <FilaDato icono={cilCarAlt} etiqueta="Modelo">
                          {vehiculo.modelo ?? '—'}
                        </FilaDato>
                        <FilaDato icono={cilCarAlt} etiqueta="Año">
                          {vehiculo.anio ?? '—'}
                        </FilaDato>
                        <FilaDato icono={cilCarAlt} etiqueta="Color">
                          {vehiculo.color ?? '—'}
                        </FilaDato>
                        <FilaDato icono={cilCarAlt} etiqueta="Tipo">
                          {vehiculo.tipo ?? '—'}
                        </FilaDato>
                        <FilaDato icono={cilUser} etiqueta="Propietario">
                          {vehiculo.propietario_nombre ?? '—'}
                        </FilaDato>
                        <FilaDato icono={cilDescription} etiqueta="Cédula">
                          {vehiculo.cedula_enmascarada ?? '—'}
                        </FilaDato>

                        <div className="d-flex align-items-center justify-content-between gap-3 py-2 px-3">
                          <span className="d-flex align-items-center gap-2 text-body-secondary">
                            <CIcon icon={cilCheckCircle} size="lg" />
                            Autorización
                          </span>
                          <CBadge color={vehiculo.autorizado ? 'success' : 'danger'}>
                            {vehiculo.autorizado ? 'Autorizado' : 'No autorizado'}
                          </CBadge>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Estados sin vehículo: se explica el motivo, no se inventan datos */}
                  {!resultado.vehiculoEncontrado && (
                    <CAlert
                      color={estadoVisual.color}
                      className="d-flex align-items-start gap-3 mb-0"
                    >
                      <CIcon icon={cilXCircle} size="xl" className="mt-1" />
                      <div>
                        <div className="fw-semibold">Ingreso no autorizado</div>
                        <div>{resultado.mensaje || estadoVisual.detalle}</div>
                      </div>
                    </CAlert>
                  )}
                </>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </>
  )
}

export default MonitoreoEntrada
