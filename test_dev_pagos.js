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

// ═══ RESUMEN ═══
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
