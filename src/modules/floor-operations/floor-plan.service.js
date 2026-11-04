import prisma from "../../db/prisma.js";

import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Floor plan
// ======================================================
//
// The whole plan of a business in one document:
//
//   areas     rooms (Binnen, Terras) or floors
//   elements  walls, bar, doors, salon rooms…
//   tables    restaurant tables with their position
//   rooms     bookable treatment rooms (massage)
//
// The editor saves the whole plan at once (PUT), so undo
// and redo stay in the app and a save is all or nothing.
// New areas and tables carry a temporary id from the app
// ("tmp-…"); the answer has the real ids.
//
// A business without any area gets one ("Binnen" or
// "Gelijkvloers") the first time the plan is read, with
// its existing tables in it.
// ======================================================

const ELEMENT_TYPES = new Set([
  "WALL", "DOOR", "WINDOW", "BAR", "PLANT", "KITCHEN",
  "LABEL", "ROOM", "RECEPTION", "WAITING", "CHANGING",
  "SAUNA", "SHOWER", "STAIRS", "TOILET", "CORRIDOR",
]);

const SHAPES = new Set(["ROUND", "SQUARE", "RECTANGLE"]);

function isTemporaryId(id) {
  return !id || String(id).startsWith("tmp-");
}

function number(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadPlan(businessId, db = prisma) {
  const [areas, elements, tables, rooms] = await Promise.all([
    db.floorArea.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.floorElement.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    }),
    db.table.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: "asc" },
    }),
    db.treatmentRoom.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { areas, elements, tables, rooms };
}

class FloorPlanService {
  async getPlan(businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const areaCount = await prisma.floorArea.count({
      where: { businessId },
    });

    if (areaCount === 0) {
      await prisma.$transaction(async (tx) => {
        const area = await tx.floorArea.create({
          data: {
            businessId,
            name:
              business.businessType === "MASSAGE"
                ? "Gelijkvloers"
                : "Binnen",
          },
        });

        await tx.table.updateMany({
          where: { businessId, areaId: null },
          data: { areaId: area.id },
        });
      });
    }

    return loadPlan(businessId);
  }

  async savePlan(businessId, plan) {
    const areas = Array.isArray(plan?.areas) ? plan.areas : [];
    const elements = Array.isArray(plan?.elements) ? plan.elements : [];
    const tables = Array.isArray(plan?.tables) ? plan.tables : [];

    if (areas.length === 0) {
      throw new ValidationError(
        "A floor plan needs at least one room.",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const roomIds = new Set(
      (
        await prisma.treatmentRoom.findMany({
          where: { businessId },
          select: { id: true },
        })
      ).map((room) => room.id)
    );

    await prisma.$transaction(async (tx) => {
      // Areas: keep the ids the app knows, create the new
      // ones and remember which temporary id became what.
      const areaIds = new Map();

      const existingAreas = await tx.floorArea.findMany({
        where: { businessId },
      });
      const existingAreaIds = new Set(
        existingAreas.map((area) => area.id)
      );

      for (const [index, area] of areas.entries()) {
        const data = {
          name: String(area.name || `Ruimte ${index + 1}`).slice(0, 40),
          sortOrder: index,
          width: number(area.width, 1200),
          height: number(area.height, 1000),
        };

        if (!isTemporaryId(area.id) && existingAreaIds.has(area.id)) {
          await tx.floorArea.update({ where: { id: area.id }, data });
          areaIds.set(area.id, area.id);
        } else {
          const created = await tx.floorArea.create({
            data: { ...data, businessId },
          });
          areaIds.set(area.id, created.id);
        }
      }

      const keptAreaIds = new Set(areaIds.values());
      const firstAreaId = areaIds.get(areas[0].id);

      // Elements: replaced as a whole.
      await tx.floorElement.deleteMany({ where: { businessId } });

      const elementRows = elements
        .filter((element) => ELEMENT_TYPES.has(element.type))
        .map((element) => ({
          businessId,
          areaId: areaIds.get(element.areaId) ?? firstAreaId,
          type: element.type,
          label: element.label ? String(element.label).slice(0, 40) : null,
          x: number(element.x),
          y: number(element.y),
          width: Math.max(10, number(element.width, 100)),
          height: Math.max(10, number(element.height, 100)),
          rotation: number(element.rotation),
          treatmentRoomId: roomIds.has(element.treatmentRoomId)
            ? element.treatmentRoomId
            : null,
          beds: Math.max(0, Math.min(4, Math.round(number(element.beds, 1)))),
        }));

      if (elementRows.length > 0) {
        await tx.floorElement.createMany({ data: elementRows });
      }

      // Tables: update the known ones, create the new ones,
      // deactivate the ones that were removed (they keep
      // their reservation history).
      const existingTables = await tx.table.findMany({
        where: { businessId, isActive: true },
      });
      const existingTableIds = new Set(
        existingTables.map((table) => table.id)
      );
      const keptTableIds = new Set();

      for (const table of tables) {
        const data = {
          name: String(table.name || "T").slice(0, 20),
          capacity: Math.max(1, Math.min(30, Math.round(number(table.capacity, 2)))),
          shape: SHAPES.has(table.shape) ? table.shape : "SQUARE",
          x: number(table.x),
          y: number(table.y),
          width: Math.max(20, number(table.width, 80)),
          height: Math.max(20, number(table.height, 80)),
          rotation: number(table.rotation),
          areaId: areaIds.get(table.areaId) ?? firstAreaId,
          isOnlineBookable: table.isOnlineBookable !== false,
        };

        if (!isTemporaryId(table.id) && existingTableIds.has(table.id)) {
          await tx.table.update({ where: { id: table.id }, data });
          keptTableIds.add(table.id);
        } else {
          await tx.table.create({ data: { ...data, businessId } });
        }
      }

      const removedTableIds = [...existingTableIds].filter(
        (id) => !keptTableIds.has(id)
      );

      if (removedTableIds.length > 0) {
        await tx.table.updateMany({
          where: { id: { in: removedTableIds } },
          data: { isActive: false },
        });
      }

      // Areas that were removed; their tables were moved or
      // deactivated above.
      await tx.floorArea.deleteMany({
        where: { businessId, id: { notIn: [...keptAreaIds] } },
      });
    });

    return loadPlan(businessId);
  }
}

export default new FloorPlanService();
