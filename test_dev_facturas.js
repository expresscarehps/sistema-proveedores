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

  return {
    fecha: extraerAtributoXML(tagComprobante, 'Fecha'),
    total: parseFloat(extraerAtributoXML(tagComprobante, 'Total')),
    rfcEmisor: extraerAtributoXML(tagEmisor, 'Rfc'),
    uuid: extraerAtributoXML(tagTimbre, 'UUID')
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
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-08-15T10:30:00" Total="11600.00" SubTotal="10000.00" Moneda="MXN">
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

// ═══ RESUMEN ═══
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
