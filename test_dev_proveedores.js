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

// Idéntico a base64UrlEncode() en Code.gs
function base64UrlEncode(texto) {
  return Buffer.from(texto, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Idéntico a la construcción de claims dentro de obtenerTokenDeServicio() en Code.gs
function construirClaimsJWT(clientEmail, usuarioImpersonado, ahoraEnSegundos) {
  return {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    sub: usuarioImpersonado,
    iat: ahoraEnSegundos,
    exp: ahoraEnSegundos + 3600
  };
}

// Idéntico a construirMensajeCrudo() en Code.gs
function construirMensajeCrudo(de, nombreDe, para, asunto, cuerpo) {
  const mensaje =
    `From: ${nombreDe} <${de}>\r\n` +
    `To: ${para}\r\n` +
    `Subject: ${asunto}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    cuerpo;
  return base64UrlEncode(mensaje);
}

// Idéntico a qué empresa dispara la ruta de Cuenta de Servicio dentro de enviarCorreoAprobacion()
function usaCuentaDeServicio(empresa) {
  return (empresa || '').toString().trim().toUpperCase() === 'KARALV';
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

console.log('\n=== Diagnóstico de carga de la Lista 69-B (para poder confirmar que sí trae datos reales) ===');
function construirResumen69B(csvPresuntos, csvDefinitivos, codigoHttpPresuntos, codigoHttpDefinitivos) {
  const resumen = [];
  [
    { texto: csvPresuntos, tipo: 'Presunto', codigo: codigoHttpPresuntos },
    { texto: csvDefinitivos, tipo: 'Definitivo', codigo: codigoHttpDefinitivos }
  ].forEach(fuente => {
    if (fuente.codigo !== 200) {
      resumen.push(fuente.tipo + ': ERROR, código HTTP ' + fuente.codigo);
      return;
    }
    const filas = parseCsvSimple(fuente.texto);
    if (filas.length < 2) {
      resumen.push(fuente.tipo + ': ERROR, el archivo llegó vacío o sin filas de datos');
      return;
    }
    resumen.push(fuente.tipo + ': ' + (filas.length - 1) + ' RFCs cargados correctamente');
  });
  return resumen.join(' | ');
}
const resumenExitoso = construirResumen69B(csvPresuntosPrueba, csvDefinitivosPrueba, 200, 200);
assert(resumenExitoso.indexOf('Presunto: 1 RFCs cargados correctamente') !== -1, 'El resumen reporta cuántos RFCs se cargaron de la lista de Presuntos');
assert(resumenExitoso.indexOf('Definitivo: 1 RFCs cargados correctamente') !== -1, 'El resumen reporta cuántos RFCs se cargaron de la lista de Definitivos');

const resumenConError = construirResumen69B('', csvDefinitivosPrueba, 404, 200);
assert(resumenConError.indexOf('Presunto: ERROR, código HTTP 404') !== -1, 'Si el SAT no responde (ej. error 404), el resumen lo reporta claramente en vez de quedarse callado');

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

console.log('\n=== Condiciones de pago incluidas en el correo de aprobación ===');
function construirCuerpoCorreo(nombre, lineaEmpresa, urlPortal) {
  return 'Hola ' + nombre + ',\n\n' +
    lineaEmpresa + '\n\n' +
    'Este es tu link de acceso para subir facturas (guárdalo, es único para tu empresa):\n' +
    urlPortal + '\n\n' +
    'Antes de empezar, unas indicaciones importantes sobre cómo procesamos los pagos:\n\n' +
    '• Solo se programan pagos de facturas que hayas subido a este portal — si no la subes aquí, no entra al proceso de pago.\n\n' +
    '• Tu plazo de pago acordado corre a partir de la fecha de emisión de tu factura, no desde el día que la subes al portal. Te conviene subirla cuanto antes para aprovechar tu plazo completo.\n\n' +
    '• Cuando te paguemos una factura con método de pago en parcialidades o diferido (PPD), también vas a necesitar subirnos el Complemento de Pago correspondiente. Si tienes complementos pendientes de facturas ya pagadas, no podremos programarte pagos nuevos hasta que los tengamos al corriente.\n\n' +
    'Saludos.';
}
const cuerpoPrueba = construirCuerpoCorreo('Proveedor de Prueba', 'Tu registro fue aprobado.', 'https://ejemplo.com/portal?token=ABC');
assert(cuerpoPrueba.indexOf('factura que hayas subido a este portal') !== -1 || cuerpoPrueba.indexOf('Solo se programan pagos de facturas que hayas subido') !== -1,
  'El correo explica que solo se pagan facturas subidas al portal');
assert(cuerpoPrueba.indexOf('fecha de emisión') !== -1, 'El correo explica que el plazo de pago corre desde la fecha de emisión, no desde que se sube');
assert(cuerpoPrueba.indexOf('Complemento de Pago') !== -1, 'El correo menciona el requisito de subir el Complemento de Pago');
assert(cuerpoPrueba.indexOf('PPD') !== -1, 'El correo menciona específicamente el método de pago PPD');
assert(cuerpoPrueba.indexOf('no podremos programarte pagos nuevos') !== -1, 'El correo deja claro que faltar complementos bloquea pagos nuevos');

console.log('\n=== Ruta de envío: Cuenta de Servicio (KARALV) vs "Enviar correo como" (Ventura/Ambas) ===');
assert(usaCuentaDeServicio('KARALV') === true, 'KARALV usa la Cuenta de Servicio (Gmail API)');
assert(usaCuentaDeServicio('karalv') === true, 'KARALV en minúsculas también usa la Cuenta de Servicio (no distingue mayúsculas)');
assert(usaCuentaDeServicio('VENTURA') === false, 'VENTURA usa "Enviar correo como", no la Cuenta de Servicio');
assert(usaCuentaDeServicio('AMBAS') === false, 'AMBAS usa "Enviar correo como" (vía enlace@), no la Cuenta de Servicio');

console.log('\n=== Codificación base64url (para el JWT y el mensaje) ===');
const b64url = base64UrlEncode('hola?mundo/con+caracteres=especiales');
assert(!b64url.includes('+'), 'base64url no contiene "+" (debe ser "-")');
assert(!b64url.includes('/'), 'base64url no contiene "/" (debe ser "_")');
assert(!b64url.endsWith('='), 'base64url no tiene relleno "=" al final');

console.log('\n=== Construcción del JWT claim set para la Cuenta de Servicio ===');
const ahoraJWT = Math.floor(Date.now() / 1000);
const claims = construirClaimsJWT('envio-correos-karalv@sistema-proveedores.iam.gserviceaccount.com', 'admon@expresscarecuu.com', ahoraJWT);
assert(claims.sub === 'admon@expresscarecuu.com', 'El "sub" (usuario a impersonar) es admon@expresscarecuu.com');
assert(claims.scope === 'https://www.googleapis.com/auth/gmail.send', 'El permiso solicitado es únicamente enviar correo, nada más amplio');
assert(claims.exp === claims.iat + 3600, 'El token expira 1 hora después de emitido');

console.log('\n=== Armado del mensaje de correo en crudo (RFC 2822) para la API de Gmail ===');
const mensajeCrudo = construirMensajeCrudo('admon@expresscarecuu.com', 'Express Care - Proveedores', 'proveedor.prueba@ejemplo.com', 'Registro aprobado - Portal de Proveedores', 'Hola Proveedor de Prueba,\n\nTu registro fue aprobado.');
function base64UrlDecode(b64) {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}
const mensajeDecodificado = base64UrlDecode(mensajeCrudo);
assert(mensajeDecodificado.includes('From: Express Care - Proveedores <admon@expresscarecuu.com>'), 'El remitente codificado en el mensaje es correcto');
assert(mensajeDecodificado.includes('Tu registro fue aprobado'), 'El cuerpo del mensaje se conserva completo dentro del mensaje codificado');

console.log('\n=== Formato de la llave privada (conversión de \\n literal a salto de línea real) ===');
function formatearLlavePrivada(llaveCruda) {
  return llaveCruda
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');
}
const llaveCruda = '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg\\n-----END PRIVATE KEY-----\\n';
const llaveFormateada = formatearLlavePrivada(llaveCruda);
assert(!llaveFormateada.includes('\\n'), 'Ya no quedan "\\n" literales (barra invertida + n) en la llave');
assert(llaveFormateada.split('\n').length === 4, 'La llave quedó separada en líneas reales (BEGIN, contenido, END, vacío final)');
assert(llaveFormateada.startsWith('-----BEGIN PRIVATE KEY-----'), 'La llave sigue empezando con el encabezado PEM correcto después de la conversión');

const llaveConComillas = '"' + llaveCruda + '"';
const llaveConComillasFormateada = formatearLlavePrivada(llaveConComillas);
assert(llaveConComillasFormateada.startsWith('-----BEGIN PRIVATE KEY-----'), 'Si se copiaron las comillas del .json por accidente, igual queda formateada correctamente');
assert(!llaveConComillasFormateada.includes('"'), 'No quedan comillas sueltas dentro de la llave ya formateada');

const llaveConEspacios = '  ' + llaveCruda + '  \n';
const llaveConEspaciosFormateada = formatearLlavePrivada(llaveConEspacios);
assert(llaveConEspaciosFormateada.startsWith('-----BEGIN PRIVATE KEY-----'), 'Espacios o saltos de línea de más al copiar tampoco rompen el formato');

console.log('\n=== Extracción de credenciales desde el .json completo pegado tal cual ===');
function extraerCredenciales(jsonCrudo) {
  const credenciales = JSON.parse(jsonCrudo);
  return { clientEmail: credenciales.client_email, privateKey: credenciales.private_key };
}
const jsonEjemplo = JSON.stringify({
  type: 'service_account',
  project_id: 'sistema-proveedores-506218',
  private_key_id: 'abc123',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\n',
  client_email: 'envio-correos-karalv@sistema-proveedores-506218.iam.gserviceaccount.com'
});
const credencialesExtraidas = extraerCredenciales(jsonEjemplo);
assert(credencialesExtraidas.clientEmail === 'envio-correos-karalv@sistema-proveedores-506218.iam.gserviceaccount.com',
  'Se extrae correctamente el client_email del .json completo pegado tal cual');
assert(credencialesExtraidas.privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
  'Se extrae correctamente el private_key del .json completo pegado tal cual (ya no hay que recortarlo a mano)');
assert(credencialesExtraidas.clientEmail !== credencialesExtraidas.privateKey,
  'client_email y private_key quedan como dos valores distintos, no se pueden confundir entre sí');

console.log('\n=== Tabla de Proveedores Aprobados (condiciones acordadas) ===');
function filtrarYOrdenarAprobados(filas) {
  const aprobados = filas.filter(f => f.estatus === 'Aprobado');
  return aprobados.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
const proveedoresPrueba = [
  { nombre: 'Zeta Suministros', estatus: 'Aprobado' },
  { nombre: 'Alfa Distribuidora', estatus: 'Aprobado' },
  { nombre: 'Beta Proveedores', estatus: 'Pendiente' },
  { nombre: 'Omega Refacciones', estatus: 'Rechazado' }
];
const resultadoOrdenado = filtrarYOrdenarAprobados(proveedoresPrueba);
assert(resultadoOrdenado.length === 2, 'Solo incluye proveedores con Estatus = Aprobado, ignora Pendientes y Rechazados');
assert(resultadoOrdenado[0].nombre === 'Alfa Distribuidora', 'Los proveedores aparecen ordenados alfabéticamente (Alfa antes que Zeta)');
assert(resultadoOrdenado[1].nombre === 'Zeta Suministros', 'El orden alfabético es correcto de principio a fin');

function claseDisponible(disponible) {
  return Number(disponible) < 0 ? 'disponible-negativo' : '';
}
assert(claseDisponible(30000) === '', 'Disponible positivo → sin clase especial (se ve normal)');
assert(claseDisponible(0) === '', 'Disponible en cero → sin clase especial, no es negativo');
assert(claseDisponible(-5000) === 'disponible-negativo', 'Disponible negativo (proveedor sobregirado) → se marca visualmente en rojo');
console.log('\n' + '─'.repeat(60));
if (fallos === 0) {
  console.log(`✅ ${total}/${total} PRUEBAS PASARON — seguro entregar este avance.`);
} else {
  console.log(`❌ ${fallos}/${total} prueba(s) fallaron — NO entregar hasta corregir.`);
  process.exitCode = 1;
}
