/* =====================================================================
   THREE DIMENSION — 3D-сцена. Один фиксированный canvas на всю страницу,
   реалистичное лаунж-кресло (GLB, CC0 Poly Haven), которое «путешествует»
   по разделам по мере скролла: hero → зачем → процесс (взрыв на детали →
   сборка → «скан» материалов) → сетка/рендер (split-рендер) → конфигуратор
   → CTA (чертёж). На мобильных первый экран без 3D.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TD = window.TD;
const canvas = document.getElementById('scene');
// 2k-текстуры для десктопа, 1k — для телефонов (в 3 раза меньше трафика)
const MODEL_URL = innerWidth < 1024 ? 'assets/models/chair-1k.glb' : 'assets/models/chair.glb';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/* ---------- палитра ---------- */
const C = {
  lavender: new THREE.Color(0xdcc8ec),
  plum: new THREE.Color(0x381932),
  milk: new THREE.Color(0xfff3e6)
};

/* ---------- пресеты конфигуратора ----------
   orig — оригинальная текстура модели; tint — перекраска (серая карта × цвет) */
const LEATHER = {
  cognac:   { orig: true },
  plum:     { tint: 0x4a1f45 },
  milk:     { tint: 0xf1e5d6 },
  graphite: { tint: 0x2b2a2e },
  sage:     { tint: 0x7f9a86 },
  lavender: { tint: 0xc3a6de }
};
const FRAME = {
  walnut: { wood: { orig: true },     metal: { orig: true } },
  oak:    { wood: { tint: 0xd9b283 }, metal: { orig: true } },
  black:  { wood: { tint: 0x1f1b1c }, metal: { tint: 0x141414, metalness: 0.85, roughness: 0.45 } },
  brass:  { wood: { orig: true },     metal: { tint: 0xcfa34e, metalness: 1, roughness: 0.3 } }
};

/* ---------- ключевые кадры (состояние кресла по разделам) ----------
   anchor — DOM-элемент, к центру которого «прилипает» кресло; nx/ny — смещение
   в долях вьюпорта; s — масштаб; ry — базовый поворот; ex — взрыв (0..1);
   wire — сетка (0..1); clip — высота «скана» материала (0..1); op — непрозрачность
   материала; wc — цвет сетки (0 лаванда … 1 слива); spin — скорость авто-вращения;
   split — режим «сетка | рендер». m — переопределения для мобильных.            */
const KF = [
  { id: 'hero',     anchor: '#heroDrag',      at: 'zero',
    d: { nx: 0, ny: 0, s: 1, ry: -0.55, ex: 0, wire: 0, clip: 1, op: 1, wc: 0, spin: 1, split: 0 },
    m: { nx: 0, ny: 0.25, s: 0.5, op: 0 } },
  { id: 'why',      anchor: '.why__stage',    at: 'center',
    d: { s: 0.95, ry: 0.9, ex: 0, wire: 0, clip: 1, op: 1, wc: 1, spin: 0.5, split: 0 },
    m: { nx: 0, ny: 0.3, s: 0.5, op: 0 } },
  { id: 'why_out',  anchor: null, at: ['#why', 0.4],
    d: { nx: -0.55, ny: 0.35, s: 0.6, ry: 1.5, ex: 0.2, wire: 0, clip: 1, op: 0, wc: 1, spin: 0.5, split: 0 } },
  { id: 'pre',      anchor: null, at: ['#process', 'top', -0.55],
    d: { nx: 0.05, ny: 0.45, s: 0.8, ry: 1.9, ex: 1, wire: 0, clip: 0, op: 0, wc: 0, spin: 0.55, split: 0 } },
  { id: 'p0', anchor: '.process__stage', at: ['#process', 0],    d: { s: 1, ry: 2.2, ex: 1, wire: 1, clip: 0, op: 1, wc: 0, spin: 0.55, split: 0 } },
  { id: 'p1', anchor: '.process__stage', at: ['#process', 0.30], d: { ex: 0, wire: 1, clip: 0, ry: 3.3 } },
  { id: 'p2', anchor: '.process__stage', at: ['#process', 0.48], d: { ex: 0, wire: 1, clip: 0, ry: 3.9 } },
  { id: 'p3', anchor: '.process__stage', at: ['#process', 0.74], d: { ex: 0, wire: 1, clip: 1, ry: 4.9 } },
  { id: 'p4', anchor: '.process__stage', at: ['#process', 0.86], d: { wire: 0, clip: 1, ry: 5.5 } },
  { id: 'p5', anchor: '.process__stage', at: ['#process', 1],    d: { wire: 0, clip: 1, ry: 6.6, s: 1.05 } },
  { id: 'compare',  anchor: '#compareStage', at: 'center',
    d: { s: 1, ry: 7.2, ex: 0, wire: 1, clip: 1, op: 1, wc: 0, spin: 0.3, split: 1 }, m: { s: 1.12 } },
  { id: 'config',   anchor: '.config__stage', at: 'center',
    d: { s: 1, ry: 8.3, ex: 0, wire: 0, clip: 1, op: 1, wc: 0, spin: 0.45, split: 0 } },
  { id: 'services', anchor: null, at: ['#services', 'top'],
    d: { nx: 0.3, ny: 0.3, s: 0.5, op: 0, wire: 0, ry: 9.2, split: 0 } },
  { id: 'audience', anchor: null, at: ['#audience', 'top'],
    d: { nx: 0.3, ny: 0.3, s: 0.5, op: 0, wire: 0, ry: 9.8, split: 0 } },
  { id: 'cta',      anchor: '.cta__stage',   at: 'center',
    d: { s: 1.05, ry: 10.8, ex: 0.4, wire: 0.8, clip: 0, op: 0, wc: 0, spin: 0.35, split: 0 }, m: { s: 0.8, ex: 0.3 } }
];
const NUM_FIELDS = ['s', 'ry', 'ex', 'wire', 'clip', 'op', 'wc', 'spin', 'split'];

/* ---------- процедурные текстуры ---------- */
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(0,0,0,.62)');
  g.addColorStop(0.45, 'rgba(0,0,0,.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ---------- разбиение меша на связные детали ---------- */
function splitComponents(geo) {
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : null;
  const triCount = index ? index.length / 3 : pos.count / 3;
  // сварка по позиции: вершины на швах UV дублируются, но лежат в одной точке
  const keyMap = new Map();
  const canon = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(pos.getX(i) * 5000) + ',' + Math.round(pos.getY(i) * 5000) + ',' + Math.round(pos.getZ(i) * 5000);
    let c = keyMap.get(k);
    if (c === undefined) { c = i; keyMap.set(k, i); }
    canon[i] = c;
  }
  const parent = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) parent[i] = i;
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const vid = t => index ? index[t] : t;
  for (let t = 0; t < triCount; t++) {
    const a = canon[vid(t * 3)], b = canon[vid(t * 3 + 1)], c = canon[vid(t * 3 + 2)];
    union(a, b); union(b, c);
  }
  const groups = new Map();
  for (let t = 0; t < triCount; t++) {
    const r = find(canon[vid(t * 3)]);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(vid(t * 3), vid(t * 3 + 1), vid(t * 3 + 2));
  }
  const parts = [];
  groups.forEach(tris => {
    const g2 = new THREE.BufferGeometry();
    for (const name in geo.attributes) g2.setAttribute(name, geo.attributes[name]);
    g2.setIndex(tris);
    g2.computeBoundingBox();
    // bbox только по вершинам этой детали (computeBoundingBox смотрит на весь общий буфер)
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < tris.length; i++) box.expandByPoint(v.fromBufferAttribute(pos, tris[i]));
    g2.userData.box = box;
    parts.push(g2);
  });
  parts.sort((a, b) => b.index.count - a.index.count);
  return parts;
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  let isMobile = innerWidth < 1024;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); TD.sceneFrame = null; TD.onFail(); });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  const CAM = { pos: new THREE.Vector3(0, 1.05, 3.9), look: new THREE.Vector3(0, 0.5, 0) };

  // студийное окружение для PBR-отражений (без внешних файлов)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.9;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff3e6, 1.4); key.position.set(2.5, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdcc8ec, 1.2); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x7b2a86, 0.3));

  /* ---------- плоскости отсечения («скан» материала) ---------- */
  const clipSolid = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4); // оставляет y <= h
  const clipWire = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);   // оставляет y >= h

  const wireMat = new THREE.MeshBasicMaterial({ color: C.lavender, wireframe: true, transparent: true, opacity: 0.6, clippingPlanes: [clipWire], depthWrite: false });
  const solids = []; // все материалы деталей (оригинальные и перекрашенные)

  /* ---------- кресло (origin — центр пола под креслом) ---------- */
  const chair = new THREE.Group();
  scene.add(chair);
  const model = new THREE.Group();
  chair.add(model);
  const parts = [];
  let CHAIR_H = 1.17, CHAIR_W = 1.2, CHAIR_CY = 0.58, FIT_W = 1.62, FIT_H = 1.22;
  let loaded = false;

  // мягкая тень под креслом
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 2.3),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.renderOrder = -1;
  chair.add(shadow);

  // кольцо «сканера» на высоте отсечения
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.98, 1.01, 128),
    new THREE.MeshBasicMaterial({ color: C.lavender, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1.14, 128),
    new THREE.MeshBasicMaterial({ color: C.lavender, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.add(glow);

  /* ---------- материалы по ролям ---------- */
  const mats = {}; // { leather: {orig, tint}, wood: {...}, metal: {...} }
  const roleMean = { leather: 0.1, wood: 0.2, metal: 0.2 }; // средняя линейная яркость серой карты по роли

  function buildMaterials(origMat, grayTex) {
    const base = () => {
      const m = origMat.clone();
      m.clippingPlanes = [clipSolid];
      m.side = THREE.FrontSide;
      m.envMapIntensity = 1;
      return m;
    };
    ['leather', 'wood', 'metal'].forEach(role => {
      const orig = base();
      const tint = base();
      tint.map = grayTex;
      mats[role] = { orig, tint };
      solids.push(orig, tint);
    });
    // перекрашенный металл — без карты металличности, чтобы латунь была по-настоящему металлом
    mats.metal.tint.metalnessMap = null;
    mats.metal.tint.roughnessMap = null;
    mats.metal.tint.needsUpdate = true;
  }

  function setTint(mat, role, hex) {
    mat.color.set(hex).multiplyScalar(1 / Math.max(0.02, roleMean[role]));
  }

  function applyConfig() {
    const L = LEATHER[TD.state.fabric] || LEATHER.cognac;
    const F = FRAME[TD.state.legs] || FRAME.walnut;
    const pick = (role, spec) => {
      const m = spec.orig ? mats[role].orig : mats[role].tint;
      if (!spec.orig) {
        setTint(m, role, spec.tint);
        if (role === 'metal') { m.metalness = spec.metalness ?? 1; m.roughness = spec.roughness ?? 0.35; }
      }
      return m;
    };
    const chosen = { leather: pick('leather', L), wood: pick('wood', F.wood), metal: pick('metal', F.metal) };
    parts.forEach(p => { p.material = chosen[p.userData.role]; });
  }
  let lastConfig = '';

  /* ---------- загрузка модели ---------- */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(MODEL_URL, gltf => {
    let srcMesh = null;
    gltf.scene.traverse(o => { if (o.isMesh && !srcMesh) srcMesh = o; });
    if (!srcMesh) { TD.onFail(); return; }
    gltf.scene.updateMatrixWorld(true);
    const geo = srcMesh.geometry.clone();
    // meshopt/KHR_mesh_quantization хранит атрибуты в нормализованных int-типах —
    // распаковываем во float32, иначе трансформация узла переполнит int16
    ['position', 'normal', 'uv'].forEach(name => {
      const a = geo.attributes[name];
      if (!a) return;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
      geo.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
    });
    geo.applyMatrix4(srcMesh.matrixWorld);
    const origMat = srcMesh.material;

    // габариты и центр
    geo.computeBoundingBox();
    const bb = geo.boundingBox, size = new THREE.Vector3(), center = new THREE.Vector3();
    bb.getSize(size); bb.getCenter(center);
    CHAIR_H = size.y; CHAIR_W = Math.max(size.x, size.z); CHAIR_CY = size.y / 2;
    FIT_W = CHAIR_W * 1.36; FIT_H = CHAIR_H * 1.06;
    model.position.set(-center.x, -bb.min.y, -center.z);

    // серая карта яркости из диффузной текстуры — для перекраски
    const img = origMat.map && origMat.map.image;
    const gsize = 1024;
    const gc = document.createElement('canvas');
    gc.width = gc.height = gsize;
    const gctx = gc.getContext('2d', { willReadFrequently: true });
    let data = null;
    if (img) {
      gctx.drawImage(img, 0, 0, gsize, gsize);
      data = gctx.getImageData(0, 0, gsize, gsize);
    }
    const uv = geo.attributes.uv;
    const sampleRGB = (indices) => {
      const acc = [0, 0, 0]; let n = 0;
      if (!data) return [110, 80, 50];
      const step = Math.max(1, Math.floor(indices.length / 300));
      for (let i = 0; i < indices.length; i += step) {
        const vi = indices[i];
        const u = ((uv.getX(vi) % 1) + 1) % 1, v = ((uv.getY(vi) % 1) + 1) % 1;
        const px = (Math.floor(v * (gsize - 1)) * gsize + Math.floor(u * (gsize - 1))) * 4;
        acc[0] += data.data[px]; acc[1] += data.data[px + 1]; acc[2] += data.data[px + 2]; n++;
      }
      return acc.map(x => x / Math.max(1, n));
    };

    // детали + роли
    const comps = splitComponents(geo);
    const roleSum = { leather: [0, 0], wood: [0, 0], metal: [0, 0] };
    comps.forEach((g, i) => {
      const b = g.userData.box, s = new THREE.Vector3(); b.getSize(s);
      const rgb = sampleRGB(g.index.array);
      let role;
      if (b.min.y < bb.min.y + 0.03) role = 'metal';                 // база на полу
      else if (Math.max(s.x, s.y, s.z) < 0.2) role = 'metal';          // стойка-шарнир
      else role = rgb[0] > 95 ? 'wood' : 'leather';                    // фанера светлее кожи
      const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      roleSum[role][0] += Math.pow(lum, 2.2); roleSum[role][1]++;
      const c = new THREE.Vector3(); b.getCenter(c);
      const dir = new THREE.Vector3(c.x - center.x, c.y - center.y, c.z - center.z);
      if (role === 'metal') dir.set(0, -0.6, 0);
      else dir.multiplyScalar(1.5).y += role === 'leather' ? 0.25 : 0.05;
      const spin = [((i % 3) - 1) * 0.35, (i % 2 ? 0.3 : -0.3), (((i + 1) % 3) - 1) * 0.25];
      const m = new THREE.Mesh(g, origMat);
      const w = new THREE.Mesh(g, wireMat);
      m.add(w);
      m.userData = {
        role,
        base: new THREE.Vector3(), baseRot: new THREE.Euler(),
        explode: dir, spin: new THREE.Vector3(spin[0], spin[1], spin[2]),
        phase: (i * 1.7) % (Math.PI * 2), wire: w
      };
      model.add(m);
      parts.push(m);
    });
    Object.keys(roleSum).forEach(r => { if (roleSum[r][1]) roleMean[r] = roleSum[r][0] / roleSum[r][1]; });

    if (data) {
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = l;
      }
      gctx.putImageData(data, 0, 0);
    }
    const grayTex = new THREE.CanvasTexture(gc);
    grayTex.colorSpace = THREE.SRGBColorSpace;
    grayTex.flipY = false;
    grayTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (origMat.map) { origMat.map.anisotropy = grayTex.anisotropy; }

    buildMaterials(origMat, grayTex);
    applyConfig();
    lastConfig = TD.state.fabric + '/' + TD.state.legs;
    loaded = true;
    layout();
    TD.onReady();
  }, xhr => {
    if (xhr.lengthComputable && TD.onProgress) TD.onProgress(xhr.loaded / xhr.total);
  }, err => {
    console.error('[scene] модель не загрузилась:', err);
    TD.onFail();
  });

  /* ---------- раскладка ключевых кадров по скроллу ---------- */
  let visibleH = 1, visibleW = 1;
  const frames = []; // { at, st: {…}, anchorEl }
  const compareStage = document.getElementById('compareStage');

  function resolveKF() {
    frames.length = 0;
    let prev = null;
    KF.forEach(k => {
      const st = Object.assign({}, prev || {}, k.d);
      if (k.anchor) { st.nx = k.d.nx ?? 0; st.ny = k.d.ny ?? 0; }
      if (isMobile && k.m) Object.assign(st, k.m);
      const anchorEl = k.anchor ? document.querySelector(k.anchor) : null;
      frames.push({ id: k.id, spec: k, st, anchorEl, at: 0 });
      prev = st;
    });
  }

  function layout() {
    const vh = innerHeight;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    const docTop = el => el.getBoundingClientRect().top + scrollY;
    frames.forEach(f => {
      const a = f.spec.at;
      let at = 0;
      if (a === 'zero') at = 0;
      else if (a === 'center' && f.anchorEl) {
        const r = f.anchorEl.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) at = r.top + scrollY + r.height / 2 - vh / 2;
        else { const sec = f.anchorEl.closest('section'); at = sec ? docTop(sec) : 0; } // якорь скрыт (мобильные)
      } else if (Array.isArray(a)) {
        const el = document.querySelector(a[0]);
        if (el) {
          const top = docTop(el);
          at = a[1] === 'top' ? top : top + a[1] * Math.max(0, el.offsetHeight - vh);
          if (a[2]) at += a[2] * vh; // смещение в долях вьюпорта
        }
      }
      f.at = clamp(at, 0, maxScroll);
    });
    for (let i = 1; i < frames.length; i++) if (frames[i].at < frames[i - 1].at) frames[i].at = frames[i - 1].at;
  }

  function computeVisible() {
    const dist = CAM.pos.z;
    visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    visibleW = visibleH * camera.aspect;
  }

  // положение и масштаб кадра в текущий момент (якорь двигается вместе со страницей)
  function framePlacement(f, out) {
    const vw = innerWidth, vh = innerHeight;
    const wpx = visibleW / vw, wpy = visibleH / vh; // мировых единиц на пиксель
    const el = f.anchorEl;
    const r = el ? el.getBoundingClientRect() : null;
    if (r && r.width > 4 && r.height > 4) {
      out.nx = (r.left + r.width / 2 - vw / 2) / vw + f.st.nx;
      out.ny = -(r.top + r.height / 2 - vh / 2) / vh + f.st.ny;
      const fit = Math.min((r.width * wpx * 0.84) / FIT_W, (r.height * wpy * 0.9) / FIT_H);
      out.scale = f.st.s * Math.min(fit, 1.15);
    } else {
      out.nx = f.st.nx; out.ny = f.st.ny;
      out.scale = f.st.s * Math.min(1.15, (visibleW * 0.8) / FIT_W);
    }
    return out;
  }

  const cur = {};
  const pa = { nx: 0, ny: 0, scale: 1 }, pb = { nx: 0, ny: 0, scale: 1 };
  function sample(y) {
    let i = 0;
    while (i < frames.length - 1 && y >= frames[i + 1].at) i++;
    const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
    let t = b.at > a.at ? clamp((y - a.at) / (b.at - a.at), 0, 1) : 0;
    t = smooth(t);
    NUM_FIELDS.forEach(k => { cur[k] = lerp(a.st[k], b.st[k], t); });
    framePlacement(a, pa); framePlacement(b, pb);
    cur.nx = lerp(pa.nx, pb.nx, t);
    cur.ny = lerp(pa.ny, pb.ny, t);
    cur.scale = lerp(pa.scale, pb.scale, t);
    cur.splitOn = (t < 0.5 ? a.st.split : b.st.split) > 0.5;
    return cur;
  }

  /* ---------- размеры ---------- */
  function resize() {
    const w = innerWidth, h = innerHeight;
    isMobile = w < 1024;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    computeVisible();
    resolveKF();
    layout();
  }
  addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(() => layout()).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  resize();

  /* ---------- кадр ---------- */
  let spinAngle = 0, dragAngle = 0, dragVel = 0, cleared = false;
  const wireColor = new THREE.Color();

  function frame(t, dt) {
    if (!loaded) return;
    const st = sample(scrollY);

    // авто-вращение + перетаскивание с инерцией
    if (!TD.reduced) spinAngle += dt * 0.32 * st.spin;
    if (TD.drag.delta) {
      const d = TD.drag.delta * 0.011;
      dragAngle += d;
      dragVel = clamp(d / Math.max(dt, 1 / 120), -7, 7);
      TD.drag.delta = 0;
    } else if (!TD.drag.active) {
      dragAngle += dragVel * dt;
      dragVel *= Math.exp(-dt * 2.6);
    }

    // конфигуратор — мгновенная смена материалов, как в товарном конфигураторе
    const cfg = TD.state.fabric + '/' + TD.state.legs;
    if (cfg !== lastConfig) { lastConfig = cfg; applyConfig(); }

    // положение и масштаб
    const scale = st.scale;
    const float = TD.reduced ? 0 : Math.sin(t * 1.3) * 0.02 * (1 - st.ex);
    chair.scale.setScalar(scale);
    chair.position.set(
      st.nx * visibleW,
      CAM.look.y + st.ny * visibleH - CHAIR_CY * scale + float,
      0
    );
    chair.rotation.set(-TD.pointer.y * 0.06, st.ry + spinAngle + dragAngle + TD.pointer.x * 0.22, 0);

    // взрыв на детали
    const ex = st.ex;
    parts.forEach((p, i) => {
      const u = p.userData;
      const bob = TD.reduced ? 0 : Math.sin(t * 1.4 + u.phase) * 0.035 * ex;
      p.position.set(u.explode.x * ex, u.explode.y * ex + bob, u.explode.z * ex);
      const wob = TD.reduced ? 0 : Math.sin(t * 0.6 + u.phase) * 0.12 * ex;
      p.rotation.set(u.spin.x * ex, u.spin.y * ex + wob * (i % 2 ? 1 : -1), u.spin.z * ex);
    });

    // сетка / материал / скан
    const solidVisible = st.op > 0.01 && st.clip > 0.001;
    const wireVisible = st.wire > 0.01;
    const clipping = st.clip < 0.999;
    const hWorld = chair.position.y + st.clip * CHAIR_H * scale;
    clipSolid.constant = clipping ? hWorld : 1e4;
    clipWire.constant = clipping ? -hWorld : 1e4;

    const tr = st.op < 0.999;
    solids.forEach(m => { m.opacity = st.op; m.transparent = tr; m.visible = solidVisible; });
    const splitMode = st.splitOn && TD.state.splitEff > 0.002;
    wireMat.opacity = st.wire * (splitMode ? 0.95 : 0.6);
    wireMat.color.copy(wireColor.copy(C.lavender).lerp(C.plum, st.wc));
    wireMat.visible = wireVisible;

    shadow.visible = solidVisible;
    shadow.material.opacity = st.op * (1 - ex) * st.clip;
    ring.visible = clipping && st.clip > 0.002 && st.op > 0.01;
    if (ring.visible) {
      ring.position.set(chair.position.x, hWorld, chair.position.z);
      ring.scale.setScalar(scale * (1 + ex * 0.6));
      ring.material.opacity = 0.9 * st.op;
    }

    if (!solidVisible && !wireVisible) {
      if (!cleared) { renderer.clear(); cleared = true; }
      return;
    }
    cleared = false;

    // камера: лёгкий параллакс от указателя и дыхание
    camera.position.set(
      CAM.pos.x + TD.pointer.x * 0.14 + (TD.reduced ? 0 : Math.sin(t * 0.25) * 0.04),
      CAM.pos.y - TD.pointer.y * 0.08,
      CAM.pos.z
    );
    camera.lookAt(CAM.look);

    if (splitMode) {
      // setScissor принимает CSS-пиксели (сам умножает на pixelRatio)
      const r = compareStage.getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      const sx = clamp(Math.round(r.left + r.width * TD.state.splitEff), 0, W);
      renderer.setScissorTest(true);
      solids.forEach(m => { m.visible = false; });
      wireMat.visible = true; shadow.visible = false;
      renderer.setScissor(0, 0, sx, H);
      renderer.render(scene, camera);
      solids.forEach(m => { m.visible = solidVisible; });
      wireMat.visible = false; shadow.visible = solidVisible;
      renderer.setScissor(sx, 0, W - sx, H);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else {
      renderer.render(scene, camera);
    }
  }

  TD._dbg = { chair, parts, solids, wireMat, sample, frames, camera, renderer, scene, mats, roleMean };
  TD.sceneFrame = frame;
  // на мобильных первый экран без 3D — страницу открываем сразу, модель догрузится к разделу «Процесс»
  if (isMobile) TD.onReady();
}

try {
  init();
} catch (err) {
  console.error('[scene] 3D недоступно:', err);
  TD.onFail();
}
