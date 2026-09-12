/* =====================================================================
   THREE DIMENSION — 3D-сцена. Один фиксированный canvas на всю страницу,
   процедурное кресло, которое «путешествует» по разделам по мере скролла:
   hero → зачем → процесс (взрыв на детали → сборка → «скан» материалов)
   → сетка/рендер (split-рендер) → конфигуратор → CTA (чертёж).
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TD = window.TD;
const canvas = document.getElementById('scene');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/* ---------- палитра ---------- */
const C = {
  lavender: new THREE.Color(0xdcc8ec),
  plum: new THREE.Color(0x381932),
  milk: new THREE.Color(0xfff3e6)
};

/* ---------- пресеты материалов конфигуратора ---------- */
const FABRICS = {
  lavender: { color: 0xc3a6de, pillow: 0xfff3e6, roughness: 0.82, sheen: 1.0, sheenColor: 0xf0e4fa, sheenRoughness: 0.55, clearcoat: 0.01, bump: 0.0025 },
  plum:     { color: 0x4a1f45, pillow: 0xdcc8ec, roughness: 0.80, sheen: 1.0, sheenColor: 0xb07ab8, sheenRoughness: 0.50, clearcoat: 0.01, bump: 0.0025 },
  milk:     { color: 0xf1e5d6, pillow: 0x381932, roughness: 1.00, sheen: 0.5, sheenColor: 0xffffff, sheenRoughness: 0.90, clearcoat: 0.01, bump: 0.0060 },
  graphite: { color: 0x2b2a2e, pillow: 0xc3a6de, roughness: 0.95, sheen: 0.7, sheenColor: 0x8d8a96, sheenRoughness: 0.70, clearcoat: 0.01, bump: 0.0040 },
  ochre:    { color: 0xb8742e, pillow: 0xfff3e6, roughness: 0.42, sheen: 0.05, sheenColor: 0xffffff, sheenRoughness: 0.50, clearcoat: 0.45, bump: 0.0015 },
  sage:     { color: 0x7f9a86, pillow: 0xfff3e6, roughness: 0.90, sheen: 0.6, sheenColor: 0xd8e4da, sheenRoughness: 0.80, clearcoat: 0.01, bump: 0.0050 }
};
const LEGS = {
  brass: { color: 0xcfa34e, metalness: 1.0, roughness: 0.28 },
  black: { color: 0x1a1a1a, metalness: 0.9, roughness: 0.42 },
  oak:   { color: 0x9c6b3c, metalness: 0.0, roughness: 0.62 }
};

/* ---------- ключевые кадры (состояние кресла по разделам) ----------
   anchor — DOM-элемент, к центру которого «прилипает» кресло; nx/ny — смещение
   в долях вьюпорта; s — масштаб; ry — базовый поворот; ex — взрыв (0..1);
   wire — сетка (0..1); clip — высота «скана» материала (0..1); op — непрозрачность
   материала; wc — цвет сетки (0 лаванда … 1 слива); spin — скорость авто-вращения;
   split — режим «сетка | рендер». m — переопределения для мобильных.            */
const KF = [
  { id: 'hero',     anchor: '#heroDrag',      at: 'zero',
    d: { nx: 0, ny: 0, s: 1, ry: 0.15, ex: 0, wire: 0, clip: 1, op: 1, wc: 0, spin: 1, split: 0 }, m: { s: 0.98 } },
  { id: 'why',      anchor: '.why__stage',    at: 'center',
    d: { s: 0.95, ry: 1.4, ex: 0, wire: 0, clip: 1, op: 1, wc: 1, spin: 0.5, split: 0 },
    m: { nx: 0, ny: 0.3, s: 0.5, op: 0 } },
  // уходит влево-вверх и гаснет, пока читают таблицу
  { id: 'why_out',  anchor: null, at: ['#why', 0.4],
    d: { nx: -0.55, ny: 0.35, s: 0.6, ry: 2.0, ex: 0.2, wire: 0, clip: 1, op: 0, wc: 1, spin: 0.5, split: 0 } },
  // невидимый «взорванный» — детали влетают сверху к началу процесса
  { id: 'pre',      anchor: null, at: ['#process', 'top', -0.55],
    d: { nx: 0.05, ny: 0.45, s: 0.8, ry: 2.3, ex: 1, wire: 0, clip: 0, op: 0, wc: 0, spin: 0.55, split: 0 } },
  { id: 'p0', anchor: '.process__stage', at: ['#process', 0],    d: { s: 1, ry: 2.6, ex: 1, wire: 1, clip: 0, op: 1, wc: 0, spin: 0.55, split: 0 } },
  { id: 'p1', anchor: '.process__stage', at: ['#process', 0.30], d: { ex: 0, wire: 1, clip: 0, ry: 3.7 } },
  { id: 'p2', anchor: '.process__stage', at: ['#process', 0.48], d: { ex: 0, wire: 1, clip: 0, ry: 4.3 } },
  { id: 'p3', anchor: '.process__stage', at: ['#process', 0.74], d: { ex: 0, wire: 1, clip: 1, ry: 5.3 } },
  { id: 'p4', anchor: '.process__stage', at: ['#process', 0.86], d: { wire: 0, clip: 1, ry: 5.9 } },
  { id: 'p5', anchor: '.process__stage', at: ['#process', 1],    d: { wire: 0, clip: 1, ry: 7.0, s: 1.05 } },
  { id: 'compare',  anchor: '#compareStage', at: 'center',
    d: { s: 1, ry: 7.6, ex: 0, wire: 1, clip: 1, op: 1, wc: 0, spin: 0.3, split: 1 }, m: { s: 1.12 } },
  { id: 'config',   anchor: '.config__stage', at: 'center',
    d: { s: 1, ry: 8.7, ex: 0, wire: 0, clip: 1, op: 1, wc: 0, spin: 0.45, split: 0 } },
  { id: 'services', anchor: null, at: ['#services', 'top'],
    d: { nx: 0.3, ny: 0.3, s: 0.5, op: 0, wire: 0, ry: 9.6, split: 0 } },
  { id: 'audience', anchor: null, at: ['#audience', 'top'],
    d: { nx: 0.3, ny: 0.3, s: 0.5, op: 0, wire: 0, ry: 10.2, split: 0 } },
  { id: 'cta',      anchor: '.cta__stage',   at: 'center',
    d: { s: 1.05, ry: 11.2, ex: 0.4, wire: 0.8, clip: 0, op: 0, wc: 0, spin: 0.35, split: 0 }, m: { s: 0.8, ex: 0.3 } }
];
const NUM_FIELDS = ['s', 'ry', 'ex', 'wire', 'clip', 'op', 'wc', 'spin', 'split'];

/* ---------- процедурные текстуры ---------- */
function noiseTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 105 + Math.random() * 100;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  return t;
}
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

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  let isMobile = innerWidth < 1024;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); TD.sceneFrame = null; TD.onFail(); });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  const CAM = { pos: new THREE.Vector3(0, 1.05, 3.9), look: new THREE.Vector3(0, 0.5, 0) };

  // студийное окружение для PBR-отражений (без внешних файлов)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff3e6, 1.5); key.position.set(2.5, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdcc8ec, 1.3); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x7b2a86, 0.35));

  /* ---------- плоскости отсечения («скан» материала) ---------- */
  const clipSolid = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4); // оставляет y <= h
  const clipWire = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);   // оставляет y >= h

  /* ---------- материалы ---------- */
  const bump = noiseTexture();
  const fabricMat = new THREE.MeshPhysicalMaterial({ bumpMap: bump, clippingPlanes: [clipSolid] });
  const pillowMat = new THREE.MeshPhysicalMaterial({ bumpMap: bump, clippingPlanes: [clipSolid] });
  const legMat = new THREE.MeshStandardMaterial({ clippingPlanes: [clipSolid] });
  const wireMat = new THREE.MeshBasicMaterial({ color: C.lavender, wireframe: true, transparent: true, opacity: 0.6, clippingPlanes: [clipWire], depthWrite: false });
  const solids = [fabricMat, pillowMat, legMat];

  const applyFabric = (f, k = 1) => {
    fabricMat.color.lerp(new THREE.Color(f.color), k);
    fabricMat.sheenColor.lerp(new THREE.Color(f.sheenColor), k);
    fabricMat.roughness = lerp(fabricMat.roughness, f.roughness, k);
    fabricMat.sheen = lerp(fabricMat.sheen, f.sheen, k);
    fabricMat.sheenRoughness = lerp(fabricMat.sheenRoughness, f.sheenRoughness, k);
    fabricMat.clearcoat = lerp(fabricMat.clearcoat, f.clearcoat, k);
    fabricMat.bumpScale = lerp(fabricMat.bumpScale, f.bump, k);
    pillowMat.color.lerp(new THREE.Color(f.pillow), k);
    pillowMat.sheenColor.lerp(new THREE.Color(0xffffff), k);
    pillowMat.roughness = lerp(pillowMat.roughness, 0.9, k);
    pillowMat.sheen = lerp(pillowMat.sheen, 0.7, k);
    pillowMat.sheenRoughness = lerp(pillowMat.sheenRoughness, 0.8, k);
    pillowMat.clearcoat = lerp(pillowMat.clearcoat, 0.01, k);
    pillowMat.bumpScale = lerp(pillowMat.bumpScale, 0.004, k);
  };
  const applyLegs = (l, k = 1) => {
    legMat.color.lerp(new THREE.Color(l.color), k);
    legMat.metalness = lerp(legMat.metalness, l.metalness, k);
    legMat.roughness = lerp(legMat.roughness, l.roughness, k);
  };
  fabricMat.sheenColor = new THREE.Color(); fabricMat.sheen = 0.5; fabricMat.clearcoat = 0.01; fabricMat.bumpScale = 0.002;
  pillowMat.sheenColor = new THREE.Color(); pillowMat.sheen = 0.5; pillowMat.clearcoat = 0.01; pillowMat.bumpScale = 0.002;
  applyFabric(FABRICS[TD.state.fabric] || FABRICS.lavender, 1);
  applyLegs(LEGS[TD.state.legs] || LEGS.brass, 1);

  /* ---------- кресло (origin — центр пола под креслом) ---------- */
  const chair = new THREE.Group();
  scene.add(chair);
  const parts = [];
  const CHAIR_H = 1.02, CHAIR_W = 1.2, CHAIR_CY = 0.5;
  // габариты «в проекции»: диагональ при повороте + перспектива (перед кресла ближе к камере)
  const FIT_W = 1.62, FIT_H = 1.22;

  function addPart(geo, mat, pos, rot, explode, spin) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    const w = new THREE.Mesh(geo, wireMat);
    m.add(w);
    m.userData = {
      base: m.position.clone(), baseRot: m.rotation.clone(),
      explode: new THREE.Vector3(explode[0], explode[1], explode[2]),
      spin: new THREE.Vector3(spin[0], spin[1], spin[2]),
      phase: Math.random() * Math.PI * 2
    };
    chair.add(m);
    parts.push(m);
    return m;
  }
  const R = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 4, r);

  addPart(R(1.18, 0.07, 0.86, 0.03), legMat,    [0, 0.235, 0],        null,                 [0, -0.5, 0],       [0, 0.5, 0]);        // основание
  addPart(R(1.0, 0.24, 0.86, 0.09),  fabricMat, [0, 0.39, 0],         null,                 [0, -0.12, 0.6],    [0.25, 0, 0]);       // сиденье
  addPart(R(0.86, 0.11, 0.7, 0.05),  fabricMat, [0, 0.565, 0.05],     null,                 [0, 0.45, 0.75],    [-0.4, 0.3, 0]);     // подушка сиденья
  addPart(R(1.0, 0.74, 0.2, 0.08),   fabricMat, [0, 0.64, -0.33],     [-0.1, 0, 0],         [0, 0.7, -0.75],    [0.4, 0, 0.12]);     // спинка
  addPart(R(0.17, 0.45, 0.86, 0.06), fabricMat, [-0.585, 0.495, 0],   null,                 [-0.85, 0.3, 0.1],  [0, 0, 0.55]);       // подлокотник L
  addPart(R(0.17, 0.45, 0.86, 0.06), fabricMat, [0.585, 0.495, 0],    null,                 [0.85, 0.3, 0.1],   [0, 0, -0.55]);      // подлокотник R
  addPart(R(0.36, 0.36, 0.11, 0.05), pillowMat, [0.2, 0.8, -0.17],    [-0.15, -0.32, 0.06], [0.6, 0.95, 0.4],   [0.7, 0.5, 0.35]);   // декоративная подушка
  const legGeo = new THREE.CylinderGeometry(0.022, 0.015, 0.2, 18);
  [[-0.5, 0.36], [0.5, 0.36], [-0.5, -0.36], [0.5, -0.36]].forEach(([x, z]) =>
    addPart(legGeo, legMat, [x, 0.1, z], [z > 0 ? 0.08 : -0.08, 0, x > 0 ? -0.08 : 0.08], [x * 1.1, -0.9, z * 1.1], [0, 0, 0]));

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
    // порядок должен быть монотонным
    for (let i = 1; i < frames.length; i++) if (frames[i].at < frames[i - 1].at) frames[i].at = frames[i - 1].at;
  }

  function computeVisible() {
    const dist = CAM.pos.z;
    visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    visibleW = visibleH * camera.aspect;
  }

  // положение и масштаб кадра в текущий момент (якорь двигается вместе со страницей)
  const tmp = { nx: 0, ny: 0, scale: 1 };
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

    // материалы конфигуратора — плавно
    const f = FABRICS[TD.state.fabric], l = LEGS[TD.state.legs];
    if (f) applyFabric(f, Math.min(1, dt * 5));
    if (l) applyLegs(l, Math.min(1, dt * 5));

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
      p.position.set(u.base.x + u.explode.x * ex, u.base.y + u.explode.y * ex + bob, u.base.z + u.explode.z * ex);
      const wob = TD.reduced ? 0 : Math.sin(t * 0.6 + u.phase) * 0.12 * ex;
      p.rotation.set(u.baseRot.x + u.spin.x * ex, u.baseRot.y + u.spin.y * ex + wob * (i % 2 ? 1 : -1), u.baseRot.z + u.spin.z * ex);
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
      // слева — сетка
      solids.forEach(m => { m.visible = false; });
      wireMat.visible = true; shadow.visible = false;
      renderer.setScissor(0, 0, sx, H);
      renderer.render(scene, camera);
      // справа — рендер
      solids.forEach(m => { m.visible = solidVisible; });
      wireMat.visible = false; shadow.visible = solidVisible;
      renderer.setScissor(sx, 0, W - sx, H);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else {
      renderer.render(scene, camera);
    }
  }

  TD._dbg = { chair, solids, wireMat, sample, frames, camera, renderer, scene, parts };
  // первый кадр — и страница может открываться
  frame(0, 0.016);
  TD.sceneFrame = frame;
  TD.onReady();
}

try {
  init();
} catch (err) {
  console.error('[scene] 3D недоступно:', err);
  TD.onFail();
}
