const path = require("path");
const { chromium } = require("C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright");
const FILE = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));

let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; } else { F++; console.log("  ✗ " + m); } };

async function fps(p, ms) {
  return await p.evaluate(async (ms) => {
    let n = 0; const t0 = performance.now();
    await new Promise(res => {
      function tick() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(); }
      requestAnimationFrame(tick);
    });
    return n / ((performance.now() - t0) / 1000);
  }, ms);
}

async function autoPlay(p, maxMs) {
  return await p.evaluate(async (ms) => {
    const G = window.__game, VF = G.VF;
    const t0 = performance.now();
    return await new Promise(res => {
      function tick() {
        const st = G.st;
        if (!st || st.phase !== "play" || performance.now() - t0 > ms) return res();
        let best = null, bp = -1;
        for (const o of st.world.objs) {
          if (o.used || o.passed) continue;
          const q = VF.objPos(o, st.camX), ahead = q.x - VF.W / 2;
          if (ahead < -220 || ahead > 1100) continue;
          if (VF.occluded(st, o, q)) continue;
          const pr = o.K.v / (1 + Math.max(0, ahead) / 300);
          if (pr > bp) { bp = pr; best = o; }
        }
        if (best) { const id = VF.idealFor(best); G.setZoom(id.z); G.setFcy(id.fcy); }
        if (st.live && st.live.s > 0.9 && st.film > 0) G.shoot();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, maxMs);
}

(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"] });

  // ============ 桌面 ============
  const c1 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c1.newPage();
  const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  p.on("pageerror", e => errs.push(String(e)));
  await p.goto(FILE); await sleep(700);
  await p.evaluate(() => { try { localStorage.removeItem("vf290save"); } catch (e) { } });
  await p.reload(); await sleep(700);

  ok(await p.evaluate(() => !!window.__game && !!window.__game.st), "游戏实例已暴露");
  ok(errs.length === 0, "无控制台错误: " + errs.join(" | "));

  // 画布缓冲 >= CSS 尺寸
  const dim = await p.evaluate(() => {
    const cv = window.__game.cv, r = cv.getBoundingClientRect();
    return { bw: cv.width, bh: cv.height, cw: r.width, ch: r.height, eff: window.__game.eff };
  });
  ok(dim.bw >= Math.round(dim.cw) && dim.bh >= Math.round(dim.ch), "缓冲 >= CSS 尺寸 " + JSON.stringify(dim));

  // 四视口：等比缩放 + 水平居中
  for (const vp of [[1280, 900], [1024, 700], [820, 1180], [390, 844]]) {
    await p.setViewportSize({ width: vp[0], height: vp[1] });
    await sleep(260);
    const r = await p.evaluate(() => {
      const s = window.__game.stage, b = s.getBoundingClientRect();
      return { w: b.width, h: b.height, cx: b.left + b.width / 2, vw: innerWidth, vh: innerHeight };
    });
    const kx = r.w / 480, ky = r.h / 800;
    ok(Math.abs(kx - ky) < 0.004, vp.join("x") + " 等比缩放 " + kx.toFixed(4) + "/" + ky.toFixed(4));
    ok(Math.abs(r.cx - r.vw / 2) < 1.5, vp.join("x") + " 水平居中");
    ok(kx > 0 && r.w <= r.vw + 1 && r.h <= r.vh + 1, vp.join("x") + " 不溢出");
  }
  await p.setViewportSize({ width: 1280, height: 900 }); await sleep(250);

  // 静音按钮在遮罩之上可点
  ok(await p.evaluate(() => {
    const el = document.getElementById("bMute");
    return getComputedStyle(el).pointerEvents === "auto" && +getComputedStyle(el).zIndex >= 60;
  }), "静音按钮 pointer-events:auto 且 z-index >= 60");
  await p.click("#bMute"); await sleep(120);
  ok(await p.evaluate(() => window.__game.save.muted === true), "静音点击生效并写入存档");
  await p.click("#bMute"); await sleep(120);
  ok(await p.evaluate(() => window.__game.save.muted === false), "再点取消静音");

  // 选关页
  await p.click("#bSel"); await sleep(260);
  ok(await p.evaluate(() => document.querySelectorAll("#grid .card").length === 8), "选关页 8 张卡");
  ok(await p.evaluate(() => document.querySelectorAll("#grid .card.lock").length === 7), "仅第 1 关解锁");
  await p.click("#grid .card[data-i='0']"); await sleep(400);
  ok(await p.evaluate(() => window.__game.mode === "play"), "进入关卡");

  // 方向键：A/D 变焦，W/S 升降
  const z0 = await p.evaluate(() => window.__game.st.z);
  await p.keyboard.down("d"); await sleep(420); await p.keyboard.up("d"); await sleep(60);
  const z1 = await p.evaluate(() => window.__game.st.z);
  ok(z1 > z0 + 0.05, "D 放大（z " + z0.toFixed(3) + " → " + z1.toFixed(3) + "）");
  await p.keyboard.down("a"); await sleep(420); await p.keyboard.up("a"); await sleep(60);
  const z2 = await p.evaluate(() => window.__game.st.z);
  ok(z2 < z1 - 0.05, "A 缩小");
  // ← / → 与 A / D 结构化等价（键位映射严格一致 + 同向 + 反向抵消）
  const map = await p.evaluate(() => {
    const k = window.__game.keyOf;
    return {
      R: k({ code: "ArrowRight", key: "ArrowRight" }), D: k({ code: "KeyD", key: "d" }), Dk: k({ code: "", key: "D" }),
      L: k({ code: "ArrowLeft", key: "ArrowLeft" }), A: k({ code: "KeyA", key: "a" }),
      U: k({ code: "ArrowUp", key: "ArrowUp" }), W: k({ code: "KeyW", key: "w" }),
      Dn: k({ code: "ArrowDown", key: "ArrowDown" }), S: k({ code: "KeyS", key: "s" }),
      SP: k({ code: "Space", key: " " })
    };
  });
  ok(map.R === "R" && map.D === "R" && map.Dk === "R", "→ ≡ D ≡ → (R)");
  ok(map.L === "L" && map.A === "L", "← ≡ A (L)");
  ok(map.U === "U" && map.W === "U", "↑ ≡ W (U)");
  ok(map.Dn === "D" && map.S === "D", "↓ ≡ S (D)");
  ok(map.SP === "S", "空格 = 快门");
  // 按下真实按键后 keys 标记一致
  await p.keyboard.down("ArrowRight"); await sleep(60);
  const kR = await p.evaluate(() => Object.keys(window.__game.keys).filter(k => window.__game.keys[k]));
  await p.keyboard.up("ArrowRight"); await sleep(60);
  await p.keyboard.down("d"); await sleep(60);
  const kD = await p.evaluate(() => Object.keys(window.__game.keys).filter(k => window.__game.keys[k]));
  await p.keyboard.up("d"); await sleep(60);
  ok(JSON.stringify(kR) === JSON.stringify(kD) && kR.join() === "R", "真实按键 → 同一输入位 " + JSON.stringify(kR));
  // 反向键严格抵消（同一事件循环内同时按下，中间不能插帧）
  await p.evaluate(() => window.__game.setZoom(0.5));
  await p.evaluate(() => {
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a" }));
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d" }));
  });
  await sleep(420);
  const zBoth = await p.evaluate(() => window.__game.st.z);
  await p.evaluate(() => {
    dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA", key: "a" }));
    dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d" }));
  });
  await sleep(60);
  ok(Math.abs(zBoth - 0.5) < 1e-9, "A+D 同时按下严格抵消 (z=" + zBoth + ")");

  await p.evaluate(() => { window.__game.setZoom(0.2); window.__game.setFcy(400); });
  await p.keyboard.down("w"); await sleep(300); await p.keyboard.up("w"); await sleep(60);
  const yW = await p.evaluate(() => window.__game.st.fcy);
  await p.evaluate(() => { window.__game.setZoom(0.2); window.__game.setFcy(400); });
  await p.keyboard.down("s"); await sleep(300); await p.keyboard.up("s"); await sleep(60);
  const yS = await p.evaluate(() => window.__game.st.fcy);
  ok(yW < 400, "W 上移 (" + yW.toFixed(1) + ")");
  ok(yS > 400, "S 下移 (" + yS.toFixed(1) + ")");
  await p.evaluate(() => { window.__game.setZoom(0.2); window.__game.setFcy(400); });
  await p.evaluate(() => {
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w" }));
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s" }));
  });
  await sleep(320);
  const yBoth = await p.evaluate(() => window.__game.st.fcy);
  await p.evaluate(() => {
    dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w" }));
    dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS", key: "s" }));
  });
  await sleep(60);
  ok(Math.abs(yBoth - 400) < 1e-9, "W+S 同时按下严格抵消 (fcy=" + yBoth + ")");

  // 空景按快门不消耗胶片
  await p.evaluate(() => { window.__game.setZoom(0.02); window.__game.setFcy(760); });
  await sleep(200);
  const before = await p.evaluate(() => ({ f: window.__game.st.film, s: window.__game.st.score }));
  await p.keyboard.press("Space"); await sleep(150);
  const after = await p.evaluate(() => ({ f: window.__game.st.film, s: window.__game.st.score }));
  ok(after.f === before.f && after.s === before.s, "空景/低分按快门不消耗胶片也不计分");

  // 有效拍摄
  const shotOk = await p.evaluate(async () => {
    const G = window.__game, VF = G.VF, st = G.st;
    for (let i = 0; i < 400; i++) {
      let best = null, bp = -1;
      for (const o of st.world.objs) {
        if (o.used || o.passed) continue;
        const q = VF.objPos(o, st.camX), ahead = q.x - VF.W / 2;
        if (ahead < -60 || ahead > 400) continue;
        if (VF.occluded(st, o, q)) continue;
        if (o.K.v > bp) { bp = o.K.v; best = o; }
      }
      if (best) { const id = VF.idealFor(best); G.setZoom(id.z); G.setFcy(id.fcy); }
      if (st.live && st.live.s > 0.9) {
        const f0 = st.film, s0 = st.score;
        G.shoot();
        return { dFilm: f0 - st.film, dScore: st.score - s0, n: st.shots.length,
          thumbs: document.querySelectorAll("#album .thumb").length };
      }
      await new Promise(r => setTimeout(r, 25));
    }
    return null;
  });
  ok(shotOk && shotOk.dFilm === 1, "有效拍摄消耗 1 张胶片 " + JSON.stringify(shotOk));
  ok(shotOk && shotOk.dScore > 0, "有效拍摄加分");
  ok(shotOk && shotOk.thumbs >= 1, "相册缩略图 +1");

  const f1 = await fps(p, 2000);
  ok(f1 > 52, "桌面 fps " + f1.toFixed(1));

  // 整局跑完 → 结算
  await autoPlay(p, 60000);
  await sleep(500);
  const end = await p.evaluate(() => ({
    phase: window.__game.st.phase,
    ov: !document.getElementById("ovEnd").classList.contains("hide"),
    star: window.__game.st.star, pass: window.__game.st.pass,
    score: window.__game.st.score, shots: window.__game.st.shots.length,
    unlocked: window.__game.save.unlocked, best: window.__game.save.best[0],
    miss: document.getElementById("endMiss").textContent
  }));
  ok(end.phase === "over", "整局结束");
  ok(end.ov, "结算遮罩出现");
  ok(end.shots >= 3, "出片数 " + end.shots);
  ok(end.score > 0 && end.best === end.score, "最佳分写入存档 " + end.score);
  ok(end.unlocked >= 2, "通关解锁下一关 (unlocked=" + end.unlocked + ")");
  ok(await p.evaluate(() => document.querySelectorAll("#endShots canvas").length >= 3), "结算页相册铺开");

  // 刷新后存档保留
  await p.reload(); await sleep(700);
  ok(await p.evaluate(() => (window.__game.save.unlocked || 1) >= 2), "刷新后解锁保留");

  // ============ 移动端 ============
  await c1.close();   // 关掉桌面页再测，否则两个 rAF 抢帧率
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
  const p2 = await c2.newPage();
  const errs2 = [];
  p2.on("pageerror", e => errs2.push(String(e)));
  await p2.goto(FILE); await sleep(800);
  await p2.evaluate(() => { try { localStorage.removeItem("vf290save"); } catch (e) { } });
  await p2.reload(); await sleep(800);
  await p2.click("#bStart"); await sleep(500);
  ok(errs2.length === 0, "移动端无报错: " + errs2.join(" | "));
  const mdim = await p2.evaluate(() => {
    const cv = window.__game.cv;
    return { bw: cv.width, bh: cv.height, eff: window.__game.eff, K: window.__game.K };
  });
  ok(mdim.eff <= 2.15, "移动端 dpr=3 缓冲上限收紧 eff=" + mdim.eff.toFixed(2));
  const mf = await fps(p2, 2200);
  ok(mf > 52, "移动端 fps " + mf.toFixed(1));

  // 触摸：拖动变焦 / 升降，轻点快门
  const tz = await p2.evaluate(() => window.__game.st.z);
  await p2.touchscreen.tap(240, 400); await sleep(80);
  await p2.mouse.move(240, 400); await p2.mouse.down();
  await p2.mouse.move(320, 400, { steps: 8 }); await sleep(60); await p2.mouse.up();
  const tz2 = await p2.evaluate(() => window.__game.st.z);
  ok(Math.abs(tz2 - tz) > 0.02, "触摸横向拖动改变变焦 " + tz.toFixed(3) + " → " + tz2.toFixed(3));
  await p2.mouse.move(240, 400); await p2.mouse.down();
  await p2.mouse.move(240, 320, { steps: 8 }); await sleep(60); await p2.mouse.up();
  ok(await p2.evaluate(() => window.__game.st.fcy < 800), "触摸纵向拖动改变框心");

  const tshot = await p2.evaluate(async () => {
    const G = window.__game, VF = G.VF, st = G.st;
    for (let i = 0; i < 300; i++) {
      let best = null, bp = -1;
      for (const o of st.world.objs) {
        if (o.used || o.passed) continue;
        const q = VF.objPos(o, st.camX), ahead = q.x - VF.W / 2;
        if (ahead < -60 || ahead > 400) continue;
        if (VF.occluded(st, o, q)) continue;
        if (o.K.v > bp) { bp = o.K.v; best = o; }
      }
      if (best) { const id = VF.idealFor(best); G.setZoom(id.z); G.setFcy(id.fcy); }
      if (st.live && st.live.s > 0.9) { const f = st.film; G.shoot(); return f - st.film; }
      await new Promise(r => setTimeout(r, 25));
    }
    return 0;
  });
  ok(tshot === 1, "移动端快门按钮/轻点可拍摄");

  console.log("\n浏览器探针：" + P + " 通过 / " + F + " 失败");
  await b.close();
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
