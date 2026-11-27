// Builds src/dark.css: a dark counterpart for every color the light stylesheets set.
// Each rule is repeated under :where(:root[data-theme="dark"]) with only its color
// declarations, so layout stays in the original files and the two themes cannot drift.
// Hand-tuned exceptions live in scripts/dark-overrides.css and are appended last.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src');
const SCOPE = ':root[data-theme="dark"]';

const NAMED = { white: '#ffffff', black: '#000000' };
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:white|black)\b/g;
const PROPERTIES = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)|border-(top|right|bottom|left)?-?color|border-color|outline|outline-color|box-shadow|fill|stroke|caret-color|text-decoration|text-decoration-color|accent-color|scrollbar-color)$/;

function parse(value) {
  let hex = (NAMED[value.toLowerCase()] || value).slice(1);
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map(letter => letter + letter).join('');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const alpha = hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l, alpha };
}
function format({ h, s, l, alpha }) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const byte = value => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0');
  return '#' + byte(r + m) + byte(g + m) + byte(b + m) + (alpha < 1 ? byte(alpha) : '');
}

// White becomes the dark surface, near-black text becomes near-white, mid greys stay readable.
const flip = l => 0.105 + Math.pow(1 - l, 0.82) * 0.82;
const SURFACE_HUE = 222, SURFACE_SATURATION = 0.1;

function convert(value, property) {
  const color = parse(value); if (!color) return value;
  const text = property === 'color' || property === 'fill' || property === 'stroke' || property === 'caret-color' || property.startsWith('text-decoration');
  const shadow = property === 'box-shadow';
  // Drop shadows stay dark; on a dark surface they need more weight to read at all.
  if (shadow && color.l < 0.45 && color.alpha < 0.6) return format({ h: 0, s: 0, l: 0, alpha: Math.min(0.6, color.alpha * 2.4 + 0.08) });
  if (color.s < 0.28 || color.l > 0.985 || color.l < 0.03) {
    const l = flip(color.l);
    // Neutrals pick up a faint cool tint so surfaces do not look flat grey.
    return format({ h: color.s < 0.06 ? SURFACE_HUE : color.h, s: l < 0.4 ? Math.max(Math.min(color.s, 0.16), SURFACE_SATURATION) : Math.min(color.s, 0.2), l, alpha: color.alpha });
  }
  if (text) return format({ ...color, s: Math.min(color.s, 0.75), l: color.l < 0.62 ? 0.62 + (0.62 - color.l) * 0.28 : color.l });
  // Pastel fills turn into deep tints of the same hue; saturated mid tones are kept.
  if (color.l > 0.78) return format({ ...color, s: color.s * 0.5, l: 0.17 + (1 - color.l) * 0.55 });
  if (color.l > 0.62 && color.s < 0.6) return format({ ...color, s: color.s * 0.6, l: 0.3 + (1 - color.l) * 0.3 });
  return value;
}

function declarations(body) {
  const list = []; let depth = 0, start = 0;
  for (let index = 0; index <= body.length; index++) {
    const letter = body[index];
    if (letter === '(') depth++; else if (letter === ')') depth--;
    if ((letter === ';' && !depth) || index === body.length) {
      const text = body.slice(start, index).trim(); start = index + 1;
      const colon = text.indexOf(':'); if (colon > 0) list.push([text.slice(0, colon).trim().toLowerCase(), text.slice(colon + 1).trim()]);
    }
  }
  return list;
}
function darkRule(selector, body) {
  const items = declarations(body), find = name => items.find(([property]) => property === name)?.[1] || '';
  // Surfaces that are already dark with light text (code blocks, toasts, viewers) keep their colors.
  const fill = (find('background') || find('background-color')).match(COLOR)?.[0], ink = find('color').match(COLOR)?.[0];
  const fillColor = fill && parse(fill), inkColor = ink && parse(ink);
  const keep = !!(fillColor && fillColor.alpha > 0.6 && fillColor.l < 0.34 && (!inkColor || inkColor.l > 0.6));
  // Every color-bearing declaration is repeated, converted or not, so the dark rules
  // override each other in exactly the order the light rules do.
  const copied = [];
  for (const [property, value] of items) {
    if (!PROPERTIES.test(property)) continue;
    copied.push(property + ':' + (keep || /url\(/.test(value) ? value : value.replace(COLOR, match => convert(match, property))));
  }
  if (!copied.length) return '';
  // :where() adds no specificity: a dark rule weighs the same as the light rule it mirrors.
  const scoped = selector.split(',').map(part => part.trim()).filter(Boolean).map(part => {
    if (/^(:root|html)(?![\w-])/.test(part)) return part.replace(/^(:root|html)/, ':where(' + SCOPE + ')');
    return ':where(' + SCOPE + ') ' + part;
  }).join(',');
  return scoped + '{' + copied.join(';') + '}';
}
function walk(css) {
  let output = '', index = 0;
  while (index < css.length) {
    const open = css.indexOf('{', index); if (open < 0) break;
    const prelude = css.slice(index, open).trim();
    let depth = 1, close = open + 1;
    while (close < css.length && depth) { if (css[close] === '{') depth++; else if (css[close] === '}') depth--; close++; }
    const body = css.slice(open + 1, close - 1);
    if (/^@(media|supports)/.test(prelude)) { const inner = walk(body); if (inner) output += prelude + '{' + inner + '}\n'; }
    else if (!prelude.startsWith('@')) { const rule = darkRule(prelude, body); if (rule) output += rule + '\n'; }
    index = close;
  }
  return output;
}

const html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const files = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]).filter(name => name !== 'dark.css');
let output = '/* Generated by scripts/generate-dark.cjs. Do not edit: change the light styles or scripts/dark-overrides.css and run npm run generate:dark. */\n';
for (const name of files) {
  const css = fs.readFileSync(path.join(source, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '');
  const rules = walk(css);
  if (rules) output += '/* ' + name + ' */\n' + rules;
}
output += '/* scripts/dark-overrides.css */\n' + fs.readFileSync(path.join(__dirname, 'dark-overrides.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').trim() + '\n';
const target = path.join(source, 'dark.css');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) { console.error('src/dark.css is out of date. Run npm run generate:dark.'); process.exit(1); }
  console.log('src/dark.css is up to date.');
} else { fs.writeFileSync(target, output); console.log('Wrote src/dark.css (' + output.length + ' bytes).'); }
