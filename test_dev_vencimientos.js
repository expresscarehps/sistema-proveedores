// ═══════════════════════════════════════════════════════════════
// test_dev_vencimientos.js — Pruebas automáticas de la Fase 3:
// Vencimientos y Reporte Semanal
// KARALV / Ventura Distribución y Servicios
// ═══════════════════════════════════════════════════════════════
// Se corre ANTES de entregar cualquier avance de código a Carlos.
// Uso: node test_dev_vencimientos.js
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

function calcularFechaPagoProgramada(fechaVencimiento) {
  const origen = (fechaVencimiento instanceof Date) ? fechaVencimiento : new Date(fechaVencimiento);
  const fecha = new Date(origen.getFullYear(), origen.getMonth(), origen.getDate());
  const diaSemana = fecha.getDay();
  const diasHastaMartes = (9 - diaSemana) % 7;
  fecha.setDate(fecha.getDate() + diasHastaMartes);
  return fecha;
}

function proximoMartesPago(desde) {
  return calcularFechaPagoProgramada(desde);
}

function formatearYMD(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Versión simplificada de obtenerResumenVencimientos, operando sobre un arreglo
// de facturas de prueba en vez de leer directo de un Google Sheet.
function obtenerResumenVencimientos(facturas, martesPago) {
  const martesTexto = formatearYMD(martesPago);
  const porProveedor = {};
  let granTotal = 0;

  facturas.forEach(f => {
    if (f.estatus !== 'Validada' || !f.fechaPago) return;
    const fechaPagoTexto = formatearYMD(f.fechaPago);
    if (fechaPagoTexto !== martesTexto) return;

    const clave = f.proveedor + '|' + f.empresa;
    if (!porProveedor[clave]) {
      porProveedor[clave] = { proveedor: f.proveedor, empresa: f.empresa, folios: [], total: 0 };
    }
    porProveedor[clave].folios.push(f.folioContrarecibo || '(sin folio)');
    porProveedor[clave].total += f.monto;
    granTotal += f.monto;
  });

  const proveedores = Object.values(porProveedor).sort((a, b) => a.proveedor.localeCompare(b.proveedor));
  return { martesPago: martesTexto, proveedores: proveedores, granTotal: granTotal };
}

function construirCuerpoReporteSemanal(resumen) {
  const fechaBonita = resumen.martesPago.split('-').reverse().join('/');

  if (resumen.proveedores.length === 0) {
    return 'Hola,\n\nNo hay facturas validadas con pago programado para el martes ' + fechaBonita + '.\n\n' +
      'Este es un resumen automático del Sistema de Registro de Facturas y Proveedores.';
  }

  let cuerpo = 'Hola,\n\nEste es el resumen de lo que vence para el próximo martes de pago (' + fechaBonita + '):\n\n';
  resumen.proveedores.forEach(p => {
    cuerpo += '• ' + p.proveedor + ' (' + p.empresa + '): $' +
      p.total.toLocaleString('es-MX', { minimumFractionDigits: 2 }) +
      ' — folio(s): ' + p.folios.join(', ') + '\n';
  });
  cuerpo += '\nTOTAL a pagar el ' + fechaBonita + ': $' + resumen.granTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + '\n\n';
  cuerpo += 'Este es un resumen automático del Sistema de Registro de Facturas y Proveedores. ';
  cuerpo += 'Recuerda que esto es solo informativo — la selección y programación de pagos se hace aparte.';
  return cuerpo;
}

// ═══ PRUEBAS ═══

console.log('\n=== Próximo martes de pago desde una fecha cualquiera (reutiliza la regla del martes) ===');
// Jueves 6 de agosto de 2026 -> el próximo martes de pago es el 11 de agosto
const desdeJueves = proximoMartesPago(new Date(2026, 7, 6));
assert(formatearYMD(desdeJueves) === '2026-08-11', 'Desde un jueves, el próximo martes de pago es 5 días después (11-ago)');

// Martes 11 de agosto -> el "próximo" martes de pago es ese mismo día
const desdeMartes = proximoMartesPago(new Date(2026, 7, 11));
assert(formatearYMD(desdeMartes) === '2026-08-11', 'Si hoy ya es martes, el próximo martes de pago es hoy mismo');

console.log('\n=== Reporte del jueves da 5 días de anticipación (el pedido original de Carlos) ===');
const jueves = new Date(2026, 7, 6);
const martesQueLeCorresponde = proximoMartesPago(jueves);
const diffDias = Math.round((martesQueLeCorresponde - jueves) / (1000 * 60 * 60 * 24));
assert(diffDias === 5, 'El reporte enviado un jueves siempre da 5 días de anticipación antes del pago del martes');

console.log('\n=== Resumen de vencimientos: agrupa por proveedor y calcula totales ===');
const martesPrueba = new Date(2026, 7, 11);
const facturasPrueba = [
  { proveedor: 'Suministros del Norte', empresa: 'VENTURA', estatus: 'Validada', monto: 10000, fechaPago: new Date(2026, 7, 11), folioContrarecibo: 'CR-VENTURA-2026-001' },
  { proveedor: 'Suministros del Norte', empresa: 'VENTURA', estatus: 'Validada', monto: 5000, fechaPago: new Date(2026, 7, 11), folioContrarecibo: 'CR-VENTURA-2026-002' },
  { proveedor: 'Refacciones del Bravo', empresa: 'KARALV', estatus: 'Validada', monto: 3000, fechaPago: new Date(2026, 7, 11), folioContrarecibo: 'CR-KARALV-2026-001' },
  { proveedor: 'Proveedor de otra semana', empresa: 'KARALV', estatus: 'Validada', monto: 99999, fechaPago: new Date(2026, 7, 18), folioContrarecibo: 'CR-KARALV-2026-002' },
  { proveedor: 'Factura aún pendiente', empresa: 'VENTURA', estatus: 'Pendiente de validar', monto: 77777, fechaPago: new Date(2026, 7, 11), folioContrarecibo: '' }
];

const resumen = obtenerResumenVencimientos(facturasPrueba, martesPrueba);
assert(resumen.proveedores.length === 2, 'Solo agrupa proveedores con facturas de ESE martes específico (2 proveedores, no todos)');
assert(resumen.granTotal === 18000, 'El gran total suma solo las facturas del martes correcto (10000+5000+3000=18000), ignora las de otras semanas');

const suministros = resumen.proveedores.find(p => p.proveedor === 'Suministros del Norte');
assert(suministros.total === 15000, 'Un mismo proveedor con 2 facturas del mismo martes se agrupa en un solo total (10000+5000=15000)');
assert(suministros.folios.length === 2, 'Se listan los 2 folios de contrarecibo por separado, aunque estén agrupados en un solo total');

assert(resumen.proveedores.some(p => p.proveedor === 'Proveedor de otra semana') === false,
  'Una factura validada pero con pago programado para OTRA semana no se incluye en este resumen');
assert(resumen.proveedores.some(p => p.proveedor === 'Factura aún pendiente') === false,
  'Una factura que todavía NO está Validada (sigue Pendiente) no se incluye, aunque su fecha de pago coincida');

console.log('\n=== Orden alfabético por proveedor en el resumen ===');
assert(resumen.proveedores[0].proveedor === 'Refacciones del Bravo', 'Los proveedores del resumen aparecen ordenados alfabéticamente');

console.log('\n=== Cuerpo del correo del reporte semanal ===');
const cuerpoConDatos = construirCuerpoReporteSemanal(resumen);
assert(cuerpoConDatos.indexOf('11/08/2026') !== -1, 'El correo menciona la fecha del martes de pago en formato dd/mm/aaaa');
assert(cuerpoConDatos.indexOf('Refacciones del Bravo') !== -1, 'El correo lista cada proveedor con monto pendiente');
assert(cuerpoConDatos.indexOf('18,000.00') !== -1, 'El correo incluye el gran total formateado con comas');
assert(cuerpoConDatos.indexOf('CR-VENTURA-2026-001') !== -1, 'El correo incluye los folios de contrarecibo de cada proveedor');
assert(cuerpoConDatos.toLowerCase().indexOf('informativo') !== -1, 'El correo deja claro que es informativo, no una acción de pago');

console.log('\n=== Cuerpo del correo cuando NO hay nada que vence esa semana ===');
const resumenVacio = obtenerResumenVencimientos([], martesPrueba);
const cuerpoVacio = construirCuerpoReporteSemanal(resumenVacio);
assert(cuerpoVacio.indexOf('No hay facturas validadas') !== -1, 'Si no hay nada pendiente esa semana, el correo lo dice claramente en vez de salir vacío o raro');
assert(resumenVacio.granTotal === 0, 'El gran total es 0 cuando no hay facturas para esa semana');

// ═══ RESUMEN ═══
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
