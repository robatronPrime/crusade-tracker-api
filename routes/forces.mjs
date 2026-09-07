import express from "express";
import db from "../db/conn.mjs";
import {
  resolveForceUnits,
  parseFiniteNumber,
  sumPointsValue,
  recalculateSupplyUsed,
  normalizeRecordOfAchievement,
} from "../lib/resolveForceUnits.mjs";
import { loadOwnedForce, sendOwnershipError } from "../lib/ownership.mjs";

const router = express.Router();

// Create unit collection add refernce in forces
// Get a list of 50 forces
router.get("/", async (req, res) => {
  const results = await db
    .collection("forces")
    .find({ userId: req.clerkID })
    .limit(50)
    .toArray();
  res.status(200).send(results);
});

// Fetches the latest forces
router.get("/latest", async (req, res) => {
  const results = await db
    .collection("forces")
    .find({ userId: req.clerkID })
    .sort({ date: -1 })
    .limit(3)
    .toArray();
  res.status(200).send(results);
});

router.get("/:id", async (req, res) => {
  try {
    const owned = await loadOwnedForce(db, req, req.params.id);
    if (owned.error) {
      return sendOwnershipError(res, owned.error);
    }

    const populated = await resolveForceUnits(db, owned.force);
    return res.status(200).json(populated);
  } catch (error) {
    console.error("GET /forces/:id error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", async (req, res) => {
  let insertedForceId = null;
  const insertedUnitIds = [];

  try {
    const forceData = req.body;

    if (!forceData || !forceData.userId) {
      return res.status(400).json({ error: "Missing force data or userId" });
    }

    if (forceData.userId !== req.clerkID) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const supplyLimit = Number(forceData.supplyLimit ?? 0);
    if (Number.isNaN(supplyLimit) || supplyLimit < 0) {
      return res.status(400).json({ error: "Invalid supplyLimit" });
    }

    // Accept units as array or JSON string (legacy form payload)
    let incomingUnits = forceData.units ?? [];
    if (typeof incomingUnits === "string") {
      try {
        incomingUnits = incomingUnits ? JSON.parse(incomingUnits) : [];
      } catch {
        return res.status(400).json({ error: "Invalid units payload" });
      }
    }
    if (!Array.isArray(incomingUnits)) {
      return res.status(400).json({ error: "units must be an array" });
    }

    for (const u of incomingUnits) {
      if (!u?.name || String(u.name).trim() === "") {
        return res.status(400).json({ error: "name is required" });
      }
      if (parseFiniteNumber(u.pointsValue, 0) === null) {
        return res.status(400).json({ error: "Invalid pointsValue" });
      }
      if (parseFiniteNumber(u.modelCount, 0) === null) {
        return res.status(400).json({ error: "Invalid modelCount" });
      }
    }

    const supplyUsed = sumPointsValue(incomingUnits);
    if (supplyUsed > supplyLimit) {
      return res.status(400).json({
        error: "Supply limit exceeded",
        supplyUsed,
        supplyLimit,
      });
    }

    const {
      units: _dropUnits,
      supplyUsed: _dropSupplyUsed,
      id: _dropId,
      ...restForce
    } = forceData;

    const forceDoc = {
      ...restForce,
      supplyLimit,
      supplyUsed,
      units: [],
      victories: Number(forceData.victories ?? 0),
      battleTally: Number(forceData.battleTally ?? 0),
      requisitionPoints: Number(forceData.requisitionPoints ?? 0),
      recordOfAchievement: normalizeRecordOfAchievement(forceData.recordOfAchievement),
      date: new Date(),
    };

    const forces = await db.collection("forces");
    const insertResult = await forces.insertOne(forceDoc);

    if (!insertResult.acknowledged) {
      return res.status(500).json({ error: "Failed to insert force" });
    }

    insertedForceId = insertResult.insertedId;

    const unitsCol = await db.collection("units");
    for (const u of incomingUnits) {
      const unitDoc = {
        forceId: insertedForceId,
        name: String(u.name).trim(),
        modelCount: parseFiniteNumber(u.modelCount, 0),
        pointsValue: parseFiniteNumber(u.pointsValue, 0),
        crusadePoints: Number(u.crusadePoints ?? 0),
        type: u.type ?? "",
        battlesPlayed: Number(u.battlesPlayed ?? 0),
        battlesSurvived: Number(u.battlesSurvived ?? 0),
        enemyUnitsDestroyed: Number(u.enemyUnitsDestroyed ?? 0),
        xp: Number(u.xp ?? 0),
        wargear: Array.isArray(u.wargear) ? u.wargear : [],
        enhancements: Array.isArray(u.enhancements) ? u.enhancements : [],
        battleHonours: Array.isArray(u.battleHonours) ? u.battleHonours : [],
        battleScars: Array.isArray(u.battleScars) ? u.battleScars : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const unitInsert = await unitsCol.insertOne(unitDoc);
      if (!unitInsert.acknowledged) {
        throw new Error("Unit insert not acknowledged");
      }
      insertedUnitIds.push(unitInsert.insertedId);
    }

    if (insertedUnitIds.length > 0) {
      await forces.updateOne(
        { _id: insertedForceId },
        { $set: { units: insertedUnitIds } }
      );
    }

    const userUpdate = await db.collection("users").updateOne(
      { clerkID: forceData.userId },
      { $push: { forces: insertedForceId } }
    );

    if (userUpdate.matchedCount === 0) {
      throw new Error("User not found for force link");
    }

    return res.status(201).json({
      forceId: insertedForceId,
      unitIds: insertedUnitIds,
    });
  } catch (error) {
    console.error("POST /forces error:", error);

    try {
      if (insertedUnitIds.length > 0) {
        await db.collection("units").deleteMany({
          _id: { $in: insertedUnitIds },
        });
      }
      if (insertedForceId) {
        await db.collection("forces").deleteOne({ _id: insertedForceId });
      }
    } catch (rollbackError) {
      console.error("POST /forces rollback error:", rollbackError);
    }

    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update the post with a new name
router.patch("/name/:id", async (req, res) => {
  const owned = await loadOwnedForce(db, req, req.params.id);
  if (owned.error) {
    return sendOwnershipError(res, owned.error);
  }

  const query = { _id: owned.force._id };
  const updates = {
    $push: { name: req.body }
  };

  let collection = await db.collection("forces");
  let result = await collection.updateOne(query, updates);

  res.send(result).status(200);
});

// Update the force with a new record of achievemnet
router.patch("/recordOfAchievemnet/:id", async (req, res) => {
  const owned = await loadOwnedForce(db, req, req.params.id);
  if (owned.error) {
    return sendOwnershipError(res, owned.error);
  }

  const query = { _id: owned.force._id };
  const updates = {
    $push: { recordOfAchievemnet: req.body }
  };

  let collection = await db.collection("forces");
  let result = await collection.updateOne(query, updates);

  res.send(result).status(200);
});

router.patch("/:id", async (req, res) => {
  try {
    const owned = await loadOwnedForce(db, req, req.params.id);
    if (owned.error) {
      return sendOwnershipError(res, owned.error);
    }

    const existing = owned.force;
    const forceObjectId = existing._id;

    const body = req.body ?? {};
    const updates = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      updates.name = name;
    }

    if (body.supplyLimit !== undefined) {
      const supplyLimit = parseFiniteNumber(body.supplyLimit, 0);
      if (supplyLimit === null || supplyLimit < 0) {
        return res.status(400).json({ error: "Invalid supplyLimit" });
      }
      const supplyUsed = await recalculateSupplyUsed(db, forceObjectId);
      if (supplyUsed > supplyLimit) {
        return res.status(400).json({
          error: "Supply limit exceeded",
          supplyUsed,
          supplyLimit,
        });
      }
      updates.supplyLimit = supplyLimit;
      updates.supplyUsed = supplyUsed;
    }

    if (body.victories !== undefined) {
      const victories = parseFiniteNumber(body.victories, 0);
      if (victories === null || victories < 0) {
        return res.status(400).json({ error: "Invalid victories" });
      }
      updates.victories = victories;
    }

    if (body.battleTally !== undefined) {
      const battleTally = parseFiniteNumber(body.battleTally, 0);
      if (battleTally === null || battleTally < 0) {
        return res.status(400).json({ error: "Invalid battleTally" });
      }
      updates.battleTally = battleTally;
    }

    if (body.requisitionPoints !== undefined) {
      const requisitionPoints = parseFiniteNumber(body.requisitionPoints, 0);
      if (requisitionPoints === null || requisitionPoints < 0) {
        return res.status(400).json({ error: "Invalid requisitionPoints" });
      }
      updates.requisitionPoints = requisitionPoints;
    }

    if (body.recordOfAchievement !== undefined) {
      updates.recordOfAchievement = normalizeRecordOfAchievement(body.recordOfAchievement);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db.collection("forces").updateOne({ _id: forceObjectId }, { $set: updates });
    const updated = await db.collection("forces").findOne({ _id: forceObjectId });
    const populated = await resolveForceUnits(db, updated);
    return res.status(200).json(populated);
  } catch (error) {
    console.error("PATCH /forces/:id error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete an entry
router.delete("/:id", async (req, res) => {
  try {
    const owned = await loadOwnedForce(db, req, req.params.id);
    if (owned.error) {
      return sendOwnershipError(res, owned.error);
    }

    const existing = owned.force;
    const forceObjectId = existing._id;

    await db.collection("units").deleteMany({ forceId: forceObjectId });
    await db.collection("forces").deleteOne({ _id: forceObjectId });

    try {
      if (existing.userId) {
        await db.collection("users").updateOne(
          { clerkID: existing.userId },
          { $pull: { forces: forceObjectId } }
        );
      }
    } catch (unlinkError) {
      console.error("DELETE /forces/:id user unlink error:", unlinkError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE /forces/:id error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
