// ═══════════════════════════════════════════════════════════════
// test_dev_facturas.js — Pruebas automáticas de la Fase 2:
// Registro de Facturas (portal del proveedor)
// KARALV / Ventura Distribución y Servicios
// ═══════════════════════════════════════════════════════════════
// Se corre ANTES de entregar cualquier avance de código a Carlos,
// para detectar errores de lectura de XML, cálculo de vencimiento,
// o validación de empresa antes de que lleguen a una factura real.
//
// Uso: node test_dev_facturas.js
// ═══════════════════════════════════════════════════════════════

let fallos = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (!cond) {
    console.error(`❌ FALLÓ: ${msg}`);
    fallos++;
  } else {
    console.log(`✅ OK: ${msg}`);
  }
}

// ── Lógica replicada 1:1 del Code.gs real ──

function empresaValidaParaProveedor(empresaProveedor, empresaFactura) {
  const prov = (empresaProveedor || '').toString().trim().toUpperCase();
  const fact = (empresaFactura || '').toString().trim().toUpperCase();
  if (prov === 'AMBAS') return fact === 'KARALV' || fact === 'VENTURA';
  return prov === fact;
}

function extraerAtributoXML(textoEtiqueta, nombreAtributo) {
  const regex = new RegExp(nombreAtributo + '="([^"]*)"');
  const coincidencia = textoEtiqueta.match(regex);
  return coincidencia ? coincidencia[1] : '';
}

function extraerDatosXML(xmlTexto) {
  const matchComprobante = xmlTexto.match(/<(?:cfdi:)?Comprobante\b[^>]*>/);
  const tagComprobante = matchComprobante ? matchComprobante[0] : '';

  const matchEmisor = xmlTexto.match(/<(?:cfdi:)?Emisor\b[^>]*\/?>/);
  const tagEmisor = matchEmisor ? matchEmisor[0] : '';

  const matchTimbre = xmlTexto.match(/<(?:tfd:)?TimbreFiscalDigital\b[^>]*\/?>/);
  const tagTimbre = matchTimbre ? matchTimbre[0] : '';

  const serie = extraerAtributoXML(tagComprobante, 'Serie');
  const folioInterno = extraerAtributoXML(tagComprobante, 'Folio');
  const folioFactura = (serie ? serie + '-' : '') + folioInterno;

  return {
    fecha: extraerAtributoXML(tagComprobante, 'Fecha'),
    total: parseFloat(extraerAtributoXML(tagComprobante, 'Total')),
    rfcEmisor: extraerAtributoXML(tagEmisor, 'Rfc'),
    uuid: extraerAtributoXML(tagTimbre, 'UUID'),
    folioFactura: folioFactura
  };
}

function calcularVencimiento(fechaEmisionStr, plazoPagoDias) {
  const soloFecha = fechaEmisionStr.split('T')[0];
  const partes = soloFecha.split('-').map(Number);
  const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
  fecha.setDate(fecha.getDate() + parseInt(plazoPagoDias, 10));
  return fecha;
}

function formatearFechaYMD(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ═══ PRUEBAS ═══

console.log('\n=== ¿A qué empresa puede facturar el proveedor? ===');
assert(empresaValidaParaProveedor('KARALV', 'KARALV') === true, 'Proveedor de KARALV puede facturar a KARALV');
assert(empresaValidaParaProveedor('KARALV', 'VENTURA') === false, 'Proveedor de KARALV NO puede facturar a VENTURA');
assert(empresaValidaParaProveedor('VENTURA', 'VENTURA') === true, 'Proveedor de VENTURA puede facturar a VENTURA');
assert(empresaValidaParaProveedor('VENTURA', 'KARALV') === false, 'Proveedor de VENTURA NO puede facturar a KARALV');
assert(empresaValidaParaProveedor('AMBAS', 'KARALV') === true, 'Proveedor de AMBAS puede elegir facturar a KARALV');
assert(empresaValidaParaProveedor('AMBAS', 'VENTURA') === true, 'Proveedor de AMBAS puede elegir facturar a VENTURA');
assert(empresaValidaParaProveedor('ambas', 'karalv') === true, 'La comparación no distingue mayúsculas/minúsculas');

console.log('\n=== Lectura de datos del XML (CFDI) ===');
const xmlEjemplo = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="4694" Fecha="2026-08-15T10:30:00" Total="11600.00" SubTotal="10000.00" Moneda="MXN">
  <cfdi:Emisor Rfc="SIN850101AB1" Nombre="Suministros Industriales del Norte SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="VDS200101XX1" Nombre="Ventura Distribucion y Servicios"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="A1B2C3D4-E5F6-7890-ABCD-1234567890AB" FechaTimbrado="2026-08-15T10:31:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const datosExtraidos = extraerDatosXML(xmlEjemplo);
assert(datosExtraidos.fecha === '2026-08-15T10:30:00', 'Se extrae correctamente la fecha de emisión del XML');
assert(datosExtraidos.total === 11600.00, 'Se extrae correctamente el monto total del XML');
assert(datosExtraidos.rfcEmisor === 'SIN850101AB1', 'Se extrae correctamente el RFC del emisor (no el del receptor)');
assert(datosExtraidos.uuid === 'A1B2C3D4-E5F6-7890-ABCD-1234567890AB', 'Se extrae correctamente el folio fiscal (UUID)');
assert(datosExtraidos.folioFactura === 'A-4694', 'Se extrae el folio interno de la factura combinado con su serie (A-4694), distinto al folio fiscal');

console.log('\n=== Folio de factura sin Serie (solo Folio, caso común) ===');
const xmlSinSerie = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Folio="2210" Fecha="2026-03-10T09:00:00" Total="800.00">
  <cfdi:Emisor Rfc="GAR900202XY2" Nombre="Otro Proveedor"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="99998888-7777-6666-5555-444433332222"/></cfdi:Complemento>
</cfdi:Comprobante>`;
const datosSinSerie = extraerDatosXML(xmlSinSerie);
assert(datosSinSerie.folioFactura === '2210', 'Sin Serie, el folio de factura es solo el número (2210), sin guión de más');

console.log('\n=== Folio de factura ausente (algunos sistemas no lo incluyen) ===');
const xmlSinFolio = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Fecha="2026-03-10T09:00:00" Total="800.00">
  <cfdi:Emisor Rfc="GAR900202XY2" Nombre="Otro Proveedor"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="99998888-7777-6666-5555-444433332222"/></cfdi:Complemento>
</cfdi:Comprobante>`;
const datosSinFolio = extraerDatosXML(xmlSinFolio);
assert(datosSinFolio.folioFactura === '', 'Si el XML no trae Folio, queda vacío en vez de tronar o mostrar solo un guión suelto');

console.log('\n=== Lectura de XML con formato ligeramente distinto (sin prefijo cfdi:) ===');
const xmlSinPrefijo = `<?xml version="1.0"?>
<Comprobante Fecha="2026-01-05T08:00:00" Total="500.50">
  <Emisor Rfc="GAR900202XY2" Nombre="Otro Proveedor"/>
  <Complemento>
    <TimbreFiscalDigital UUID="11112222-3333-4444-5555-666677778888"/>
  </Complemento>
</Comprobante>`;
const datosSinPrefijo = extraerDatosXML(xmlSinPrefijo);
assert(datosSinPrefijo.rfcEmisor === 'GAR900202XY2', 'También funciona con XML sin el prefijo "cfdi:" (algunos sistemas lo omiten)');
assert(datosSinPrefijo.uuid === '11112222-3333-4444-5555-666677778888', 'El UUID también se lee bien sin el prefijo "tfd:"');

console.log('\n=== XML incompleto o inválido (no debe tronar, debe regresar vacío) ===');
const datosVacios = extraerDatosXML('<xml>esto no es una factura</xml>');
assert(datosVacios.fecha === '', 'XML sin estructura de factura → fecha vacía, no truena');
assert(datosVacios.rfcEmisor === '', 'XML sin estructura de factura → RFC vacío, no truena');
assert(datosVacios.uuid === '', 'XML sin estructura de factura → UUID vacío, no truena');
assert(isNaN(datosVacios.total), 'XML sin estructura de factura → total es NaN, se puede detectar como inválido');

console.log('\n=== Cálculo de fecha de vencimiento ===');
const venc1 = calcularVencimiento('2026-08-15T10:30:00', 30);
assert(formatearFechaYMD(venc1) === '2026-09-14', 'Factura del 15 de agosto + 30 días = 14 de septiembre');

const venc2 = calcularVencimiento('2026-08-15T10:30:00', 0);
assert(formatearFechaYMD(venc2) === '2026-08-15', 'Plazo de pago 0 días (contra entrega) → vence el mismo día de emisión');

const venc3 = calcularVencimiento('2026-01-20T00:00:00', 15);
assert(formatearFechaYMD(venc3) === '2026-02-04', 'Vencimiento que cruza de enero a febrero se calcula bien');

const venc4 = calcularVencimiento('2026-12-20T00:00:00', 30);
assert(formatearFechaYMD(venc4) === '2027-01-19', 'Vencimiento que cruza de un año a otro se calcula bien');

console.log('\n=== Comparación de RFC: no distingue mayúsculas/minúsculas ===');
function rfcCoincide(rfcXML, rfcProveedor) {
  return rfcXML.toUpperCase() === rfcProveedor.toUpperCase();
}
assert(rfcCoincide('SIN850101AB1', 'SIN850101AB1') === true, 'RFC idéntico → coincide');
assert(rfcCoincide('sin850101ab1', 'SIN850101AB1') === true, 'La comparación no distingue mayúsculas/minúsculas');
assert(rfcCoincide('OTRO000000XX', 'SIN850101AB1') === false, 'RFC distinto → no coincide');

console.log('\n=== RFC que no coincide: la factura se RECHAZA por completo (no solo se marca) ===');
function validarRegistroFacturaConRFC(data, proveedor) {
  if (!data.token || !data.empresaFactura || !data.facturaPdfBase64 || !data.xmlTexto || !data.evidenciaBase64) {
    return { ok: false, error: 'Faltan archivos obligatorios.' };
  }
  const datosXML = extraerDatosXML(data.xmlTexto);
  if (!datosXML.fecha || !datosXML.total || !datosXML.uuid) {
    return { ok: false, error: 'El XML no tiene los datos esperados.' };
  }
  if (datosXML.rfcEmisor.toUpperCase() !== proveedor.rfc.toUpperCase()) {
    return { ok: false, error: 'El RFC del emisor en el XML (' + datosXML.rfcEmisor + ') no coincide con tu RFC registrado (' + proveedor.rfc + ').' };
  }
  return { ok: true };
}

const proveedorPrueba = { rfc: 'SIN850101AB1' };
const facturaConRFCCorrecto = { token: 'ABC', empresaFactura: 'VENTURA', facturaPdfBase64: 'xx', xmlTexto: xmlEjemplo, evidenciaBase64: 'yy' };
assert(validarRegistroFacturaConRFC(facturaConRFCCorrecto, proveedorPrueba).ok === true,
  'RFC del XML coincide con el proveedor → la factura SÍ se guarda');

const proveedorConRFCDistinto = { rfc: 'OTRO000000XX' };
const resultadoRechazado = validarRegistroFacturaConRFC(facturaConRFCCorrecto, proveedorConRFCDistinto);
assert(resultadoRechazado.ok === false, 'RFC del XML NO coincide con el proveedor → la factura se RECHAZA por completo, no se guarda');
assert(resultadoRechazado.error.indexOf('SIN850101AB1') !== -1 && resultadoRechazado.error.indexOf('OTRO000000XX') !== -1,
  'El mensaje de rechazo muestra ambos RFCs (el del XML y el registrado) para que el proveedor entienda el problema');

console.log('\n=== Validación de campos obligatorios al registrar una factura ===');
function validarRegistroFactura(data) {
  if (!data.token || !data.empresaFactura || !data.facturaPdfBase64 || !data.xmlTexto || !data.evidenciaBase64) {
    return { ok: false };
  }
  return { ok: true };
}
const facturaCompleta = { token: 'ABC123', empresaFactura: 'KARALV', facturaPdfBase64: 'xx', xmlTexto: '<xml/>', evidenciaBase64: 'yy' };
assert(validarRegistroFactura(facturaCompleta).ok === true, 'Factura con los 5 campos completos pasa la validación');
assert(validarRegistroFactura({ ...facturaCompleta, xmlTexto: '' }).ok === false, 'Falta el XML → rechaza el registro');
assert(validarRegistroFactura({ ...facturaCompleta, evidenciaBase64: '' }).ok === false, 'Falta la evidencia de entrega → rechaza el registro');
assert(validarRegistroFactura({ ...facturaCompleta, facturaPdfBase64: '' }).ok === false, 'Falta el PDF de la factura → rechaza el registro');

console.log('\n=== Folio consecutivo del contrarecibo (CR-EMPRESA-AÑO-###) ===');
function siguienteNumeroFolio(foliosExistentes, prefijo) {
  let maxNum = 0;
  foliosExistentes.forEach(folio => {
    const texto = (folio || '').toString();
    if (texto.indexOf(prefijo) === 0) {
      const num = parseInt(texto.substring(prefijo.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

assert(siguienteNumeroFolio([], 'CR-KARALV-2026-') === 1, 'Sin folios previos → el primero es el número 1');
assert(siguienteNumeroFolio(['CR-KARALV-2026-001'], 'CR-KARALV-2026-') === 2, 'Con un folio previo (001) → el siguiente es 002');
assert(siguienteNumeroFolio(['CR-KARALV-2026-001', 'CR-KARALV-2026-002', 'CR-KARALV-2026-003'], 'CR-KARALV-2026-') === 4,
  'Con varios folios previos → toma el máximo y le suma 1 (no solo cuenta filas)');
assert(siguienteNumeroFolio(['CR-KARALV-2026-005', 'CR-KARALV-2026-002'], 'CR-KARALV-2026-') === 6,
  'No importa el orden en que aparezcan los folios → siempre toma el número más alto');
assert(siguienteNumeroFolio(['CR-VENTURA-2026-001', 'CR-VENTURA-2026-002'], 'CR-KARALV-2026-') === 1,
  'Folios de OTRA empresa no cuentan → KARALV sigue en 1 aunque VENTURA ya lleve 2');
assert(siguienteNumeroFolio(['CR-KARALV-2025-010'], 'CR-KARALV-2026-') === 1,
  'Folios de OTRO año no cuentan → 2026 empieza en 1 aunque 2025 haya llegado a 10 (el folio se reinicia cada año)');

function formatearFolio(numero) {
  return String(numero).padStart(3, '0');
}
assert(formatearFolio(1) === '001', 'El número 1 se formatea con ceros a la izquierda: 001');
assert(formatearFolio(42) === '042', 'El número 42 se formatea como 042');
assert(formatearFolio(1234) === '1234', 'Un número de 4 dígitos no se recorta, se queda completo');

console.log('\n=== Presentación del contrarecibo según empresa (nombre y color) ===');
function datosPresentacionEmpresa(empresa) {
  if (empresa === 'KARALV') {
    return { nombre: 'KARALV Impulsora Internacional', nombreSecundario: 'Express Care by Valvoline', color: '#e3241a' };
  }
  return { nombre: 'Ventura Distribución y Servicios', nombreSecundario: '', color: '#0b5d85' };
}
const presentKaralv = datosPresentacionEmpresa('KARALV');
assert(presentKaralv.nombre === 'KARALV Impulsora Internacional', 'KARALV → el nombre principal es la razón social real (KARALV Impulsora Internacional)');
assert(presentKaralv.nombreSecundario === 'Express Care by Valvoline', 'KARALV → el nombre comercial (Express Care by Valvoline) aparece como línea secundaria');
assert(presentKaralv.color === '#e3241a', 'KARALV → usa el color rojo de su marca en el contrarecibo');

const presentVentura = datosPresentacionEmpresa('VENTURA');
assert(presentVentura.nombre.indexOf('Ventura') !== -1, 'VENTURA → el nombre completo menciona Ventura Distribución y Servicios');
assert(presentVentura.color === '#0b5d85', 'VENTURA → usa el color azul de su marca en el contrarecibo');

console.log('\n=== Contenido del PDF del contrarecibo (todos los datos clave deben aparecer) ===');
function construirHTMLContrareciboSimplificado(d) {
  const presentacion = datosPresentacionEmpresa(d.empresa);
  const montoTexto = Number(d.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  return `<html><body>
    <div>${d.folioContrarecibo}</div>
    <div>${presentacion.nombre}</div>
    <div>${presentacion.nombreSecundario}</div>
    <div>${d.proveedor}</div>
    <div>${d.rfcProveedor}</div>
    <div>${d.folioFiscal}</div>
    ${d.folioFactura ? `<div>${d.folioFactura}</div>` : ''}
    <div>$${montoTexto}</div>
  </body></html>`;
}
const datosPruebaContrarecibo = {
  folioContrarecibo: 'CR-KARALV-2026-001',
  empresa: 'KARALV',
  proveedor: 'Suministros Industriales del Norte SA de CV',
  rfcProveedor: 'SIN850101AB1',
  folioFiscal: 'A1B2C3D4-E5F6-7890-ABCD-1234567890AB',
  folioFactura: 'A-4694',
  monto: 11600
};
const htmlContrarecibo = construirHTMLContrareciboSimplificado(datosPruebaContrarecibo);
assert(htmlContrarecibo.indexOf('CR-KARALV-2026-001') !== -1, 'El contrarecibo incluye su propio folio');
assert(htmlContrarecibo.indexOf('KARALV Impulsora Internacional') !== -1, 'El contrarecibo incluye la razón social real de KARALV');
assert(htmlContrarecibo.indexOf('Express Care by Valvoline') !== -1, 'El contrarecibo también incluye el nombre comercial (Express Care by Valvoline)');
assert(htmlContrarecibo.indexOf('Suministros Industriales del Norte SA de CV') !== -1, 'El contrarecibo incluye el nombre del proveedor');
assert(htmlContrarecibo.indexOf('SIN850101AB1') !== -1, 'El contrarecibo incluye el RFC del proveedor');
assert(htmlContrarecibo.indexOf('A1B2C3D4-E5F6-7890-ABCD-1234567890AB') !== -1, 'El contrarecibo incluye el folio fiscal (UUID) de la factura');
assert(htmlContrarecibo.indexOf('A-4694') !== -1, 'El contrarecibo incluye el folio de factura interno del proveedor (A-4694), además del folio fiscal');
assert(htmlContrarecibo.indexOf('11,600.00') !== -1, 'El monto se formatea con comas y 2 decimales');

const datosSinFolioFactura = { ...datosPruebaContrarecibo, folioFactura: '' };
const htmlSinFolioFactura = construirHTMLContrareciboSimplificado(datosSinFolioFactura);
assert(htmlSinFolioFactura.indexOf('A-4694') === -1, 'Si la factura no traía folio interno, el contrarecibo simplemente no muestra esa línea (no se rompe ni queda vacía)');

console.log('\n=== Lista de contrarecibos generados (filtro y orden) ===');
function filtrarYOrdenarContrarecibos(filas) {
  const validadas = filas.filter(f => f.estatus === 'Validada');
  return validadas.reverse();
}
const filasPrueba = [
  { folio: 'CR-KARALV-2026-001', estatus: 'Validada' },
  { folio: 'REG-2', estatus: 'Pendiente de validar' },
  { folio: 'CR-KARALV-2026-002', estatus: 'Validada' },
  { folio: 'REG-4', estatus: 'Rechazada' }
];
const resultadoFiltrado = filtrarYOrdenarContrarecibos(filasPrueba);
assert(resultadoFiltrado.length === 2, 'Solo incluye las facturas con Estatus = Validada, ignora Pendientes y Rechazadas');
assert(resultadoFiltrado[0].folio === 'CR-KARALV-2026-002', 'El más reciente (el último validado) aparece primero en la lista');

console.log('\n=== Fecha de pago programada (ciclo semanal: se paga los martes) ===');
function calcularFechaPagoProgramada(fechaVencimiento) {
  const origen = (fechaVencimiento instanceof Date) ? fechaVencimiento : new Date(fechaVencimiento);
  const fecha = new Date(origen.getFullYear(), origen.getMonth(), origen.getDate());
  const diaSemana = fecha.getDay();
  const diasHastaMartes = (9 - diaSemana) % 7;
  fecha.setDate(fecha.getDate() + diasHastaMartes);
  return fecha;
}
function formatearYMD(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Semana de referencia real: miércoles 5 de agosto de 2026 -> martes 11 de agosto de 2026
const pagoDesdeMiercoles = calcularFechaPagoProgramada(new Date(2026, 7, 5));
assert(formatearYMD(pagoDesdeMiercoles) === '2026-08-11', 'Vence miércoles 5-ago → se paga el martes 11-ago (el caso que describiste)');

const pagoDesdeJueves = calcularFechaPagoProgramada(new Date(2026, 7, 6));
assert(formatearYMD(pagoDesdeJueves) === '2026-08-11', 'Vence jueves 6-ago → se paga también el martes 11-ago');

const pagoDesdeViernes = calcularFechaPagoProgramada(new Date(2026, 7, 7));
assert(formatearYMD(pagoDesdeViernes) === '2026-08-11', 'Vence viernes 7-ago → se paga también el martes 11-ago');

const pagoDesdeSabado = calcularFechaPagoProgramada(new Date(2026, 7, 8));
assert(formatearYMD(pagoDesdeSabado) === '2026-08-11', 'Vence sábado 8-ago → se paga también el martes 11-ago');

const pagoDesdeDomingo = calcularFechaPagoProgramada(new Date(2026, 7, 9));
assert(formatearYMD(pagoDesdeDomingo) === '2026-08-11', 'Vence domingo 9-ago → se paga también el martes 11-ago');

const pagoDesdeLunes = calcularFechaPagoProgramada(new Date(2026, 7, 10));
assert(formatearYMD(pagoDesdeLunes) === '2026-08-11', 'Vence lunes 10-ago → se paga también el martes 11-ago');

const pagoDesdeMartes = calcularFechaPagoProgramada(new Date(2026, 7, 11));
assert(formatearYMD(pagoDesdeMartes) === '2026-08-11', 'Vence el propio martes 11-ago → se paga ese mismo martes 11-ago');

const pagoSiguienteMiercoles = calcularFechaPagoProgramada(new Date(2026, 7, 12));
assert(formatearYMD(pagoSiguienteMiercoles) === '2026-08-18', 'Vence miércoles 12-ago (ya de la siguiente semana) → se paga el martes 18-ago, no el 11');

const pagoCruzaMes = calcularFechaPagoProgramada(new Date(2026, 7, 26)); // miércoles 26 de agosto
assert(formatearYMD(pagoCruzaMes) === '2026-09-01', 'Vence miércoles 26-ago (fin de mes) → el pago cruza correctamente a septiembre (1-sep), no se queda pegado en agosto');

const pagoCruzaAnio = calcularFechaPagoProgramada(new Date(2026, 11, 30)); // miércoles 30 de diciembre
assert(formatearYMD(pagoCruzaAnio) === '2027-01-05', 'Vence miércoles 30-dic (fin de año) → el pago cruza correctamente a enero de 2027, no se queda pegado en 2026');

console.log('\n=== La fecha de pago programada SIEMPRE cae en martes ===');
for (let dia = 1; dia <= 10; dia++) {
  const resultado = calcularFechaPagoProgramada(new Date(2026, 7, dia));
  assert(resultado.getDay() === 2, `Para cualquier fecha de vencimiento (día ${dia} de agosto), el resultado siempre es un martes`);
}

console.log('\n=== Respaldo: si una fila vieja no tiene Fecha Pago Programada guardada, se calcula al validar ===');
function obtenerFechaPagoConRespaldo(valorGuardado, vencimiento) {
  if (valorGuardado) return valorGuardado;
  return calcularFechaPagoProgramada(vencimiento);
}
const vencimientoPrueba = new Date(2026, 7, 5); // miércoles 5 de agosto
const resultadoConValorVacio = obtenerFechaPagoConRespaldo('', vencimientoPrueba);
assert(formatearYMD(resultadoConValorVacio) === '2026-08-11', 'Si la columna llega vacía (fila creada antes de que existiera), se calcula sola en vez de dejarla en blanco');

const fechaYaGuardada = new Date(2026, 7, 18);
const resultadoConValorExistente = obtenerFechaPagoConRespaldo(fechaYaGuardada, vencimientoPrueba);
assert(resultadoConValorExistente === fechaYaGuardada, 'Si la columna ya tiene un valor guardado, se usa ese tal cual, no se recalcula de nuevo');

console.log('\n=== Correo del contrarecibo al proveedor (con PDF adjunto) ===');
function construirCuerpoCorreoContrarecibo(nombreProveedor, referenciaFactura, folioContrarecibo, monto, fechaPagoTexto) {
  const montoTexto = Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  return 'Hola ' + nombreProveedor + ',\n\n' +
    'Te enviamos el contrarecibo correspondiente a tu factura ' + referenciaFactura + ', ya validada.\n\n' +
    'Contrarecibo: ' + folioContrarecibo + '\n' +
    'Monto: $' + montoTexto + '\n' +
    'Fecha de pago programada: ' + fechaPagoTexto + '\n\n' +
    'Encontrarás el PDF de tu contrarecibo adjunto a este correo, para tus registros.\n\n' +
    'Saludos.';
}

const cuerpoCorreoCR = construirCuerpoCorreoContrarecibo('Suministros del Norte', 'A-4694', 'CR-KARALV-2026-001', 11600, '11/08/2026');
assert(cuerpoCorreoCR.indexOf('Suministros del Norte') !== -1, 'El correo del contrarecibo saluda al proveedor por su nombre');
assert(cuerpoCorreoCR.indexOf('A-4694') !== -1, 'El correo menciona la referencia de la factura (folio interno si existe)');
assert(cuerpoCorreoCR.indexOf('CR-KARALV-2026-001') !== -1, 'El correo incluye el folio del contrarecibo');
assert(cuerpoCorreoCR.indexOf('11,600.00') !== -1, 'El correo incluye el monto formateado con comas');
assert(cuerpoCorreoCR.indexOf('11/08/2026') !== -1, 'El correo incluye la fecha de pago programada');
assert(cuerpoCorreoCR.toLowerCase().indexOf('adjunto') !== -1, 'El correo le avisa al proveedor que el PDF viene adjunto');

console.log('\n=== Cuando la factura no tiene folio interno, usa el folio fiscal como referencia ===');
function referenciaParaCorreo(folioFactura, folioFiscal) {
  return folioFactura || folioFiscal;
}
assert(referenciaParaCorreo('A-4694', 'UUID-XXXX') === 'A-4694', 'Si existe folio de factura interno, se usa ese como referencia (más fácil de reconocer para el proveedor)');
assert(referenciaParaCorreo('', 'UUID-XXXX') === 'UUID-XXXX', 'Si no hay folio interno, cae al folio fiscal (UUID) como respaldo');

console.log('\n=== Construcción del mensaje MIME con adjunto (estructura básica) ===');
function construirMensajeCrudoConAdjuntoSimplificado(cuerpo, adjunto) {
  const boundary = 'frontera_prueba';
  return 'Content-Type: multipart/mixed; boundary="' + boundary + '"\r\n\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    cuerpo + '\r\n\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + adjunto.mimeType + '; name="' + adjunto.nombre + '"\r\n' +
    'Content-Disposition: attachment; filename="' + adjunto.nombre + '"\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    adjunto.base64 + '\r\n\r\n' +
    '--' + boundary + '--';
}
const mimeDePrueba = construirMensajeCrudoConAdjuntoSimplificado('Cuerpo del correo', { nombre: 'CR-KARALV-2026-001.pdf', mimeType: 'application/pdf', base64: 'QUJDMTIz' });
assert(mimeDePrueba.indexOf('multipart/mixed') !== -1, 'El mensaje se arma como multipart/mixed (necesario para incluir un adjunto)');
assert(mimeDePrueba.indexOf('Cuerpo del correo') !== -1, 'El mensaje incluye el texto del cuerpo del correo');
assert(mimeDePrueba.indexOf('CR-KARALV-2026-001.pdf') !== -1, 'El mensaje incluye el nombre del archivo adjunto');
assert(mimeDePrueba.indexOf('Content-Disposition: attachment') !== -1, 'El adjunto queda marcado explícitamente como archivo adjunto, no como parte del cuerpo');
assert(mimeDePrueba.indexOf('QUJDMTIz') !== -1, 'El contenido base64 del PDF queda incluido en el mensaje');

console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
