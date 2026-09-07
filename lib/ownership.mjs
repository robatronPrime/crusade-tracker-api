import { ObjectId } from "mongodb";

export function assertSelf(req, res, clerkID) {
  if (req.clerkID !== clerkID) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

export function sendOwnershipError(res, error) {
  return res.status(error.status).json(error.body);
}

export async function loadOwnedForce(db, req, forceId) {
  if (!ObjectId.isValid(forceId)) {
    return { error: { status: 400, body: { error: "Invalid ID" } } };
  }

  const force = await db.collection("forces").findOne({
    _id: new ObjectId(forceId),
  });

  if (!force) {
    return { error: { status: 404, body: { error: "Force not found" } } };
  }

  if (force.userId !== req.clerkID) {
    return { error: { status: 403, body: { error: "Forbidden" } } };
  }

  return { force };
}

export async function loadOwnedUnit(db, req, unitId) {
  if (!ObjectId.isValid(unitId)) {
    return { error: { status: 400, body: { error: "Invalid ID" } } };
  }

  const unit = await db.collection("units").findOne({
    _id: new ObjectId(unitId),
  });

  if (!unit) {
    return { error: { status: 404, body: { error: "Unit not found" } } };
  }

  const forceId = unit.forceId?.toString?.() ?? String(unit.forceId);
  const owned = await loadOwnedForce(db, req, forceId);
  if (owned.error) {
    return owned;
  }

  return { unit, force: owned.force };
}
