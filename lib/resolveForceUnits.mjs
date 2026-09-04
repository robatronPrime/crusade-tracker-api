import { ObjectId } from "mongodb";

export function isObjectIdRef(entry) {
  if (entry == null) return false;
  if (entry instanceof ObjectId) return true;
  if (typeof entry === "string" && ObjectId.isValid(entry)) return true;
  if (typeof entry === "object" && entry._bsontype === "ObjectId") return true;
  // Plain objects with unit fields are legacy embedded units
  if (typeof entry === "object" && (entry.name != null || entry.unitName != null || entry.pointsValue != null)) {
    return false;
  }
  if (typeof entry === "object" && entry.toHexString) return true;
  return false;
}

export function mapUnitDoc(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return {
    id: _id != null ? String(_id) : String(doc.id ?? ""),
    ...rest,
    // Normalise legacy embedded shape when present
    name: rest.name ?? rest.unitName ?? "",
  };
}

export function normalizeRecordOfAchievement(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join("\n");
  return String(value);
}

export async function resolveForceUnits(db, force) {
  if (!force) return force;

  const recordOfAchievement = normalizeRecordOfAchievement(force.recordOfAchievement);
  const entries = Array.isArray(force.units) ? force.units : [];
  if (entries.length === 0) {
    return { ...force, units: [], recordOfAchievement };
  }

  const objectIds = [];
  const indexMap = []; // { kind: 'ref'|'embedded', value }

  for (const entry of entries) {
    if (isObjectIdRef(entry)) {
      const oid = entry instanceof ObjectId ? entry : new ObjectId(String(entry));
      indexMap.push({ kind: "ref", oid });
      objectIds.push(oid);
    } else if (typeof entry === "object") {
      indexMap.push({ kind: "embedded", value: mapUnitDoc(entry) });
    }
  }

  let fetchedById = new Map();
  if (objectIds.length > 0) {
    const docs = await db
      .collection("units")
      .find({ _id: { $in: objectIds } })
      .toArray();
    fetchedById = new Map(docs.map((d) => [String(d._id), mapUnitDoc(d)]));
  }

  const units = indexMap.map((item) => {
    if (item.kind === "embedded") return item.value;
    return fetchedById.get(String(item.oid)) ?? null;
  }).filter(Boolean);

  return { ...force, units, recordOfAchievement };
}

export async function resolveForcesUnits(db, forces) {
  return Promise.all(forces.map((f) => resolveForceUnits(db, f)));
}

export function sumPointsValue(units) {
  if (!Array.isArray(units)) return 0;
  return units.reduce((sum, u) => {
    const n = Number(u.pointsValue ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function parseFiniteNumber(value, defaultValue = 0) {
  const n = Number(value ?? defaultValue);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recalculate supplyUsed from:
 * - all documents in `units` with this forceId
 * - plus any still-embedded plain objects on force.units
 */
export async function recalculateSupplyUsed(db, forceId) {
  const forceObjectId = forceId instanceof ObjectId ? forceId : new ObjectId(String(forceId));
  const force = await db.collection("forces").findOne({ _id: forceObjectId });
  if (!force) return 0;

  const collectionUnits = await db
    .collection("units")
    .find({ forceId: forceObjectId })
    .toArray();

  const embedded = (Array.isArray(force.units) ? force.units : []).filter(
    (entry) => !isObjectIdRef(entry) && typeof entry === "object"
  );

  return sumPointsValue([...collectionUnits, ...embedded]);
}
