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
const VERSION_CODIGO = 'v13-diagnostico-sat-69b'; // Cambia en cada entrega, para confirmar que el código desplegado es el más reciente

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

function enviarCorreoAprobacion(correo, nombre, token, empresa) {
  const urlPortal = 'https://TU-USUARIO.github.io/TU-REPO/portal.html?token=' + token;
  const asunto = 'Registro aprobado - Portal de Proveedores';
  const remitente = datosRemitente(empresa);

  const cuerpo =
    'Hola ' + nombre + ',\n\n' +
    remitente.lineaEmpresa + '\n\n' +
    'Este es tu link de acceso para subir facturas (guárdalo, es único para tu empresa):\n' +
    urlPortal + '\n\n' +
    'Saludos.';

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

function construirMensajeCrudo(de, nombreDe, para, asunto, cuerpo) {
  const mensaje =
    'From: ' + nombreDe + ' <' + de + '>\r\n' +
    'To: ' + para + '\r\n' +
    'Subject: ' + asunto + '\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    cuerpo;
  return base64UrlEncode(mensaje);
}
