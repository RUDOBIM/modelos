// Realidad aumentada de BIM Loading: iPhone (AR Quick Look) y Android (WebXR propio).
// El modelo se muestra siempre COMPLETO: nunca se corta ni se oculta nada.
//  · Android: elevación = altura del NIVEL 0 sobre la superficie (±0.00 m = nivel 0 en el piso).
//  · iPhone: la RA de Apple apoya en la superficie el punto más bajo del modelo (la base del terreno);
//    elevación = altura de esa base (±0.00 m = apoyada). Se informa a qué altura queda el nivel 0.
// Escala fija (1:1 … 1:500) o libre (pellizcar con dos dedos dentro de la RA).
const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const modelo = parametros.get("m") || "";
const titulo = parametros.get("t") || "";
const mv = $("mv");
const ajustarVista = () => { mv.style.bottom = ($("panel").offsetHeight + 24) + "px"; };
new ResizeObserver(ajustarVista).observe($("panel"));
window.addEventListener("resize", ajustarVista);
$("volver").href = "./" + location.search;
if (titulo) { $("titulo").textContent = titulo; document.title = titulo + " · Realidad aumentada · BIM Loading"; }
const estado = (texto, error) => { $("estado").textContent = texto || ""; $("estado").classList.toggle("error", !!error); };

const valido = modelo && !/^[a-z][a-z0-9+.-]*:/i.test(modelo) && !modelo.startsWith("//");
if (!valido) {
  $("carga").hidden = true;
  estado(modelo ? "La dirección del modelo no es válida." : "Falta indicar el modelo (?m=archivo.glb).", true);
  throw new Error("sin modelo");
}

const esApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const rutaUsdz = modelo.replace(/\.glb$/i, ".usdz");
const rutaRa = modelo.replace(/\.glb$/i, ".ra.glb");
const existe = (r) => fetch(r, { method: "HEAD", cache: "no-store" }).then((x) => x.ok).catch(() => false);
const hayUsdz = existe(rutaUsdz);
const hayRa = existe(rutaRa);
const hayXR = !esApple && navigator.xr && navigator.xr.isSessionSupported
  ? navigator.xr.isSessionSupported("immersive-ar").catch(() => false) : Promise.resolve(false);

Promise.all([customElements.whenDefined("model-viewer"), hayRa]).then(([, ra]) => {
  mv.src = new URL(ra ? rutaRa : modelo, location.href).href;
}).catch(() => estado("No se pudo cargar el visor. Revisa tu conexión.", true));

// ---------------------------------------------------------------- Ajustes (escala y elevación)
const m2 = (v) => v.toFixed(2) + " m";
const conSigno = (v) => Math.abs(v) < 0.005 ? "±0.00 m" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(2) + " m";
// Elevación = NPT del nivel 0 (Planta Baja) respecto a la superficie detectada. Inicia en ±0.00.
const ajuste = { k: 1, elev: 0, libre: false };
let dims = null;
let fondo = 0; // y del punto más bajo respecto al nivel 0 (negativo si hay terreno o sótanos), en m reales
const textoEscala = (k) => "1:" + (k >= 10 ? Math.round(k) : +k.toFixed(1));
let alAjustar = () => {};

// Elevación libre por debajo y por encima de la superficie (en iPhone, solo hacia arriba).
// Barra de −4.00 a +4.00 m con 0 al centro. En iPhone la RA de Apple apoya el punto más bajo del
// modelo (base del terreno) en la superficie: el nivel 0 no puede quedar más bajo que eso.
const minimoIOS = () => (esApple ? -fondo / ajuste.k : -Infinity);
function rangoElev() {
  const max = Math.max(4, Math.ceil(minimoIOS()));
  return [-max, max];
}
function pintarMarcas(min, max) {
  const caja = $("elev-marcas");
  const clave = min + "/" + max;
  if (caja.dataset.clave === clave) return;
  caja.dataset.clave = clave;
  caja.innerHTML = "";
  const paso = (max - min) > 10 ? 2 : 1;
  for (let v = min; v <= max + 1e-9; v += paso) {
    const s = document.createElement("span");
    s.textContent = v === 0 ? "0" : (v > 0 ? "+" : "−") + Math.abs(v);
    s.style.left = ((v - min) / (max - min) * 100) + "%";
    caja.appendChild(s);
  }
}
function pintarAjustes() {
  const [min, max] = rangoElev();
  ajuste.elev = Math.min(max, Math.max(min, minimoIOS(), ajuste.elev));
  $("escala").value = ajuste.libre ? "libre" : String(ajuste.k);
  $("elev-valor").textContent = "NPT " + conSigno(ajuste.elev);
  const barra = $("elev-barra");
  barra.min = String(min); barra.max = String(max); barra.value = ajuste.elev.toFixed(2);
  pintarMarcas(min, max);
  $("elev-menos").disabled = ajuste.elev <= Math.max(min, minimoIOS()) + 0.0001;
  $("elev-mas").disabled = ajuste.elev >= max - 0.0001;
  const nota = $("nota-elev");
  nota.hidden = !(esApple && fondo < -0.005);
  nota.textContent = "En iPhone la RA de Apple apoya en la superficie el punto más bajo del modelo (base del terreno): a esta escala el nivel 0 queda como mínimo en NPT " + conSigno(minimoIOS()) + ".";
  if (dims) {
    const k = ajuste.k;
    const esc = ajuste.libre ? "libre (" + textoEscala(k) + ")" : (k === 1 ? "real" : textoEscala(k));
    $("medida").innerHTML = "Tamaño a escala " + esc + ": <b>" + m2(dims.x / k) + " × " + m2(dims.z / k) +
      "</b> de planta, <b>" + m2(dims.y / k) + "</b> de alto. Nivel 0 (Planta Baja) en <b>NPT " + conSigno(ajuste.elev) + "</b> respecto a la superficie." +
      (ajuste.libre ? " Dentro de la RA, <b>pellizca con dos dedos</b> para cambiar el tamaño." : "");
  }
}
const cambiar = () => { pintarAjustes(); alAjustar(); };
$("escala").addEventListener("change", () => {
  const v = $("escala").value;
  ajuste.libre = v === "libre";
  if (!ajuste.libre) {
    // En iPhone, si estaba en su mínimo (base apoyada), sigue en el mínimo de la nueva escala.
    const enMinimo = esApple && ajuste.elev <= minimoIOS() + 0.0001;
    ajuste.k = Number(v);
    if (enMinimo) ajuste.elev = 0;
  }
  cambiar();
});
const redondear = (v) => Math.round(v * 100) / 100;
$("elev-mas").addEventListener("click", () => { ajuste.elev = redondear(ajuste.elev + 0.01); cambiar(); });
$("elev-menos").addEventListener("click", () => { ajuste.elev = redondear(ajuste.elev - 0.01); cambiar(); });
$("elev-barra").addEventListener("input", () => { ajuste.elev = redondear(Number($("elev-barra").value)); cambiar(); });
$("elev-cero").addEventListener("click", () => { ajuste.elev = 0; cambiar(); });

// ---------------------------------------------------------------- Vista previa
mv.addEventListener("progress", (e) => {
  const p = e.detail && e.detail.totalProgress || 0;
  $("carga-barra").style.width = Math.round(p * 100) + "%";
  $("carga-texto").textContent = "Cargando modelo… " + Math.round(p * 100) + " %";
});
mv.addEventListener("error", () => { $("carga").hidden = true; estado("No se pudo cargar el modelo.", true); });

let modo = "";
mv.addEventListener("load", async () => {
  $("carga").hidden = true;
  const d = mv.getDimensions(), c = mv.getBoundingBoxCenter();
  dims = { x: d.x, y: d.y, z: d.z };
  fondo = Math.min(0, c.y - d.y / 2);
  pintarAjustes();
  if (esApple) {
    if (!(await hayUsdz)) {
      estado("Este modelo aún no tiene versión para iPhone. Vuelve a publicarlo desde el Hub de modelos y recarga esta página.", true);
      return;
    }
    modo = "ios";
    prepararIOS();
    return; // el botón se activa cuando el archivo con nivel 0 en el piso está listo
  }
  if (await hayXR) { modo = "xr"; prepararXR(); }
  else if (mv.canActivateAR) { modo = "sceneviewer"; estado("Este teléfono no permite ajustes dentro de la RA; se abrirá el visor de Google a escala real."); }
  else { mostrarQR(); return; }
  $("iniciar").disabled = false;
});

$("iniciar").addEventListener("click", () => {
  if (modo === "xr") return iniciarXR();
  if (modo === "ios") return abrirQuickLook();
  if (modo === "sceneviewer") {
    // Solo el visor de Google (si se dejara WebXR primero, model-viewer repetiría el mismo error).
    mv.setAttribute("ar-modes", "scene-viewer");
    try { mv.activateAR(); } catch (e) { estado("No se pudo iniciar la realidad aumentada.", true); }
  }
});

// =================================================================== iPhone (AR Quick Look)
// La barra de arriba de la RA es de Apple. Abajo solo se permite una franja: se usa la mínima, con un
// ícono de ajustes. Al tocarla vuelve aquí, se ajusta y se regresa a la RA.
let usdzBase = null, blobActual = null, preparando = null, numAjuste = 0;

function prepararIOS() {
  $("grupo-xr").hidden = true;
  $("ios-lugar").appendChild($("ajustes"));
  $("elev-cero").textContent = "NPT ±0.00";
  mv.setAttribute("ar-scale", "fixed");
  // Servicio que entrega el USDZ ajustado con una dirección normal del sitio (ver sw-ra.js).
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw-ra.js").catch(() => {});
  mv.addEventListener("quick-look-button-tapped", () => { $("ios-ajustes").hidden = false; });
  $("ios-cerrar").addEventListener("click", () => { $("ios-ajustes").hidden = true; });
  $("ios-volver").addEventListener("click", () => { $("ios-ajustes").hidden = true; abrirQuickLook(); });
  let espera = null;
  alAjustar = () => { clearTimeout(espera); $("ios-volver").disabled = true; espera = setTimeout(rehacerIOS, 250); };
  estado("Preparando la versión de realidad aumentada…");
  rehacerIOS();
}
function ponerIosSrc(url) {
  // Franja de acción de Apple: el ícono de ajustes como botón y, a la izquierda, la escala y la elevación
  // actuales (Apple no muestra la franja si el título va vacío). Sin Apple Pay: no se usa franja "custom".
  const k = ajuste.k;
  // Escala libre: la RA de Apple deja pellizcar para cambiar el tamaño; fija: no.
  mv.setAttribute("ar-scale", ajuste.libre ? "auto" : "fixed");
  const franja = "callToAction=" + encodeURIComponent("\u2699\uFE0E") +
    "&checkoutTitle=" + encodeURIComponent(ajuste.libre ? "Escala libre" : "Escala " + textoEscala(k)) +
    "&checkoutSubtitle=" + encodeURIComponent("NPT " + conSigno(ajuste.elev));
  // Safari no muestra esta franja con archivos temporales (blob); solo se usan si no hay servicio.
  const temporal = url.startsWith("blob:");
  mv.setAttribute("ios-src", url.split("#")[0] + (temporal ? "" : "#" + franja));
}
function abrirQuickLook() {
  estado("");
  // Queda abierto debajo de la RA: al cerrarla con la X, aparece el menú de escala y elevación.
  $("ios-ajustes").hidden = false;
  try { mv.activateAR(); } catch (e) { estado("No se pudo iniciar la realidad aumentada en este dispositivo.", true); }
}

// --- Edición del USDZ como texto (sin volver a convertir el modelo).
function bloque(texto, desde) {
  // Devuelve [inicio, fin) del bloque "def ... { ... }" que empieza en "desde" (incluye la sangría previa).
  let i = texto.indexOf("{", desde), nivel = 0;
  for (; i < texto.length; i++) {
    const c = texto[i];
    if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) break;
  }
  return [texto.lastIndexOf("\n", desde) + 1, i + 1];
}
function matrizDe(texto, nombre) {
  const i = texto.indexOf('def Xform "' + nombre + '"');
  if (i < 0) return null;
  const j = texto.indexOf("matrix4d xformOp:transform = ", i) + "matrix4d xformOp:transform = ".length;
  const fin = texto.indexOf(" )", j) + 2;
  return { j, fin, valor: texto.slice(j, fin) };
}
async function usdzAjustado(k, elev) {
  const fflate = await import("./vendor/fflate.module.js");
  if (!usdzBase) usdzBase = new Uint8Array(await (await fetch(rutaUsdz)).arrayBuffer());
  const archivos = fflate.unzipSync(usdzBase);
  const dec = new TextDecoder(), enc = new TextEncoder();
  let texto = dec.decode(archivos["model.usda"]);
  // Escala: el grupo "BIM_Escala" se multiplica por 1/k.
  const esc = matrizDe(texto, "BIM_Escala");
  if (!esc) throw new Error("sin grupo de escala");
  const f = String(1 / k);
  texto = texto.slice(0, esc.j) + "( (" + f + ", 0, 0, 0), (0, " + f + ", 0, 0), (0, 0, " + f + ", 0), (0, 0, 0, 1) )" + texto.slice(esc.fin);
  // Archivos de la versión anterior guardaban aparte ("bim_bajo.usda") lo que está bajo el nivel 0:
  // se vuelve a poner en la escena para que el modelo quede completo.
  if (texto.indexOf('def Xform "BIM_Bajo"') < 0 && archivos["bim_bajo.usda"]) {
    const capa = dec.decode(archivos["bim_bajo.usda"]);
    const blq = capa.slice(capa.indexOf("def Xform"));
    const iApo = texto.indexOf('def Xform "BIM_Apoyo"');
    if (iApo >= 0) { const linea = texto.lastIndexOf("\n", iApo) + 1; texto = texto.slice(0, linea) + blq.trimEnd() + "\n\n" + texto.slice(linea); }
  }
  // Elevación: el punto de apoyo (1 mm) es el punto más bajo del archivo, el que Apple pone sobre la
  // superficie. Se baja elev·k (en coordenadas del modelo) bajo la base para subir el modelo completo.
  const apo = matrizDe(texto, "BIM_Apoyo");
  if (apo) {
    const t = apo.valor.match(/\(([^()]*)\) \)$/)[1].split(",").map(Number);
    // Nivel 0 a "elev" sobre la superficie: el punto de apoyo queda a −elev·k (nunca arriba de la base).
    const y = Math.min(fondo, -elev * k);
    texto = texto.slice(0, apo.j) + "( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (" + t[0] + ", " + y + ", " + t[2] + ", 1) )" + texto.slice(apo.fin);
  }
  archivos["model.usda"] = enc.encode(texto);
  // Reempaquetar sin compresión con la alineación de 64 bytes que exige AR Quick Look.
  const entrada = {};
  let pos = 0;
  for (const nombre of Object.keys(archivos)) {
    const datos = archivos[nombre];
    const base = pos + 30 + enc.encode(nombre).length + 4;
    const relleno = (64 - (base % 64)) % 64;
    entrada[nombre] = [datos, { extra: { 12345: new Uint8Array(relleno) } }];
    pos = base + relleno + datos.length;
  }
  return new Blob([fflate.zipSync(entrada, { level: 0 })], { type: "model/vnd.usdz+zip" });
}
// Guarda el USDZ ajustado para que el servicio (sw-ra.js) lo entregue con una dirección normal del
// sitio; así Apple sí muestra la franja de ajustes. Si no hay servicio, se usa un archivo temporal.
async function guardarAjuste(blob) {
  try {
    const sw = navigator.serviceWorker;
    if (sw && sw.controller && window.caches) {
      const ruta = new URL(rutaUsdz, location.href);
      ruta.searchParams.set("ra-ajuste", Date.now() + "-" + (++numAjuste));
      const cache = await caches.open("blg-ra-ajustes");
      for (const viejo of await cache.keys()) await cache.delete(viejo);
      await cache.put(ruta.pathname + ruta.search, new Response(blob, {
        headers: { "content-type": "model/vnd.usdz+zip", "content-length": String(blob.size) }
      }));
      return ruta.href;
    }
  } catch (e) { /* sin servicio: archivo temporal */ }
  blobActual = URL.createObjectURL(blob);
  return blobActual;
}
async function rehacerIOS() {
  // Escala real con la base apoyada es el estado en que se publica el archivo: se abre directo
  // (así Apple muestra la franja).
  const inicial = ajuste.k === 1 && ajuste.elev <= minimoIOS() + 0.0001;
  const tarea = preparando = inicial ? Promise.resolve(null) : usdzAjustado(ajuste.k, ajuste.elev);
  $("ios-volver").disabled = true;
  $("ios-volver").textContent = "Preparando…";
  try {
    const blob = await tarea;
    if (tarea !== preparando) return;
    if (blobActual) { URL.revokeObjectURL(blobActual); blobActual = null; }
    let url = new URL(rutaUsdz, location.href).href;
    if (blob) url = await guardarAjuste(blob);
    ponerIosSrc(url);
    estado("");
  } catch (e) {
    if (tarea !== preparando) return;
    estado("No se pudo preparar el ajuste; se usará el archivo original.", true);
    ponerIosSrc(new URL(rutaUsdz, location.href).href);
  }
  preparando = null;
  $("ios-volver").disabled = false;
  $("ios-volver").textContent = "Volver a la realidad aumentada";
  $("iniciar").disabled = false;
}

// =================================================================== Android (WebXR propio)
let T = null, xr = null, avisoTimer = null;
const aviso = (t, fugaz) => {
  const a = $("ra-aviso");
  a.textContent = t;
  a.classList.remove("oculto");
  clearTimeout(avisoTimer);
  if (fugaz) avisoTimer = setTimeout(() => a.classList.add("oculto"), 2500);
};
function prepararXR() {
  $("ra-panel").appendChild($("ajustes"));
  import("./vendor/three-ra.js").then(async (m) => {
    T = m;
    const draco = new T.DRACOLoader();
    draco.setDecoderPath(new URL("draco/", location.href).href);
    const cargador = new T.GLTFLoader();
    cargador.setDRACOLoader(draco);
    const gltf = await cargador.loadAsync(new URL((await hayRa) ? rutaRa : modelo, location.href).href);
    xr = Object.assign(xr || {}, { escena3d: gltf.scene });
    prepararModelo();
  }).catch(() => { if (mv.canActivateAR) modo = "sceneviewer"; });
  // Los toques sobre los íconos y el panel no colocan el modelo.
  for (const id of ["ra-salir", "ra-panel"]) $(id).addEventListener("beforexrselect", (e) => e.preventDefault());
  document.querySelector("#ra-ui .segm").addEventListener("beforexrselect", (e) => e.preventDefault());
  $("ra-salir").addEventListener("click", () => { salirXR(); location.href = $("volver").href; });
  $("ra-modo-obj").addEventListener("click", () => salirXR());
  $("ra-modo-ar").addEventListener("click", () => { $("ra-panel").hidden = true; $("ra-ajustes").classList.remove("activo"); });
  $("ra-ajustes").addEventListener("click", () => {
    const abrir = $("ra-panel").hidden;
    $("ra-panel").hidden = !abrir;
    $("ra-ajustes").classList.toggle("activo", abrir);
    $("ra-aviso").classList.add("oculto");
  });
  $("girar-izq").addEventListener("click", () => girar(15));
  $("girar-der").addEventListener("click", () => girar(-15));
  $("recolocar").addEventListener("click", () => {
    if (!xr) return;
    xr.colocado = false;
    $("ra-panel").hidden = true; $("ra-ajustes").classList.remove("activo");
    aviso("Apunta al piso y toca la pantalla para colocar el modelo.");
  });
  alAjustar = aplicarXR;
  // Escala libre: pellizcar con dos dedos en cualquier parte de la pantalla.
  const ui = $("ra-ui");
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let pellizco = null, pinta = 0;
  ui.addEventListener("touchstart", (e) => {
    if (ajuste.libre && e.touches.length === 2) pellizco = { d: dist(e.touches), k: ajuste.k };
  }, { passive: true });
  ui.addEventListener("touchmove", (e) => {
    if (!pellizco || e.touches.length !== 2) return;
    ajuste.k = Math.min(5000, Math.max(0.1, pellizco.k * pellizco.d / Math.max(1, dist(e.touches))));
    aplicarXR();
    const ahora = performance.now();
    if (ahora - pinta > 120) { pinta = ahora; pintarAjustes(); aviso("Escala " + textoEscala(ajuste.k), true); }
  }, { passive: true });
  ui.addEventListener("touchend", (e) => { if (pellizco && e.touches.length < 2) { pellizco = null; pintarAjustes(); } });
}
function salirXR() { if (xr && xr.sesion) xr.sesion.end(); }
function prepararModelo() {
  const escena = xr.escena3d;
  let datos = null;
  escena.traverse((o) => { if (!datos && o.userData && o.userData.blgRA) datos = o.userData.blgRA; });
  let y0 = 0;
  if (!datos) {
    let niveles = null;
    escena.traverse((o) => { if (!niveles && o.userData && o.userData.niveles) niveles = o.userData.niveles; });
    if (niveles && niveles.length) y0 = niveles.slice().sort((a, b) => Math.abs(a.y) - Math.abs(b.y))[0].y;
    else y0 = new T.Box3().setFromObject(escena).min.y;
  }
  const caja = new T.Box3().setFromObject(escena);
  const centrado = new T.Group();
  escena.position.set(-(caja.min.x + caja.max.x) / 2, -y0, -(caja.min.z + caja.max.z) / 2);
  centrado.add(escena);
  escena.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  xr.ancho = Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z);
  xr.alto = caja.max.y - caja.min.y;
  dims = { x: caja.max.x - caja.min.x, y: caja.max.y - caja.min.y, z: caja.max.z - caja.min.z };
  xr.modelo = centrado;
  pintarAjustes();
}
function girar(g) { if (xr && xr.anclaje) { xr.giro += T.MathUtils.degToRad(g); xr.anclaje.rotation.y = xr.yaw + xr.giro; } }
function aplicarXR() {
  if (!xr || !xr.escalado) return;
  const s = 1 / ajuste.k;
  xr.escalado.scale.setScalar(s);
  xr.escalado.position.y = ajuste.elev;
  const L = Math.max(0.3, xr.ancho * s * 1.6);
  xr.sombra.scale.setScalar(L);
  const cam = xr.luz.shadow.camera;
  cam.left = cam.bottom = -L / 2; cam.right = cam.top = L / 2;
  cam.near = 0.01; cam.far = L * 4 + xr.alto * s * 2;
  xr.luz.position.set(L * 0.6, L * 1.5, L * 0.4);
  cam.updateProjectionMatrix();
}

async function iniciarXR() {
  if (!T) { estado("Preparando la realidad aumentada… vuelve a tocar en un momento."); return; }
  let sesion;
  try {
    sesion = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: $("ra-ui") }
    });
  } catch (e) {
    // Se muestra la causa exacta para poder diagnosticar el equipo.
    const causa = (e && (e.name || "") + (e && e.message ? ": " + e.message : "")) || "sin detalle";
    if (mv.canActivateAR) {
      // El visor de Google necesita un toque nuevo (el navegador bloquea abrirlo después de un error).
      modo = "sceneviewer";
      estado("Este equipo no abrió la RA con ajustes (" + causa + "). Toca otra vez «Iniciar realidad aumentada» para abrir el visor de Google.", true);
    } else {
      estado("Este equipo no pudo iniciar la realidad aumentada (" + causa + "). Ábrela en la app de Chrome (menú ⋮ → «Abrir en Chrome») y verifica que tenga «Servicios de Google Play para RA».", true);
    }
    return;
  }
  xr = xr || {};
  xr.sesion = sesion;
  $("ra-ui").hidden = false;
  $("ra-ui").style.pointerEvents = "auto"; // para recibir el pellizco de la escala libre
  $("ra-panel").hidden = true;
  $("ra-ajustes").classList.remove("activo");
  aviso(xr.modelo ? "Apunta al piso y mueve el teléfono despacio…" : "Cargando el modelo…");
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(sesion);
  const escena = new T.Scene();
  const camara = new T.PerspectiveCamera();
  escena.add(new T.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
  const luz = new T.DirectionalLight(0xffffff, 1.8);
  luz.castShadow = true;
  luz.shadow.mapSize.set(2048, 2048);
  luz.shadow.bias = -0.0005;
  const reticula = new T.Mesh(new T.RingGeometry(0.09, 0.12, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x0a84ff }));
  reticula.matrixAutoUpdate = false;
  reticula.visible = false;
  escena.add(reticula);
  const anclaje = new T.Group();
  const escalado = new T.Group();
  anclaje.add(escalado);
  const sombra = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.ShadowMaterial({ opacity: 0.28 }));
  sombra.position.y = 0.002;
  sombra.receiveShadow = true;
  anclaje.add(sombra, luz, luz.target);
  anclaje.visible = false;
  escena.add(anclaje);
  Object.assign(xr, { renderer, escena, anclaje, escalado, sombra, luz, reticula, colocado: false, yaw: 0, giro: 0 });
  const espacio = renderer.xr.getReferenceSpace();
  const espacioVista = await sesion.requestReferenceSpace("viewer");
  const fuente = await sesion.requestHitTestSource({ space: espacioVista });
  const conModelo = () => {
    if (xr.modelo && !xr.modelo.parent) { escalado.add(xr.modelo); aplicarXR(); pintarAjustes(); aviso("Apunta al piso y toca la pantalla para colocar el modelo."); }
  };
  const pos = new T.Vector3(), q = new T.Quaternion(), e = new T.Vector3();
  sesion.addEventListener("select", () => {
    if (!xr.modelo || !reticula.visible || xr.colocado) return;
    xr.colocado = true;
    anclaje.visible = true;
    aviso("Modelo colocado con el nivel 0 en el piso.", true);
  });
  sesion.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    if (fuente.cancel) fuente.cancel();
    if (xr.modelo) xr.modelo.removeFromParent();
    renderer.dispose();
    $("ra-ui").hidden = true;
    xr.sesion = null;
    estado("");
  });
  renderer.setAnimationLoop((t, frame) => {
    conModelo();
    if (frame && !xr.colocado) {
      const r = frame.getHitTestResults(fuente);
      if (r.length) {
        const pose = r[0].getPose(espacio);
        reticula.visible = true;
        reticula.matrix.fromArray(pose.transform.matrix);
        if (xr.modelo) {
          reticula.matrix.decompose(pos, q, e);
          anclaje.position.copy(pos);
          const c = renderer.xr.getCamera().position;
          xr.yaw = Math.atan2(c.x - pos.x, c.z - pos.z);
          anclaje.rotation.set(0, xr.yaw + xr.giro, 0);
          anclaje.visible = true;
        }
      } else {
        reticula.visible = false;
        anclaje.visible = false;
      }
    } else reticula.visible = false;
    renderer.render(escena, camara);
  });
}

// =================================================================== Computadora
function mostrarQR() {
  $("modo-ra").hidden = true;
  $("modo-qr").hidden = false;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    $("qr").hidden = true;
    $("qr-caja").querySelector("p").innerHTML = "La realidad aumentada se usa desde el celular. <b>Publica el modelo en la web</b> y ábrelo desde tu teléfono.";
    return;
  }
  const pintar = () => {
    if (!window.qrcode) return setTimeout(pintar, 200);
    const q = window.qrcode(0, "M");
    q.addData(location.href);
    q.make();
    $("qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  };
  pintar();
}
