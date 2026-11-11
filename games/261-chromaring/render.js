/* 261-chromaring · Canvas 渲染层（只读 game 状态，零业务逻辑）
 * 设计：黑底+彩环漂浮，每帧只负责把 state 画到 canvas 上。
 *       DPR 适配、整体缩放适配，零外部依赖。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RenderLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function createRender(canvas, game){
  let ctx = null;
  let dpr = 1;
  let scale = 1;
  let cx = 0, cy = 0;  // 屏幕震动偏移

  function fitCanvas(){
    dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const fit = Math.min(cssW / game.W, cssH / game.H);
    scale = fit;
    const drawW = game.W * fit;
    const drawH = game.H * fit;
    canvas.style.width = drawW + 'px';
    canvas.style.height = drawH + 'px';
    canvas.width = Math.floor(drawW * dpr);
    canvas.height = Math.floor(drawH * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * fit, 0, 0, dpr * fit, 0, 0);
  }

  function render(){
    if (!ctx) return;
    const W = game.W, H = game.H;

    // 屏幕震动偏移（轻微）
    if (game.state.comboShake > 0){
      const s = game.state.comboShake;
      cx = (Math.random() - 0.5) * s * 0.6;
      cy = (Math.random() - 0.5) * s * 0.6;
    } else if (game.state.flashTime > 12){
      cx = (Math.random() - 0.5) * 6;
      cy = (Math.random() - 0.5) * 6;
    } else {
      cx = cy = 0;
    }

    // 清屏（带震动偏移）
    ctx.save();
    ctx.translate(cx, cy);

    // 背景渐变
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0f1a');
    bg.addColorStop(1, '#161b2c');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // 微弱星点（参考距离感）
    drawStars();

    // 圆环
    for (const r of game.state.rings){
      drawRing(r);
    }

    // 球
    drawBall();

    // 粒子
    for (const p of game.state.particles){
      const a = Math.max(0, p.life / 40);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 死亡闪烁
    if (game.state.flashTime > 0 && game.state.flashTime % 4 < 2){
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    // UI
    drawUI();

    ctx.restore();
  }

  function drawStars(){
    const W = game.W, H = game.H;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    // 用确定性伪随机点
    for (let i = 0; i < 30; i++){
      const x = ((i * 73) % W);
      const y = ((i * 131) % H);
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.restore();
  }

  function drawRing(r){
    const cx = game.BALL_X;
    const cy = r.y;
    const segSize = 360 / game.SEG_COUNT;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(r.rotation * Math.PI / 180);

    for (let i = 0; i < game.SEG_COUNT; i++){
      const a1 = (i * segSize - segSize / 2) * Math.PI / 180;
      const a2 = ((i + 1) * segSize - segSize / 2) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(0, 0, game.RING_R, a1, a2);
      ctx.arc(0, 0, game.RING_R - game.RING_THICK, a2, a1, true);
      ctx.closePath();
      ctx.fillStyle = game.COLORS[r.segments[i]].fill;
      ctx.fill();
      // 段边缘高光
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 圆环外描边（让旋转可见）
    ctx.beginPath();
    ctx.arc(0, 0, game.RING_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, game.RING_R - game.RING_THICK, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 圆环 12 点位置的"穿越标记"——一个小圆点，提示玩家对准哪
    ctx.save();
    ctx.translate(cx, cy - game.RING_R);
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.restore();
  }

  function drawBall(){
    const col = game.COLORS[game.state.ballColorIdx];
    const x = game.BALL_X, y = game.BALL_Y;
    // 外光晕
    const grd = ctx.createRadialGradient(x, y, 0, x, y, game.BALL_R * 4.5);
    grd.addColorStop(0, col.fill);
    grd.addColorStop(0.15, col.fill);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, game.BALL_R * 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 球本体
    ctx.beginPath();
    ctx.arc(x, y, game.BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = col.fill;
    ctx.fill();
    // 高光
    ctx.beginPath();
    ctx.arc(x - game.BALL_R * 0.3, y - game.BALL_R * 0.3, game.BALL_R * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    // 外描边
    ctx.beginPath();
    ctx.arc(x, y, game.BALL_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawUI(){
    const W = game.W, H = game.H;
    // 顶部：分数（居中大号）
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 36px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(String(game.state.score), W / 2, 50);

    // 顶部：BEST
    ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText('BEST ' + game.state.best, W - 18, 22);

    // 当前球颜色徽章（分数下面）
    const col = game.COLORS[game.state.ballColorIdx];
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = col.fill;
    ctx.fillText('● ' + col.name.toUpperCase(), W / 2, 96);

    // 连击
    if (game.state.streak > 1){
      ctx.font = 'bold 18px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('×' + game.state.streak + '  COMBO', W / 2, 122);
    }

    // 玩法提示（小字底部）
    ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.fillText('click / space to switch color', W / 2, H - 30);

    // 开始屏
    if (game.state.phase === 'idle'){
      ctx.fillStyle = 'rgba(10,14,26,0.65)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('chromaring', W / 2, H / 2 - 60);
      ctx.font = '13px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('切对颜色，穿过彩环', W / 2, H / 2 - 20);
      ctx.fillText('点 / 空格 切换 · 撞错就重来', W / 2, H / 2);
      // 四个色块示意
      const sw = 26, sx0 = W / 2 - 60, sy = H / 2 + 30;
      for (let i = 0; i < 4; i++){
        ctx.fillStyle = game.COLORS[i].fill;
        ctx.beginPath();
        ctx.arc(sx0 + i * 40, sy, sw / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('click to start', W / 2, H / 2 + 80);
    }

    // 死亡屏（文字下移避开球/圆环）
    if (game.state.phase === 'dead'){
      ctx.fillStyle = 'rgba(10,14,26,0.72)';
      ctx.fillRect(0, 0, W, H);
      const cy = H * 0.66;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('color mismatch', W / 2, cy - 36);
      ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('score', W / 2, cy - 4);
      ctx.font = 'bold 52px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = col.fill;
      ctx.fillText(String(game.state.score), W / 2, cy + 44);
      if (state_isNewBest()){
        ctx.font = 'bold 12px -apple-system, "PingFang SC", sans-serif';
        ctx.fillStyle = '#f1c40f';
        ctx.fillText('★ new best', W / 2, cy + 76);
      }
      if (game.state.maxStreak > 1){
        ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText('max combo ×' + game.state.maxStreak, W / 2, cy + 96);
      }
      ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('click to retry', W / 2, cy + 130);
    }
  }

  function state_isNewBest(){
    return game.state.score > 0 && game.state.score === game.state.best && game.state.best > 0;
  }

  return {
    render: render,
    fitCanvas: fitCanvas
  };
}

return { createRender: createRender };
});
