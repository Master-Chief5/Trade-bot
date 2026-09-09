const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fa = require('react-icons/fa');
const fs = require('fs');

async function icon(name, color, size = 256) {
  const Comp = fa[name];
  if (!Comp) throw new Error('no icon ' + name);
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

// Background: deep navy with radial glows, faint grid and scanline texture
function bgSvg(kind) {
  const W = 2560, H = 1440;
  const glowA = kind === 'title' ? 0.55 : 0.28;
  const glowB = kind === 'title' ? 0.40 : 0.18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B1326"/><stop offset="0.55" stop-color="#080D1A"/><stop offset="1" stop-color="#05080F"/>
    </linearGradient>
    <radialGradient id="g1" cx="${kind==='title'?0.22:0.92}" cy="${kind==='title'?0.30:0.06}" r="0.55">
      <stop offset="0" stop-color="#00E5A0" stop-opacity="${glowA}"/><stop offset="1" stop-color="#00E5A0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="${kind==='title'?0.85:0.05}" cy="${kind==='title'?0.80:0.95}" r="0.6">
      <stop offset="0" stop-color="#38BDF8" stop-opacity="${glowB}"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#7DD3FC" stroke-opacity="0.07" stroke-width="1"/>
    </pattern>
    <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="1.2" fill="#A5F3FC" fill-opacity="0.10"/>
    </pattern>
    <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  ${kind==='title' ? hexes(W,H) : ''}
</svg>`;
}
function hexes(W,H){
  // scattered outline hexagons, right side
  let s='';
  const pts=(cx,cy,r)=>Array.from({length:6},(_,i)=>{const a=Math.PI/3*i+Math.PI/6;return `${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`}).join(' ');
  const list=[[2100,300,150],[2320,430,110],[2210,620,120],[1980,520,70],[2400,760,150],[2180,880,90],[2350,1050,120],[1900,1000,60],[2500,180,80]];
  for(const [x,y,r] of list) s+=`<polygon points="${pts(x,y,r)}" fill="none" stroke="#00E5A0" stroke-opacity="0.22" stroke-width="2"/>`;
  return s;
}
async function bg(kind){
  const buf = await sharp(Buffer.from(bgSvg(kind))).resize(1920,1080).jpeg({ quality: 82 }).toBuffer();
  fs.writeFileSync(`bg_${kind}.jpg`, buf);
  return 'image/jpeg;base64,' + buf.toString('base64');
}
module.exports = { icon, bg };
