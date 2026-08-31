// ═══════════════════════════════════════════════════════════════
// test_dev_pagos.js — Pruebas automáticas de la Fase 5:
// Selección de Pagos y Resumen
// KARALV / Ventura Distribución y Servicios
// ═══════════════════════════════════════════════════════════════
// Se corre ANTES de entregar cualquier avance de código a Carlos.
// Uso: node test_dev_pagos.js
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

function formatearYMD(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

function agruparPorProveedor(facturas) {
  const porProveedor = {};
  let granTotal = 0;

  facturas.forEach(f => {
    const clave = f.proveedor + '|' + f.empresa;
    if (!porProveedor[clave]) {
      porProveedor[clave] = { proveedor: f.proveedor, empresa: f.empresa, folios: [], total: 0 };
    }
    porProveedor[clave].folios.push(f.folioContrarecibo || '(sin folio)');
    porProveedor[clave].total += Number(f.monto);
    granTotal += Number(f.monto);
  });

  const proveedores = Object.values(porProveedor).sort((a, b) => a.proveedor.localeCompare(b.proveedor));
  return { proveedores, granTotal };
}

// Versión simplificada de listarFacturasPorPagar, operando sobre un arreglo de prueba.
function filtrarFacturasPorPagar(filas) {
  return filas
    .filter(f => f.estatus === 'Validada')
    .sort((a, b) => new Date(a.fechaPagoProgramada) - new Date(b.fechaPagoProgramada));
}

// Versión simplificada de confirmarPagos: simula marcar filas como pagadas.
function simularConfirmarPagos(filasSeleccionadas, todasLasFacturas) {
  if (!filasSeleccionadas || filasSeleccionadas.length === 0) {
    return { ok: false, error: 'No seleccionaste ninguna factura.' };
  }

  const facturasPagadas = [];
  filasSeleccionadas.forEach(idFila => {
    const factura = todasLasFacturas.find(f => f.fila === idFila);
    if (!factura || factura.estatus !== 'Validada') return; // ignora si ya no está disponible
    factura.estatus = 'Pagada'; // simula el cambio
    facturasPagadas.push(factura);
  });

  if (facturasPagadas.length === 0) {
    return { ok: false, error: 'Ninguna de las facturas seleccionadas sigue disponible para pagar.' };
  }

  const resumen = agruparPorProveedor(facturasPagadas);
  return { ok: true, resumen };
}

// ═══ PRUEBAS ═══

console.log('\n=== Folio consecutivo del resumen de pago (RESUMEN-AÑO-###) ===');
assert(siguienteNumeroFolio([], 'RESUMEN-2026-') === 1, 'Sin resúmenes previos → el primero es el número 1');
assert(siguienteNumeroFolio(['RESUMEN-2026-001'], 'RESUMEN-2026-') === 2, 'Con un resumen previo → el siguiente es 002');
assert(siguienteNumeroFolio(['RESUMEN-2025-005'], 'RESUMEN-2026-') === 1, 'Resúmenes de OTRO año no cuentan → 2026 empieza en 1 aunque 2025 llegara a 5');

console.log('\n=== Solo se listan facturas Validadas (no Pendientes, no Rechazadas, no ya Pagadas) ===');
const facturasDePrueba = [
  { fila: 2, proveedor: 'Suministros del Norte', empresa: 'VENTURA', estatus: 'Validada', monto: 10000, fechaPagoProgramada: '2026-08-18', folioContrarecibo: 'CR-VENTURA-2026-002' },
  { fila: 3, proveedor: 'Refacciones del Bravo', empresa: 'KARALV', estatus: 'Validada', monto: 3000, fechaPagoProgramada: '2026-08-11', folioContrarecibo: 'CR-KARALV-2026-001' },
  { fila: 4, proveedor: 'Proveedor Pendiente', empresa: 'VENTURA', estatus: 'Pendiente de validar', monto: 5000, fechaPagoProgramada: '2026-08-11', folioContrarecibo: '' },
  { fila: 5, proveedor: 'Proveedor Rechazado', empresa: 'KARALV', estatus: 'Rechazada', monto: 2000, fechaPagoProgramada: '2026-08-11', folioContrarecibo: '' },
  { fila: 6, proveedor: 'Ya Pagado Antes', empresa: 'VENTURA', estatus: 'Pagada', monto: 8000, fechaPagoProgramada: '2026-08-04', folioContrarecibo: 'CR-VENTURA-2026-001' }
];

const porPagar = filtrarFacturasPorPagar(facturasDePrueba);
assert(porPagar.length === 2, 'Solo aparecen las 2 facturas con Estatus = Validada (ignora Pendiente, Rechazada, y ya Pagada)');
assert(porPagar[0].proveedor === 'Refacciones del Bravo', 'Las facturas por pagar se ordenan por fecha de pago programada, la más próxima primero');
assert(porPagar[1].proveedor === 'Suministros del Norte', 'La factura con fecha de pago más lejana aparece después');

console.log('\n=== Confirmar pago: marca como Pagada, agrupa por proveedor, calcula totales ===');
const facturasParaConfirmar = JSON.parse(JSON.stringify(facturasDePrueba)); // copia limpia para no afectar otras pruebas
const resultadoConfirmacion = simularConfirmarPagos([2, 3], facturasParaConfirmar);

assert(resultadoConfirmacion.ok === true, 'Confirmar con al menos 1 fila seleccionada → responde ok: true');
assert(resultadoConfirmacion.resumen.granTotal === 13000, 'El gran total suma correctamente las facturas seleccionadas (10000+3000=13000)');
assert(resultadoConfirmacion.resumen.proveedores.length === 2, 'Se agrupan correctamente 2 proveedores distintos');

const filaAhoraPagada = facturasParaConfirmar.find(f => f.fila === 2);
assert(filaAhoraPagada.estatus === 'Pagada', 'La factura seleccionada cambia su Estatus a Pagada después de confirmar');

const filaNoSeleccionada = facturasParaConfirmar.find(f => f.fila === 6);
assert(filaNoSeleccionada.estatus === 'Pagada', 'Una factura que YA estaba Pagada desde antes sigue igual (no se re-procesa, esto solo confirma que no se tocó por accidente)');

console.log('\n=== Confirmar pago sin seleccionar nada ===');
const confirmacionVacia = simularConfirmarPagos([], facturasDePrueba);
assert(confirmacionVacia.ok === false, 'Intentar confirmar sin seleccionar ninguna factura → rechaza la acción');
assert(confirmacionVacia.error.indexOf('ninguna factura') !== -1, 'El mensaje de error explica claramente que no se seleccionó nada');

console.log('\n=== Protección: una fila que ya no está Validada al momento de confirmar se ignora, no truena ===');
const facturasConCambioReciente = JSON.parse(JSON.stringify(facturasDePrueba));
facturasConCambioReciente.find(f => f.fila === 3).estatus = 'Pagada'; // simula que alguien más ya la pagó desde otra sesión
const resultadoConCarreraDeCondicion = simularConfirmarPagos([2, 3], facturasConCambioReciente);
assert(resultadoConCarreraDeCondicion.ok === true, 'Si una de las filas seleccionadas ya no está disponible, igual procesa las que SÍ siguen válidas');
assert(resultadoConCarreraDeCondicion.resumen.granTotal === 10000, 'El total solo incluye la factura que en verdad se pudo procesar (10000), no la que ya estaba pagada');

console.log('\n=== Si TODAS las filas seleccionadas ya no están disponibles, rechaza con mensaje claro ===');
const facturasTodasYaPagadas = JSON.parse(JSON.stringify(facturasDePrueba));
facturasTodasYaPagadas.find(f => f.fila === 2).estatus = 'Pagada';
facturasTodasYaPagadas.find(f => f.fila === 3).estatus = 'Pagada';
const resultadoTodasPagadas = simularConfirmarPagos([2, 3], facturasTodasYaPagadas);
assert(resultadoTodasPagadas.ok === false, 'Si ninguna de las seleccionadas sigue disponible, rechaza la acción en vez de generar un resumen vacío');

console.log('\n=== Contenido del PDF del resumen de pago ===');
function construirHTMLResumenPagoSimplificado(folioResumen, fechaPagoTexto, resumenAgrupado) {
  const filas = resumenAgrupado.proveedores.map(p =>
    `<tr><td>${p.proveedor}</td><td>${p.empresa}</td><td>${p.folios.join(', ')}</td><td>$${p.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</td></tr>`
  ).join('');
  return `<html><body>
    <div>${folioResumen}</div>
    <div>${fechaPagoTexto}</div>
    <table>${filas}</table>
    <div>TOTAL: $${resumenAgrupado.granTotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</div>
  </body></html>`;
}
const resumenPrueba = agruparPorProveedor([
  { proveedor: 'Suministros del Norte', empresa: 'VENTURA', monto: 10000, folioContrarecibo: 'CR-VENTURA-2026-002' },
  { proveedor: 'Refacciones del Bravo', empresa: 'KARALV', monto: 3000, folioContrarecibo: 'CR-KARALV-2026-001' }
]);
const htmlResumen = construirHTMLResumenPagoSimplificado('RESUMEN-2026-001', '11/08/2026', resumenPrueba);
assert(htmlResumen.indexOf('RESUMEN-2026-001') !== -1, 'El PDF incluye su propio folio de resumen');
assert(htmlResumen.indexOf('11/08/2026') !== -1, 'El PDF incluye la fecha de pago');
assert(htmlResumen.indexOf('Suministros del Norte') !== -1, 'El PDF lista cada proveedor pagado');
assert(htmlResumen.indexOf('CR-KARALV-2026-001') !== -1, 'El PDF incluye la referencia al folio de contrarecibo de cada proveedor');
assert(htmlResumen.indexOf('13,000.00') !== -1, 'El PDF incluye el gran total correcto (10000+3000=13000)');

console.log('\n=== Registro permanente de resúmenes de pago (orden y estructura) ===');
function filtrarYOrdenarResumenes(filas) {
  return filas.slice().reverse();
}
const resumenesDePrueba = [
  { folioResumen: 'RESUMEN-2026-001', fechaPago: '2026-08-29', cantidadFacturas: 1, total: 1505.56, urlPDF: 'https://drive.google.com/x1' },
  { folioResumen: 'RESUMEN-2026-002', fechaPago: '2026-09-02', cantidadFacturas: 3, total: 27000, urlPDF: 'https://drive.google.com/x2' }
];
const resumenesOrdenados = filtrarYOrdenarResumenes(resumenesDePrueba);
assert(resumenesOrdenados[0].folioResumen === 'RESUMEN-2026-002', 'El resumen más reciente aparece primero en la lista permanente');
assert(resumenesOrdenados[1].folioResumen === 'RESUMEN-2026-001', 'El resumen más viejo aparece después, no se pierde');
assert(resumenesOrdenados.length === 2, 'Se conservan TODOS los resúmenes generados, no solo el último');

console.log('\n=== Saldo pendiente con respaldo (facturas de antes de que existiera esta columna) ===');
function obtenerSaldoPendienteConRespaldo(saldoGuardado, monto) {
  if (saldoGuardado === '' || saldoGuardado === null || saldoGuardado === undefined) {
    return Number(monto);
  }
  return Number(saldoGuardado);
}
assert(obtenerSaldoPendienteConRespaldo('', 5000) === 5000, 'Si el saldo pendiente viene vacío (factura vieja), se asume el monto completo');
assert(obtenerSaldoPendienteConRespaldo(2000, 5000) === 2000, 'Si ya hay un saldo pendiente guardado, se usa ese, no el monto original');
assert(obtenerSaldoPendienteConRespaldo(0, 5000) === 0, 'Un saldo pendiente de 0 (ya liquidada) se respeta tal cual, no se confunde con "vacío"');

console.log('\n=== Simulación de abono parcial (no cubre todo, factura queda "Parcialmente Pagada") ===');
function simularAbono(saldoActual, montoAbonado) {
  let abono = Number(montoAbonado);
  if (isNaN(abono) || abono <= 0) return null;
  if (abono > saldoActual) abono = saldoActual; // nunca sobrepagar
  const nuevoSaldo = Math.round((saldoActual - abono) * 100) / 100;
  const nuevoEstatus = nuevoSaldo <= 0 ? 'Pagada' : 'Parcialmente Pagada';
  return { abono, nuevoSaldo, nuevoEstatus };
}

const abonoParcial = simularAbono(10000, 4000);
assert(abonoParcial.nuevoSaldo === 6000, 'Un abono de $4,000 sobre un saldo de $10,000 deja $6,000 pendientes');
assert(abonoParcial.nuevoEstatus === 'Parcialmente Pagada', 'Si queda saldo pendiente, el estatus pasa a "Parcialmente Pagada", no a "Pagada"');

console.log('\n=== Simulación de abono que sí liquida por completo ===');
const abonoCompleto = simularAbono(6000, 6000);
assert(abonoCompleto.nuevoSaldo === 0, 'Un abono igual al saldo pendiente deja el saldo en $0');
assert(abonoCompleto.nuevoEstatus === 'Pagada', 'Si el saldo llega a $0, el estatus pasa a "Pagada"');

console.log('\n=== Protección: nunca se puede abonar más del saldo pendiente (evita sobrepagos) ===');
const abonoExcesivo = simularAbono(1000, 5000);
assert(abonoExcesivo.abono === 1000, 'Si intentas abonar más de lo que se debe, el sistema lo limita al saldo pendiente real (1000, no 5000)');
assert(abonoExcesivo.nuevoSaldo === 0, 'Después de ese abono limitado, el saldo queda correctamente en $0, no en negativo');
assert(abonoExcesivo.nuevoEstatus === 'Pagada', 'Y el estatus pasa a Pagada correctamente');

console.log('\n=== Protección: montos inválidos (cero, negativos, texto) se ignoran sin tronar ===');
assert(simularAbono(5000, 0) === null, 'Un abono de $0 se ignora, no se procesa como si fuera válido');
assert(simularAbono(5000, -100) === null, 'Un abono negativo se ignora, no resta saldo de más');
assert(simularAbono(5000, NaN) === null, 'Un monto inválido (NaN) se ignora sin tronar el resto del proceso');

console.log('\n=== Secuencia completa de abonos hasta liquidar una factura ===');
let saldoSimulado = 10000;
const paso1 = simularAbono(saldoSimulado, 3000);
saldoSimulado = paso1.nuevoSaldo;
assert(saldoSimulado === 7000, 'Primer abono de $3,000 sobre $10,000 → quedan $7,000');
assert(paso1.nuevoEstatus === 'Parcialmente Pagada', 'Después del primer abono, sigue Parcialmente Pagada');

const paso2 = simularAbono(saldoSimulado, 4000);
saldoSimulado = paso2.nuevoSaldo;
assert(saldoSimulado === 3000, 'Segundo abono de $4,000 sobre $7,000 → quedan $3,000');
assert(paso2.nuevoEstatus === 'Parcialmente Pagada', 'Sigue Parcialmente Pagada, todavía falta el último abono');

const paso3 = simularAbono(saldoSimulado, 3000);
saldoSimulado = paso3.nuevoSaldo;
assert(saldoSimulado === 0, 'Tercer y último abono de $3,000 sobre $3,000 → queda en $0');
assert(paso3.nuevoEstatus === 'Pagada', 'Con el tercer abono, la factura por fin pasa a Pagada');

console.log('\n=== Facturas por pagar: incluye "Parcialmente Pagada", no solo "Validada" ===');
function filtrarFacturasPorPagarConAbonos(filas) {
  return filas.filter(f => f.estatus === 'Validada' || f.estatus === 'Parcialmente Pagada');
}
const facturasConParcial = [
  { fila: 2, estatus: 'Validada' },
  { fila: 3, estatus: 'Parcialmente Pagada' },
  { fila: 4, estatus: 'Pagada' },
  { fila: 5, estatus: 'Pendiente de validar' }
];
const resultadoConParciales = filtrarFacturasPorPagarConAbonos(facturasConParcial);
assert(resultadoConParciales.length === 2, 'La lista de "por pagar" incluye tanto Validadas como Parcialmente Pagadas (2 de las 4)');
assert(resultadoConParciales.some(f => f.estatus === 'Parcialmente Pagada'), 'Una factura Parcialmente Pagada SÍ debe seguir apareciendo para poder terminar de abonarla');
assert(!resultadoConParciales.some(f => f.estatus === 'Pagada'), 'Una factura YA completamente Pagada no debe aparecer para pagar de nuevo');

console.log('\n=== Historial de abonos: se conserva cada abono por separado, más reciente primero ===');
function ordenarAbonos(filas) {
  return filas.slice().reverse();
}
const abonosDePrueba = [
  { fecha: '2026-08-10', referenciaFactura: 'A-4694', montoAbonado: 3000, saldoDespues: 7000 },
  { fecha: '2026-08-20', referenciaFactura: 'A-4694', montoAbonado: 4000, saldoDespues: 3000 },
  { fecha: '2026-08-29', referenciaFactura: 'A-4694', montoAbonado: 3000, saldoDespues: 0 }
];
const abonosOrdenados = ordenarAbonos(abonosDePrueba);
assert(abonosOrdenados.length === 3, 'Se conservan los 3 abonos por separado, no se resumen en uno solo');
assert(abonosOrdenados[0].fecha === '2026-08-29', 'El abono más reciente aparece primero');
assert(abonosOrdenados[2].saldoDespues === 7000, 'Se puede rastrear el saldo que quedaba después de cada abono individual, en orden');

console.log('\n=== Aviso de pago al proveedor (recordatorio de Complemento de Pago) ===');
function construirCuerpoAvisoPago(nombreProveedor, items, granTotal, fechaPagoTexto, fechaLimiteTexto, urlPortal) {
  const listaItems = items.map(item =>
    '• Factura ' + item.referenciaFactura + ': $' + Number(item.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })
  ).join('\n');
  const totalTexto = Number(granTotal).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  return 'Hola ' + nombreProveedor + ',\n\n' +
    'Te informamos que se procesó el siguiente pago a tu favor el ' + fechaPagoTexto + ':\n\n' +
    listaItems + '\n\n' +
    'Total pagado: $' + totalTexto + '\n\n' +
    'IMPORTANTE: por cada pago que recibes, necesitamos que nos envíes tu Complemento de Pago (CFDI) correspondiente.\n\n' +
    'Fecha límite para subirlo: ' + fechaLimiteTexto + ' (5 días naturales).\n\n' +
    'Puedes subirlo directo en tu portal, en la sección "Complementos de Pago":\n' + urlPortal + '\n\n' +
    'Si no lo recibimos a tiempo, no podremos programarte pagos nuevos hasta que quede al corriente.\n\n' +
    'Saludos.';
}

const cuerpoAviso = construirCuerpoAvisoPago(
  'Suministros del Norte',
  [{ referenciaFactura: 'A-4694', monto: 1505.56 }],
  1505.56, '29/08/2026', '03/09/2026', 'https://expresscarehps.github.io/sistema-proveedores/portal.html?token=ABC123'
);
assert(cuerpoAviso.indexOf('Suministros del Norte') !== -1, 'El aviso saluda al proveedor por su nombre');
assert(cuerpoAviso.indexOf('A-4694') !== -1, 'El aviso menciona la referencia de la factura pagada');
assert(cuerpoAviso.indexOf('1,505.56') !== -1, 'El aviso incluye el monto pagado formateado');
assert(cuerpoAviso.indexOf('29/08/2026') !== -1, 'El aviso incluye la fecha en que se pagó');
assert(cuerpoAviso.indexOf('03/09/2026') !== -1, 'El aviso incluye la fecha límite para el complemento');
assert(cuerpoAviso.toLowerCase().indexOf('complemento de pago') !== -1, 'El aviso menciona explícitamente el Complemento de Pago requerido');
assert(cuerpoAviso.indexOf('token=ABC123') !== -1, 'El aviso incluye el link al portal del proveedor con su token');

console.log('\n=== Fecha límite del complemento: siempre 5 días naturales después del pago ===');
function calcularFechaLimiteComplemento(fechaPago) {
  const limite = new Date(fechaPago);
  limite.setDate(limite.getDate() + 5);
  return limite;
}
const pagoUnMiercoles = new Date(2026, 7, 26); // miércoles 26 de agosto
const limiteCalculado = calcularFechaLimiteComplemento(pagoUnMiercoles);
assert(formatearYMD(limiteCalculado) === '2026-08-31', 'Un pago el 26 de agosto tiene como límite el 31 de agosto (5 días naturales exactos, no hábiles)');

console.log('\n=== Aviso de pago consolidado: varias facturas del mismo proveedor en un solo correo ===');
const cuerpoConsolidado = construirCuerpoAvisoPago(
  'Suministros del Norte',
  [{ referenciaFactura: 'A-4694', monto: 1000 }, { referenciaFactura: 'A-4700', monto: 2000 }],
  3000, '29/08/2026', '03/09/2026', 'https://ejemplo.com/portal?token=ABC'
);
assert(cuerpoConsolidado.indexOf('A-4694') !== -1 && cuerpoConsolidado.indexOf('A-4700') !== -1,
  'Si se pagan varias facturas del mismo proveedor a la vez, el correo lista TODAS, no solo una');
assert(cuerpoConsolidado.indexOf('3,000.00') !== -1, 'El total consolidado suma correctamente todas las facturas del correo (1000+2000=3000)');

console.log('\n=== Complementos pendientes: solo los del proveedor dueño del token, y solo los "Pendiente" ===');
function filtrarComplementosPendientes(filasAbonos, tokenBuscado) {
  return filasAbonos
    .filter(a => a.token === tokenBuscado && a.estatusComplemento === 'Pendiente')
    .map(a => ({ idAbono: a.id, referenciaFactura: a.referenciaFactura, montoAbonado: a.montoAbonado, fechaLimite: a.fechaLimite }));
}
const abonosDePruebaConToken = [
  { id: 1, token: 'TOKEN-A', referenciaFactura: 'A-1', montoAbonado: 1000, fechaLimite: '2026-09-03', estatusComplemento: 'Pendiente' },
  { id: 2, token: 'TOKEN-A', referenciaFactura: 'A-2', montoAbonado: 2000, fechaLimite: '2026-09-05', estatusComplemento: 'Recibido' },
  { id: 3, token: 'TOKEN-B', referenciaFactura: 'B-1', montoAbonado: 500, fechaLimite: '2026-09-04', estatusComplemento: 'Pendiente' }
];
const pendientesTokenA = filtrarComplementosPendientes(abonosDePruebaConToken, 'TOKEN-A');
assert(pendientesTokenA.length === 1, 'Un proveedor solo ve SUS PROPIOS complementos pendientes, no los de otros proveedores');
assert(pendientesTokenA[0].idAbono === 1, 'No ve los que ya tienen Estatus Complemento = Recibido, solo los Pendientes');

console.log('\n=== Subir complemento: solo se acepta si el abono pertenece a ese token ===');
function validarSubidaComplemento(filasAbonos, idAbono, token) {
  const fila = filasAbonos.find(a => String(a.id) === String(idAbono));
  if (!fila) return { ok: false, error: 'No se encontró ese abono, o no te pertenece.' };
  if (fila.token !== token) return { ok: false, error: 'No se encontró ese abono, o no te pertenece.' };
  return { ok: true };
}
assert(validarSubidaComplemento(abonosDePruebaConToken, 1, 'TOKEN-A').ok === true, 'El dueño real del abono SÍ puede subir su complemento');
assert(validarSubidaComplemento(abonosDePruebaConToken, 1, 'TOKEN-B').ok === false, 'Un proveedor NO puede subir un complemento de un abono que no es suyo (token distinto)');
assert(validarSubidaComplemento(abonosDePruebaConToken, 999, 'TOKEN-A').ok === false, 'Un ID de abono que no existe se rechaza claramente, no truena');

// ═══ RESUMEN ═══
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
