// Realidad aumentada de BIM Loading: iPhone (AR Quick Look) y Android (WebXR propio).
// Elevación = altura del NIVEL 0 sobre la superficie detectada (±0.00 m = nivel 0 en el piso).
// Lo que queda bajo el piso (terreno, cimentación, sótanos) no se muestra, como en la realidad;
// el modelo no se modifica: al subir la elevación aparece lo que queda por encima del piso.
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
const ajuste = { k: 1, elev: 0 };
let dims = null;
let alAjustar = () => {};

function pintarAjustes() {
  if (ajuste.elev < 0) ajuste.elev = 0;
  $("escala").value = String(ajuste.k);
  $("elev-valor").textContent = conSigno(ajuste.elev);
  $("elev-menos").disabled = ajuste.elev <= 0.0001;
  if (dims) {
    const k = ajuste.k;
    $("medida").innerHTML = "Tamaño a escala " + (k === 1 ? "real" : "1:" + k) + ": <b>" + m2(dims.x / k) + " × " + m2(dims.z / k) +
      "</b> de planta, <b>" + m2(dims.y / k) + "</b> de alto. Nivel 0 a <b>" + conSigno(ajuste.elev) + "</b> del piso.";
  }
}
const cambiar = () => { pintarAjustes(); alAjustar(); };
$("escala").addEventListener("change", () => { ajuste.k = Number($("escala").value); cambiar(); });
const paso = () => Number($("paso").value);
$("elev-mas").addEventListener("click", () => { ajuste.elev = Math.round((ajuste.elev + paso()) * 100) / 100; cambiar(); });
$("elev-menos").addEventListener("click", () => { ajuste.elev = Math.max(0, Math.round((ajuste.elev - paso()) * 100) / 100); cambiar(); });
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
  const d = mv.getDimensions();
  dims = { x: d.x, y: d.y, z: d.z };
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
  if (modo === "sceneviewer") { try { mv.activateAR(); } catch (e) { estado("No se pudo iniciar la realidad aumentada.", true); } }
});

// =================================================================== iPhone (AR Quick Look)
// La barra de arriba de la RA es de Apple. Abajo solo se permite una franja: se usa la mínima, con un
// ícono de ajustes. Al tocarla vuelve aquí, se ajusta y se regresa a la RA.
let usdzBase = null, blobActual = null, preparando = null;

function prepararIOS() {
  $("grupo-xr").hidden = true;
  $("ios-lugar").appendChild($("ajustes"));
  mv.setAttribute("ar-scale", "fixed");
  mv.addEventListener("quick-look-button-tapped", () => { $("ios-ajustes").hidden = false; });
  $("ios-cerrar").addEventListener("click", () => { $("ios-ajustes").hidden = true; });
  $("ios-volver").addEventListener("click", () => { $("ios-ajustes").hidden = true; abrirQuickLook(); });
  let espera = null;
  alAjustar = () => { clearTimeout(espera); $("ios-volver").disabled = true; espera = setTimeout(rehacerIOS, 250); };
  estado("Preparando la versión de realidad aumentada…");
  rehacerIOS();
}
function ponerIosSrc(url) {
  // Franja de acción de Apple solo con el ícono de ajustes (sin títulos ni Apple Pay).
  // La franja con página propia ("custom") hace que Apple agregue su botón de Apple Pay; esta no.
  const franja = "callToAction=" + encodeURIComponent("\u2699\uFE0E") + "&checkoutTitle=" + encodeURIComponent("\u00A0");
  mv.setAttribute("ios-src", url.split("#")[0] + (franja ? "#" + franja : ""));
}
function abrirQuickLook() {
  estado("");
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
const leerArreglo = (t, nombre) => {
  const i = t.indexOf(nombre + " = [");
  if (i < 0) return null;
  const a = i + nombre.length + 4, b = t.indexOf("]", a);
  return { a, b, texto: t.slice(a, b) };
};
const numeros = (s) => s.length ? s.replace(/[()]/g, "").split(",").map(Number) : [];
const tuplas = (arr, n) => { let s = ""; for (let i = 0; i < arr.length; i += n) s += (i ? ", " : "") + "(" + arr.slice(i, i + n).map((x) => +x.toFixed(5)).join(", ") + ")"; return s; };
// Corta una malla del USDZ (triángulos, atributos por vértice) con el plano y = yc; conserva lo de arriba.
function cortarMallaUsda(t, yc) {
  const P = leerArreglo(t, "point3f[] points"), I = leerArreglo(t, "int[] faceVertexIndices");
  const N = leerArreglo(t, "normal3f[] normals"), S = leerArreglo(t, "texCoord2f[] primvars:st");
  if (!P || !I) return { texto: t, vacio: false };
  const pts = numeros(P.texto), idx = numeros(I.texto), nor = N ? numeros(N.texto) : null, st = S ? numeros(S.texto) : null;
  const sp = [], sn = [], ss = [], si = [];
  const ver = (v) => ({ p: pts.slice(v * 3, v * 3 + 3), n: nor ? nor.slice(v * 3, v * 3 + 3) : null, s: st ? st.slice(v * 2, v * 2 + 2) : null });
  const mez = (a, b, f) => ({ p: a.p.map((x, c) => x + (b.p[c] - x) * f), n: a.n && a.n.map((x, c) => x + (b.n[c] - x) * f), s: a.s && a.s.map((x, c) => x + (b.s[c] - x) * f) });
  const poner = (v) => { si.push(sp.length / 3); sp.push(...v.p); if (nor) sn.push(...v.n); if (st) ss.push(...v.s); };
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const tri = [ver(idx[i]), ver(idx[i + 1]), ver(idx[i + 2])];
    const d = tri.map((v) => v.p[1] - yc);
    if (d.every((x) => x <= 0)) continue;
    const poli = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j + 1) % 3], da = d[j], db = d[(j + 1) % 3];
      if (da >= 0) poli.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) poli.push(mez(a, b, da / (da - db)));
    }
    for (let j = 1; j + 1 < poli.length; j++) { poner(poli[0]); poner(poli[j]); poner(poli[j + 1]); }
  }
  if (!si.length) return { texto: t, vacio: true };
  const cambios = [[P, tuplas(sp, 3)], [I, si.join(", ")]];
  if (N) cambios.push([N, tuplas(sn, 3)]);
  if (S) cambios.push([S, tuplas(ss, 2)]);
  const C = leerArreglo(t, "int[] faceVertexCounts");
  if (C) cambios.push([C, new Array(si.length / 3).fill(3).join(", ")]);
  cambios.sort((x, y) => y[0].a - x[0].a);
  let r = t;
  for (const [z, v] of cambios) r = r.slice(0, z.a) + v + r.slice(z.b);
  return { texto: r, vacio: false };
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
  // Piso: en coordenadas del modelo queda a yc = -elev·k bajo el nivel 0.
  const yc = -elev * k;
  const iBajo = texto.indexOf('def Xform "BIM_Bajo"');
  if (iBajo >= 0) {
    const [ini, fin] = bloque(texto, iBajo);
    if (elev <= 0.0001) {
      texto = texto.slice(0, ini) + texto.slice(fin); // nivel 0 en el piso: no se muestra nada bajo el piso
    } else {
      let parte = texto.slice(ini, fin);
      const hijos = [...parte.matchAll(/def Xform "([^"]+)" \(\s*prepend references = @\.\/(geometries\/[^@]+)@/g)];
      for (const h of hijos.reverse()) {
        const datos = archivos[h[2]];
        if (!datos) continue;
        const r = cortarMallaUsda(dec.decode(datos), yc);
        if (r.vacio) { const [a, b] = bloque(parte, h.index); parte = parte.slice(0, a) + parte.slice(b); }
        else archivos[h[2]] = enc.encode(r.texto);
      }
      texto = texto.slice(0, ini) + parte + texto.slice(fin);
    }
  }
  // Punto de apoyo (1 mm): es el punto más bajo del archivo, el que Apple pone sobre el piso.
  const apo = matrizDe(texto, "BIM_Apoyo");
  if (apo) {
    const t = apo.valor.match(/\(([^()]*)\) \)$/)[1].split(",").map(Number);
    texto = texto.slice(0, apo.j) + "( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (" + t[0] + ", " + yc + ", " + t[2] + ", 1) )" + texto.slice(apo.fin);
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
async function rehacerIOS() {
  const tarea = preparando = usdzAjustado(ajuste.k, ajuste.elev);
  $("ios-volver").disabled = true;
  $("ios-volver").textContent = "Preparando…";
  try {
    const blob = await tarea;
    if (tarea !== preparando) return;
    if (blobActual) URL.revokeObjectURL(blobActual);
    blobActual = URL.createObjectURL(blob);
    ponerIosSrc(blobActual);
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
    if (mv.canActivateAR) { modo = "sceneviewer"; estado("No se pudo abrir la RA con ajustes; se usará el visor de Google."); try { mv.activateAR(); } catch (_) {} }
    else estado("Tu dispositivo no pudo iniciar la realidad aumentada.", true);
    return;
  }
  xr = xr || {};
  xr.sesion = sesion;
  $("ra-ui").hidden = false;
  $("ra-panel").hidden = true;
  $("ra-ajustes").classList.remove("activo");
  aviso(xr.modelo ? "Apunta al piso y mueve el teléfono despacio…" : "Cargando el modelo…");
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  // Plano de corte a la altura del piso: lo que queda debajo no se dibuja (el modelo no se modifica).
  const corte = new T.Plane(new T.Vector3(0, 1, 0), 0);
  renderer.clippingPlanes = [corte];
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
    corte.constant = -(anclaje.position.y - 0.001);
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
