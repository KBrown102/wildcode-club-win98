const {chromium}=require('playwright');
const path=require('path');
const url='file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/');
const out=path.join(__dirname,'_shot');

(async()=>{
  const browser=await chromium.launch();
  const results=[];
  for(const dev of [{n:'desktop',w:1280,h:800},{n:'mobile',w:390,h:844}]){
    const ctxb=await browser.newContext({viewport:{width:dev.w,height:dev.h},deviceScaleFactor:2});
    const page=await ctxb.newPage();
    const errs=[],cerrs=[];
    page.on('pageerror',e=>errs.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')cerrs.push(m.text());});
    await page.goto(url);
    await page.waitForTimeout(900);
    await page.screenshot({path:out+'-'+dev.n+'-0mask.png'});
    await page.click('#bStart');
    await page.waitForTimeout(1400);
    await page.screenshot({path:out+'-'+dev.n+'-1start.png'});

    // 点第一排的灯
    let L=await page.evaluate(()=>{const G=__G;const l=G.lampPos(G.geo(),0,G.S.cam);return {x:l.x,y:l.y};});
    await page.mouse.click(L.x,L.y);
    await page.waitForTimeout(900);
    await page.screenshot({path:out+'-'+dev.n+'-2lit.png'});

    // 拖动往后退
    await page.mouse.move(dev.w*0.5,dev.h*0.45);
    await page.mouse.down();
    for(let i=1;i<=14;i++){await page.mouse.move(dev.w*0.5,dev.h*0.45+i*14);await page.waitForTimeout(16);}
    await page.mouse.up();
    await page.waitForTimeout(1100);
    await page.screenshot({path:out+'-'+dev.n+'-3back.png'});

    // 按住
    await page.mouse.move(dev.w*0.3,dev.h*0.6);
    await page.mouse.down();
    await page.waitForTimeout(2600);
    await page.screenshot({path:out+'-'+dev.n+'-4hold.png'});
    await page.mouse.up();
    await page.waitForTimeout(400);

    // 中段：点亮 3 盏后的样子
    await page.evaluate(async()=>{const G=__G;G.setCam(3);for(let r=0;r<4;r++){G.lightRow(r);}});
    await page.waitForTimeout(1300);
    await page.screenshot({path:out+'-'+dev.n+'-5mid.png'});

    // 终章
    await page.evaluate(()=>{const G=__G;for(let r=0;r<7;r++)if(!G.S.lit[r])G.lightRow(r);G.setCam(6);G.S.camT=6;});
    await page.waitForTimeout(5200);
    await page.screenshot({path:out+'-'+dev.n+'-6fin.png'});

    // fps
    const fps=await page.evaluate(()=>new Promise(res=>{
      let n=0;const t0=performance.now();
      function f(){n++;if(performance.now()-t0<1500)requestAnimationFrame(f);else res(Math.round(n/((performance.now()-t0)/1000)));}
      requestAnimationFrame(f);
    }));
    results.push({dev:dev.n,fps,errs:errs.length,cerrs:cerrs.length,detail:errs.concat(cerrs).slice(0,3)});
    await ctxb.close();
  }
  await browser.close();
  console.log(JSON.stringify(results,null,1));
})();
