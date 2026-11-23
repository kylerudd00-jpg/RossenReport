/* Rossen Reports: cartoon Jeff on the website.
 *
 * Jeff is the same jointed paper-cutout puppet as the social videos (cut from the approved reference art:
 * head, torso, two arms, two legs, each turning on its own pivot; see art/jeff.json). Every pose is drawn
 * live on a canvas, so the art stays crisp at any size and the whole thing weighs ~55 KB.
 *
 * Four gags, each one explains or confirms something (the site's motion rule):
 *   1. ZIP LINE  - Jeff rides the double rule under the hero, once, when it scrolls into view.
 *   2. RECEIPT   - after the receipt prints, Jeff pops up with a giant pencil and circles "25+". He stays.
 *   3. CLIP THIS - Jeff walks a dashed coupon line above "Clip this. Save all year." and cuts it. He stays.
 *   4. YOU'RE IN - when a signup succeeds, Jeff pops up next to the confirmation with a thumbs up.
 *
 * Motion only runs when <html> has the site's `motion` class (prefers-reduced-motion: no-preference).
 * Without it, gags 2-4 are drawn in their final, still state and the zip line is skipped.
 * Every canvas is aria-hidden and ignores the pointer; nothing on the page depends on this script.
 *
 * Usage: <script defer src="jeff/jeff-puppet.js" data-art="jeff/"></script>  plus jeff/jeff-puppet.css
 * Turn a gag off: data-gags="zip,receipt,cut,thumb" (list only the ones you want).
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var ART = (script && script.getAttribute('data-art')) || 'jeff/';
  var GAGS = ((script && script.getAttribute('data-gags')) || 'zip,receipt,cut,thumb').split(/[\s,]+/);
  var MOTION = document.documentElement.classList.contains('motion');
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var TAU = Math.PI * 2;
  // inks from the site (and the animation kit): press black, logo yellow, receipt pencil, die-cut cream
  var INK = '#1d1b1f', YEL = '#F8D000', CREAM = '#f8f2e4', GRAPHITE = '#3a3d45', STEEL = '#c9ccd3';

  var J = null, IMG = {};
  function load() {
    if (load.p) return load.p;
    load.p = fetch(ART + 'jeff.json').then(function (r) { return r.json(); }).then(function (j) {
      J = j;
      return Promise.all(Object.keys(j.parts).map(function (k) {
        return new Promise(function (res, rej) {
          var im = new Image(); im.decoding = 'async';
          im.onload = function () { IMG[k] = im; res(); }; im.onerror = rej; im.src = ART + 'jeff-' + k + '.webp';
        });
      }));
    });
    return load.p;
  }

  // ---------- small maths ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function easeInOut(u) { return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  function rot(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; }
  function len(v) { return Math.hypot(v[0], v[1]); }
  function norm(v) { var l = len(v) || 1; return [v[0] / l, v[1] / l]; }

  // ---------- the puppet (rig units = the cut art at jeff.json's scale) ----------
  function restHand() { var p = J.parts.armR.pivot; return [J.hand[0] - p[0], J.hand[1] - p[1]]; }
  function handAt(a) { var p = J.parts.armR.pivot, v = rot(restHand(), a); return [p[0] + v[0], p[1] + v[1]]; }
  function armToward(dir) { var h = restHand(); return Math.atan2(dir[1], dir[0]) - Math.atan2(h[1], h[0]); }
  // pose: head, armL (mic arm), armR (free arm), legL, legR in radians; bob in rig units
  function drawRig(c, p) {
    c.save(); c.translate(0, -(p.bob || 0));
    if (p.sy) { c.translate(J.feet[0], J.feet[1]); c.scale(1, p.sy); c.translate(-J.feet[0], -J.feet[1]); }   // breathing
    function part(k, a) {
      var m = J.parts[k], px = m.pivot[0], py = m.pivot[1];
      c.save(); c.translate(px, py); c.rotate(a || 0); c.translate(-px, -py); c.drawImage(IMG[k], m.x, m.y, m.w, m.h); c.restore();
    }
    part('legL', p.legL); part('legR', p.legR);
    part('torso'); part('armR', p.armR);
    var pv = J.parts.armR.pivot;   // the yellow split pin at the shoulder, as in the films
    c.fillStyle = YEL; c.beginPath(); c.arc(pv[0], pv[1], 3.8, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
    part('armL', p.armL); part('head', p.head);
    c.restore();
  }

  // A sticker is Jeff (plus a prop) drawn on his own canvas, given a thin cream die-cut edge (like the loop
  // videos) so he reads on newsprint, yellow and navy alike, then stamped onto the stage.
  function Sticker(R) { this.R = R; this.a = document.createElement('canvas'); this.b = document.createElement('canvas'); }
  // o: s (css px per rig unit), at [x,y] css px on the stage, anchor [x,y] rig, rot, flip, pose, prop(c) in rig space
  Sticker.prototype.draw = function (ctx, o) {
    var R = this.R, k = o.s * DPR, n = Math.max(2, Math.ceil(2 * R * k)), a = this.a, b = this.b;
    if (a.width !== n) { a.width = a.height = b.width = b.height = n; }
    var c = a.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, n, n);
    c.setTransform(k, 0, 0, k, R * k, R * k); c.rotate(o.rot || 0); if (o.flip) c.scale(-1, 1);
    c.translate(-o.anchor[0], -o.anchor[1]);
    var bob = (o.pose && o.pose.bob) || 0;
    drawRig(c, o.pose || {});
    if (o.prop) { c.translate(0, -bob); o.prop(c); }
    var g = b.getContext('2d'), r = 2 * DPR;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n); g.globalCompositeOperation = 'source-over';
    for (var i = 0; i < 10; i++) { var t = i / 10 * TAU; g.drawImage(a, Math.cos(t) * r, Math.sin(t) * r); }
    g.globalCompositeOperation = 'source-in'; g.fillStyle = CREAM; g.fillRect(0, 0, n, n); g.globalCompositeOperation = 'source-over';
    var x = o.at[0] - R * o.s, y = o.at[1] - R * o.s, w = 2 * R * o.s;
    ctx.save(); ctx.globalAlpha = .28; ctx.filter = 'blur(' + (3 * DPR) + 'px)';   // a soft drop shadow, like the receipt's
    ctx.drawImage(b, x + 3, y + 5, w, w); ctx.restore();
    ctx.drawImage(b, x, y, w, w); ctx.drawImage(a, x, y, w, w);
  };
  // stage point -> rig point for a sticker placed with o (inverse of the transform above)
  function toRig(o, P) {
    var v = [(P[0] - o.at[0]) / o.s, (P[1] - o.at[1]) / o.s]; v = rot(v, -(o.rot || 0)); if (o.flip) v[0] = -v[0];
    return [v[0] + o.anchor[0], v[1] + o.anchor[1]];
  }
  function toStage(o, Q) {
    var v = [Q[0] - o.anchor[0], Q[1] - o.anchor[1]]; if (o.flip) v[0] = -v[0]; v = rot(v, o.rot || 0);
    return [o.at[0] + v[0] * o.s, o.at[1] + v[1] * o.s];
  }

  // ---------- props, printed like the films: flat ink, black keyline, a touch off register ----------
  function poly(c, pts) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); }
  function inked(c, pts, col, kw) {
    c.save(); c.translate(1.6, -1.2); poly(c, pts); c.fillStyle = col; c.fill(); c.restore();   // colour prints off register
    poly(c, pts); c.lineWidth = kw || 3; c.lineJoin = 'round'; c.strokeStyle = INK; c.stroke();
  }
  // giant pencil along unit u from hand: `back` behind the fist, `front` to the graphite tip
  function pencil(c, hand, u, front, back) {
    var nx = -u[1], ny = u[0], w = 13;
    function P(along, across) { return [hand[0] + u[0] * along + nx * across, hand[1] + u[1] * along + ny * across]; }
    var cone = 46, wood = front - cone;
    inked(c, [P(-back + 26, -w), P(wood, -w), P(wood, w), P(-back + 26, w)], YEL);                    // hexagonal body
    c.save(); c.strokeStyle = 'rgba(29,27,31,.35)'; c.lineWidth = 2; c.beginPath(); var a = P(-back + 30, -w * .3), b = P(wood - 4, -w * .3); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.restore();
    inked(c, [P(-back + 8, -w), P(-back + 26, -w), P(-back + 26, w), P(-back + 8, w)], STEEL);        // ferrule
    inked(c, [P(-back, -w + 2), P(-back + 8, -w), P(-back + 8, w), P(-back, w - 2)], '#f29aa6');       // eraser
    inked(c, [P(wood, -w), P(front - 10, -3.5), P(front - 10, 3.5), P(wood, w)], '#f0d3a2');           // shaved wood
    inked(c, [P(front - 12, -4.5), P(front, 0), P(front - 12, 4.5)], GRAPHITE, 2.4);                  // graphite
  }
  // giant scissors: screw at hand + 34u, blades forward (`open` 0..1), yellow finger loops back at the fist
  function scissors(c, hand, u, open) {
    var piv = [hand[0] + u[0] * 34, hand[1] + u[1] * 34], a = .32 * open;
    [-1, 1].forEach(function (sd) {
      var d = rot(u, sd * a), n = [-d[1], d[0]], L = 120;
      inked(c, [[piv[0] + n[0] * 6 * sd, piv[1] + n[1] * 6 * sd], [piv[0] + d[0] * L, piv[1] + d[1] * L], [piv[0] - n[0] * 7 * sd + d[0] * 18, piv[1] - n[1] * 7 * sd + d[1] * 18]], STEEL, 2.6);
      var bd = rot([-u[0], -u[1]], -sd * (a + .38)), cx = piv[0] + bd[0] * 40, cy = piv[1] + bd[1] * 40;
      c.save(); c.translate(1.6, -1.2); c.strokeStyle = YEL; c.lineWidth = 9; c.beginPath(); c.ellipse(cx, cy, 15, 11, Math.atan2(bd[1], bd[0]), 0, TAU); c.stroke(); c.restore();
      c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.ellipse(cx, cy, 19.5, 15.5, Math.atan2(bd[1], bd[0]), 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(cx, cy, 10.5, 6.5, Math.atan2(bd[1], bd[0]), 0, TAU); c.stroke();
    });
    c.fillStyle = INK; c.beginPath(); c.arc(piv[0], piv[1], 5, 0, TAU); c.fill(); c.fillStyle = YEL; c.beginPath(); c.arc(piv[0], piv[1], 2, 0, TAU); c.fill();
    return [piv[0] + u[0] * 120, piv[1] + u[1] * 120];
  }
  // a thumb printed like his hands: orange stock, red halftone, red off-register shadow, no keyline
  function thumb(c, hand, up) {
    var r = 7.5, a = [hand[0] + up[0] * 8, hand[1] + up[1] * 8], b = [a[0] + up[0] * 21, a[1] + up[1] * 21];
    function cap() { c.beginPath(); c.lineCap = 'round'; c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.save(); c.translate(1.8, 1.4); cap(); c.strokeStyle = '#e2553b'; c.lineWidth = 2 * r; c.globalAlpha = .75; c.stroke(); c.restore();
    cap(); c.strokeStyle = '#f4a46d'; c.lineWidth = 2 * r; c.stroke();
    c.fillStyle = 'rgba(220,79,55,.55)';
    for (var i = 0; i <= 4; i++) { var q = i / 4, x = lerp(a[0], b[0], q), y = lerp(a[1], b[1], q); c.beginPath(); c.arc(x + 1.5, y, 1.1, 0, TAU); c.fill(); c.beginPath(); c.arc(x - 2.5, y + 1.5, .9, 0, TAU); c.fill(); }
  }

  // ---------- stage: a canvas laid over part of the page ----------
  function Stage(host, place, cls) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var cv = document.createElement('canvas'); cv.className = 'jeff-stage ' + (cls || ''); cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    this.host = host; this.cv = cv; this.ctx = cv.getContext('2d'); this.place = place; this.resize();
  }
  Stage.prototype.resize = function () {
    var r = this.place(this.host), cv = this.cv;
    cv.style.left = r.left + 'px'; cv.style.top = r.top + 'px'; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR);
    this.w = r.width; this.h = r.height;
  };
  Stage.prototype.clear = function () { var c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); c.setTransform(DPR, 0, 0, DPR, 0, 0); };
  Stage.prototype.rectOf = function (el) {   // an element's box in stage coordinates
    var a = el.getBoundingClientRect(), b = this.cv.getBoundingClientRect();
    // rossenreports.com renders desktop at CSS zoom .9: client rects come back in zoomed px while the
    // canvas draws in layout px, so divide by the rendered/layout ratio (1 when nothing is zoomed).
    var k = (this.w && b.width) ? b.width / this.w : 1;
    var x = (a.left - b.left) / k, y = (a.top - b.top) / k, w = a.width / k, h = a.height / k;
    return { x: x, y: y, w: w, h: h, r: x + w, b: y + h, cx: x + w / 2, cy: y + h / 2 };
  };

  function play(step) {   // step(t seconds, dt) returns false when done
    var t0 = null, last = 0;
    function f(now) { if (t0 === null) { t0 = now; last = now; } var t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now; if (step(t, dt) !== false) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }
  function whenVisible(el, margin, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(); } }); }, { rootMargin: margin || '0px 0px -12% 0px' });
    io.observe(el);
  }
  var resizers = [];
  var rT; window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { resizers.forEach(function (f) { f(); }); }, 120); });

  // ================= 1. ZIP LINE across the rule under the hero =================
  function gagZip() {
    var host = document.querySelector('.circular'); if (!host || !MOTION) return;
    var ABOVE = 40, BELOW = 170;
    var st = new Stage(host, function (h) { return { left: 0, top: -ABOVE, width: h.clientWidth, height: ABOVE + BELOW }; }, 'jeff-zip');
    var sk = new Sticker(430), done = false;
    resizers.push(function () { st.resize(); if (done) st.clear(); });
    whenVisible(host, '0px 0px -10% 0px', function () {
      var wait = Math.max(0, 1400 - performance.now());   // let the hero's own entrance finish first
      setTimeout(function () { load().then(run); }, wait + 350);
    });
    function run() {
      // Round trip (owner, Nov 23): left to right, a short turnaround just past the right edge, then back
      // right to left. Near-constant speed so he is only off screen for moments: ~0.3 s entering, ~1 s at
      // the turnaround, ~0.3 s leaving.
      var s = st.w < 600 ? .25 : .34, W = st.w, strap = 70 * s;
      var LEG = W < 600 ? 3.6 : 4.8, TURN = .45, M = W < 600 ? 95 : 130;   // seconds per leg, pause, off-screen margin
      var X0 = -M, X1 = W + M, phi = 0, dphi = 0, xPrev = null, vPrev = 0;
      var armR = -2.5;   // free hand up and out to the side, gripping the bar
      function along(u) { return .88 * u + .12 * easeInOut(u); }   // mostly linear, softened at the ends
      play(function (t, dt) {
        var x, dir;
        if (t < LEG) { x = X0 + (X1 - X0) * along(t / LEG); dir = 1; }
        else if (t < LEG + TURN) { x = X1; dir = -1; }
        else { x = X1 - (X1 - X0) * along(Math.min(1, (t - LEG - TURN) / LEG)); dir = -1; }
        var v = (xPrev === null || !dt) ? 0 : (x - xPrev) / dt; xPrev = x;
        var acc = dt ? (v - vPrev) / dt : 0; vPrev = v;
        // the body swings on the strap like a pendulum: it lags as he speeds up or turns
        var w0 = 3.4; dphi += (-w0 * w0 * phi - 2 * .18 * w0 * dphi + acc / 520) * dt; phi += dphi * dt; phi = clamp(phi, -.6, .6);
        var cable = st.rectOf(host).y + 1.5;
        st.clear(); var c = st.ctx;
        var hand = [x - Math.sin(phi) * strap, cable + 6 + Math.cos(phi) * strap];
        // speed lines trail behind him, whichever way he is going
        var sp = Math.abs(v);
        c.save(); c.strokeStyle = 'rgba(22,24,29,.28)'; c.lineCap = 'round'; c.lineWidth = 2;
        [[26, 70], [52, 48], [78, 60]].forEach(function (q, i) { var y = hand[1] + q[0] * s * 2.2, x0 = hand[0] - dir * (70 * s * 2 + i * 6), l = q[1] * Math.min(1, sp / 500); c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 - dir * l, y); c.stroke(); });
        c.restore();
        // strap from the trolley down to his fist
        c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, cable + 4); c.lineTo(hand[0], hand[1]); c.stroke();
        var kick = Math.sin(t * 9);
        sk.draw(c, { s: s, at: hand, anchor: handAt(armR), rot: dir * -.32 + phi, flip: dir < 0, pose: { armR: armR, armL: 1.55 + .28 * Math.sin(t * 10), legL: .45 + .3 * kick, legR: .25 - .3 * kick, head: -.06 + .05 * Math.sin(t * 5) } });
        // the T-bar in his fist
        var bd = rot([1, 0], phi); c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(hand[0] - bd[0] * 9, hand[1] - bd[1] * 9); c.lineTo(hand[0] + bd[0] * 9, hand[1] + bd[1] * 9); c.stroke();
        // the trolley riding on top of the rule: bracket, wheel, spinning yellow spokes
        c.lineWidth = 3; c.beginPath(); c.moveTo(x, cable - 6); c.lineTo(x, cable + 5); c.stroke();
        c.fillStyle = INK; c.beginPath(); c.arc(x, cable - 6, 7, 0, TAU); c.fill();
        c.strokeStyle = YEL; c.lineWidth = 1.6; var spin = x / 7;
        for (var i = 0; i < 3; i++) { var a = spin + i * TAU / 3; c.beginPath(); c.moveTo(x, cable - 6); c.lineTo(x + Math.cos(a) * 5, cable - 6 + Math.sin(a) * 5); c.stroke(); }
        if (t >= 2 * LEG + TURN) { st.clear(); done = true; return false; }
      });
    }
  }

  // ================= 2. RECEIPT: Jeff circles the total with a giant pencil =================
  function gagReceipt() {
    var host = document.querySelector('.receipts'), tape = host && host.querySelector('.tape'), tot = tape && tape.querySelector('.tot');
    if (!tot) return;
    var target = tot.lastElementChild;
    var st = new Stage(host, function (h) { return { left: 0, top: 0, width: h.clientWidth, height: h.clientHeight }; }, 'jeff-receipt');
    var sk = new Sticker(560), state = null;
    host.classList.add('jeff-receipt-on');
    function geom() {
      st.resize();
      var tr = st.rectOf(tape), g = st.rectOf(target), wide = tr.r + 90 < st.w;
      var s = clamp(tr.w / 390 * .38, .28, .38);
      return {
        s: s, C: [g.cx, g.cy], rx: g.w / 2 + 13, ry: g.h / 2 + 8,
        // wide: beside the receipt, reaching up-left (mirrored so the free arm is on that side);
        // narrow: under it and left of the total, reaching up-right
        F: wide ? [tr.r + 34, tr.b + 64] : [Math.min(tr.r - 105, g.cx - 75), tr.b + 100], flip: wide
      };
    }
    // the hand-drawn loop: a bit more than one turn, wobbly, not quite closing
    function loopPt(G, q) { var th = -.5 - q * TAU * 1.12, k = 1 + .05 * Math.sin(th * 3 + 1.3) + .035 * q; return [G.C[0] + Math.cos(th) * G.rx * k, G.C[1] + Math.sin(th) * G.ry * k]; }
    function render(G, o, tipStage, progress) {
      st.clear(); var c = st.ctx;
      if (progress > 0) {   // graphite on thermal paper: a dark stroke and a lighter grain beside it
        var n = Math.max(2, Math.round(progress * 90));
        [[GRAPHITE, 2.6, 0], ['rgba(58,61,69,.45)', 1.2, .9]].forEach(function (L) {
          c.strokeStyle = L[0]; c.lineWidth = L[1]; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
          for (var i = 0; i <= n; i++) { var p = loopPt(G, progress * i / n); if (i) c.lineTo(p[0] + L[2], p[1] + L[2]); else c.moveTo(p[0] + L[2], p[1] + L[2]); }
          c.stroke();
        });
      }
      if (o) sk.draw(c, o);
    }
    // pose Jeff so the pencil's tip lands on P (stage coords); the pencil slides in his fist a little
    function aim(G, P, at, extra) {
      var o = { s: G.s, at: at, anchor: [357, 376], flip: G.flip, pose: extra.pose };
      var Pr = toRig(o, P), sh = J.parts.armR.pivot, d = [Pr[0] - sh[0], Pr[1] - sh[1]];
      var a = armToward(d), h = handAt(a), u = norm(d), front = clamp(len([Pr[0] - h[0], Pr[1] - h[1]]), 120, 330);
      o.pose.armR = a; o.prop = function (c) { pencil(c, h, u, front, 92); };
      return o;
    }
    function finalPose(G) {
      var o = { s: G.s, at: G.F, anchor: [357, 376], flip: G.flip, pose: { armL: .1, head: .04 } };
      var a = -2.85, h = handAt(a), u = norm(rot(restHand(), a));
      o.pose.armR = a; o.prop = function (c) { pencil(c, h, u, 170, 92); };
      return o;
    }
    function still() { var G = geom(); render(G, finalPose(G), null, 1); }
    resizers.push(function () { if (state === 'done') still(); else st.resize(); });
    if (!MOTION) { load().then(still); return; }
    // start when the receipt has printed (the site arms .tape and adds .in; its print takes ~1.65 s)
    function armed() { return !tape.classList.contains('armed') || tape.classList.contains('in'); }
    whenVisible(tape, '0px 0px -15% 0px', function () {
      load().then(function () {
        (function wait() { if (!armed()) return setTimeout(wait, 120); setTimeout(run, tape.classList.contains('in') ? 1750 : 300); })();
      });
    });
    function run() {
      state = 'run';
      var G = geom(), start = loopPt(G, 0);
      play(function (t) {
        G = geom();
        var pop = easeOutBack(seg(t, 0, .55)), at = [G.F[0], G.F[1] + (1 - pop) * 150 * G.s];
        var breathe = 1 + .012 * Math.sin(t * 3.1);
        var prog = seg(t, .9, 2.35), P, o;
        if (t < 2.35) {
          P = t < .9 ? lerp2(add(start, [G.flip ? 26 : -26, 22]), start, easeInOut(seg(t, .45, .9))) : loopPt(G, prog);
          var lean = [(P[0] - G.C[0]) * .35, (P[1] - G.C[1]) * .25];
          o = aim(G, P, [at[0] + lean[0], at[1] + lean[1] * .3], { pose: { armL: .1 + .06 * Math.sin(t * 7), head: -.08 + .05 * Math.sin(t * 6), bob: Math.abs(Math.sin(t * 7)) * 3 } });
        } else {
          // tap, then lower the pencil and settle (overshoot a touch, as every stop does in the films)
          var u2 = easeOutBack(seg(t, 2.45, 2.95)), F = finalPose(G);
          var aimO = aim(G, loopPt(G, 1), G.F, { pose: { armL: .1, head: .04 } });
          var a = lerp(aimO.pose.armR, F.pose.armR, u2), h = handAt(a), uu = norm(rot(restHand(), a));
          o = { s: G.s, at: G.F, anchor: [357, 376], flip: G.flip, pose: { armR: a, armL: .1, head: lerp(-.08, .04, u2), bob: (t < 2.45 ? Math.abs(Math.sin((t - 2.35) * 30)) * 3 : 0) } };
          o.prop = function (c) { pencil(c, h, uu, 170, 92); };
        }
        o.pose.sy = breathe;
        render(G, o, null, prog);
        if (t > 3.05) { state = 'done'; still(); return false; }
      });
    }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
    function lerp2(a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; }
  }

  // ================= 3. CLIP THIS: Jeff cuts the coupon line =================
  function gagCut() {
    var host = document.querySelector('.closer'); if (!host) return;
    var strip = document.createElement('div'); strip.className = 'jeff-cut'; strip.setAttribute('aria-hidden', 'true');
    host.insertBefore(strip, host.firstChild); host.classList.add('jeff-cut-on');
    var st = new Stage(strip, function (h) { return { left: 0, top: 0, width: h.clientWidth, height: h.clientHeight }; }, 'jeff-cutline');
    var sk = new Sticker(540), state = null;
    function geom() {
      st.resize();
      var wrap = host.querySelector('.wrap'), pad = wrap ? parseFloat(getComputedStyle(wrap).paddingLeft) + Math.max(0, (st.w - wrap.clientWidth) / 2) : 24;
      return { s: st.w < 600 ? .26 : .36, x0: pad, x1: st.w - pad, y: st.h - 36 };
    }
    function line(c, G, cutTo) {
      c.save(); c.lineWidth = 2;
      if (cutTo > G.x0) {   // the cut: a clean dark slit with a paper-light edge under it
        c.strokeStyle = '#020b20'; c.beginPath(); c.moveTo(G.x0, G.y); c.lineTo(Math.min(cutTo, G.x1), G.y); c.stroke();
        c.strokeStyle = 'rgba(244,239,227,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(G.x0, G.y + 2); c.lineTo(Math.min(cutTo, G.x1), G.y + 2); c.stroke();
      }
      if (cutTo < G.x1) { c.strokeStyle = 'rgba(244,239,227,.6)'; c.lineWidth = 2; c.setLineDash([9, 7]); c.beginPath(); c.moveTo(Math.max(cutTo, G.x0), G.y); c.lineTo(G.x1, G.y); c.stroke(); }
      c.restore();
    }
    function pose(G, X, t, walking, open) {
      var step = walking ? Math.sin(t * TAU * 1.7) : 0, dir = norm([1, .1]), a = armToward(dir), h = handAt(a);
      var o = { s: G.s, at: [X, G.y], anchor: [h[0] + dir[0] * 154, h[1] + dir[1] * 154], pose: { armR: a, armL: walking ? -.12 * step : 0, legL: .38 * step, legR: -.38 * step, head: .04 * step, bob: Math.abs(step) * 5 } };
      o.prop = function (c) { scissors(c, h, dir, open); };
      return o;   // anchored at the blade tips, which ride the line
    }
    // With the page's cut-off flap (data-flap on .closer), the flap's edge is the cut, so don't draw the line.
    function still() { var G = geom(); st.clear(); if (!host.hasAttribute('data-flap')) line(st.ctx, G, G.x1); sk.draw(st.ctx, pose(G, G.x1, 0, false, .15)); }
    resizers.push(function () { if (state === 'done') still(); else if (state === null) { var G = geom(); st.clear(); line(st.ctx, G, G.x0); } });
    // hook for the 'cut-off flap' upgrade (README): fires once the coupon line is fully cut
    // lineY is read from the current stage size, not geom(): geom() resizes the canvas, which wiped the
    // finished cut and Jeff the moment this fired.
    function cutDone(isStill) { host.classList.add('jeff-cut-done'); host.dispatchEvent(new CustomEvent('jeff:cut', { bubbles: true, detail: { still: isStill, lineY: st.h - 36, strip: strip } })); }
    if (!MOTION) { load().then(function () { still(); cutDone(true); }); return; }
    var G0 = geom(); st.clear(); line(st.ctx, G0, G0.x0);
    whenVisible(strip, '0px 0px -18% 0px', function () { load().then(run); });
    function run() {
      state = 'run';
      var G = geom(), speed = G.s * 900, T = (G.x1 - G.x0 + 120) / speed;
      play(function (t) {
        G = geom();
        var X = lerp(G.x0 - 120, G.x1, Math.min(1, t / T)), walking = t < T, snip = .5 + .5 * Math.cos(t * TAU * 3.4);
        if (!walking) snip = 1 - seg(t, T, T + .25) * .85;
        st.clear(); line(st.ctx, G, X);
        sk.draw(st.ctx, pose(G, X, t, walking, walking ? snip : snip));
        if (t > T + .3) { state = 'done'; still(); cutDone(false); return false; }
      });
    }
  }

  // ================= 4. YOU'RE IN: a thumbs up next to every signup confirmation =================
  function gagThumb() {
    var dones = document.querySelectorAll('.signup-done'); if (!dones.length) return;
    function pop(el) {
      if (el.querySelector('.jeff-thumb')) return;
      var box = document.createElement('span'); box.className = 'jeff-thumb'; box.setAttribute('aria-hidden', 'true'); el.appendChild(box);
      load().then(function () {
        var st = new Stage(box, function (h) { return { left: 0, top: 0, width: h.clientWidth, height: h.clientHeight }; }, '');
        var sk = new Sticker(300), s = st.h / 300;
        function frame(t) {
          var u = MOTION ? easeOutBack(seg(t, 0, .5)) : 1, pump = MOTION ? Math.sin(seg(t, .5, 1.4) * TAU * 2) * (1 - seg(t, .5, 1.4)) : 0;
          var a = -2.3 + .22 * pump, h = handAt(a);
          st.clear();
          sk.draw(st.ctx, { s: s, at: [st.w * .5, st.h + 4 + (1 - u) * st.h], anchor: [357, 275], pose: { armR: a, armL: .05, head: -.05 * pump }, prop: function (c) { thumb(c, h, norm([.25, -1])); } });
        }
        if (!MOTION) { frame(9); return; }
        play(function (t) { frame(t); return t < 1.5; });
      });
    }
    Array.prototype.forEach.call(dones, function (el) {
      if (!el.hidden) pop(el);
      new MutationObserver(function () { if (!el.hidden) pop(el); }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  function init() {
    if (!window.CanvasRenderingContext2D || !window.fetch) return;
    var on = function (k) { return GAGS.indexOf(k) >= 0; };
    try { if (on('zip')) gagZip(); } catch (e) { console.warn('jeff zip', e); }
    try { if (on('receipt')) gagReceipt(); } catch (e) { console.warn('jeff receipt', e); }
    try { if (on('cut')) gagCut(); } catch (e) { console.warn('jeff cut', e); }
    try { if (on('thumb')) gagThumb(); } catch (e) { console.warn('jeff thumb', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
