// Draws the finished photostrip as a 1080×1920 image (Instagram Story size)
// so people can download it or share it to their Story.

const C = {
  cream: '#FFF6E9',
  plum: '#69455B',
  plumMuted: '#7D5A6E',
  orange: '#F6AA62',
  orangeTint: '#FDE3C8',
  yellow: '#FFD77D',
  yellowTint: '#FFEBBE',
  coral: '#FF8F86',
  white: '#FFFFFF',
};

const loadImg = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    // Signed storage URLs are cross-origin; the canvas needs CORS to export the image.
    if (/^https?:/.test(src)) i.crossOrigin = 'anonymous';
    i.src = src;
  });

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawTextCard(ctx, x, y, w, h, lines, size = 40) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = C.orangeTint;
  ctx.fillRect(x, y, w, h);
  // soft hills, like the placeholder in the screens
  ctx.fillStyle = 'rgba(246,170,98,0.35)';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.9);
  ctx.lineTo(x + w * 0.3, y + h * 0.8);
  ctx.lineTo(x + w * 0.55, y + h * 0.9);
  ctx.lineTo(x + w * 0.75, y + h * 0.83);
  ctx.lineTo(x + w, y + h * 0.92);
  ctx.lineTo(x + w, y + h);
  ctx.fill();
  ctx.fillStyle = C.plum;
  ctx.font = `700 ${size}px Caveat`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lh = Math.round(size * 1.12);
  const pad = Math.round(size * 0.7);
  const all = lines.filter(Boolean).flatMap((b) => wrap(ctx, b, w - pad * 2));
  const max = Math.max(1, Math.floor((h * 0.8 - pad) / lh));
  const shown = all.length > max ? [...all.slice(0, max - 1), all[max - 1].replace(/\s*\S*$/, '') + '…'] : all;
  let ty = y + (h * 0.85 - shown.length * lh) / 2;
  for (const l of shown) {
    ctx.fillText(l, x + w / 2, ty);
    ty += lh;
  }
  ctx.restore();
}

async function drawFrame(ctx, f, x, y, w, h, size) {
  if (f.photo) {
    try {
      drawCover(ctx, await loadImg(f.photo), x, y, w, h);
      return;
    } catch { /* fall back to text */ }
  }
  drawTextCard(ctx, x, y, w, h, f.lines, size);
}

function caption(ctx, text, cx, cy, size = 38) {
  ctx.fillStyle = C.plum;
  ctx.font = `700 ${size}px Caveat`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.length > 30 ? text.slice(0, 29) + '…' : text, cx, cy);
}

export async function renderPhotostrip(strip, assets) {
  await Promise.all([
    document.fonts.load('600 64px Fredoka'),
    document.fonts.load('700 40px Caveat'),
    document.fonts.load('500 30px "DM Sans"'),
  ]);
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  // background
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.yellowTint;
  ctx.beginPath();
  ctx.arc(W - 80, 260, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,143,134,0.25)';
  ctx.beginPath();
  ctx.arc(90, H - 260, 220, 0, Math.PI * 2);
  ctx.fill();

  const logo = await loadImg(assets.logo);
  const lw = 150, lh = (logo.height / logo.width) * lw;
  ctx.drawImage(logo, 80, 70, lw, lh);
  ctx.fillStyle = C.plum;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 52px Fredoka';
  ctx.fillText('This Is Random But…', 250, 135);
  ctx.font = '700 40px Caveat';
  ctx.fillText("Let's pick up where we left off.", 252, 185);

  // the strip: 5 frames
  // row 1 (now): you | friend, row 2 (then): you | friend, row 3 (next): the photo you take together
  const t = strip.turns || {};
  const me = strip.myName || 'you';
  const fr = strip.friendName;
  const sx = 110, sy = 250, sw = 860, pad = 28, gap = 20, capH = 56;
  const hw = (sw - pad * 2 - gap) / 2, hh = 300; // half-width frames
  const fw = sw - pad * 2, fh = 390; // full-width meet-up frame
  const sh = pad + 2 * (hh + capH) + (fh + capH) + 52 + pad;
  ctx.save();
  ctx.translate(W / 2, sy + sh / 2);
  ctx.rotate((-1.5 * Math.PI) / 180);
  ctx.translate(-W / 2, -(sy + sh / 2));
  ctx.shadowColor = 'rgba(105,69,91,0.22)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = C.white;
  roundRect(ctx, sx, sy, sw, sh, 8);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  let y = sy + pad;
  for (const stage of ['now', 'then']) {
    const pair = [
      { who: me, part: t[stage]?.me },
      { who: fr, part: t[stage]?.friend },
    ];
    for (let i = 0; i < 2; i++) {
      const x = sx + pad + i * (hw + gap);
      const p = pair[i].part || {};
      await drawFrame(ctx, { photo: p.photo, lines: [p.text] }, x, y, hw, hh, 34);
      caption(ctx, `${stage} · ${pair[i].who}`, x + hw / 2, y + hh + capH / 2, 34);
    }
    y += hh + capH;
  }
  const planTurn = strip.role === 'friend' ? t.next?.friend : t.next?.me;
  const plan = [planTurn?.idea, planTurn?.time].filter(Boolean);
  await drawFrame(ctx, { photo: t.meetup?.photo, lines: plan }, sx + pad, y, fw, fh, 44);
  caption(ctx, t.meetup?.caption ? `next · ${t.meetup.caption}` : 'next · together', W / 2, y + fh + capH / 2, 40);
  y += fh + capH;
  ctx.font = '700 34px Caveat';
  ctx.fillStyle = C.plumMuted;
  const d = new Date(strip.updatedAt || Date.now());
  const month = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  ctx.fillText(`${me} & ${fr} · ${month}`, W / 2, y + 18);
  ctx.restore();

  // footer
  ctx.textAlign = 'center';
  ctx.fillStyle = C.plum;
  ctx.font = '600 44px Fredoka';
  ctx.fillText('we picked up where we left off.', W / 2, H - 170);
  ctx.font = '500 30px "DM Sans"';
  ctx.fillStyle = C.plumMuted;
  ctx.fillText(`${assets.hashtag}  ·  made with re:frame`, W / 2, H - 110);

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}
