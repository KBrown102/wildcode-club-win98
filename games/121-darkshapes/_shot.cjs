const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const url = 'file://' + path.resolve(__dirname,'index.html').replace(/\\/g,'/');
  // 桌面：开场 / 认出两个 / 全部认出终章
  let p = await browser.newPage({ viewport:{width:1280,height:800}, deviceScaleFactor:1 });
  await p.goto(url); await p.waitForTimeout(700);
  await p.screenshot({ path:'shot_mask.png' });
  await p.click('#bStart'); await p.waitForTimeout(1400);
  await p.screenshot({ path:'shot_start.png' });
  const slots = await p.evaluate(()=>{ const g=__G.geo(),c=__G.S.curtain;
    return g.slots.map(s=>{const hh=s.shH*(1.42-0.42*c);return {x:Math.round(s.shX),y:Math.round(g.floorY-hh*0.46)};}); });
  for(let i=0;i<3;i++){ await p.mouse.click(slots[i].x,slots[i].y); await p.waitForTimeout(320); }
  await p.screenshot({ path:'shot_mid.png' });
  for(let i=3;i<6;i++){ await p.mouse.click(slots[i].x,slots[i].y); await p.waitForTimeout(320); }
  await p.waitForTimeout(5200);
  await p.screenshot({ path:'shot_fin.png' });
  await p.close();
  // 移动端
  p = await browser.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:1 });
  await p.goto(url); await p.waitForTimeout(600);
  await p.click('#bStart'); await p.waitForTimeout(1300);
  const s2 = await p.evaluate(()=>{ const g=__G.geo(),c=__G.S.curtain;
    return g.slots.map(s=>{const hh=s.shH*(1.42-0.42*c);return {x:Math.round(s.shX),y:Math.round(g.floorY-hh*0.46)};}); });
  for(let i=0;i<4;i++){ await p.mouse.click(s2[i].x,s2[i].y); await p.waitForTimeout(260); }
  await p.screenshot({ path:'shot_mobile.png' });
  await p.close();
  await browser.close();
  console.log('shots done');
})();
