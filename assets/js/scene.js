/* =====================================================================
   THREE DIMENSION — 3D-сцена. Один фиксированный canvas на всю страницу.
   Кресло: скульптурный деревянный каркас (гнутые круглые элементы) и две
   пухлые подушки; материалы — настоящие PBR-текстуры (букле, тедди, шерсть,
   велюр, лён, кожа, дуб, орех) с картами нормалей/шероховатости/AO.
   Кресло «путешествует» по разделам по мере скролла: hero → зачем → процесс
   (взрыв на детали → сборка → «скан» материала) → сетка/рендер → конфигуратор
   → CTA. На мобильных первый экран без 3D.
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TD = window.TD;
const canvas = document.getElementById('scene');
const TEX = 'assets/tex/';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));

/* ---------- палитра ---------- */
const C = {
  lavender: new THREE.Color(0xdcc8ec),
  plum: new THREE.Color(0x381932),
  milk: new THREE.Color(0xfff3e6)
};

/* ---------- наборы материалов конфигуратора ----------
   map/gray — цвет (gray — нормированная карта яркости под перекраску цветом color),
   nor/rough/ao — PBR-карты, tile — размер плитки текстуры в метрах.       */
const FABRICS = {
  velvet_olive:   { name: 'Оливковый велюр', gray: 'velvet_gray', color: 0x33452a, nor: 'velvet_nor', rough: 'velvet_rough', tile: 0.28, sheen: 1.0, sheenColor: 0x6e8450, sheenRoughness: 0.5, normalScale: 0.7 },
  boucle_cream:   { name: 'Кремовое букле', map: 'boucle_cream', nor: 'boucle_nor', rough: 'boucle_rough', ao: 'boucle_ao', tile: 0.33, sheen: 0.35, normalScale: 1.1 },
  boucle_pattern: { name: 'Букле с узором', map: 'boucle_pattern', mapTile: 1.2, nor: 'boucle_nor', rough: 'boucle_rough', ao: 'boucle_ao', tile: 0.33, sheen: 0.25, normalScale: 1.3 },
  teddy_cream:    { name: 'Кремовый тедди', map: 'teddy_diff', nor: 'teddy_nor', rough: 'teddy_rough', ao: 'teddy_ao', tile: 0.34, sheen: 0.5, normalScale: 1.0 },
  wool_graphite:  { name: 'Графитовая шерсть', gray: 'wool_gray', color: 0x4a4a50, nor: 'wool_nor', rough: 'wool_rough', ao: 'wool_ao', tile: 0.27, sheen: 0.4, normalScale: 0.9 },
  velvet_plum:    { name: 'Сливовый велюр', gray: 'velvet_gray', color: 0x52224c, nor: 'velvet_nor', rough: 'velvet_rough', tile: 0.28, sheen: 1.0, sheenColor: 0xb07ab8, sheenRoughness: 0.45, normalScale: 0.6 },
  linen_olive:    { name: 'Оливковый лён', gray: 'linen_gray', color: 0x767f5e, nor: 'linen_nor', rough: 'linen_rough', ao: 'linen_ao', tile: 0.27, sheen: 0.25, normalScale: 0.9 },
  leather_cognac: { name: 'Коньячная кожа', map: 'leather_diff', nor: 'leather_nor', rough: 'leather_rough', ao: 'leather_ao', tile: 0.4, sheen: 0.0, clearcoat: 0.12, clearcoatRoughness: 0.5, normalScale: 0.8 }
};
// дерево: серая карта волокна × точный оттенок, сатиновый лак (clearcoat)
const FRAMES = {
  dark_walnut: { name: 'Тёмный орех', gray: 'walnut_gray', color: 0x46291a, nor: 'walnut_nor', rough: 'walnut_rough', tile: 0.6, normalScale: 0.4, roughness: 0.34, clearcoat: 0.38, clearcoatRoughness: 0.28 },
  walnut:     { name: 'Орех', gray: 'walnut_gray', color: 0x5f4a3b, nor: 'walnut_nor', rough: 'walnut_rough', tile: 0.6, normalScale: 0.4, roughness: 0.58, clearcoat: 0.08, clearcoatRoughness: 0.45 },
  smoked_oak: { name: 'Копчёный дуб', gray: 'oak_gray', color: 0x544840, nor: 'oak_nor', rough: 'oak_rough', tile: 0.8, normalScale: 0.45, roughness: 0.62, clearcoat: 0.06, clearcoatRoughness: 0.5 },
  oak_light:  { name: 'Светлый дуб', gray: 'oak_gray', color: 0xc6ad8b, nor: 'oak_nor', rough: 'oak_rough', tile: 0.8, normalScale: 0.45, roughness: 0.6, clearcoat: 0.06, clearcoatRoughness: 0.5 },
  ash_black:  { name: 'Чёрный ясень', gray: 'oak_gray', color: 0x26221e, nor: 'oak_nor', rough: 'oak_rough', tile: 0.8, normalScale: 0.4, roughness: 0.55, clearcoat: 0.08, clearcoatRoughness: 0.45 }
};

/* ---------- ключевые кадры (состояние кресла по разделам) ----------
   anchor — DOM-элемент, к центру которого «прилипает» кресло; nx/ny — смещение
   в долях вьюпорта; s — масштаб; ry — базовый поворот; ex — взрыв (0..1);
   wire — сетка (0..1); clip — высота «скана» материала (0..1); op — непрозрачность
   материала; wc — цвет сетки (0 лаванда … 1 слива); spin — скорость авто-вращения;
   split — режим «сетка | рендер». m — переопределения для мобильных.            */
const KF = [
  { id: 'hero',     anchor: '#heroDrag',      at: 'zero',
    d: { nx: 0, ny: 0, s: 1, ry: 0.55, ex: 0, wire: 0, clip: 1, op: 1, wc: 0, spin: 0, osc: 0.3, split: 0 },
    m: { nx: 0, ny: 0.25, s: 0.5, op: 0 } },
  { id: 'why',      anchor: '.why__stage',    at: 'center',
    d: { s: 0.95, ry: 1.9, ex: 0, wire: 0, clip: 1, op: 1, wc: 1, spin: 0.5, osc: 0, split: 0 },
    m: { nx: 0, ny: 0.3, s: 0.5, op: 0 } },
  { id: 'why_out',  anchor: null, at: ['#why', 0.4],
    d: { nx: -0.55, ny: 0.35, s: 0.6, ry: 2.5, ex: 0.2, wire: 0, clip: 1, op: 0, wc: 1, spin: 0.5, split: 0 } },
  { id: 'pre',      anchor: null, at: ['#process', 'top', -0.55],
    d: { nx: 0.05, ny: 0.45, s: 0.8, ry: 2.9, ex: 1, wire: 0, clip: 0, op: 0, wc: 0, spin: 0.55, split: 0 } },
  { id: 'p0', anchor: '.process__stage', at: ['#process', 0],    d: { s: 1, ry: 3.2, ex: 1, wire: 1, clip: 0, op: 1, wc: 0, spin: 0.55, split: 0 } },
  { id: 'p1', anchor: '.process__stage', at: ['#process', 0.30], d: { ex: 0, wire: 1, clip: 0, ry: 4.3 } },
  { id: 'p2', anchor: '.process__stage', at: ['#process', 0.48], d: { ex: 0, wire: 1, clip: 0, ry: 4.9 } },
  { id: 'p3', anchor: '.process__stage', at: ['#process', 0.74], d: { ex: 0, wire: 1, clip: 1, ry: 5.9 } },
  { id: 'p4', anchor: '.process__stage', at: ['#process', 0.86], d: { wire: 0, clip: 1, ry: 6.5 } },
  { id: 'p5', anchor: '.process__stage', at: ['#process', 1],    d: { wire: 0, clip: 1, ry: 7.6, s: 1.05 } },
  { id: 'compare',  anchor: '#compareStage', at: 'center',
    d: { s: 1, ry: 8.2, ex: 0, wire: 1, clip: 1, op: 1, wc: 0, spin: 0.3, split: 1 }, m: { s: 1.12 } },
  { id: 'config',   anchor: '.config__stage', at: 'center',
    d: { s: 1, ry: 9.3, ex: 0, wire: 0, clip: 1, op: 1, wc: 0, spin: 0.45, split: 0 } },
  { id: 'services', anchor: null, at: ['#services', 'top'],
    d: { nx: 0.3, ny: 0.3, s: 0.5, op: 0, wire: 0, ry: 10.2, split: 0 } },
  { id: 'audience', anchor: null, at: ['#audience', 'top'],
    d: { nx: 0.3, ny: 0.3, s: 0.5, op: 0, wire: 0, ry: 10.8, split: 0 } },
  { id: 'cta',      anchor: '.cta__stage',   at: 'center',
    d: { s: 1.05, ry: 11.8, ex: 0.4, wire: 0.8, clip: 0, op: 0, wc: 0, spin: 0.35, split: 0 }, m: { s: 0.8, ex: 0.3 } }
];
const NUM_FIELDS = ['s', 'ry', 'ex', 'wire', 'clip', 'op', 'wc', 'spin', 'osc', 'split'];

/* ---------- геометрия: «протяжка» сечения вдоль кривой ----------
   radius(t) → число (круг) или [rN, rB] (полуоси вдоль нормали N и бинормали B);
   opts.n — показатель суперэллипса сечения (2 — эллипс, 5–6 — брусок со скруглёнными рёбрами);
   opts.normal — фиксированная нормаль [x,y,z] (для плоских брусков в одной плоскости, без «скрутки»);
   opts.caps — торцы: 'round' | 'flat' | false для начала и конца.                                  */
function sweep(points, radius, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal', 0.5);
  const segs = opts.segments || 40, radial = opts.radial || 18, tile = opts.tile || 0.25, n = opts.n || 2;
  const lengths = curve.getLengths(segs);
  const fixedN = opts.normal ? new THREE.Vector3(opts.normal[0], opts.normal[1], opts.normal[2]).normalize() : null;
  const frames = fixedN ? null : curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  const rnd = opts.round || [0, 0];
  const roundF = t => {
    let f = 1;
    if (rnd[0] > 0 && t < rnd[0]) f = Math.sqrt(Math.max(0, 1 - Math.pow((rnd[0] - t) / rnd[0], 2)));
    if (rnd[1] > 0 && t > 1 - rnd[1]) f = Math.sqrt(Math.max(0, 1 - Math.pow((t - (1 - rnd[1])) / rnd[1], 2)));
    return Math.max(f, 0.06);
  };
  const rAt = t => { const r = typeof radius === 'function' ? radius(t) : radius; const f = roundF(t); return Array.isArray(r) ? [r[0] * f, r[1] * f] : [r * f, r * f]; };
  const N = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3(), tmp = new THREE.Vector3();
  const frameAt = i => {
    if (frames) { N.copy(frames.normals[i]); B.copy(frames.binormals[i]); T.copy(frames.tangents[i]); return; }
    T.copy(curve.getTangentAt(i / segs)).normalize();
    B.crossVectors(T, fixedN).normalize();
    N.crossVectors(B, T).normalize();
  };
  const sePow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const [rn, rb] = rAt(t);
    frameAt(i);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = -Math.cos(a), sn = Math.sin(a);
      const sx = sePow(c, 2 / n) * rn, sy = sePow(sn, 2 / n) * rb;
      pos.push(p.x + sx * N.x + sy * B.x, p.y + sx * N.y + sy * B.y, p.z + sx * N.z + sy * B.z);
      // нормаль суперэллипса: градиент |x/rn|^n + |y/rb|^n
      const gx = sePow(sx / rn, n - 1) / rn, gy = sePow(sy / rb, n - 1) / rb;
      tmp.set(gx * N.x + gy * B.x, gx * N.y + gy * B.y, gx * N.z + gy * B.z).normalize();
      nor.push(tmp.x, tmp.y, tmp.z);
      // волокно вдоль элемента: v — по длине, u — по периметру сечения
      uv.push((j / radial) * ((Math.PI * (rn + rb)) / tile), lengths[i] / tile);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const parts = [g];
  const caps = opts.caps === undefined ? ['round', 'round'] : opts.caps;
  [0, 1].forEach(end => {
    const kind = caps[end];
    if (!kind) return;
    const i = end ? segs : 0;
    const p = curve.getPointAt(end);
    const [rn, rb] = rAt(end);
    frameAt(i);
    if (kind === 'round' || kind === true) {
      const sph = new THREE.SphereGeometry(rn, 18, 12);
      sph.translate(p.x, p.y, p.z);
      parts.push(sph);
      return;
    }
    // плоский торец: веер от центра, нормаль ±T
    const cp = [], cn = [], cu = [], ci = [];
    const sgn = end ? 1 : -1;
    cp.push(p.x, p.y, p.z); cn.push(sgn * T.x, sgn * T.y, sgn * T.z); cu.push(0.5, 0.5);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = -Math.cos(a), sn = Math.sin(a);
      const sx = sePow(c, 2 / n) * rn, sy = sePow(sn, 2 / n) * rb;
      cp.push(p.x + sx * N.x + sy * B.x, p.y + sx * N.y + sy * B.y, p.z + sx * N.z + sy * B.z);
      cn.push(sgn * T.x, sgn * T.y, sgn * T.z);
      cu.push(0.5 + sx / tile, 0.5 + sy / tile);
    }
    for (let j = 0; j < radial; j++) { if (end) ci.push(0, j + 1, j + 2); else ci.push(0, j + 2, j + 1); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cg.setIndex(ci);
    parts.push(cg);
  });
  return mergeGeometries(parts, false);
}

/* ---------- мягкие детали: «подушка» — суперэллипс в плане, скруглённая кромка, выпуклый верх ----------
   Строится кольцами: крышка (концентрические кольца к центру), верхняя четверть-кромка, боковина,
   нижняя кромка, нижняя крышка. Толщина по Y, план в XZ. Развёртка «обивочная»: крышки — планарно
   (x,z), кромка — периметр × высота; шов проходит по границе треугольников. Возвращает неиндексированную
   геометрию с гладкими нормалями. seamT0 — где на периметре начинается развёртка (там шов).      */
function pillow(w, d, thick, bevel, n, puff, seamT0 = -Math.PI / 2) {
  const M = 96, K = 7, J = 7;
  const a = w / 2 - bevel, b = d / 2 - bevel;
  const bx = [], bz = [], nx = [], nz = [], arc = [];
  for (let i = 0; i < M; i++) {
    const t = (i / M) * Math.PI * 2 + seamT0;
    const c = Math.cos(t), sn = Math.sin(t);
    bx.push(Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * a);
    bz.push(Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * b);
  }
  let total = 0;
  for (let i = 0; i < M; i++) {
    const i0 = (i - 1 + M) % M, i1 = (i + 1) % M;
    const tx = bx[i1] - bx[i0], tz = bz[i1] - bz[i0], l = Math.hypot(tx, tz) || 1;
    nx.push(tz / l); nz.push(-tx / l);
    arc.push(total); total += Math.hypot(bx[i1] - bx[i], bz[i1] - bz[i]);
  }
  // станции профиля: массив функций i → [x, y, z], с тегом полосы после станции
  const stations = [];
  const dome = s => puff * Math.pow(1 - s * s, 2);
  for (let k = 1; k <= K; k++) { const sc = k / K; stations.push({ f: i => [sc * bx[i], thick / 2 + dome(sc), sc * bz[i]], band: 'cap' }); }
  for (let j = 1; j <= J; j++) { const ph = (j / J) * Math.PI / 2; stations.push({ f: i => [bx[i] + nx[i] * bevel * Math.sin(ph), thick / 2 - bevel * (1 - Math.cos(ph)), bz[i] + nz[i] * bevel * Math.sin(ph)], band: 'rim' }); }
  stations.push({ f: i => [bx[i] + nx[i] * bevel, -thick / 2 + bevel, bz[i] + nz[i] * bevel], band: 'rim' });
  for (let j = 1; j <= J; j++) { const ph = (j / J) * Math.PI / 2; stations.push({ f: i => [bx[i] + nx[i] * bevel * Math.cos(ph), -thick / 2 + bevel * (1 - Math.sin(ph)), bz[i] + nz[i] * bevel * Math.cos(ph)], band: 'cap' }); }
  for (let k = K - 1; k >= 1; k--) { const sc = k / K; stations.push({ f: i => [sc * bx[i], -thick / 2, sc * bz[i]], band: 'cap' }); }
  // кольца станций (cap-теги у последних станций — для нижней крышки)
  stations[stations.length - 1].band = 'cap';
  const S = stations.length;
  const pos = new Float32Array((S * M + 2) * 3);
  const topC = S * M, botC = S * M + 1;
  for (let si = 0; si < S; si++) for (let i = 0; i < M; i++) {
    const p = stations[si].f(i); const o = (si * M + i) * 3;
    pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
  }
  pos[topC * 3] = 0; pos[topC * 3 + 1] = thick / 2 + dome(0); pos[topC * 3 + 2] = 0;
  pos[botC * 3] = 0; pos[botC * 3 + 1] = -thick / 2; pos[botC * 3 + 2] = 0;
  const tris = []; // [ia, ib, ic, band]
  for (let i = 0; i < M; i++) { const i1 = (i + 1) % M; tris.push([topC, i1, i, 'cap']); }
  for (let si = 0; si < S - 1; si++) {
    const band = stations[si + 1].band === 'rim' || stations[si].band === 'rim' ? (stations[si].band === 'cap' && stations[si + 1].band === 'rim' ? 'rim' : stations[si].band) : 'cap';
    for (let i = 0; i < M; i++) {
      const i1 = (i + 1) % M, A = si * M + i, B = si * M + i1, C = (si + 1) * M + i, D = (si + 1) * M + i1;
      tris.push([A, B, C, band], [B, D, C, band]);
    }
  }
  const last = (S - 1) * M;
  for (let i = 0; i < M; i++) { const i1 = (i + 1) % M; tris.push([botC, last + i, last + i1, 'cap']); }
  // гладкие нормали по общей сетке
  const ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = []; tris.forEach(t => idx.push(t[0], t[1], t[2]));
  ig.setIndex(idx);
  ig.computeVertexNormals();
  const nrm = ig.attributes.normal.array;
  // разворачиваем в неиндексированную с UV по полосам
  const P = new Float32Array(tris.length * 9), Nn = new Float32Array(tris.length * 9), UV = new Float32Array(tris.length * 6);
  const ringOf = v => (v >= topC ? -1 : v % M);
  tris.forEach((t, ti) => {
    for (let k = 0; k < 3; k++) {
      const v = t[k], o = ti * 9 + k * 3, ou = ti * 6 + k * 2;
      P[o] = pos[v * 3]; P[o + 1] = pos[v * 3 + 1]; P[o + 2] = pos[v * 3 + 2];
      Nn[o] = nrm[v * 3]; Nn[o + 1] = nrm[v * 3 + 1]; Nn[o + 2] = nrm[v * 3 + 2];
      if (t[3] === 'cap') { UV[ou] = P[o]; UV[ou + 1] = P[o + 2]; }
      else {
        const r = ringOf(v);
        // для «следующей» вершины квада на стыке периметра берём полную длину вместо 0
        const others = [t[0], t[1], t[2]].map(ringOf);
        const u = (r === 0 && others.includes(M - 1)) ? total : arc[r];
        UV[ou] = u; UV[ou + 1] = -P[o + 1];
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  return g;
}
// изгиб плоской вертикальной панели вокруг вертикальной оси: x → дуга радиуса R, +z остаётся вогнутой стороной
function bendAroundY(g, R) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = x / R, rho = R - z;
    pos.setXYZ(i, rho * Math.sin(th), y, -rho * Math.cos(th));
    // нормаль: локальный поворот вокруг Y на угол th (x → дуга, z → радиус внутрь)
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    nor.setXYZ(i, nx * Math.cos(th) + nz * Math.sin(th), ny, -nx * Math.sin(th) + nz * Math.cos(th));
  }
  nor.needsUpdate = true;
}

/* ---------- пухлая подушка: скруглённый бокс + выпуклость граней + UV в мировом масштабе ---------- */
function cushion(w, h, d, radius, puff) {
  let g = new RoundedBoxGeometry(w, h, d, 7, radius);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  const inner = new THREE.Vector3(hw - radius, hh - radius, hd - radius);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // нормаль скруглённого бокса — направление от ближайшей точки внутреннего бокса
    n.set(v.x - clamp(v.x, -inner.x, inner.x), v.y - clamp(v.y, -inner.y, inner.y), v.z - clamp(v.z, -inner.z, inner.z));
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0); else n.normalize();
    const mask = (1 - Math.pow(Math.abs(v.x) / hw, 3)) * (1 - Math.pow(Math.abs(v.y) / hh, 3)) * (1 - Math.pow(Math.abs(v.z) / hd, 3));
    v.addScaledVector(n, puff * Math.max(0, mask));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// UV проекцией по доминирующей оси нормали, 1 UV-единица = 1 метр (для тайлящихся тканей)
function boxProjectUVs(g, matrix) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ay >= ax && ay >= az) { uv[i * 2] = p.x; uv[i * 2 + 1] = p.z; }
    else if (ax >= az) { uv[i * 2] = p.z; uv[i * 2 + 1] = p.y; }
    else { uv[i * 2] = p.x; uv[i * 2 + 1] = p.y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/* ---------- процедурные текстуры ---------- */
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(0,0,0,.5)');
  g.addColorStop(0.5, 'rgba(0,0,0,.16)');
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
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); TD.sceneFrame = null; TD.onFail(); });
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  const CAM = { pos: new THREE.Vector3(0, 1.0, 3.9), look: new THREE.Vector3(0, 0.45, 0) };

  // студийное окружение для PBR-отражений (без внешних файлов)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff3e6, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
  key.shadow.camera.left = key.shadow.camera.bottom = -1.7;
  key.shadow.camera.right = key.shadow.camera.top = 1.7;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xdcc8ec, 1.1); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x7b2a86, 0.25));

  /* ---------- плоскости отсечения («скан» материала) ---------- */
  const clipSolid = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4); // оставляет y <= h
  const clipWire = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);   // оставляет y >= h
  const wireMat = new THREE.MeshBasicMaterial({ color: C.lavender, wireframe: true, transparent: true, opacity: 0.6, clippingPlanes: [clipWire], depthWrite: false });
  const solids = []; // все материалы деталей

  /* ---------- текстуры: загрузка с кэшем ---------- */
  const texLoader = new THREE.TextureLoader();
  const texCache = new Map();
  function loadTex(name, { srgb = false, repeat = 1 } = {}) {
    const k = name + '|' + srgb + '|' + repeat;
    if (texCache.has(k)) return texCache.get(k);
    const p = new Promise((resolve, reject) => {
      texLoader.load(TEX + name + '.webp', t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.anisotropy = maxAniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
      }, undefined, reject);
    });
    texCache.set(k, p);
    return p;
  }

  /* ---------- материалы по спецификации ---------- */
  const matCache = new Map();
  async function buildMaterial(kind, key) {
    const ck = kind + ':' + key;
    if (matCache.has(ck)) return matCache.get(ck);
    const spec = (kind === 'fabric' ? FABRICS : FRAMES)[key];
    const p = (async () => {
      const rep = 1 / spec.tile;
      const jobs = {};
      if (spec.map) jobs.map = loadTex(spec.map, { srgb: true, repeat: spec.mapTile ? 1 / spec.mapTile : rep });
      if (spec.gray) jobs.map = loadTex(spec.gray, { srgb: true, repeat: rep });
      if (spec.nor) jobs.normalMap = loadTex(spec.nor, { repeat: rep });
      if (spec.rough) jobs.roughnessMap = loadTex(spec.rough, { repeat: rep });
      if (spec.ao) jobs.aoMap = loadTex(spec.ao, { repeat: rep });
      const keys = Object.keys(jobs);
      const texs = await Promise.all(keys.map(k => jobs[k]));
      const params = { roughness: spec.roughness ?? 1, metalness: 0, clippingPlanes: [clipSolid] };
      keys.forEach((k, i) => { params[k] = texs[i]; });
      const m = new THREE.MeshPhysicalMaterial(params);
      if (params.aoMap) { params.aoMap.channel = 0; m.aoMapIntensity = 0.9; }
      m.normalScale.setScalar(spec.normalScale ?? 1);
      if (spec.color !== undefined) {
        m.color.set(spec.color);
        if (spec.gray) m.color.multiplyScalar(2.0); // серая карта нормирована на среднее 0.5 в линейном пространстве
      }
      m.sheen = spec.sheen ?? 0.01;
      m.sheenColor.set(spec.sheenColor ?? 0xffffff);
      m.sheenRoughness = spec.sheenRoughness ?? 0.8;
      m.clearcoat = spec.clearcoat ?? 0.01;
      m.clearcoatRoughness = spec.clearcoatRoughness ?? 0.6;
      m.envMapIntensity = 1;
      solids.push(m);
      return m;
    })();
    matCache.set(ck, p);
    return p;
  }

  /* ---------- кресло (origin — центр пола под креслом) ---------- */
  const chair = new THREE.Group();
  scene.add(chair);
  const parts = [];
  const CHAIR_H = 0.82, CHAIR_W = 0.86, CHAIR_CY = 0.42, FIT_W = 1.2, FIT_H = 0.9;

  const XS = 0.36; // половина ширины каркаса
  function sideFrame(sign) {
    const xs = sign * XS, sp = sign * 0.025; // разлёт ножек у пола
    const frontLeg = sweep(
      [[xs + sp, 0, 0.33], [xs + sp * 0.5, 0.2, 0.335], [xs, 0.4, 0.34], [xs, 0.57, 0.35]],
      t => 0.02 + 0.005 * t + 0.013 * sstep(0.72, 1, t), { caps: [true, false] });
    const rearPost = sweep(
      [[xs + sp, 0, -0.31], [xs + sp * 0.4, 0.3, -0.33], [xs, 0.58, -0.36], [xs, 0.79, -0.415]],
      t => 0.021 + 0.006 * t, { caps: [true, true] });
    const arm = sweep(
      [[xs, 0.625, -0.35], [xs, 0.618, -0.1], [xs, 0.608, 0.2], [xs, 0.598, 0.42]],
      t => 0.03 + 0.004 * Math.sin(t * Math.PI), { caps: [true, true] });
    const rail = sweep([[xs, 0.33, -0.31], [xs, 0.33, 0.33]], 0.019, { segments: 8, caps: [false, false] });
    return mergeGeometries([frontLeg, rearPost, arm, rail], false);
  }
  const railsGeo = mergeGeometries([
    sweep([[-XS, 0.33, 0.33], [XS, 0.33, 0.33]], 0.019, { segments: 8, caps: [false, false] }),
    sweep([[-XS, 0.33, -0.31], [XS, 0.33, -0.31]], 0.019, { segments: 8, caps: [false, false] }),
    sweep([[-XS, 0.55, -0.385], [XS, 0.55, -0.385]], 0.018, { segments: 8, caps: [false, false] }),
    sweep([[-XS, 0.7, -0.4], [XS, 0.7, -0.4]], 0.018, { segments: 8, caps: [false, false] })
  ], false);

  const seatM = new THREE.Matrix4().makeTranslation(0, 0.415, 0.02);
  const seatGeo = cushion(0.68, 0.15, 0.62, 0.065, 0.014);
  boxProjectUVs(seatGeo, seatM);
  seatGeo.applyMatrix4(seatM);
  const backM = new THREE.Matrix4().makeRotationX(-0.14).premultiply(new THREE.Matrix4().makeTranslation(0, 0.6, -0.285));
  const backGeo = cushion(0.68, 0.46, 0.15, 0.065, 0.014);
  boxProjectUVs(backGeo, backM);
  backGeo.applyMatrix4(backM);

  function addPart(geo, role, explode, spin, i) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
    m.castShadow = m.receiveShadow = true;
    const w = new THREE.Mesh(geo, wireMat);
    m.add(w);
    m.userData = {
      role, explode: new THREE.Vector3(explode[0], explode[1], explode[2]),
      spin: new THREE.Vector3(spin[0], spin[1], spin[2]), phase: (i * 1.7) % (Math.PI * 2), wire: w
    };
    chair.add(m);
    parts.push(m);
    return m;
  }
  addPart(sideFrame(-1), 'frame', [-0.62, 0.12, 0], [0, 0, 0.35], 0);
  addPart(sideFrame(1), 'frame', [0.62, 0.12, 0], [0, 0, -0.35], 1);
  addPart(railsGeo, 'frame', [0, -0.42, 0.08], [0.3, 0, 0], 2);
  addPart(seatGeo, 'fabric', [0, 0.18, 0.62], [-0.35, 0.25, 0], 3);
  addPart(backGeo, 'fabric', [0, 0.62, -0.55], [0.4, 0, 0.1], 4);

  // тени: настоящая от ключевого света на невидимую плоскость + мягкое пятно
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.34, transparent: true, depthWrite: false }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = -2;
  chair.add(shadowPlane);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.renderOrder = -1;
  chair.add(shadow);

  // кольцо «сканера» на высоте отсечения
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.74, 0.765, 128),
    new THREE.MeshBasicMaterial({ color: C.lavender, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.64, 0.86, 128),
    new THREE.MeshBasicMaterial({ color: C.lavender, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.add(glow);

  /* ---------- конфигуратор ---------- */
  let current = { fabric: null, frame: null };
  let loaded = false;
  async function applyConfig() {
    const fk = FABRICS[TD.state.fabric] ? TD.state.fabric : 'boucle_pattern';
    const frk = FRAMES[TD.state.legs] ? TD.state.legs : 'ash_black';
    const want = fk + '/' + frk;
    TD.state.materialLoading = true;
    const [fm, frm] = await Promise.all([buildMaterial('fabric', fk), buildMaterial('frame', frk)]);
    if (TD.state.fabric !== fk && FABRICS[TD.state.fabric]) return; // уже выбрали другое
    parts.forEach(p => { p.material = p.userData.role === 'fabric' ? fm : frm; });
    current = { fabric: fk, frame: frk };
    TD.state.materialLoading = false;
    return want;
  }
  let lastConfig = '';

  /* ---------- раскладка ключевых кадров по скроллу ---------- */
  let visibleH = 1, visibleW = 1;
  const frames = [];
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
        else { const sec = f.anchorEl.closest('section'); at = sec ? docTop(sec) : 0; }
      } else if (Array.isArray(a)) {
        const el = document.querySelector(a[0]);
        if (el) {
          const top = docTop(el);
          at = a[1] === 'top' ? top : top + a[1] * Math.max(0, el.offsetHeight - vh);
          if (a[2]) at += a[2] * vh;
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

  function framePlacement(f, out) {
    const vw = innerWidth, vh = innerHeight;
    const wpx = visibleW / vw, wpy = visibleH / vh;
    const el = f.anchorEl;
    const r = el ? el.getBoundingClientRect() : null;
    if (r && r.width > 4 && r.height > 4) {
      out.nx = (r.left + r.width / 2 - vw / 2) / vw + f.st.nx;
      out.ny = -(r.top + r.height / 2 - vh / 2) / vh + f.st.ny;
      const fit = Math.min((r.width * wpx * 0.84) / FIT_W, (r.height * wpy * 0.9) / FIT_H);
      out.scale = f.st.s * Math.min(fit, 1.3);
    } else {
      out.nx = f.st.nx; out.ny = f.st.ny;
      out.scale = f.st.s * Math.min(1.3, (visibleW * 0.8) / FIT_W);
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

  const SHOT = TD.shot || null;
  function shotState() {
    const fit = Math.min((visibleW * 0.86) / FIT_W, (visibleH * 0.86) / FIT_H);
    return Object.assign(cur, { nx: 0, ny: SHOT.ny, s: 1, ry: SHOT.ry, ex: SHOT.ex, wire: SHOT.wire, clip: SHOT.clip, op: SHOT.op,
      wc: 0, spin: 0, osc: 0, split: 0, scale: fit * SHOT.s, splitOn: false });
  }
  function frame(t, dt) {
    if (!loaded) return;
    const st = SHOT ? shotState() : sample(scrollY);
    if (SHOT) t = 0; // без «дыхания» камеры и покачивания — детерминированный кадр

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

    const cfg = TD.state.fabric + '/' + TD.state.legs;
    if (cfg !== lastConfig) { lastConfig = cfg; applyConfig(); }

    const scale = st.scale;
    const float = TD.reduced ? 0 : Math.sin(t * 1.3) * 0.015 * (1 - st.ex);
    chair.scale.setScalar(scale);
    chair.position.set(st.nx * visibleW, CAM.look.y + st.ny * visibleH - CHAIR_CY * scale + float, 0);
    const osc = (TD.reduced ? 0 : Math.sin(t * 0.45) * (st.osc || 0));
    chair.rotation.set(-TD.pointer.y * 0.06, st.ry + osc + spinAngle + dragAngle + TD.pointer.x * 0.22, 0);

    // ключевой свет следует за креслом, чтобы тень всегда попадала в карту теней
    key.position.set(chair.position.x + 2.2, chair.position.y + 4.2, chair.position.z + 2.4);
    key.target.position.copy(chair.position);
    key.target.updateMatrixWorld();

    const ex = st.ex;
    parts.forEach((p, i) => {
      const u = p.userData;
      const bob = TD.reduced ? 0 : Math.sin(t * 1.4 + u.phase) * 0.035 * ex;
      p.position.set(u.explode.x * ex, u.explode.y * ex + bob, u.explode.z * ex);
      const wob = TD.reduced ? 0 : Math.sin(t * 0.6 + u.phase) * 0.12 * ex;
      p.rotation.set(u.spin.x * ex, u.spin.y * ex + wob * (i % 2 ? 1 : -1), u.spin.z * ex);
    });

    const solidVisible = st.op > 0.01 && st.clip > 0.001;
    const wireVisible = st.wire > 0.01;
    const clipping = st.clip < 0.999;
    const hWorld = chair.position.y + st.clip * CHAIR_H * scale;
    clipSolid.constant = clipping ? hWorld : 1e4;
    clipWire.constant = clipping ? -hWorld : 1e4;

    const tr = st.op < 0.999;
    solids.forEach(m => { m.opacity = st.op; m.transparent = tr; m.visible = solidVisible; });
    const splitMode = st.splitOn && TD.state.splitEff > 0.002;
    wireMat.opacity = st.wire * (splitMode || SHOT ? 0.95 : 0.6);
    wireMat.color.copy(wireColor.copy(C.lavender).lerp(C.plum, st.wc));
    wireMat.visible = wireVisible;

    shadow.visible = shadowPlane.visible = solidVisible;
    shadow.material.opacity = 0.6 * st.op * (1 - ex) * st.clip;
    shadowPlane.material.opacity = 0.34 * st.op * st.clip;
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

    camera.position.set(
      CAM.pos.x + TD.pointer.x * 0.14 + (TD.reduced ? 0 : Math.sin(t * 0.25) * 0.04),
      CAM.pos.y - TD.pointer.y * 0.08,
      CAM.pos.z
    );
    camera.lookAt(CAM.look);

    if (splitMode) {
      const r = compareStage.getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      const sx = clamp(Math.round(r.left + r.width * TD.state.splitEff), 0, W);
      renderer.setScissorTest(true);
      solids.forEach(m => { m.visible = false; });
      wireMat.visible = true; shadow.visible = shadowPlane.visible = false;
      renderer.setScissor(0, 0, sx, H);
      renderer.render(scene, camera);
      solids.forEach(m => { m.visible = solidVisible; });
      wireMat.visible = false; shadow.visible = shadowPlane.visible = solidVisible;
      renderer.setScissor(sx, 0, W - sx, H);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else {
      renderer.render(scene, camera);
    }
  }

  TD.applyConfig = applyConfig;
  TD._dbg = { chair, parts, solids, wireMat, sample, frames, camera, renderer, scene, matCache, FABRICS, FRAMES };
  TD.sceneFrame = frame;

  // на мобильных первый экран без 3D — страницу открываем сразу
  if (isMobile) TD.onReady();
  applyConfig().then(() => {
    loaded = true;
    lastConfig = TD.state.fabric + '/' + TD.state.legs;
    frame(0, 0.016);
    TD.onReady();
    // остальные наборы подгружаем в фоне, чтобы в конфигураторе переключение было мгновенным
    const rest = [...Object.keys(FABRICS).map(k => ['fabric', k]), ...Object.keys(FRAMES).map(k => ['frame', k])];
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 2500));
    idle(() => rest.reduce((p, [kind, k]) => p.then(() => buildMaterial(kind, k).catch(() => {})), Promise.resolve()));
  }).catch(err => {
    console.error('[scene] текстуры не загрузились:', err);
    TD.onFail();
  });
}

try {
  init();
} catch (err) {
  console.error('[scene] 3D недоступно:', err);
  TD.onFail();
}
