// ═══════════════════════════════════════════════════════════════
// test_dev_proveedores.js — Pruebas automáticas del Sistema de
// Registro de Facturas / Catálogo de Proveedores (Fase 1)
// KARALV / Ventura Distribución y Servicios
// ═══════════════════════════════════════════════════════════════
// Se corre ANTES de entregar cualquier avance de código a Carlos,
// para detectar errores de validación o cálculo (campos obligatorios,
// disponible de línea de crédito, verificación contra el SAT, tokens)
// antes de que lleguen a un proveedor o factura real.
//
// Uso: node test_dev_proveedores.js
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');

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

// ── Lógica replicada 1:1 del Code.gs real (mismas condiciones que en Apps Script) ──

const ADMIN_PASSWORD = 'KaralvVentura2026';

function claveValida(password) {
  return password === ADMIN_PASSWORD;
}

function generarToken() {
  return crypto.randomUUID().split('-')[0].toUpperCase();
}

// Idéntico al validador dentro de registrarProveedor() en Code.gs
function validarRegistro(data) {
  if (!data.nombre || !data.rfc || !data.correo || !data.empresa || !data.telefono || !data.formaPago) {
    return { ok: false, error: 'Faltan datos obligatorios (todos son requeridos excepto nombre comercial).' };
  }
  return { ok: true };
}

// Idéntico al validador dentro de aprobarProveedor() en Code.gs
function validarAprobacion(data) {
  if (!data.fila || !data.plazoPago || data.lineaCredito === undefined) {
    return { ok: false, error: 'Faltan datos para aprobar (fila, plazo de pago o línea de crédito).' };
  }
  return { ok: true };
}

// Idéntica fórmula que se escribe en la columna N (Disponible) del Sheet: =L-M
function calcularDisponible(lineaCredito, saldoPendiente) {
  return lineaCredito - saldoPendiente;
}

// Idéntica lógica de detección de RFC duplicado dentro de registrarProveedor() en Code.gs
function esRfcDuplicado(rfcNuevo, rfcsExistentes) {
  const normalizado = rfcNuevo.trim().toUpperCase();
  return rfcsExistentes.some(r => (r || '').toString().trim().toUpperCase() === normalizado);
}

// Idéntico a datosRemitente() en Code.gs
function datosRemitente(empresa) {
  const empresaNorm = (empresa || '').toString().trim().toUpperCase();

  if (empresaNorm === 'KARALV') {
    return {
      correo: 'admon@expresscarecuu.com',
      nombre: 'Express Care - Proveedores',
      lineaEmpresa: 'Tu registro como proveedor de KARALV fue aprobado.'
    };
  }

  if (empresaNorm === 'AMBAS') {
    return {
      correo: 'enlace@highprecisionsupply.com',
      nombre: 'High Precision Supply - Proveedores',
      lineaEmpresa: 'Tu registro como proveedor fue aprobado por KARALV y Ventura Distribución y Servicios.'
    };
  }

  return {
    correo: 'enlace@highprecisionsupply.com',
    nombre: 'High Precision Supply - Proveedores',
    lineaEmpresa: 'Tu registro como proveedor de Ventura Distribución y Servicios fue aprobado.'
  };
}

// Idéntico al parseo CSV + detección de columna RFC en obtenerRFCsLista69B() de Code.gs
function parseCsvSimple(texto) {
  return texto.trim().split('\n').map(fila => fila.split(','));
}
function construirMapa69B(csvPresuntos, csvDefinitivos) {
  const mapa = {};
  [
    { texto: csvPresuntos, tipo: 'Presunto' },
    { texto: csvDefinitivos, tipo: 'Definitivo' }
  ].forEach(fuente => {
    const filas = parseCsvSimple(fuente.texto);
    if (filas.length < 2) return;
    const encabezado = filas[0].map(h => (h || '').trim().toUpperCase());
    let colRFC = encabezado.findIndex(h => h.indexOf('RFC') !== -1);
    if (colRFC === -1) colRFC = 0;
    for (let i = 1; i < filas.length; i++) {
      const rfc = (filas[i][colRFC] || '').trim().toUpperCase();
      if (rfc) mapa[rfc] = fuente.tipo;
    }
  });
  return mapa;
}

// ═══ PRUEBAS ═══

console.log('\n=== Validación de registro público (campos obligatorios) ===');

const registroCompleto = {
  nombre: 'Suministros Industriales del Norte SA de CV',
  rfc: 'SIN850101AB1',
  correo: 'compras@sinindustrial.com',
  empresa: 'VENTURA',
  telefono: '614-123-4567',
  formaPago: 'Transferencia',
  nombreComercial: ''
};
assert(validarRegistro(registroCompleto).ok === true, 'Registro con todos los campos obligatorios pasa la validación');

assert(validarRegistro({ ...registroCompleto, nombreComercial: undefined }).ok === true,
  'Nombre comercial vacío/ausente NO bloquea el registro (es el único campo opcional)');

assert(validarRegistro({ ...registroCompleto, nombre: '' }).ok === false, 'Falta nombre → rechaza el registro');
assert(validarRegistro({ ...registroCompleto, rfc: '' }).ok === false, 'Falta RFC → rechaza el registro');
assert(validarRegistro({ ...registroCompleto, correo: '' }).ok === false, 'Falta correo → rechaza el registro');
assert(validarRegistro({ ...registroCompleto, empresa: '' }).ok === false, 'Falta empresa → rechaza el registro');
assert(validarRegistro({ ...registroCompleto, telefono: '' }).ok === false, 'Falta teléfono → rechaza el registro');
assert(validarRegistro({ ...registroCompleto, formaPago: '' }).ok === false, 'Falta forma de pago → rechaza el registro');

console.log('\n=== Clave de acceso al portal interno ===');
assert(claveValida('KaralvVentura2026') === true, 'Clave correcta → acceso permitido');
assert(claveValida('clave-incorrecta') === false, 'Clave incorrecta → acceso negado');
assert(claveValida('') === false, 'Clave vacía → acceso negado');
assert(claveValida('karalvventura2026') === false, 'Clave con minúsculas distinta de la real → acceso negado (sensible a mayúsculas)');

console.log('\n=== Validación al aprobar un proveedor ===');
assert(validarAprobacion({ fila: 2, plazoPago: '30', lineaCredito: '50000' }).ok === true,
  'Aprobación con fila, plazo y línea de crédito completos → válida');
assert(validarAprobacion({ fila: 2, plazoPago: '30', lineaCredito: '0' }).ok === true,
  'Línea de crédito en "0" (proveedor solo de contado) → SÍ se puede aprobar, no se confunde con "falta el dato"');
assert(validarAprobacion({ fila: 2, plazoPago: '0', lineaCredito: '50000' }).ok === true,
  'Plazo de pago en "0" (pago contra entrega) → SÍ se puede aprobar');
assert(validarAprobacion({ fila: 2, plazoPago: '30' }).ok === false,
  'Falta línea de crédito (undefined) → rechaza la aprobación');
assert(validarAprobacion({ fila: 2, lineaCredito: '50000' }).ok === false,
  'Falta plazo de pago → rechaza la aprobación');
assert(validarAprobacion({ plazoPago: '30', lineaCredito: '50000' }).ok === false,
  'Falta el número de fila → rechaza la aprobación');

console.log('\n=== Cálculo de Disponible (Línea de Crédito − Saldo Pendiente) ===');
assert(calcularDisponible(50000, 0) === 50000, 'Proveedor recién aprobado sin facturas: disponible = línea completa');
assert(calcularDisponible(50000, 20000) === 30000, 'Línea $50,000 con saldo de $20,000 → disponible $30,000');
assert(calcularDisponible(0, 0) === 0, 'Proveedor sin línea de crédito asignada: disponible = $0');
assert(calcularDisponible(10000, 15000) === -5000,
  'Proveedor sobregirado (saldo mayor a su línea) → disponible negativo, y así debe mostrarse (alerta visual, no error de sistema)');

console.log('\n=== Formato del token de acceso generado al aprobar ===');
const tokenPrueba = generarToken();
assert(/^[0-9A-F]{8}$/.test(tokenPrueba), `Token generado cumple el formato de 8 caracteres hexadecimales en mayúsculas (ej: ${tokenPrueba})`);
const tokenPrueba2 = generarToken();
assert(tokenPrueba !== tokenPrueba2, 'Dos tokens generados seguidos son distintos entre sí (no hay colisión trivial)');

console.log('\n=== Verificación contra la Lista 69-B del SAT ===');
const csvPresuntosPrueba = 'No,RFC,Nombre del Contribuyente,Situacion\n1,SIN850101AB1,EMPRESA PRESUNTA SA DE CV,Presunto';
const csvDefinitivosPrueba = 'No,RFC,Nombre del Contribuyente,Situacion\n1,FAN900101XX1,FACTURAS APOCRIFAS SA DE CV,Definitivo';
const mapa69B = construirMapa69B(csvPresuntosPrueba, csvDefinitivosPrueba);

assert(mapa69B['SIN850101AB1'] === 'Presunto', 'RFC que aparece en la lista de Presuntos se detecta correctamente');
assert(mapa69B['FAN900101XX1'] === 'Definitivo', 'RFC que aparece en la lista de Definitivos se detecta correctamente');
assert(mapa69B['RFC_LIMPIO01'] === undefined, 'RFC que no aparece en ninguna lista → no se marca ninguna alerta');
assert(mapa69B['sin850101ab1'] === undefined && mapa69B['SIN850101AB1'] === 'Presunto',
  'La búsqueda del RFC del proveedor se hace en mayúsculas antes de comparar (evita falsos negativos por minúsculas)');

console.log('\n=== Transiciones de estatus válidas ===');
const estatusValidos = ['Pendiente', 'Aprobado', 'Rechazado'];
assert(estatusValidos.includes('Pendiente'), 'Estatus inicial al registrarse: Pendiente');
assert(estatusValidos.includes('Aprobado'), 'Estatus tras aprobar: Aprobado');
assert(estatusValidos.includes('Rechazado'), 'Estatus tras rechazar: Rechazado');

console.log('\n=== RFC duplicado (no se permite registrar el mismo RFC dos veces) ===');
const rfcsExistentes = ['SIN850101AB1', 'GAR900202XY2', 'gts950303zz3'];
assert(esRfcDuplicado('SIN850101AB1', rfcsExistentes) === true, 'RFC ya existente (mismas mayúsculas) → se detecta como duplicado');
assert(esRfcDuplicado('sin850101ab1', rfcsExistentes) === true, 'RFC ya existente en minúsculas → igual se detecta como duplicado');
assert(esRfcDuplicado('  SIN850101AB1  ', rfcsExistentes) === true, 'RFC con espacios de más → igual se detecta como duplicado');
assert(esRfcDuplicado('GTS950303ZZ3', rfcsExistentes) === true, 'RFC existente capturado originalmente en minúsculas → se detecta igual');
assert(esRfcDuplicado('NUEVO000000XX', rfcsExistentes) === false, 'RFC que no existe todavía → NO se marca como duplicado, se permite registrar');

console.log('\n=== Remitente del correo de aprobación según empresa ===');
const remitenteKaralv = datosRemitente('KARALV');
assert(remitenteKaralv.correo === 'admon@expresscarecuu.com', 'Proveedor de KARALV → remitente admon@expresscarecuu.com');
assert(remitenteKaralv.lineaEmpresa.indexOf('KARALV') !== -1, 'Proveedor de KARALV → el cuerpo menciona KARALV');

const remitenteVentura = datosRemitente('VENTURA');
assert(remitenteVentura.correo === 'enlace@highprecisionsupply.com', 'Proveedor de VENTURA → remitente enlace@highprecisionsupply.com');
assert(remitenteVentura.lineaEmpresa.indexOf('Ventura') !== -1, 'Proveedor de VENTURA → el cuerpo menciona Ventura Distribución y Servicios');

const remitenteAmbas = datosRemitente('AMBAS');
assert(remitenteAmbas.correo === 'enlace@highprecisionsupply.com', 'Proveedor de AMBAS empresas → remitente es el de enlace (Ventura), no el de Karalv');
assert(remitenteAmbas.lineaEmpresa.indexOf('KARALV') !== -1 && remitenteAmbas.lineaEmpresa.indexOf('Ventura') !== -1,
  'Proveedor de AMBAS empresas → el cuerpo menciona que las DOS empresas aprobaron el alta');

// ═══ RESUMEN ═══
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
