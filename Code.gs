/* =========================================================================
   SISTEMA DE REGISTRO DE FACTURAS - FASE 1: CATÁLOGO DE PROVEEDORES
   KARALV / Ventura Distribución y Servicios
   =========================================================================
   Este archivo va pegado en Apps Script (Extensiones > Apps Script,
   dentro de tu Google Sheet). No necesitas entender el código para usarlo,
   solo seguir las instrucciones del README para conectarlo.
   ========================================================================= */

// ====== CONFIGURACIÓN ======
// Ya está todo listo. No necesitas cambiar nada aquí.
const SHEET_ID = '1-qPOj0yvsGZ_lStDeOayPDQvQfOtqdn2RGQ6gLTlse0';
const ADMIN_PASSWORD = 'KaralvVentura2026';   // Esta es tu clave para entrar al portal interno (admin.html)
const VERSION_CODIGO = 'v19-lista-contrarecibos-permanente'; // Cambia en cada entrega, para confirmar que el código desplegado es el más reciente

const SHEET_NAME = 'Catalogo';

// Columnas del tab "Catalogo" (para referencia, no las cambies sin ajustar el código):
// A=1 ID | B=2 Fecha registro | C=3 Nombre | D=4 RFC | E=5 Empresa
// F=6 Nombre comercial | G=7 Teléfono | H=8 Correo | I=9 Forma de pago
// J=10 Estatus | K=11 Plazo de pago (días) | L=12 Línea de crédito
// M=13 Saldo pendiente | N=14 Disponible | O=15 Token | P=16 Fecha aprobación
// Q=17 Motivo de rechazo

// ====== PUNTOS DE ENTRADA ======

function doGet(e) {
  return respuestaJSON({ ok: true, mensaje: 'Sistema de catálogo de proveedores activo.' });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return respuestaJSON({ ok: false, error: 'Datos inválidos.' });
  }

  switch (data.action) {
    case 'registrarProveedor':
      return registrarProveedor(data);
    case 'listarPendientes':
      return listarPendientes(data);
    case 'aprobarProveedor':
      return aprobarProveedor(data);
    case 'rechazarProveedor':
      return rechazarProveedor(data);
    case 'obtenerInfoProveedor':
      return obtenerInfoProveedor(data);
    case 'registrarFactura':
      return registrarFactura(data);
    case 'listarFacturasProveedor':
      return listarFacturasProveedor(data);
    case 'listarFacturasPendientes':
      return listarFacturasPendientes(data);
    case 'validarFactura':
      return validarFactura(data);
    case 'rechazarFactura':
      return rechazarFactura(data);
    case 'listarContrarecibos':
      return listarContrarecibos(data);
    default:
      return respuestaJSON({ ok: false, error: 'Acción no reconocida.' });
  }
}

// ====== UTILIDADES ======

function respuestaJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function generarToken() {
  return Utilities.getUuid().split('-')[0].toUpperCase(); // ej: 3F8A9B2C
}

function claveValida(password) {
  return password === ADMIN_PASSWORD;
}

// ====== VERIFICACIÓN CONTRA LA LISTA 69-B DEL SAT (EFOS) ======
// El SAT publica estos archivos públicamente, sin necesidad de clave ni permiso.
// "Presuntos" = en investigación. "Definitivos" = confirmados por el SAT.

function obtenerRFCsLista69B() {
  const fuentes = [
    { url: 'http://omawww.sat.gob.mx/cifras_sat/Documents/Presuntos.csv', tipo: 'Presunto' },
    { url: 'http://omawww.sat.gob.mx/cifras_sat/Documents/Definitivos.csv', tipo: 'Definitivo' }
  ];
  const mapa = {}; // RFC -> 'Presunto' | 'Definitivo'
  const resumen = [];

  fuentes.forEach(function (fuente) {
    try {
      const resp = UrlFetchApp.fetch(fuente.url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) {
        resumen.push(fuente.tipo + ': ERROR, código HTTP ' + resp.getResponseCode());
        return;
      }

      const texto = resp.getContentText('ISO-8859-1'); // el SAT publica en este formato de texto
      const filas = Utilities.parseCsv(texto);
      if (filas.length < 2) {
        resumen.push(fuente.tipo + ': ERROR, el archivo llegó vacío o sin filas de datos');
        return;
      }

      const encabezado = filas[0].map(function (h) { return (h || '').trim().toUpperCase(); });
      let colRFC = encabezado.findIndex(function (h) { return h.indexOf('RFC') !== -1; });
      if (colRFC === -1) colRFC = 0;

      let contador = 0;
      for (let i = 1; i < filas.length; i++) {
        const rfc = (filas[i][colRFC] || '').trim().toUpperCase();
        if (rfc) {
          mapa[rfc] = fuente.tipo;
          contador++;
        }
      }
      resumen.push(fuente.tipo + ': ' + contador + ' RFCs cargados correctamente');
    } catch (err) {
      resumen.push(fuente.tipo + ': EXCEPCIÓN — ' + err.message);
    }
  });

  registrarDiagnosticoSAT(resumen.join(' | '));

  return mapa;
}

function registrarDiagnosticoSAT(mensaje) {
  try {
    getHojaDebug().getRange('B7').setValue('(' + new Date().toLocaleString() + ') Lista 69-B: ' + mensaje);
  } catch (err) {
    // No detiene el resto del proceso si esto falla.
  }
}

// ====== REGISTRO PÚBLICO (lo llena el proveedor) ======

function registrarProveedor(data) {
  if (!data.nombre || !data.rfc || !data.correo || !data.empresa || !data.telefono || !data.formaPago) {
    return respuestaJSON({ ok: false, error: 'Faltan datos obligatorios (todos son requeridos excepto nombre comercial).' });
  }

  const sheet = getSheet();

  // No se permite registrar el mismo RFC dos veces (sin importar mayúsculas/espacios)
  const rfcNuevo = data.rfc.trim().toUpperCase();
  const datosExistentes = sheet.getDataRange().getValues();
  for (let i = 1; i < datosExistentes.length; i++) {
    const rfcExistente = (datosExistentes[i][3] || '').toString().trim().toUpperCase();
    if (rfcExistente === rfcNuevo) {
      return respuestaJSON({ ok: false, error: 'Este RFC ya está registrado en el sistema.' });
    }
  }

  const fecha = new Date();

  sheet.appendRow([
    '',                          // A: ID (se calcula abajo)
    fecha,                       // B: Fecha de registro
    data.nombre,                 // C: Nombre / Razón social
    data.rfc,                    // D: RFC
    data.empresa,                // E: Empresa (KARALV / VENTURA)
    data.nombreComercial || '',  // F: Nombre comercial
    data.telefono || '',         // G: Teléfono
    data.correo,                 // H: Correo
    data.formaPago || '',        // I: Forma de pago preferida
    'Pendiente',                 // J: Estatus
    '',                          // K: Plazo de pago (lo define Carlos al aprobar)
    '',                          // L: Línea de crédito (lo define Carlos al aprobar)
    0,                           // M: Saldo pendiente (se llenará en Fase 2)
    '',                          // N: Disponible (fórmula, se pone abajo)
    '',                          // O: Token de acceso
    '',                          // P: Fecha de aprobación
    ''                           // Q: Motivo de rechazo
  ]);

  const fila = sheet.getLastRow();
  sheet.getRange(fila, 1).setValue(fila - 1);                              // ID
  sheet.getRange(fila, 14).setFormula('=L' + fila + '-M' + fila);          // Disponible = Línea - Saldo

  return respuestaJSON({ ok: true, mensaje: 'Registro recibido. Quedará pendiente de aprobación.' });
}

// ====== PORTAL INTERNO (requiere clave) ======

function listarPendientes(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }

  const sheet = getSheet();
  const datos = sheet.getDataRange().getValues();
  const listaNegra = obtenerRFCsLista69B();
  const pendientes = [];

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][9] === 'Pendiente') { // columna J (índice 9)
      const rfc = (datos[i][3] || '').trim().toUpperCase();
      pendientes.push({
        fila: i + 1,
        nombre: datos[i][2],
        rfc: datos[i][3],
        empresa: datos[i][4],
        nombreComercial: datos[i][5],
        telefono: datos[i][6],
        correo: datos[i][7],
        formaPago: datos[i][8],
        alertaSAT: listaNegra[rfc] || null   // 'Presunto', 'Definitivo', o null si no aparece
      });
    }
  }

  return respuestaJSON({ ok: true, pendientes: pendientes });
}

function aprobarProveedor(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }
  if (!data.fila || !data.plazoPago || data.lineaCredito === undefined) {
    return respuestaJSON({ ok: false, error: 'Faltan datos para aprobar (fila, plazo de pago o línea de crédito).' });
  }

  const sheet = getSheet();
  const fila = data.fila;
  const token = generarToken();

  sheet.getRange(fila, 10).setValue('Aprobado');            // J: Estatus
  sheet.getRange(fila, 11).setValue(data.plazoPago);         // K: Plazo de pago
  sheet.getRange(fila, 12).setValue(data.lineaCredito);      // L: Línea de crédito
  sheet.getRange(fila, 15).setValue(token);                  // O: Token
  sheet.getRange(fila, 16).setValue(new Date());              // P: Fecha de aprobación

  const correo = sheet.getRange(fila, 8).getValue();
  const nombre = sheet.getRange(fila, 3).getValue();
  const empresa = sheet.getRange(fila, 5).getValue();

  // Marcador de versión: se escribe SIEMPRE, para confirmar que el código desplegado
  // en este momento es el más reciente (compara esto contra VERSION_CODIGO arriba).
  try {
    getHojaDebug().getRange('B5').setValue(VERSION_CODIGO + ' — ejecutado ' + new Date().toLocaleString());
  } catch (err) {
    // No detiene el resto del proceso si esto falla.
  }

  enviarCorreoAprobacion(correo, nombre, token, empresa);

  return respuestaJSON({ ok: true });
}

function rechazarProveedor(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }
  if (!data.fila) {
    return respuestaJSON({ ok: false, error: 'Falta la fila a rechazar.' });
  }

  const sheet = getSheet();
  sheet.getRange(data.fila, 10).setValue('Rechazado');
  sheet.getRange(data.fila, 17).setValue(data.motivo || '');

  return respuestaJSON({ ok: true });
}

// ====== CORREO AUTOMÁTICO AL APROBAR ======
// IMPORTANTE: cambia la URL de abajo por la de tu GitHub Pages una vez publicado (ver README paso 6).
//
// El remitente cambia según la empresa:
//   VENTURA / AMBAS -> enlace@highprecisionsupply.com
//   KARALV          -> admon@expresscarecuu.com
// Para que el correo salga con ese remitente, esa dirección debe estar dada de alta
// como "Enviar correo como" en la cuenta de Gmail que usa este Apps Script.
// Si no lo está, GmailApp falla y el sistema manda el correo de todos modos desde tu
// cuenta normal (respaldo automático), para que el proveedor nunca se quede sin avisarse.

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

  // VENTURA (o cualquier valor inesperado cae aquí por seguridad)
  return {
    correo: 'enlace@highprecisionsupply.com',
    nombre: 'High Precision Supply - Proveedores',
    lineaEmpresa: 'Tu registro como proveedor de Ventura Distribución y Servicios fue aprobado.'
  };
}

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

function enviarCorreoAprobacion(correo, nombre, token, empresa) {
  const urlPortal = 'https://TU-USUARIO.github.io/TU-REPO/portal.html?token=' + token;
  const asunto = 'Registro aprobado - Portal de Proveedores';
  const remitente = datosRemitente(empresa);
  const cuerpo = construirCuerpoCorreo(nombre, remitente.lineaEmpresa, urlPortal);

  const empresaNorm = (empresa || '').toString().trim().toUpperCase();

  // KARALV usa la Cuenta de Servicio (Gmail API), porque "Enviar correo como" no
  // funciona entre los dos dominios de Workspace distintos (highprecisionsupply.com
  // y expresscarecuu.com son organizaciones separadas para Google, aunque tú
  // administres las dos).
  if (empresaNorm === 'KARALV') {
    const enviado = enviarConCuentaDeServicio(correo, remitente.correo, remitente.nombre, asunto, cuerpo);
    if (enviado) return;
    // Si la Cuenta de Servicio falla (llave no configurada, delegación no autorizada, etc.),
    // caemos al mismo respaldo de siempre: sale desde tu cuenta normal.
    MailApp.sendEmail(correo, asunto, cuerpo);
    return;
  }

  // VENTURA / AMBAS: enlace@highprecisionsupply.com ya funciona con "Enviar correo como"
  // porque vive en tu mismo Workspace.
  try {
    GmailApp.sendEmail(correo, asunto, cuerpo, {
      from: remitente.correo,
      name: remitente.nombre
    });
  } catch (err) {
    MailApp.sendEmail(correo, asunto, cuerpo);
  }
}

// ====== ENVÍO VÍA GMAIL API CON CUENTA DE SERVICIO ======
// Se usa exclusivamente para mandar correos como admon@expresscarecuu.com.
// Requiere 1 sola propiedad guardada en Propiedades del Proyecto (Apps Script ->
// Configuración del proyecto -> Propiedades del script), NUNCA escrita aquí en el código:
//   SERVICE_ACCOUNT_JSON  -> pega ahí el CONTENIDO COMPLETO del archivo .json que
//                            descargaste de Google Cloud, tal cual, sin recortar nada.
//                            Abre el archivo, Ctrl+A (seleccionar todo), Ctrl+C, y pégalo
//                            completo en esa propiedad. El sistema saca de ahí lo que necesita.

function getHojaDebug() {
  const libro = SpreadsheetApp.openById(SHEET_ID);
  let hoja = libro.getSheetByName('Debug');
  if (!hoja) {
    hoja = libro.insertSheet('Debug');
  }
  // Aseguramos las etiquetas aunque la pestaña ya existiera de una versión anterior del sistema.
  if (!hoja.getRange('A1').getValue()) hoja.getRange('A1').setValue('Último error:');
  if (!hoja.getRange('A3').getValue()) hoja.getRange('A3').setValue('Diagnóstico:');
  if (!hoja.getRange('A7').getValue()) hoja.getRange('A7').setValue('Verificación Lista 69-B (SAT):');
  return hoja;
}

function registrarError(mensaje) {
  try {
    Logger.log(mensaje);
    getHojaDebug().getRange('B1').setValue('(' + new Date().toLocaleString() + ') ' + mensaje);
  } catch (err) {
    // Si ni siquiera esto funciona, no hay nada más que hacer aquí.
  }
}

function registrarDiagnostico(mensaje) {
  try {
    getHojaDebug().getRange('B3').setValue('(' + new Date().toLocaleString() + ') ' + mensaje);
  } catch (err) {
    // No detiene el resto del proceso si esto falla.
  }
}

function enviarConCuentaDeServicio(paraCorreo, deCorreo, deNombre, asunto, cuerpo) {
  try {
    const props = PropertiesService.getScriptProperties();
    const jsonCrudo = props.getProperty('SERVICE_ACCOUNT_JSON');

    if (!jsonCrudo) {
      registrarError('Cuenta de Servicio: falta la propiedad SERVICE_ACCOUNT_JSON.');
      return false;
    }

    let credenciales;
    try {
      credenciales = JSON.parse(jsonCrudo);
    } catch (err) {
      registrarError('Cuenta de Servicio: SERVICE_ACCOUNT_JSON no es un .json válido. ¿Se pegó el archivo completo? Detalle: ' + err.message);
      return false;
    }

    const clientEmail = credenciales.client_email;
    const privateKey = credenciales.private_key;

    if (!clientEmail || !privateKey) {
      registrarError('Cuenta de Servicio: el .json pegado no tiene "client_email" o "private_key". ¿Es el archivo correcto?');
      return false;
    }

    const accessToken = obtenerTokenDeServicio(clientEmail, privateKey, deCorreo);
    if (!accessToken) return false; // El error ya quedó registrado dentro de obtenerTokenDeServicio()

    const mensajeCrudo = construirMensajeCrudo(deCorreo, deNombre, paraCorreo, asunto, cuerpo);

    const resp = UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + accessToken },
      payload: JSON.stringify({ raw: mensajeCrudo }),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      registrarError('Gmail API rechazó el envío. Código ' + resp.getResponseCode() + ': ' + resp.getContentText());
      return false;
    }

    return true;
  } catch (err) {
    registrarError('Excepción inesperada en enviarConCuentaDeServicio: ' + err.message);
    return false;
  }
}

function obtenerTokenDeServicio(clientEmail, privateKey, usuarioImpersonado) {
  // El .json guarda los saltos de línea de la llave como "\n" literal; los convertimos
  // a saltos de línea reales antes de firmar.
  const privateKeyFormateada = privateKey
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');

  const ahora = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    sub: usuarioImpersonado,
    iat: ahora,
    exp: ahora + 3600
  };
  const header = { alg: 'RS256', typ: 'JWT' };

  const entrada = base64UrlEncode(JSON.stringify(header)) + '.' + base64UrlEncode(JSON.stringify(claims));

  // Diagnóstico de la FORMA de la llave, sin exponer su contenido secreto
  // (el encabezado/pie de una llave PEM siempre es el mismo texto público, no es secreto).
  registrarDiagnostico('largo: ' + privateKeyFormateada.length +
    ' | empieza con: "' + privateKeyFormateada.substring(0, 30) + '"' +
    ' | termina con: "' + privateKeyFormateada.substring(privateKeyFormateada.length - 30) + '"' +
    ' | número de líneas: ' + privateKeyFormateada.split('\n').length);

  const firma = Utilities.computeRsaSha256Signature(entrada, privateKeyFormateada);
  const jwt = entrada + '.' + Utilities.base64Encode(firma).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    registrarError('Google rechazó la solicitud del token. Código ' + resp.getResponseCode() + ': ' + resp.getContentText());
    return null;
  }
  const datos = JSON.parse(resp.getContentText());
  return datos.access_token || null;
}

function base64UrlEncode(texto) {
  return Utilities.base64Encode(texto, Utilities.Charset.UTF_8)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Función de un solo uso: correla manualmente una vez desde el editor para forzar
// que Google pida el permiso de Drive. Después de correrla, ya no hace falta usarla.
function probarPermisoDrive() {
  DriveApp.getRootFolder();
}

function construirMensajeCrudo(de, nombreDe, para, asunto, cuerpo) {
  const mensaje =
    'From: ' + nombreDe + ' <' + de + '>\r\n' +
    'To: ' + para + '\r\n' +
    'Subject: ' + asunto + '\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    cuerpo;
  return base64UrlEncode(mensaje);
}

/* =========================================================================
   FASE 2: REGISTRO DE FACTURAS (portal del proveedor)
   =========================================================================
   El proveedor entra con su link único (token), sube su factura (PDF + XML)
   y la evidencia de entrega firmada/sellada. El sistema lee el XML solo,
   calcula el vencimiento, y guarda todo para que tu equipo lo valide después.
   ========================================================================= */

// Columnas del tab "Facturas":
// A=1 ID | B=2 Fecha registro | C=3 Token | D=4 Proveedor | E=5 RFC Proveedor
// F=6 Empresa Factura | G=7 RFC Emisor XML | H=8 Alerta RFC | I=9 Folio Fiscal
// J=10 Monto | K=11 Fecha Emisión | L=12 Plazo de Pago | M=13 Fecha Vencimiento
// N=14 Estatus | O=15 Link Factura PDF | P=16 Link XML | Q=17 Link Evidencia
// R=18 Folio Contrarecibo | S=19 Link Contrarecibo PDF | T=20 Fecha Validación | U=21 Motivo Rechazo

function getHojaFacturas() {
  const libro = SpreadsheetApp.openById(SHEET_ID);
  let hoja = libro.getSheetByName('Facturas');
  if (!hoja) {
    hoja = libro.insertSheet('Facturas');
    hoja.appendRow([
      'ID', 'Fecha Registro', 'Token', 'Proveedor', 'RFC Proveedor', 'Empresa Factura',
      'RFC Emisor XML', 'Alerta RFC', 'Folio Fiscal', 'Monto', 'Fecha Emision',
      'Plazo de Pago', 'Fecha Vencimiento', 'Estatus',
      'Link Factura PDF', 'Link XML', 'Link Evidencia',
      'Folio Contrarecibo', 'Link Contrarecibo PDF', 'Fecha Validacion', 'Motivo Rechazo'
    ]);
  }
  return hoja;
}

// Busca al proveedor dueño de un token, solo entre los Aprobados.
function buscarProveedorPorToken(token) {
  const sheet = getSheet();
  const datos = sheet.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][14] === token && datos[i][9] === 'Aprobado') { // O=14 Token, J=9 Estatus
      return {
        nombre: datos[i][2],
        rfc: datos[i][3],
        empresa: datos[i][4],
        plazoPago: datos[i][10]
      };
    }
  }
  return null;
}

// ¿Puede este proveedor facturar a esta empresa específica?
// Si está registrado como AMBAS, puede elegir KARALV o VENTURA para cada factura.
// Si está registrado solo para una, no puede facturar a la otra.
function empresaValidaParaProveedor(empresaProveedor, empresaFactura) {
  const prov = (empresaProveedor || '').toString().trim().toUpperCase();
  const fact = (empresaFactura || '').toString().trim().toUpperCase();
  if (prov === 'AMBAS') return fact === 'KARALV' || fact === 'VENTURA';
  return prov === fact;
}

// Lee los datos clave de un XML de factura (CFDI) usando texto simple, no un
// parser de XML completo — esto lo hace más resistente a pequeñas diferencias
// de formato entre distintos proveedores de facturación electrónica.
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

// Vencimiento = fecha de emisión + plazo de pago del proveedor (en días).
// Se usa solo la parte de fecha (sin hora), para evitar líos de zona horaria.
function calcularVencimiento(fechaEmisionStr, plazoPagoDias) {
  const soloFecha = fechaEmisionStr.split('T')[0]; // "2026-08-22"
  const partes = soloFecha.split('-').map(Number);
  const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
  fecha.setDate(fecha.getDate() + parseInt(plazoPagoDias, 10));
  return fecha;
}

// ====== GUARDADO DE ARCHIVOS EN DRIVE ======
// Se organizan en carpetas: "Sistema Facturas - Documentos" > Empresa > Año

function obtenerOCrearCarpeta(carpetaPadre, nombre) {
  const carpetas = carpetaPadre.getFoldersByName(nombre);
  if (carpetas.hasNext()) return carpetas.next();
  return carpetaPadre.createFolder(nombre);
}

function obtenerCarpetaDestino(empresa, anio) {
  const raiz = obtenerOCrearCarpeta(DriveApp.getRootFolder(), 'Sistema Facturas - Documentos');
  const carpetaEmpresa = obtenerOCrearCarpeta(raiz, empresa);
  return obtenerOCrearCarpeta(carpetaEmpresa, String(anio));
}

function guardarArchivoEnDrive(base64Data, nombreArchivo, mimeType, empresa, anio) {
  const carpeta = obtenerCarpetaDestino(empresa, anio);
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, nombreArchivo);
  const archivo = carpeta.createFile(blob);
  return archivo.getUrl();
}

// ====== PUNTOS DE ENTRADA DEL PORTAL DEL PROVEEDOR ======

function obtenerInfoProveedor(data) {
  const proveedor = buscarProveedorPorToken(data.token);
  if (!proveedor) {
    return respuestaJSON({ ok: false, error: 'Link inválido, o tu registro todavía no ha sido aprobado.' });
  }
  return respuestaJSON({ ok: true, proveedor: proveedor });
}

function registrarFactura(data) {
  if (!data.token || !data.empresaFactura || !data.facturaPdfBase64 || !data.xmlTexto || !data.evidenciaBase64) {
    return respuestaJSON({ ok: false, error: 'Faltan archivos obligatorios (factura PDF, XML o evidencia de entrega).' });
  }

  const proveedor = buscarProveedorPorToken(data.token);
  if (!proveedor) {
    return respuestaJSON({ ok: false, error: 'Link inválido, o tu registro todavía no ha sido aprobado.' });
  }

  if (!empresaValidaParaProveedor(proveedor.empresa, data.empresaFactura)) {
    return respuestaJSON({ ok: false, error: 'No estás autorizado para facturar a esa empresa.' });
  }

  let datosXML;
  try {
    datosXML = extraerDatosXML(data.xmlTexto);
  } catch (err) {
    return respuestaJSON({ ok: false, error: 'No se pudo leer el archivo XML. Verifica que sea el XML correcto de tu factura.' });
  }

  if (!datosXML.fecha || !datosXML.total || !datosXML.uuid) {
    return respuestaJSON({ ok: false, error: 'El XML no tiene los datos esperados (fecha, monto o folio fiscal). ¿Es el archivo correcto?' });
  }

  if (datosXML.rfcEmisor.toUpperCase() !== proveedor.rfc.toUpperCase()) {
    return respuestaJSON({
      ok: false,
      error: 'El RFC del emisor en el XML (' + datosXML.rfcEmisor + ') no coincide con tu RFC registrado (' + proveedor.rfc + '). Verifica que subiste el XML correcto de tu factura.'
    });
  }

  const vencimiento = calcularVencimiento(datosXML.fecha, proveedor.plazoPago);
  const anio = new Date(datosXML.fecha.split('T')[0]).getFullYear();

  let urlFactura, urlXML, urlEvidencia;
  try {
    urlFactura = guardarArchivoEnDrive(data.facturaPdfBase64, data.facturaPdfNombre || 'factura.pdf', 'application/pdf', data.empresaFactura, anio);
    urlXML = guardarArchivoEnDrive(Utilities.base64Encode(data.xmlTexto), (data.xmlNombre || 'factura') + '.xml', 'text/xml', data.empresaFactura, anio);
    urlEvidencia = guardarArchivoEnDrive(data.evidenciaBase64, data.evidenciaNombre || 'evidencia', data.evidenciaMimeType || 'image/jpeg', data.empresaFactura, anio);
  } catch (err) {
    registrarError('Excepción guardando archivos en Drive: ' + err.message);
    return respuestaJSON({ ok: false, error: 'No se pudieron guardar los archivos. Intenta de nuevo o avisa a tu contacto.' });
  }

  const hoja = getHojaFacturas();
  hoja.appendRow([
    '', new Date(), data.token, proveedor.nombre, proveedor.rfc, data.empresaFactura,
    datosXML.rfcEmisor, '', datosXML.uuid, datosXML.total, datosXML.fecha,
    proveedor.plazoPago, vencimiento, 'Pendiente de validar',
    urlFactura, urlXML, urlEvidencia, '', '', '', ''
  ]);
  const fila = hoja.getLastRow();
  hoja.getRange(fila, 1).setValue(fila - 1);

  return respuestaJSON({ ok: true, folio: 'REG-' + (fila - 1), mensaje: 'Factura recibida correctamente. Queda pendiente de validación.' });
}

function listarFacturasProveedor(data) {
  const proveedor = buscarProveedorPorToken(data.token);
  if (!proveedor) {
    return respuestaJSON({ ok: false, error: 'Link inválido, o tu registro todavía no ha sido aprobado.' });
  }

  const hoja = getHojaFacturas();
  const datos = hoja.getDataRange().getValues();
  const facturas = [];
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][2] === data.token) {
      facturas.push({
        folioRegistro: 'REG-' + datos[i][0],
        empresa: datos[i][5],
        folioFiscal: datos[i][8],
        monto: datos[i][9],
        fechaEmision: datos[i][10],
        vencimiento: datos[i][12],
        estatus: datos[i][13],
        alertaRFC: datos[i][7] || null
      });
    }
  }
  return respuestaJSON({ ok: true, proveedor: proveedor, facturas: facturas });
}

/* =========================================================================
   FASE 2 — SEGUNDA ENTREGA: VALIDACIÓN DE FACTURAS + CONTRARECIBO
   =========================================================================
   Tu equipo revisa la factura, el XML y la evidencia. Si todo está en orden,
   la valida y el sistema genera el PDF de contrarecibo con folio consecutivo
   (CR-KARALV-2026-001 / CR-VENTURA-2026-001) automáticamente.
   ========================================================================= */

function listarFacturasPendientes(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }

  const hoja = getHojaFacturas();
  const datos = hoja.getDataRange().getValues();
  const pendientes = [];

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][13] === 'Pendiente de validar') { // N=14 Estatus (índice 13)
      pendientes.push({
        fila: i + 1,
        folioRegistro: 'REG-' + datos[i][0],
        proveedor: datos[i][3],
        rfcProveedor: datos[i][4],
        empresa: datos[i][5],
        folioFiscal: datos[i][8],
        monto: datos[i][9],
        fechaEmision: datos[i][10],
        vencimiento: datos[i][12],
        linkFactura: datos[i][14],
        linkXML: datos[i][15],
        linkEvidencia: datos[i][16]
      });
    }
  }

  return respuestaJSON({ ok: true, pendientes: pendientes });
}

// Busca, dentro de los folios ya usados para una empresa+año, cuál es el
// siguiente número consecutivo disponible. Función pura para poder probarla.
function siguienteNumeroFolio(foliosExistentes, prefijo) {
  let maxNum = 0;
  foliosExistentes.forEach(function (folio) {
    const texto = (folio || '').toString();
    if (texto.indexOf(prefijo) === 0) {
      const num = parseInt(texto.substring(prefijo.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

function generarFolioContrarecibo(empresa, anio) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // espera hasta 10 segundos si otra aprobación está en curso al mismo tiempo
  try {
    const hoja = getHojaFacturas();
    const datos = hoja.getDataRange().getValues();
    const prefijo = 'CR-' + empresa + '-' + anio + '-';
    const foliosExistentes = datos.slice(1).map(function (fila) { return fila[17]; }); // R=18 Folio Contrarecibo
    const siguiente = siguienteNumeroFolio(foliosExistentes, prefijo);
    return prefijo + String(siguiente).padStart(3, '0');
  } finally {
    lock.releaseLock();
  }
}

// Datos de presentación (nombre completo y color) según la empresa.
function datosPresentacionEmpresa(empresa) {
  if (empresa === 'KARALV') {
    return { nombre: 'KARALV (Express Care by Valvoline)', color: '#e3241a' };
  }
  return { nombre: 'Ventura Distribución y Servicios', color: '#0b5d85' };
}

function formatearFechaSimple(valor) {
  if (!valor) return '';
  const fecha = (valor instanceof Date) ? valor : new Date(valor);
  if (isNaN(fecha.getTime())) return valor.toString();
  return Utilities.formatDate(fecha, 'America/Chihuahua', 'dd/MM/yyyy');
}

function construirHTMLContrarecibo(d) {
  const presentacion = datosPresentacionEmpresa(d.empresa);
  const fechaHoy = Utilities.formatDate(new Date(), 'America/Chihuahua', 'dd/MM/yyyy');
  const montoTexto = Number(d.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  return '<html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; padding: 40px; color: #22303f;">' +
    '<div style="border-bottom: 4px solid ' + presentacion.color + '; padding-bottom: 16px; margin-bottom: 24px;">' +
    '<div style="font-size: 12px; letter-spacing: 2px; color: #8b98a5; text-transform: uppercase;">Contrarecibo</div>' +
    '<div style="font-size: 24px; font-weight: bold; color: ' + presentacion.color + ';">' + d.folioContrarecibo + '</div>' +
    '<div style="font-size: 14px; color: #5b6b7a; margin-top: 4px;">' + presentacion.nombre + '</div>' +
    '</div>' +
    '<table style="width:100%; border-collapse: collapse; font-size: 14px;">' +
    '<tr><td style="padding:6px 0; color:#5b6b7a; width:220px;">Fecha de contrarecibo:</td><td style="padding:6px 0; font-weight:bold;">' + fechaHoy + '</td></tr>' +
    '<tr><td style="padding:6px 0; color:#5b6b7a;">Proveedor:</td><td style="padding:6px 0; font-weight:bold;">' + d.proveedor + '</td></tr>' +
    '<tr><td style="padding:6px 0; color:#5b6b7a;">RFC del proveedor:</td><td style="padding:6px 0; font-weight:bold;">' + d.rfcProveedor + '</td></tr>' +
    '<tr><td style="padding:6px 0; color:#5b6b7a;">Folio fiscal (UUID):</td><td style="padding:6px 0; font-weight:bold;">' + d.folioFiscal + '</td></tr>' +
    '<tr><td style="padding:6px 0; color:#5b6b7a;">Fecha de emisión de la factura:</td><td style="padding:6px 0; font-weight:bold;">' + formatearFechaSimple(d.fechaEmision) + '</td></tr>' +
    '<tr><td style="padding:6px 0; color:#5b6b7a;">Monto:</td><td style="padding:6px 0; font-weight:bold;">$' + montoTexto + '</td></tr>' +
    '<tr><td style="padding:6px 0; color:#5b6b7a;">Fecha de vencimiento:</td><td style="padding:6px 0; font-weight:bold;">' + formatearFechaSimple(d.vencimiento) + '</td></tr>' +
    '</table>' +
    '<div style="margin-top: 40px; font-size: 11px; color: #8b98a5;">Documento generado automáticamente por el Sistema de Registro de Facturas y Proveedores.</div>' +
    '</body></html>';
}

function generarContrareciboPDF(datosFactura, anio) {
  const html = construirHTMLContrarecibo(datosFactura);
  const blob = Utilities.newBlob(html, 'text/html', 'contrarecibo.html').getAs('application/pdf');
  blob.setName(datosFactura.folioContrarecibo + '.pdf');
  const carpeta = obtenerCarpetaDestino(datosFactura.empresa, anio);
  const archivo = carpeta.createFile(blob);
  return archivo.getUrl();
}

function validarFactura(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }
  if (!data.fila) {
    return respuestaJSON({ ok: false, error: 'Falta la fila a validar.' });
  }

  const hoja = getHojaFacturas();
  const fila = data.fila;

  const empresa = hoja.getRange(fila, 6).getValue();
  const fechaEmision = hoja.getRange(fila, 11).getValue();
  const anio = new Date(fechaEmision.toString().split('T')[0]).getFullYear() || new Date().getFullYear();

  let folioContrarecibo;
  try {
    folioContrarecibo = generarFolioContrarecibo(empresa, anio);
  } catch (err) {
    registrarError('Excepción generando folio de contrarecibo: ' + err.message);
    return respuestaJSON({ ok: false, error: 'No se pudo generar el folio del contrarecibo. Intenta de nuevo.' });
  }

  const datosFactura = {
    folioContrarecibo: folioContrarecibo,
    empresa: empresa,
    proveedor: hoja.getRange(fila, 4).getValue(),
    rfcProveedor: hoja.getRange(fila, 5).getValue(),
    folioFiscal: hoja.getRange(fila, 9).getValue(),
    monto: hoja.getRange(fila, 10).getValue(),
    fechaEmision: fechaEmision,
    vencimiento: hoja.getRange(fila, 13).getValue()
  };

  let urlContrarecibo;
  try {
    urlContrarecibo = generarContrareciboPDF(datosFactura, anio);
  } catch (err) {
    registrarError('Excepción generando el PDF del contrarecibo: ' + err.message);
    return respuestaJSON({ ok: false, error: 'No se pudo generar el PDF del contrarecibo. Intenta de nuevo.' });
  }

  hoja.getRange(fila, 14).setValue('Validada');            // N: Estatus
  hoja.getRange(fila, 18).setValue(folioContrarecibo);      // R: Folio Contrarecibo
  hoja.getRange(fila, 19).setValue(urlContrarecibo);        // S: Link Contrarecibo PDF
  hoja.getRange(fila, 20).setValue(new Date());              // T: Fecha Validación

  return respuestaJSON({ ok: true, folioContrarecibo: folioContrarecibo, urlContrarecibo: urlContrarecibo });
}

function rechazarFactura(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }
  if (!data.fila) {
    return respuestaJSON({ ok: false, error: 'Falta la fila a rechazar.' });
  }

  const hoja = getHojaFacturas();
  hoja.getRange(data.fila, 14).setValue('Rechazada');       // N: Estatus
  hoja.getRange(data.fila, 21).setValue(data.motivo || ''); // U: Motivo Rechazo

  return respuestaJSON({ ok: true });
}

// Lista permanente de contrarecibos ya generados, para poder consultarlos
// en cualquier momento (no solo en el instante en que se validan).
function listarContrarecibos(data) {
  if (!claveValida(data.password)) {
    return respuestaJSON({ ok: false, error: 'Clave incorrecta.' });
  }

  const hoja = getHojaFacturas();
  const datos = hoja.getDataRange().getValues();
  const contrarecibos = [];

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][13] === 'Validada') { // N=14 Estatus (índice 13)
      contrarecibos.push({
        folioContrarecibo: datos[i][17],
        urlContrarecibo: datos[i][18],
        fechaValidacion: datos[i][19],
        proveedor: datos[i][3],
        empresa: datos[i][5],
        monto: datos[i][9],
        folioFiscal: datos[i][8]
      });
    }
  }

  contrarecibos.reverse(); // más recientes primero
  return respuestaJSON({ ok: true, contrarecibos: contrarecibos });
}
