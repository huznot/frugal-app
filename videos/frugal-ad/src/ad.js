(function () {
  const root = document.getElementById("root");
  const wide = root.dataset.layout === "wide";
  const W = wide ? 1920 : 1080;
  const H = wide ? 1080 : 1920;
  // Music is 128 BPM; B(n) is beat n of the detected grid (beats/assets/audio/music.wav.json).
  const B = (n) => 0.022 + n * 0.46875;
  // Stage-px anchors that depend on layout.
  const L = wide
    ? { zoomO: "1460px 540px", burst: { x: 1440, y: 795, s: 28 } }
    : { zoomO: "530px 1246px", burst: { x: 540, y: 1660, s: 30 } };

  const tl = gsap.timeline({ paused: true });
  const $ = (s) => document.querySelector(s);
  const all = (s) => gsap.utils.toArray(s);
  const hash = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  // ---------- helpers ----------
  const rise = (sel, at, dist = 150) => {
    tl.set(sel, { opacity: 1 }, at);
    tl.fromTo(sel, { y: dist, rotation: 4 }, { y: 0, rotation: 0, duration: 0.5, ease: "power4.out", immediateRender: false }, at);
  };
  const bar = (sel, at) => tl.to(sel, { scaleX: 1, duration: 0.35, ease: "power3.out" }, at);
  const flash = (at, peak) => tl.fromTo("#flash", { opacity: peak }, { opacity: 0, duration: 0.32, ease: "power2.out", immediateRender: false }, at);
  const shake = (at, amp) => {
    [[amp, -amp * 0.6], [-amp * 0.8, amp * 0.5], [amp * 0.5, -amp * 0.35], [-amp * 0.25, amp * 0.15], [0, 0]].forEach(([x, y], i) =>
      tl.to("#world", { x, y, duration: 0.045, ease: "none" }, at + i * 0.045));
  };
  // Directional (horizontal) motion blur driven through an SVG filter proxy.
  const mblur = (nodeId, at, peak, dur, up) => {
    const node = document.getElementById(nodeId);
    const p = { v: up ? 0 : peak };
    const write = () => node.setAttribute("stdDeviation", p.v.toFixed(2) + " 0");
    tl.fromTo(p, { v: up ? 0 : peak }, { v: up ? peak : 0, duration: dur, ease: up ? "power2.in" : "power2.out", onUpdate: write, immediateRender: false }, at);
  };
  // Deterministic confetti: every particle is a pure ballistic function of time.
  const confetti = (sel, at, n, colors, speed, dur) => {
    const box = $(sel);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("i");
      el.style.background = colors[i % colors.length];
      el.style.opacity = "0";
      box.appendChild(el);
      const a = -Math.PI / 2 + (hash(i) - 0.5) * 2.4;
      const s = speed * (0.55 + hash(i + 40) * 0.6);
      parts.push({ el, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r0: hash(i + 80) * 360, vr: (hash(i + 120) - 0.5) * 1400, sc: 0.7 + hash(i + 160) * 0.7 });
    }
    const p = { t: 0 };
    const g = 2600;
    const write = () => {
      const t = p.t;
      const op = t <= 0 ? 0 : Math.max(0, Math.min(1, 1 - (t - dur * 0.65) / (dur * 0.35)));
      parts.forEach((q) => {
        q.el.style.transform = `translate(${(q.vx * t).toFixed(1)}px, ${(q.vy * t + 0.5 * g * t * t).toFixed(1)}px) rotate(${(q.r0 + q.vr * t).toFixed(1)}deg) scale(${q.sc})`;
        q.el.style.opacity = op.toFixed(3);
      });
    };
    tl.fromTo(p, { t: 0 }, { t: dur, duration: dur, ease: "none", onUpdate: write, immediateRender: false }, at);
  };
  const counter = (sel, at, from, to, dur, ease) => {
    const el = $(sel);
    const p = { v: from };
    tl.fromTo(p, { v: from }, { v: to, duration: dur, ease, onUpdate: () => { el.textContent = "$" + p.v.toFixed(2); }, immediateRender: false }, at);
  };

  // ---------- initial states ----------
  gsap.set(["#it1", "#it2", "#it3", "#stamp"], { opacity: 0 });
  gsap.set(["#a1-w1", "#a1-w2", "#a1-w3", "#a1-w4", "#c2-w1", "#c2-w2", "#c2-sub", "#c3-w1", "#c3-w2"], { opacity: 0 });
  gsap.set(".hl-bar", { scaleX: 0 });
  gsap.set("#a1-lines", { filter: "url(#mbA)" });
  gsap.set("#a2", { filter: "url(#mbB)" });
  gsap.set("#a2-move", { x: W });
  gsap.set("#phoneMove", { transformPerspective: 1600 });
  gsap.set("#scanCheck", { scale: 0 });
  gsap.set("#toast", { y: 260, opacity: 0 });
  gsap.set("#prodChip", { opacity: 0 });
  const ROW = 192;
  const slot0 = { r0: 0, r1: 1, r2: 2, r3: 3 };
  const slot1 = { r0: 3, r1: 2, r2: 0, r3: 1 };
  Object.keys(slot0).forEach((id) => gsap.set("#" + id, { y: slot0[id] * ROW, opacity: 0 }));
  gsap.set("#bestSticker", { opacity: 0 });
  gsap.set(["#bigTag", "#savePill"], { opacity: 0 });
  gsap.set(".stripe", { x: W });
  gsap.set(".box .ion", { scale: 0 });
  gsap.set(".strike", { scaleX: 0 });
  gsap.set(["#svLabel", "#saveNum", "#svSub"], { opacity: 0 });
  gsap.set("#bigBtn", { y: 500, opacity: 0 });
  gsap.set("#burst", { left: L.burst.x, top: L.burst.y, scale: 0 });
  gsap.set(["#appIcon", "#playWrap"], { opacity: 0 });
  gsap.set(["#wordmark .ch", "#tagline .tw"], { opacity: 0 });
  gsap.set("#sheen", { xPercent: -150 });

  // background current: one slow leftward drift for the whole film
  tl.fromTo("#dots", { x: 0, y: 0 }, { x: -576, y: -192, duration: 14.6, ease: "none" }, 0);

  // =========== ACT 1 · HOOK: one grocery item per beat ===========
  const items = ["#it1", "#it2", "#it3"];
  const tints = ["#FFFFFF", "#FFF4D6", "#FFE3E3"];
  items.forEach((sel, i) => {
    const at = B(i);
    tl.set("#bgColor", { backgroundColor: tints[i] }, at);
    tl.set(sel, { opacity: 1 }, at);
    const tile = sel + " .it-tile", word = sel + " .it-word", tag = sel + " .it-tag";
    if (i === 0) tl.fromTo(tile, { scale: 1.9, rotation: -14 }, { scale: 1, rotation: 0, duration: 0.38, ease: "power4.out", immediateRender: false }, at);
    if (i === 1) tl.fromTo(sel, { x: W * 0.9 }, { x: 0, duration: 0.36, ease: "power4.out", immediateRender: false }, at);
    if (i === 2) tl.fromTo(sel, { y: H * 0.6, rotation: 14 }, { y: 0, rotation: 0, duration: 0.38, ease: "power4.out", immediateRender: false }, at);
    tl.fromTo(word, { y: 120, scale: 0.8 }, { y: 0, scale: 1, duration: 0.32, ease: "back.out(2)", immediateRender: false }, at + 0.04);
    tl.fromTo(tag, { x: 260, y: -120, rotation: 50, scale: 0.4 }, { x: 0, y: 0, rotation: -8, scale: 1, duration: 0.4, ease: "back.out(1.8)", immediateRender: false }, at + 0.08);
    if (i < 2) tl.to(sel, { x: -W * 0.9, duration: 0.13, ease: "power4.in" }, B(i + 1) - 0.13);
  });
  // beat 3: the verdict stamp slams down
  tl.set("#bgColor", { backgroundColor: "#FFFFFF" }, B(3));
  tl.to("#it3", { scale: 0.9, opacity: 0.35, duration: 0.2, ease: "power2.out" }, B(3));
  tl.set("#stamp", { opacity: 1 }, B(3));
  tl.fromTo("#stamp span", { scale: 3.2, rotation: -24, filter: "blur(10px)" }, { scale: 1, rotation: -8, filter: "blur(0px)", duration: 0.24, ease: "power4.out", immediateRender: false }, B(3));
  flash(B(3), 0.55);
  shake(B(3) + 0.1, 22);
  // beat 4: pull back, then the promise
  tl.to(["#it3", "#stamp"], { scale: 0.7, opacity: 0, duration: 0.16, ease: "power3.in" }, B(4) - 0.1);
  rise("#a1-w1", B(4));
  rise("#a1-w2", B(4) + 0.09);
  rise("#a1-w3", B(5));
  rise("#a1-w4", B(5) + 0.09);
  bar("#a1-bar", B(5) + 0.2);
  // whip-pan out (left) with directional blur
  tl.to("#a1-lines", { x: -W * 1.2, duration: 0.3, ease: "power3.in" }, 2.64);
  mblur("mbA-n", 2.64, 40, 0.3, true);

  // =========== ACT 2 · SCAN ===========
  tl.to("#a2-move", { x: 0, duration: 0.5, ease: "power3.out" }, 2.72);
  mblur("mbB-n", 2.72, 40, 0.45, false);
  tl.fromTo("#phoneMove", { rotationY: -38, rotation: 8 }, { rotationY: 0, rotation: 0, duration: 0.8, ease: "power3.out", immediateRender: false }, 2.72);
  rise("#c2-w1", B(6), 120);
  rise("#c2-w2", B(6) + 0.09, 120);
  bar("#c2-bar", B(6) + 0.3);
  rise("#c2-sub", B(7), 60);
  tl.fromTo("#scanline", { y: 0 }, { y: 296, duration: 0.47, ease: "sine.inOut" }, B(7));
  tl.to("#scanline", { y: 150, duration: 0.47, ease: "sine.inOut" }, B(8));
  // beat 9: BEEP, lock on
  const t9 = B(9);
  tl.to("#scanline", { opacity: 0, duration: 0.08 }, t9);
  tl.fromTo("#vf-flash", { opacity: 0.85 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, t9);
  [[".corner.tl", 14, 14], [".corner.tr", -14, 14], [".corner.bl", 14, -14], [".corner.br", -14, -14]].forEach(([s, x, y]) =>
    tl.to(s, { x, y, borderColor: "#16A870", duration: 0.16, ease: "power3.out" }, t9));
  tl.to("#scanCheck", { scale: 1, duration: 0.4, ease: "back.out(2.4)" }, t9 + 0.03);
  tl.fromTo("#ring", { scale: 1, opacity: 1 }, { scale: 3.4, opacity: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, t9);
  tl.to("#phoneMove", { scale: 1.06, duration: 0.07, ease: "power2.out" }, t9);
  tl.to("#phoneMove", { scale: 1, duration: 0.4, ease: "back.out(2)" }, t9 + 0.07);
  flash(t9, 0.35);
  tl.set("#toast", { opacity: 1 }, B(10));
  tl.to("#toast", { y: 0, duration: 0.45, ease: "power4.out" }, B(10));
  // beat 11: zoom THROUGH the screen (camera pushes forward)
  tl.set("#a2-move", { transformOrigin: L.zoomO }, B(11) - 0.01);
  tl.to("#a2-move", { scale: 6, duration: 0.38, ease: "power4.in" }, B(11));
  tl.fromTo("#a2-move", { filter: "blur(0px)" }, { filter: "blur(14px)", duration: 0.38, ease: "power4.in", immediateRender: false }, B(11));
  flash(5.54, 0.9);

  // =========== ACT 3 · COMPARE (arrives still pushing forward: grows into place) ===========
  tl.fromTo("#a3-move", { scale: 0.72, filter: "blur(12px)" }, { scale: 1, filter: "blur(0px)", duration: 0.5, ease: "power4.out", immediateRender: false }, 5.55);
  rise("#c3-w1", 5.62, 120);
  rise("#c3-w2", 5.72, 120);
  bar("#c3-bar", 6.0);
  tl.set("#prodChip", { opacity: 1 }, B(12) + 0.2);
  tl.fromTo("#prodChip", { scale: 0.6, y: 40 }, { scale: 1, y: 0, duration: 0.4, ease: "back.out(1.8)", immediateRender: false }, B(12) + 0.2);
  ["r0", "r1", "r2", "r3"].forEach((id, i) => {
    const at = B(13) + i * 0.2344;
    const fromX = i % 2 ? W : -W;
    tl.set("#" + id, { opacity: 1 }, at);
    tl.fromTo("#" + id, { x: fromX, rotation: i % 2 ? 6 : -6 }, { x: 0, rotation: 0, duration: 0.38, ease: "power4.out", immediateRender: false }, at);
  });
  // beat 15: sort by price; the cheapest lifts and flies to the top
  const t15 = B(15);
  tl.set("#r2", { zIndex: 3 }, t15);
  tl.to("#r2", { scale: 1.06, boxShadow: "0 30px 60px rgba(0,0,0,0.18)", duration: 0.14, ease: "power2.out" }, t15);
  tl.to("#r2", { y: slot1.r2 * ROW, duration: 0.42, ease: "power3.inOut" }, t15 + 0.06);
  ["r0", "r1", "r3"].forEach((id, i) => tl.to("#" + id, { y: slot1[id] * ROW, duration: 0.4, ease: "power3.inOut" }, t15 + 0.1 + i * 0.03));
  // anticipation squash, then BEST VALUE on the downbeat
  tl.to("#r2", { scale: 0.97, duration: 0.2, ease: "power2.in" }, B(17) - 0.2);
  const t17 = B(17);
  tl.to("#r2", { scale: 1, boxShadow: "0 12px 30px rgba(0,0,0,0.06)", duration: 0.45, ease: "back.out(3)" }, t17);
  tl.to("#bestRing", { opacity: 1, duration: 0.1 }, t17);
  tl.to("#r2-price", { color: "#0E7A51", duration: 0.1 }, t17);
  tl.set("#bestSticker", { opacity: 1 }, t17);
  tl.fromTo("#bestSticker", { scale: 3.4, rotation: -22 }, { scale: 1, rotation: -4, duration: 0.24, ease: "power4.out", immediateRender: false }, t17);
  confetti("#confA", t17, 40, ["#16A870", "#FFC53D", "#FF5050", "#3F7BFF"], 1300, 1.3);
  flash(t17, 0.45);
  shake(t17 + 0.05, 16);
  // beat 18: the price tag lands and rolls down to the best price
  tl.set("#bigTag", { opacity: 1 }, B(18));
  tl.fromTo("#bigTag", { scale: 2.3, rotation: -28 }, { scale: 1, rotation: -5, duration: 0.4, ease: "power4.out", immediateRender: false }, B(18));
  counter("#bigTagNum", B(18) + 0.1, 6.29, 4.49, 0.7, "power2.inOut");
  tl.set("#savePill", { opacity: 1 }, B(19) + 0.1);
  tl.fromTo("#savePill", { scale: 0, rotation: -20 }, { scale: 1, rotation: 5, duration: 0.42, ease: "back.out(2.6)", immediateRender: false }, B(19) + 0.1);
  tl.to("#a3-move", { scale: 1.035, duration: 1.5, ease: "none" }, 8.1);

  // =========== stripe wipe (left), swap under cover at 10.13 ===========
  all(".stripe").forEach((s, i) => tl.to(s, { x: -W * 1.5, duration: 0.75, ease: "power3.inOut" }, 9.62 + i * 0.07));

  // =========== ACT 4 · SAVE ===========
  tl.fromTo("#listCard", { x: 160 }, { x: 0, duration: 0.5, ease: "power3.out" }, 10.13);
  const cnt = { v: 0 };
  const cntEl = $("#lCount");
  all(".item-row").forEach((it, i) => {
    const at = B(22) + i * 0.2344;
    tl.to(it.querySelector(".box"), { backgroundColor: "#16A870", borderColor: "#16A870", duration: 0.1 }, at);
    tl.to(it.querySelector(".box .ion"), { scale: 1, duration: 0.3, ease: "back.out(2.6)" }, at);
    tl.to(it.querySelector(".strike"), { scaleX: 1, duration: 0.22, ease: "power2.out" }, at + 0.04);
    tl.to(it.querySelector(".i-name"), { color: "#8a8a8a", duration: 0.18 }, at + 0.04);
    tl.to(cnt, { v: i + 1, duration: 0.01, onUpdate: () => { cntEl.textContent = Math.round(cnt.v) + " / 6"; } }, at);
  });
  rise("#svLabel", B(25), 80);
  tl.set("#saveNum", { opacity: 1 }, B(25) + 0.06);
  tl.fromTo("#saveNum", { scale: 2.2 }, { scale: 1, duration: 0.35, ease: "power4.out", immediateRender: false }, B(25) + 0.06);
  counter("#saveNum", B(25) + 0.1, 0, 12.6, 0.78, "power2.out");
  const tPay = 12.62;
  tl.to("#saveNum", { scale: 1.14, duration: 0.07, ease: "power2.out" }, tPay);
  tl.to("#saveNum", { scale: 1, duration: 0.45, ease: "back.out(2.4)" }, tPay + 0.07);
  confetti("#confB", tPay, 44, ["#16A870", "#0E7A51", "#FFC53D", "#DDF5EA"], 1500, 1.4);
  flash(tPay, 0.4);
  shake(tPay + 0.03, 18);
  rise("#svSub", B(26) + 0.1, 60);
  // the big scan button rises, gets pressed, and floods the frame red
  tl.set("#bigBtn", { opacity: 1 }, B(28));
  tl.to("#bigBtn", { y: 0, duration: 0.45, ease: "back.out(1.6)" }, B(28));
  tl.to("#bigBtn", { scale: 1.05, duration: 0.3, ease: "power2.inOut" }, B(29) - 0.05);
  tl.to("#bbFace", { y: 20, duration: 0.06, ease: "power2.in" }, 14.03);
  tl.to("#bigBtn", { scale: 1, duration: 0.06, ease: "power2.in" }, 14.03);
  tl.to("#bbFace", { y: 0, duration: 0.2, ease: "back.out(2)" }, 14.1);

  // =========== ACT 5 · CTA ===========
  tl.fromTo("#burst", { scale: 0 }, { scale: L.burst.s, duration: 0.46, ease: "power3.in", immediateRender: false }, B(30));
  tl.to("#ctaDots", { opacity: 1, duration: 0.4 }, 14.55);
  tl.set("#appIcon", { opacity: 1 }, 14.55);
  tl.fromTo("#appIcon", { scale: 0, rotation: -20, y: 80 }, { scale: 1, rotation: 0, y: 0, duration: 0.6, ease: "back.out(1.8)", immediateRender: false }, 14.55);
  all("#wordmark .ch").forEach((c, i) => {
    tl.set(c, { opacity: 1 }, 14.82 + i * 0.05);
    tl.fromTo(c, { y: 180, scaleY: 1.4 }, { y: 0, scaleY: 1, duration: 0.5, ease: "back.out(2)", immediateRender: false }, 14.82 + i * 0.05);
  });
  all("#tagline .tw").forEach((c, i) => rise(c, 15.28 + i * 0.14, 80));
  tl.set("#playWrap", { opacity: 1 }, 15.8);
  tl.fromTo("#playWrap", { y: 150, scale: 0.8 }, { y: 0, scale: 1, duration: 0.55, ease: "back.out(1.7)", immediateRender: false }, 15.8);
  tl.to("#sheen", { xPercent: 420, duration: 0.7, ease: "power2.inOut" }, 16.3);
  tl.to("#playWrap", { scale: 0.93, duration: 0.08, ease: "power2.in" }, 17.0);
  tl.to("#playWrap", { scale: 1, duration: 0.4, ease: "back.out(2.4)" }, 17.08);
  tl.fromTo("#ctaInner", { scale: 1 }, { scale: 1.04, duration: 3.45, ease: "none" }, 14.55);

  window.__timelines["main"] = tl;
})();
