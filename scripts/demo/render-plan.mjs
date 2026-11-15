// Draws the saved floor plan of a demo account as SVG files
// (one per area), to check it without opening the app.
// Usage: node scripts/demo/render-plan.mjs scripts/demo/demos/<slug>.json <output-dir>
// Then: qlmanage -t -s 1200 -o <output-dir> <output-dir>/*.svg  (PNG preview)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { call, loadConfig, login } from "./lib.mjs";

const config = loadConfig(process.argv[2]);
const out = process.argv[3];
if (!out) throw new Error("Geef een map voor de SVG's mee.");
mkdirSync(out, { recursive: true });

const { token, businessId } = await login(config);
const plan = await call("GET", `/businesses/${businessId}/floor-plan`, null, token);
const layer = (e) => ({ WINDOW: 2, DOOR: 3, PLANT: 2, LABEL: 4 }[e.type] ?? 0);

for (const area of plan.areas) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${area.width + 40} ${area.height + 40}" width="1200" style="background:#f6f3ee;font-family:sans-serif">`;
  for (const e of plan.elements.filter((x) => x.areaId === area.id).sort((a, b) => layer(a) - layer(b))) {
    const { width: w, height: h } = e;
    let body;
    if (e.type === "DOOR") body = `<rect y="${h - 7}" width="${w}" height="14" fill="#f6f3ee"/><line x1="0" y1="${h}" x2="0" y2="0" stroke="#8a6" stroke-width="5"/><path d="M0 0 A${w} ${h} 0 0 1 ${w} ${h}" fill="none" stroke="#8a6" stroke-width="2" stroke-dasharray="8 7"/>`;
    else if (e.type === "WINDOW") body = `<rect width="${w}" height="${h}" fill="#f6f3ee"/><rect y="${h / 2 - 3}" width="${w}" height="6" fill="#7ac"/>`;
    else if (e.type === "PLANT") body = `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="#6a5"/>`;
    else if (e.type === "LABEL") body = `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="22" fill="#777">${e.label ?? ""}</text>`;
    else body = `<rect width="${w}" height="${h}" fill="${e.type === "ROOM" ? "#e3efe6" : e.type === "WALL" ? "#444" : "#fff"}" stroke="#444" stroke-width="${e.type === "CORRIDOR" ? 3 : 8}"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="22">${e.label ?? e.type.toLowerCase()}</text>`;
    s += `<g transform="translate(${e.x} ${e.y}) rotate(${e.rotation ?? 0} ${w / 2} ${h / 2})">${body}</g>`;
  }
  for (const t of plan.tables.filter((x) => x.areaId === area.id)) {
    const shape = t.shape === "ROUND" ? `<ellipse cx="${t.width / 2}" cy="${t.height / 2}" rx="${t.width / 2}" ry="${t.height / 2}" fill="#2f7a6c"/>` : `<rect width="${t.width}" height="${t.height}" rx="10" fill="#2f7a6c"/>`;
    s += `<g transform="translate(${t.x} ${t.y})">${shape}<text x="${t.width / 2}" y="${t.height / 2 + 6}" text-anchor="middle" font-size="18" fill="#fff">${t.name} (${t.capacity})</text></g>`;
  }
  const file = join(out, `${config.slug}-${area.name.toLowerCase().replace(/\W+/g, "-")}.svg`);
  writeFileSync(file, s + "</svg>");
  console.log(file);
}
