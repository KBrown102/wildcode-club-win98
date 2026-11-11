const path = require("path");
const { chromium } = require("C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright");
const FILE = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  await p.goto(FILE); await sleep(800);
  await p.screenshot({ path: "_p290_start.png" });
  await p.click("#bStart"); await sleep(1200);
  // 挑一个大景，摆到理想取景
  await p.evaluate(async () => {
    const G = window.__game, VF = G.VF, st = G.st;
    for (let i = 0; i < 400; i++) {
      let best = null, bp = -1;
      for (const o of st.world.objs) {
        if (o.used || o.passed) continue;
        const q = VF.objPos(o, st.camX), ahead = q.x - VF.W / 2;
        if (ahead < -60 || ahead > 500) continue;
        if (VF.occluded(st, o, q)) continue;
        if (o.K.v > bp) { bp = o.K.v; best = o; }
      }
      if (best) { const id = VF.idealFor(best); G.setZoom(id.z); G.setFcy(id.fcy); }
      if (st.live && st.live.s > 0.92) { G.shoot(); return; }
      await new Promise(r => setTimeout(r, 20));
    }
  });
  await sleep(200);
  await p.screenshot({ path: "_p290_play.png" });
  await p.evaluate(async (ms) => {
    const G = window.__game, VF = G.VF;
    const t0 = performance.now();
    await new Promise(res => {
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
  }, 60000);
  await sleep(700);
  await p.screenshot({ path: "_p290_end.png" });
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  await p2.goto(FILE); await sleep(800);
  await p2.click("#bStart"); await sleep(900);
  await p2.screenshot({ path: "_p290_mobile.png" });
  await b.close();
  console.log("ok");
})();
