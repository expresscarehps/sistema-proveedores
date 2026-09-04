// ═══════════════════════════════════════════════════════════════
// test_dev_estado_cuenta.js — Pruebas automáticas del Estado de
// Cuenta por Proveedor (resumen + detalle factura por factura)
// KARALV / Ventura Distribución y Servicios
// ═══════════════════════════════════════════════════════════════
// Se corre ANTES de entregar cualquier avance de código a Carlos.
// Uso: node test_dev_estado_cuenta.js
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

function obtenerSaldoPendienteConRespaldo(saldoGuardado, monto) {
  if (saldoGuardado === '' || saldoGuardado === null || saldoGuardado === undefined) {
    return Number(monto);
  }
  return Number(saldoGuardado);
}

// Versión simplificada de obtenerEstadoCuenta, operando sobre un arreglo de
// facturas de prueba en vez de leer directo de un Google Sheet.
function calcularEstadoCuenta(facturas, hoy) {
  const porProveedor = {};

  facturas.forEach(f => {
    if (f.estatus !== 'Validada' && f.estatus !== 'Parcialmente Pagada' && f.estatus !== 'Pagada') return;

    const clave = f.proveedor + '|' + f.empresa;
    const saldoPendiente = obtenerSaldoPendienteConRespaldo(f.saldoPendiente, f.monto);

    if (!porProveedor[clave]) {
      porProveedor[clave] = {
        proveedor: f.proveedor, empresa: f.empresa,
        totalFacturado: 0, totalPagado: 0, saldoPendiente: 0, vencido: 0, cantidadFacturas: 0
      };
    }

    const r = porProveedor[clave];
    r.totalFacturado += f.monto;
    r.totalPagado += (f.monto - saldoPendiente);
    r.saldoPendiente += saldoPendiente;
    r.cantidadFacturas += 1;

    if (saldoPendiente > 0 && f.fechaVencimiento && new Date(f.fechaVencimiento) < hoy) {
      r.vencido += saldoPendiente;
    }
  });

  const resultado = Object.values(porProveedor).map(r => {
    r.totalFacturado = Math.round(r.totalFacturado * 100) / 100;
    r.totalPagado = Math.round(r.totalPagado * 100) / 100;
    r.saldoPendiente = Math.round(r.saldoPendiente * 100) / 100;
    r.vencido = Math.round(r.vencido * 100) / 100;
    return r;
  });
  resultado.sort((a, b) => b.saldoPendiente - a.saldoPendiente);
  return resultado;
}

function calcularDetalleProveedor(facturas, proveedor, empresa) {
  return facturas
    .filter(f => (f.estatus === 'Validada' || f.estatus === 'Parcialmente Pagada' || f.estatus === 'Pagada'))
    .filter(f => f.proveedor === proveedor && f.empresa === empresa)
    .map(f => ({
      folioFactura: f.folioFactura,
      monto: f.monto,
      saldoPendiente: obtenerSaldoPendienteConRespaldo(f.saldoPendiente, f.monto),
      estatus: f.estatus,
      fechaEmision: f.fechaEmision
    }))
    .sort((a, b) => new Date(b.fechaEmision) - new Date(a.fechaEmision));
}

// ═══ PRUEBAS ═══

const hoyPrueba = new Date(2026, 8, 3); // 3 de septiembre de 2026

console.log('\n=== Solo cuenta facturas Validadas, Parcialmente Pagadas o Pagadas ===');
const facturasBasicas = [
  { proveedor: 'Suministros del Norte', empresa: 'VENTURA', estatus: 'Validada', monto: 10000, saldoPendiente: '', fechaVencimiento: '2026-08-01', folioFactura: 'A-1' },
  { proveedor: 'Suministros del Norte', empresa: 'VENTURA', estatus: 'Pendiente de validar', monto: 5000, saldoPendiente: '', fechaVencimiento: '2026-09-01', folioFactura: 'A-2' },
  { proveedor: 'Suministros del Norte', empresa: 'VENTURA', estatus: 'Rechazada', monto: 3000, saldoPendiente: '', fechaVencimiento: '2026-09-01', folioFactura: 'A-3' }
];
const estadoBasico = calcularEstadoCuenta(facturasBasicas, hoyPrueba);
assert(estadoBasico.length === 1, 'Solo aparece 1 proveedor (el que tiene al menos una factura Validada)');
assert(estadoBasico[0].totalFacturado === 10000, 'El total facturado NO incluye la Pendiente ni la Rechazada, solo la Validada (10000)');
assert(estadoBasico[0].cantidadFacturas === 1, 'La cantidad de facturas contadas es 1, no 3');

console.log('\n=== Total Facturado, Total Pagado y Saldo Pendiente calculan correctamente ===');
const facturasConPagos = [
  { proveedor: 'Refacciones del Bravo', empresa: 'KARALV', estatus: 'Pagada', monto: 5000, saldoPendiente: 0, fechaVencimiento: '2026-07-01', folioFactura: 'B-1' },
  { proveedor: 'Refacciones del Bravo', empresa: 'KARALV', estatus: 'Parcialmente Pagada', monto: 8000, saldoPendiente: 3000, fechaVencimiento: '2026-08-15', folioFactura: 'B-2' },
  { proveedor: 'Refacciones del Bravo', empresa: 'KARALV', estatus: 'Validada', monto: 2000, saldoPendiente: '', fechaVencimiento: '2026-09-10', folioFactura: 'B-3' }
];
const estadoConPagos = calcularEstadoCuenta(facturasConPagos, hoyPrueba);
const bravo = estadoConPagos.find(r => r.proveedor === 'Refacciones del Bravo');
assert(bravo.totalFacturado === 15000, 'Total facturado suma las 3 facturas (5000+8000+2000=15000)');
assert(bravo.totalPagado === 10000, 'Total pagado: 5000 (pagada completa) + 5000 (de la parcial, 8000-3000) + 0 (validada, nada pagado) = 10000');
assert(bravo.saldoPendiente === 5000, 'Saldo pendiente: 0 + 3000 + 2000 = 5000');

console.log('\n=== "Vencido" solo cuenta saldo pendiente con fecha de vencimiento YA PASADA ===');
const facturasConVencidas = [
  { proveedor: 'Proveedor X', empresa: 'VENTURA', estatus: 'Validada', monto: 1000, saldoPendiente: '', fechaVencimiento: '2026-08-01', folioFactura: 'X-1' }, // ya venció (antes del 3-sep)
  { proveedor: 'Proveedor X', empresa: 'VENTURA', estatus: 'Validada', monto: 2000, saldoPendiente: '', fechaVencimiento: '2026-09-20', folioFactura: 'X-2' }, // todavía no vence
  { proveedor: 'Proveedor X', empresa: 'VENTURA', estatus: 'Pagada', monto: 500, saldoPendiente: 0, fechaVencimiento: '2026-07-01', folioFactura: 'X-3' } // venció pero ya no debe nada
];
const estadoConVencidas = calcularEstadoCuenta(facturasConVencidas, hoyPrueba);
const proveedorX = estadoConVencidas.find(r => r.proveedor === 'Proveedor X');
assert(proveedorX.vencido === 1000, 'Solo cuenta como vencido lo que YA pasó su fecha Y todavía tiene saldo (1000, no 1000+2000+500)');
assert(proveedorX.saldoPendiente === 3000, 'El saldo pendiente total sigue sumando todo lo que falta (1000+2000+0=3000), vencido o no');

console.log('\n=== Orden: el proveedor con mayor saldo pendiente aparece primero ===');
const facturasVarias = [
  { proveedor: 'Debe Poco', empresa: 'KARALV', estatus: 'Validada', monto: 100, saldoPendiente: '', fechaVencimiento: '2026-09-10', folioFactura: 'P-1' },
  { proveedor: 'Debe Mucho', empresa: 'KARALV', estatus: 'Validada', monto: 90000, saldoPendiente: '', fechaVencimiento: '2026-09-10', folioFactura: 'P-2' }
];
const estadoOrdenado = calcularEstadoCuenta(facturasVarias, hoyPrueba);
assert(estadoOrdenado[0].proveedor === 'Debe Mucho', 'El proveedor con más saldo pendiente aparece primero en la lista');

console.log('\n=== Detalle factura por factura de un proveedor específico ===');
const detalleBravo = calcularDetalleProveedor(facturasConPagos, 'Refacciones del Bravo', 'KARALV');
assert(detalleBravo.length === 3, 'El detalle incluye las 3 facturas de ese proveedor');
assert(detalleBravo.every(f => f.folioFactura), 'Cada factura del detalle trae su folio para identificarla');

console.log('\n=== El detalle de un proveedor NO incluye facturas de otro proveedor ===');
const facturasDosProveedores = [
  ...facturasConPagos,
  { proveedor: 'Otro Proveedor', empresa: 'KARALV', estatus: 'Validada', monto: 999, saldoPendiente: '', fechaVencimiento: '2026-09-10', folioFactura: 'Z-1' }
];
const detalleFiltrado = calcularDetalleProveedor(facturasDosProveedores, 'Refacciones del Bravo', 'KARALV');
assert(detalleFiltrado.every(f => f.folioFactura !== 'Z-1'), 'El detalle de un proveedor nunca mezcla facturas de otro proveedor');

console.log('\n=== El mismo nombre de proveedor en OTRA empresa se trata como cuenta separada ===');
const facturasMismoNombreDosEmpresas = [
  { proveedor: 'Proveedor Compartido', empresa: 'KARALV', estatus: 'Validada', monto: 1000, saldoPendiente: '', fechaVencimiento: '2026-09-10', folioFactura: 'C-1' },
  { proveedor: 'Proveedor Compartido', empresa: 'VENTURA', estatus: 'Validada', monto: 2000, saldoPendiente: '', fechaVencimiento: '2026-09-10', folioFactura: 'C-2' }
];
const estadoCompartido = calcularEstadoCuenta(facturasMismoNombreDosEmpresas, hoyPrueba);
assert(estadoCompartido.length === 2, 'Un proveedor que factura a ambas empresas aparece como 2 renglones separados, no mezclados');

// ═══ RESUMEN ═══
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
