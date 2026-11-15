// Draws the floor plan of a demo account.
// Usage: node scripts/demo/floor-plan.mjs scripts/demo/demos/<slug>.json
//
// Massage: waiting room, reception and changing room on the
// left, a corridor, the treatment rooms on the right with
// toilet, shower and a rest room behind them.
// Restaurant: the dining room with tables, bar, kitchen and
// toilets, plus a terrace when the config says so.
import { pathToFileURL } from "node:url";
import { call, loadConfig, login } from "./lib.mjs";

const el = (areaId, type, label, x, y, width, height, extra = {}) => ({ type, label, x, y, width, height, rotation: 0, areaId, ...extra });
const door = (areaId, x, y, rotation, label = null) => el(areaId, "DOOR", label, x, y, 90, 90, { rotation });

function massagePlan(config, area, rooms) {
  const A = area.id;
  const n = Math.max(1, rooms.length);
  // One row of treatment rooms; with more than one room a
  // hallway runs under them, so every room has its own door.
  const roomW = n === 1 ? 470 : 300;
  const roomH = 400;
  const right = 460 + Math.max(470, n * roomW);
  const hallH = n === 1 ? 0 : 110;
  const hallY = 30 + roomH;
  const backY = hallY + hallH;
  const height = backY + 200 + 30;
  const width = right + 30;

  const elements = [
    el(A, "WAITING", "Wachtruimte", 30, 30, 300, 270),
    el(A, "RECEPTION", "Onthaal", 30, 300, 300, 170),
    el(A, "CHANGING", "Kleedruimte", 30, 470, 300, Math.max(160, height - 30 - 470)),
    el(A, "CORRIDOR", "Gang", 330, 30, 130, height - 60),
    door(A, 30, 340, 90, "Ingang"),
    door(A, 330, 360, 90),
    door(A, 240, 120, -90),
    door(A, 240, 510, -90),
    el(A, "WINDOW", null, 105, 25, 150, 10),
    el(A, "PLANT", null, 265, 45, 50, 50),
    el(A, "PLANT", null, 45, 230, 50, 50),
  ];

  rooms.forEach((room, i) => {
    const x = 460 + i * roomW;
    const w = n === 1 ? 470 : roomW;
    elements.push(el(A, "ROOM", room.name, x, 30, w, roomH, { treatmentRoomId: room.id, beds: 1 }));
    elements.push(n === 1 ? door(A, 460, 90, 90) : door(A, x + w / 2 - 45, 30 + roomH - 90, 0));
    elements.push(el(A, "WINDOW", null, x + w / 2 - 90, 25, 180, 10));
  });
  if (hallH) elements.push(el(A, "CORRIDOR", null, 460, hallY, right - 460, hallH));

  const backW = right - 460;
  const toiletW = Math.round(backW * 0.3), showerW = Math.round(backW * 0.36), restW = backW - toiletW - showerW;
  elements.push(
    el(A, "TOILET", "Toilet", 460, backY, toiletW, 200),
    el(A, "SHOWER", "Douche", 460 + toiletW, backY, showerW, 200),
    el(A, "WAITING", "Rustruimte", 460 + toiletW + showerW, backY, restW, 200),
    hallH ? door(A, 460 + 40, backY, 180) : door(A, 460, backY + 105, 90),
    door(A, 460 + toiletW + 40, backY, 180),
    door(A, 460 + toiletW + showerW + 40, backY, 180),
    el(A, "PLANT", null, right - 65, 50, 50, 50),
    el(A, "PLANT", null, right - 65, height - 95, 50, 50),
  );

  return { areas: [{ ...area, name: area.name || "Gelijkvloers", width, height }], elements, tables: [] };
}

// Default dining room: 12 tables, 44 seats, plus a terrace.
const DINING = [
  ["T1", 2, "ROUND", 110, 120, 70, 70], ["T2", 2, "ROUND", 110, 320, 70, 70], ["T3", 4, "SQUARE", 330, 115, 85, 85],
  ["T4", 4, "SQUARE", 330, 315, 85, 85], ["T5", 4, "RECTANGLE", 560, 120, 150, 80], ["T6", 6, "RECTANGLE", 780, 120, 200, 85],
  ["T7", 2, "ROUND", 110, 520, 70, 70], ["T8", 4, "SQUARE", 330, 515, 85, 85], ["T9", 4, "SQUARE", 560, 320, 85, 85],
  ["T10", 8, "RECTANGLE", 760, 330, 240, 90], ["Bar 1", 2, "ROUND", 820, 640, 55, 55], ["Bar 2", 2, "ROUND", 940, 640, 55, 55],
];
const TERRACE = [["Terras 1", 4, "SQUARE", 120, 140, 85, 85], ["Terras 2", 4, "SQUARE", 300, 140, 85, 85], ["Terras 3", 6, "RECTANGLE", 470, 140, 200, 90]];

function restaurantPlan(config, area) {
  const inside = { ...area, name: "Binnen", width: 1300, height: 950 };
  const areas = [inside];
  const terrace = config.terrace ? { id: "tmp-terras", name: "Terras", width: 760, height: 400 } : null;
  if (terrace) areas.push(terrace);
  const I = inside.id;
  const tables = DINING.map(([name, capacity, shape, x, y, width, height]) => ({ id: `tmp-${name}`, name, capacity, shape, x, y, width, height, rotation: 0, areaId: I }));
  if (terrace) tables.push(...TERRACE.map(([name, capacity, shape, x, y, width, height]) => ({ id: `tmp-${name}`, name, capacity, shape, x, y, width, height, rotation: 0, areaId: terrace.id })));
  const elements = [
    el(I, "WINDOW", null, 60, -5, 260, 10), el(I, "WINDOW", null, 480, -5, 260, 10), el(I, "WINDOW", null, -5, 200, 10, 260),
    door(I, 470, 860, 0, "Ingang"), el(I, "BAR", "Bar", 760, 730, 300, 75), el(I, "KITCHEN", "Keuken", 1080, 0, 220, 420),
    el(I, "TOILET", "Toiletten", 1150, 760, 150, 190), el(I, "WALL", null, 1080, 420, 12, 160),
    el(I, "PLANT", null, 40, 860, 55, 55), el(I, "PLANT", null, 680, 860, 55, 55), el(I, "PLANT", null, 1000, 30, 50, 50),
  ];
  if (terrace) elements.push(
    el(terrace.id, "PLANT", null, 40, 40, 60, 60), el(terrace.id, "PLANT", null, 660, 40, 60, 60),
    door(terrace.id, 330, 0, 180), el(terrace.id, "LABEL", "Straatkant", 260, 330, 240, 40),
  );
  return { areas, elements, tables };
}

export async function drawFloorPlan(config) {
  const { token, businessId } = await login(config);
  const plan = await call("GET", `/businesses/${businessId}/floor-plan`, null, token);
  const area = plan.areas[0];
  const body = config.type === "MASSAGE" ? massagePlan(config, area, plan.rooms) : restaurantPlan(config, area);
  const saved = await call("PUT", `/businesses/${businessId}/floor-plan`, body, token);
  console.log("plattegrond:", saved.areas.map((a) => a.name).join(", "), "|", saved.elements.length, "elementen |", saved.tables.length, "tafels");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await drawFloorPlan(loadConfig(process.argv[2]));
}
