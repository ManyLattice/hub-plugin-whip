// Плётка — плагин страницы Agents Hub по образцу «Молотка»: рукоять у курсора, гибкий хлыст тянется за рукой,
// клик — щелчок: хлыст выстреливает, на «экране» остаётся рубец, звучит щелчок. Esc или «Убрать следы» — всё как было.
// Это слой поверх страницы: хаб под ним работает, пока плётка в руке, клики до него не доходят. «Уменьшить движение» —
// без физики хлыста, только след и звук. Всё рисуется кодом, файлов и сети нет.

const N = 26;                 // звеньев хлыста
const SEG = 9;                // длина звена, px
const GRAVITY = 0.45;
const DAMP = 0.965;
const HANDLE = 46;            // рукоять, px
const ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-4"/>' +
  '<path d="M7 13c3-5 6-8 10-9-2 3-6 5-7 9 2-1 4-1 6 0"/></svg>';

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rnd = (a, b) => a + Math.random() * (b - a);
let layer = null, current = null, stopLoop = null;

// --- щелчок: свист взмаха, сухой хлопок (короткий широкий шум), хвост ---------------------------------------------
let audio = null;
function crackSound(power) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, rate = audio.sampleRate;
    const noise = (sec, shape) => {
      const len = Math.max(1, Math.round(sec * rate)), buf = audio.createBuffer(1, len, rate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * shape(i / len);
      const src = audio.createBufferSource();
      src.buffer = buf;
      return src;
    };
    const whoosh = noise(0.16, (x) => Math.sin(Math.PI * x)), bp = audio.createBiquadFilter(), wg = audio.createGain();
    bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(3500, t + 0.15);
    wg.gain.value = 0.18 * power;
    whoosh.connect(bp).connect(wg).connect(audio.destination); whoosh.start(t);
    const at = t + 0.15;
    const crack = noise(0.05, (x) => Math.pow(1 - x, 6)), hp = audio.createBiquadFilter(), cg = audio.createGain();
    hp.type = "highpass"; hp.frequency.value = 1800;
    cg.gain.value = 0.9 * power;
    crack.connect(hp).connect(cg).connect(audio.destination); crack.start(at);
    const tail = noise(0.25, (x) => Math.pow(1 - x, 3)), lp = audio.createBiquadFilter(), tg = audio.createGain();
    lp.type = "lowpass"; lp.frequency.value = 1400;
    tg.gain.value = 0.12 * power;
    tail.connect(lp).connect(tg).connect(audio.destination); tail.start(at + 0.01);
  } catch { /* без звука — тоже щёлкнуло */ }
}

function canvas() {
  const c = document.createElement("canvas"), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  return c;
}

// --- рубец: красная полоса по форме кончика хлыста в момент щелчка, с припухлостью и бликом ------------------------
function welt(ctx, pts) {
  if (pts.length < 2) return;
  const path = () => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  };
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(190,20,30,.55)"; ctx.shadowBlur = 14;
  path(); ctx.strokeStyle = "rgba(205,40,48,.55)"; ctx.lineWidth = 11; ctx.stroke();
  ctx.shadowBlur = 0;
  path(); ctx.strokeStyle = "rgba(150,10,22,.85)"; ctx.lineWidth = 5; ctx.stroke();
  path(); ctx.strokeStyle = "rgba(255,170,170,.6)"; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

// --- искры и пыль в точке щелчка ----------------------------------------------------------------------------------
function burst(fx, x, y) {
  if (calm()) return;
  const parts = Array.from({ length: Math.round(rnd(10, 16)) }, () => {
    const a = rnd(0, Math.PI * 2), v = rnd(2, 7);
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, s: rnd(1, 2.6) };
  });
  const ctx = fx.getContext("2d"), dpr = devicePixelRatio || 1;
  let ring = 0;
  const tick = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, fx.width, fx.height);
    let alive = 0;
    if (ring < 1) {   // ударная волна щелчка
      ring += 0.12;
      ctx.beginPath(); ctx.arc(x, y, 6 + ring * 34, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - ring)})`; ctx.lineWidth = 2; ctx.stroke();
      alive++;
    }
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy *= 0.9; p.life -= 0.045; alive++;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = "rgba(255,236,200,1)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (alive && layer) requestAnimationFrame(tick); else ctx.clearRect(0, 0, fx.width, fx.height);
  };
  requestAnimationFrame(tick);
}

// --- хлыст: цепочка точек (Верле), первая — у кончика рукояти -----------------------------------------------------
function whip(x, y) {
  const pts = Array.from({ length: N }, (_, i) => ({ x: x + i * 2, y: y + i * SEG, px: x + i * 2, py: y + i * SEG }));
  return {
    pts,
    step(hx, hy) {
      pts[0].x = hx; pts[0].y = hy; pts[0].px = hx; pts[0].py = hy;
      for (let i = 1; i < N; i++) {
        const p = pts[i], vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + GRAVITY;
      }
      for (let k = 0; k < 6; k++) {
        for (let i = 1; i < N; i++) {
          const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const diff = (d - SEG) / d;
          if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
          else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
        }
        pts[0].x = hx; pts[0].y = hy;
      }
    },
    tipSpeed() {
      const p = pts[N - 1];
      return Math.hypot(p.x - p.px, p.y - p.py);
    },
    draw(ctx) {
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let i = 1; i < N; i++) {   // к кончику тоньше
        const a = pts[i - 1], b = pts[i];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = i % 2 ? "#5a3418" : "#6b4020";
        ctx.lineWidth = 5.5 - (i / N) * 4.5;
        ctx.stroke();
      }
      const t = pts[N - 1];   // кисточка
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + 4, t.y + 7); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - 3, t.y + 8);
      ctx.strokeStyle = "#c9a47a"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    },
  };
}

function drawHandle(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 6;
  const g = ctx.createLinearGradient(0, -6, 0, 6);
  g.addColorStop(0, "#8a5a32"); g.addColorStop(0.5, "#5b3519"); g.addColorStop(1, "#3a200d");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-HANDLE, -5.5, HANDLE, 11, 5); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,220,180,.35)"; ctx.lineWidth = 1;   // оплётка
  for (let i = 1; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-HANDLE + i * 6.5, -5); ctx.lineTo(-HANDLE + i * 6.5 + 4, 5); ctx.stroke(); }
  ctx.fillStyle = "#c8a070";   // навершие и кольцо
  ctx.beginPath(); ctx.arc(-HANDLE, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-3, -6, 4, 12);
  ctx.restore();
}

function close(button) {
  if (!layer) return;
  const l = layer;
  layer = null;
  stopLoop?.();
  document.removeEventListener("keydown", onKey, true);
  button?.setAttribute("aria-pressed", "false");
  if (calm()) l.remove();
  else l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out" }).onfinish = () => l.remove();
}

function onKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(current); } }

function open(button, hub) {
  if (layer) return close(button);
  current = button;
  button.setAttribute("aria-pressed", "true");
  layer = document.createElement("div");
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Плётка: щёлкайте по экрану, Esc — убрать следы");
  Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "2147483000", cursor: "none", touchAction: "none",
    overflow: "hidden" });
  const marks = canvas(), fx = canvas(), hand = canvas();

  let mx = innerWidth / 2, my = innerHeight / 2, lastX = mx, dir = 1;
  const angle = -0.6;   // рукоять наклонена, кончик — у курсора
  const rope = whip(mx, my);
  let cracking = null, hits = 0;
  // взмах кистью: точка крепления уходит назад и вверх, потом резко вперёд и вниз — волна бежит по хлысту к кончику
  const FLICK = [[-0.4, -0.5], [-0.8, -1], [-1, -1.2], [-0.6, -0.9], [0.2, -0.3], [0.9, 0.2], [1.2, 0.5], [0.8, 0.4],
    [0.4, 0.2], [0.1, 0.05]];
  const REACH = 60;

  const crack = () => {
    hits++;
    const tail = rope.pts.slice(Math.round(N * 0.45)).map((p) => [p.x, p.y]);
    welt(marks.getContext("2d"), tail);
    const t = rope.pts[N - 1];
    burst(fx, t.x, t.y);
  };
  const frame = () => {
    const ctx = hand.getContext("2d");
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let ax = mx, ay = my, tilt = angle;
    if (cracking && !calm()) {
      const f = FLICK[Math.min(cracking.frames, FLICK.length - 1)], d = cracking.dir;
      if (cracking.frames < FLICK.length) { ax += f[0] * REACH * d; ay += f[1] * REACH; tilt += f[0] * 0.5 * d; }
    }
    if (!calm()) rope.step(ax, ay);
    if (cracking && !calm()) {
      cracking.frames++;
      const v = rope.tipSpeed();
      // щелчок — когда кончик, разогнавшись после взмаха, начал тормозить
      if (cracking.frames > FLICK.length / 2 && (v < cracking.peak * 0.75 || cracking.frames > 30)) { crack(); cracking = null; }
      else if (cracking.frames > FLICK.length / 2) cracking.peak = Math.max(cracking.peak, v);
    }
    if (!calm()) rope.draw(ctx);
    drawHandle(ctx, ax, ay, tilt);
  };
  let raf = 0;
  const loop = () => { frame(); raf = requestAnimationFrame(loop); };
  stopLoop = () => cancelAnimationFrame(raf);

  layer.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - lastX) > 2) dir = e.clientX > lastX ? 1 : -1;
    lastX = mx = e.clientX; my = e.clientY;
    if (calm()) frame();
  });

  const bar = hub.el("div");
  Object.assign(bar.style, { position: "absolute", top: "12px", right: "12px", display: "flex", gap: "8px",
    padding: "6px", borderRadius: "10px", background: "var(--card, #fff)", boxShadow: "0 8px 24px rgba(0,0,0,.25)",
    cursor: "default" });
  const done = hub.el("button", "btn small", "Убрать следы");
  done.type = "button";
  done.addEventListener("click", (e) => { e.stopPropagation(); close(button); });
  const hint = hub.el("span", null, "Щёлкайте плёткой · Esc");
  Object.assign(hint.style, { alignSelf: "center", fontSize: "12px", color: "var(--muted-foreground, #666)", padding: "0 6px" });
  bar.append(hint, done);
  bar.addEventListener("pointerdown", (e) => e.stopPropagation());
  layer.append(marks, fx, hand, bar);

  layer.addEventListener("pointerdown", (e) => {
    mx = e.clientX; my = e.clientY;
    crackSound(Math.min(1, 0.6 + hits * 0.05));
    if (calm()) {   // без физики: рубец по дуге от руки и щелчок сразу
      const pts = Array.from({ length: 12 }, (_, i) => [mx + dir * i * 14, my - 40 + Math.pow(i - 6, 2) * 1.6]);
      welt(marks.getContext("2d"), pts);
      return;
    }
    if (!cracking) cracking = { frames: 0, peak: 0, dir };
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(layer);
  loop();
  done.focus();
}

export default function register(hub) {
  hub.addSlot("topbar", {
    id: "whip", order: 91,
    render(root) {
      if (root.firstChild) return;
      const b = hub.el("button", "btn quiet small");
      b.type = "button";
      b.innerHTML = ICON;
      b.append(" Плётка");
      b.title = "Щёлкнуть плёткой (Esc — убрать следы)";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => open(b, hub));
      root.append(b);
    },
  });
}
