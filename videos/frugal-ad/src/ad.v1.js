(function () {
  const root = document.getElementById("root");
  const wide = root.dataset.layout === "wide";
  const W = wide ? 1920 : 1080;
  // Scan button centre in stage px (phone anchor + scale), used as the CTA burst origin.
  const burstAt = wide ? { x: 1230 + 195 * 1.18, y: 42 + 756 * 1.18, s: 32 } : { x: 228 + 195 * 1.6, y: 530 + 756 * 1.6, s: 36 };

  const tl = gsap.timeline({ paused: true });
  const $ = (s) => document.querySelector(s);
  const all = (s) => gsap.utils.toArray(s);

  // ---------- initial states ----------
  gsap.set(["#s1-eyebrow", "#s1-w1", "#s1-w2", "#s1-w3", "#s1-w4"], { opacity: 0 });
  gsap.set(".hl-bar", { scaleX: 0 });
  gsap.set(["#tagA", "#tagB", "#tagC"], { opacity: 0 });
  gsap.set("#phoneMove", { x: 1200 });
  gsap.set(["#cap2", "#cap3", "#cap4"], { x: W });
  gsap.set(["#c2-w1", "#c2-w2", "#c3-w1", "#c3-w2", "#c4-w1", "#c4-w2"], { opacity: 0 });
  gsap.set("#scanCheck", { scale: 0 });
  gsap.set("#toast", { y: 260, opacity: 0 });
  gsap.set(["#scrRes", "#scrList"], { x: 366, opacity: 0 });
  gsap.set("#tabbar", { y: 120 });
  const slot0 = { r0: 0, r1: 1, r2: 2, r3: 3 };
  const slot1 = { r0: 3, r1: 2, r2: 0, r3: 1 };
  const ROW = 90;
  Object.keys(slot0).forEach((id) => gsap.set("#" + id, { y: slot0[id] * ROW + 70, opacity: 0 }));
  gsap.set("#bestSticker", { scale: 0 });
  gsap.set(".box svg", { scale: 0 });
  gsap.set(".strike", { scaleX: 0 });
  gsap.set(["#bigTag", "#saveCard"], { opacity: 0 });
  gsap.set("#burst", { left: burstAt.x, top: burstAt.y, scale: 0 });
  gsap.set(["#appIcon", "#playWrap"], { opacity: 0 });
  gsap.set(["#wordmark .ch", "#tagline .tw"], { opacity: 0 });

  // Word arrival: binary opacity + fast rise (waterfall entry).
  const rise = (sel, at, dist = 150) => {
    tl.set(sel, { opacity: 1 }, at);
    tl.fromTo(sel, { y: dist, rotation: 3 }, { y: 0, rotation: 0, duration: 0.55, ease: "power4.out", immediateRender: false }, at);
  };
  const bar = (sel, at) => tl.to(sel, { scaleX: 1, duration: 0.4, ease: "power3.out" }, at);

  // ---------- background: one slow leftward current for the whole film ----------
  tl.fromTo("#dots", { x: 0, y: 0 }, { x: -552, y: -184, duration: 18, ease: "none" }, 0);
  tl.fromTo("#glowA", { x: 0 }, { x: -260, duration: 18, ease: "none" }, 0);
  tl.fromTo("#glowB", { x: 0 }, { x: -200, duration: 18, ease: "none" }, 0);

  // ---------- 1 · HOOK (0 to 2.95) ----------
  tl.set("#s1-eyebrow", { opacity: 1 }, 0.1);
  tl.fromTo("#s1-eyebrow", { y: 40 }, { y: 0, duration: 0.45, ease: "power3.out", immediateRender: false }, 0.1);
  rise("#s1-w1", 0.22);
  rise("#s1-w2", 0.38);
  const tags = [
    ["#tagA", 8, 0.5, { x: 420, y: -260, rotation: 50 }],
    ["#tagB", -10, 0.66, { x: 460, y: 240, rotation: -45 }],
    ["#tagC", 6, 0.82, { x: -300, y: 300, rotation: 40 }],
  ];
  tags.forEach(([sel, rot, at, from]) => {
    tl.set(sel, { opacity: 1 }, at);
    tl.fromTo(sel, { ...from, scale: 0.5 }, { x: 0, y: 0, rotation: rot, scale: 1, duration: 0.6, ease: "back.out(1.5)", immediateRender: false }, at);
  });
  rise("#s1-w3", 1.05);
  rise("#s1-w4", 1.22);
  bar("#s1-bar", 1.5);
  // "price." lands: the tags get knocked (causal kick), then the cheapest one steps forward.
  tags.forEach(([sel, rot], i) => {
    tl.to(sel, { rotation: rot + (i % 2 ? -12 : 12), duration: 0.1, ease: "power2.out" }, 1.32);
    tl.to(sel, { rotation: rot, duration: 0.5, ease: "back.out(2)" }, 1.42);
  });
  tl.to(["#tagA", "#tagB"], { opacity: 0.35, scale: 0.9, duration: 0.35, ease: "power2.out" }, 1.95);
  tl.to("#tagC", { scale: 1.22, rotation: -4, duration: 0.4, ease: "back.out(1.7)" }, 1.95);
  // exit with the current (left), still accelerating at the cut
  tl.to(["#s1-move", "#tagA", "#tagB", "#tagC"], { x: -1500, duration: 0.42, ease: "power4.in", stagger: 0.03 }, 2.55);

  // ---------- 2 · SCAN (2.75 to 6.3) ----------
  tl.to("#phoneMove", { x: 0, duration: 0.75, ease: "power4.out" }, 2.78);
  tl.to("#cap2", { x: 0, duration: 0.6, ease: "power4.out" }, 2.84);
  rise("#c2-w1", 2.9, 110);
  rise("#c2-w2", 3.04, 110);
  bar("#c2-bar", 3.4);
  tl.fromTo("#scanline", { y: 0 }, { y: 296, duration: 0.6, ease: "sine.inOut" }, 3.45);
  tl.to("#scanline", { y: 150, duration: 0.45, ease: "sine.inOut" }, 4.05);
  // BEEP: lock-on
  tl.to("#scanline", { opacity: 0, duration: 0.1 }, 4.5);
  tl.fromTo("#vf-flash", { opacity: 0 }, { opacity: 0.8, duration: 0.06, ease: "none" }, 4.5);
  tl.to("#vf-flash", { opacity: 0, duration: 0.35, ease: "power2.out" }, 4.56);
  tl.to(".corner.tl", { x: 14, y: 14, duration: 0.18, ease: "power3.out" }, 4.5);
  tl.to(".corner.tr", { x: -14, y: 14, duration: 0.18, ease: "power3.out" }, 4.5);
  tl.to(".corner.bl", { x: 14, y: -14, duration: 0.18, ease: "power3.out" }, 4.5);
  tl.to(".corner.br", { x: -14, y: -14, duration: 0.18, ease: "power3.out" }, 4.5);
  tl.to(".corner", { borderColor: "#16A870", duration: 0.15 }, 4.5);
  tl.to("#scanCheck", { scale: 1, duration: 0.45, ease: "back.out(2.2)" }, 4.56);
  tl.to("#phoneMove", { scale: 1.02, duration: 0.08, ease: "power2.out" }, 4.5);
  tl.to("#phoneMove", { scale: 1, duration: 0.4, ease: "back.out(2)" }, 4.58);
  tl.set("#toast", { opacity: 1 }, 4.8);
  tl.to("#toast", { y: 0, duration: 0.55, ease: "power4.out" }, 4.8);

  // push to Results: screen + caption both move left
  tl.to("#scrScan", { x: -366, duration: 0.36, ease: "power4.in" }, 5.95);
  tl.set("#scrRes", { opacity: 1 }, 6.18);
  tl.to("#scrRes", { x: 0, duration: 0.5, ease: "power4.out" }, 6.18);
  tl.set("#scrScan", { opacity: 0 }, 6.32);
  tl.to(".status", { color: "#161616", duration: 0.2 }, 6.2);
  tl.to("#tabbar", { y: 0, duration: 0.5, ease: "power4.out" }, 6.3);
  tl.to("#cap2", { x: -1500, duration: 0.38, ease: "power4.in" }, 5.95);
  tl.to("#cap3", { x: 0, duration: 0.6, ease: "power4.out" }, 6.25);
  rise("#c3-w1", 6.3, 110);
  rise("#c3-w2", 6.44, 110);
  bar("#c3-bar", 6.85);

  // ---------- 3 · COMPARE (6.3 to 10.5) ----------
  ["r0", "r1", "r2", "r3"].forEach((id, i) => {
    tl.set("#" + id, { opacity: 1 }, 6.55 + i * 0.1);
    tl.to("#" + id, { y: slot0[id] * ROW, duration: 0.5, ease: "power4.out" }, 6.55 + i * 0.1);
  });
  // sort by price: the cheapest lifts and rises to the top
  tl.set("#r2", { zIndex: 3 }, 7.7);
  tl.to("#r2", { scale: 1.05, boxShadow: "0 14px 30px rgba(0,0,0,0.16)", duration: 0.2, ease: "power2.out" }, 7.7);
  tl.to("#r2", { y: slot1.r2 * ROW, duration: 0.6, ease: "power3.inOut" }, 7.82);
  ["r0", "r1", "r3"].forEach((id, i) => tl.to("#" + id, { y: slot1[id] * ROW, duration: 0.55, ease: "power3.inOut" }, 7.86 + i * 0.03));
  tl.to("#r2", { scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)", duration: 0.3, ease: "power2.out" }, 8.42);
  // (stillness) then BEST VALUE
  tl.to("#bestRing", { opacity: 1, duration: 0.15 }, 8.7);
  tl.to("#r2-price", { color: "#0E7A51", duration: 0.15 }, 8.7);
  tl.to("#bestSticker", { scale: 1, duration: 0.45, ease: "back.out(2.4)" }, 8.72);
  tl.set("#bigTag", { opacity: 1 }, 8.85);
  tl.fromTo("#bigTag", { scale: 2.4, rotation: -28 }, { scale: 1, rotation: -6, duration: 0.45, ease: "power4.out", immediateRender: false }, 8.85);
  tl.to("#phoneMove", { x: -6, y: 8, duration: 0.08, ease: "power2.out" }, 9.28);
  tl.to("#phoneMove", { x: 0, y: 0, duration: 0.45, ease: "back.out(2)" }, 9.36);
  tl.to("#phoneMove", { scale: 1.04, duration: 1.0, ease: "power1.inOut" }, 9.4);

  // push to List
  tl.to("#bigTag", { x: -1600, duration: 0.4, ease: "power4.in" }, 10.35);
  tl.to("#scrRes", { x: -366, duration: 0.36, ease: "power4.in" }, 10.45);
  tl.set("#scrList", { opacity: 1 }, 10.68);
  tl.to("#scrList", { x: 0, duration: 0.5, ease: "power4.out" }, 10.68);
  tl.set("#scrRes", { opacity: 0 }, 10.82);
  tl.to("#phoneMove", { scale: 1, duration: 0.5, ease: "power3.inOut" }, 10.45);
  tl.to("#cap3", { x: -1500, duration: 0.38, ease: "power4.in" }, 10.45);
  tl.to("#cap4", { x: 0, duration: 0.6, ease: "power4.out" }, 10.75);
  rise("#c4-w1", 10.8, 110);
  rise("#c4-w2", 10.94, 110);
  bar("#c4-bar", 11.35);

  // ---------- 4 · SAVINGS (10.7 to 13.9) ----------
  all(".item").forEach((it, i) => {
    const at = 11.1 + i * 0.16;
    tl.to(it.querySelector(".box"), { backgroundColor: "#16A870", borderColor: "#16A870", duration: 0.12 }, at);
    tl.to(it.querySelector(".box svg"), { scale: 1, duration: 0.3, ease: "back.out(2.5)" }, at);
    tl.to(it.querySelector(".strike"), { scaleX: 1, duration: 0.25, ease: "power2.out" }, at + 0.05);
    tl.to(it.querySelector(".i-name"), { color: "#707070", duration: 0.2 }, at + 0.05);
  });
  tl.set("#saveCard", { opacity: 1 }, 12.05);
  tl.fromTo("#saveCard", { y: 520, rotation: 4 }, { y: 0, rotation: 0, duration: 0.6, ease: "power4.out", immediateRender: false }, 12.05);
  const money = { v: 0 };
  const num = $("#saveNum");
  tl.fromTo(money, { v: 0 }, {
    v: 12.6, duration: 0.85, ease: "power2.out",
    onUpdate: () => { num.textContent = "$" + money.v.toFixed(2); },
  }, 12.35);
  tl.fromTo("#saveNum", { scale: 0.8 }, { scale: 1, duration: 0.85, ease: "power2.out", immediateRender: false }, 12.35);
  tl.to("#saveNum", { scale: 1.1, duration: 0.1, ease: "power2.out" }, 13.2);
  tl.to("#saveNum", { scale: 1, duration: 0.3, ease: "back.out(2)" }, 13.3);
  // card drops away to reveal the scan button
  tl.to("#saveCard", { y: 900, duration: 0.3, ease: "power4.in" }, 13.45);

  // ---------- 5 · CTA (13.9 to 18) ----------
  // the red scan button is pressed, and its colour floods the frame
  tl.to("#scanFace", { y: 4, duration: 0.07, ease: "power2.in" }, 13.72);
  tl.to("#scanFace", { y: 0, duration: 0.2, ease: "back.out(2)" }, 13.8);
  tl.fromTo("#burst", { scale: 0 }, { scale: burstAt.s, duration: 0.6, ease: "power3.in", immediateRender: false }, 13.9);
  tl.to("#ctaDots", { opacity: 1, duration: 0.4 }, 14.45);
  tl.set("#appIcon", { opacity: 1 }, 14.45);
  tl.fromTo("#appIcon", { scale: 0, rotation: -14 }, { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(1.7)", immediateRender: false }, 14.45);
  all("#wordmark .ch").forEach((c, i) => rise(c, 14.72 + i * 0.05, 170));
  all("#tagline .tw").forEach((c, i) => rise(c, 15.15 + i * 0.16, 80));
  tl.set("#playWrap", { opacity: 1 }, 15.7);
  tl.fromTo("#playWrap", { y: 140 }, { y: 0, duration: 0.6, ease: "power4.out", immediateRender: false }, 15.7);
  tl.to("#playWrap", { scale: 0.93, duration: 0.08, ease: "power2.in" }, 16.55);
  tl.to("#playWrap", { scale: 1, duration: 0.4, ease: "back.out(2.2)" }, 16.63);
  tl.fromTo("#ctaInner", { scale: 1 }, { scale: 1.035, duration: 3.5, ease: "none" }, 14.5);

  window.__timelines["main"] = tl;
})();
