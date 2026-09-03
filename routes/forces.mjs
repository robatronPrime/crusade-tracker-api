import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/conn.mjs";
import { resolveForceUnits, sumPointsValue } from "../lib/resolveForceUnits.mjs";

const router = express.Router();

// Create unit collection add refernce in forces
// Get a list of 50 forces
router.get("/", async (req, res) => {
  let collection = await db.collection("forces");
  let results = await collection.find({}).limit(50).toArray();

  res.send(results).status(200);
});

// Fetches the latest forces
router.get("/latest", async (req, res) => {
  let collection = await db.collection("forces");
  let results = await collection
    .aggregate([{ $project: { author: 1, title: 1, tags: 1, date: 1 } }, { $sort: { date: -1 } }, { $limit: 3 }])
    .toArray();
  res.send(results).status(200);
});

router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const result = await db.collection("forces").findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!result) {
      return res.status(404).json({ error: "Force not found" });
    }

    const populated = await resolveForceUnits(db, result);
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
      recordOfAchievement: forceData.recordOfAchievement ?? [],
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
        modelCount: Number(u.modelCount ?? 0),
        pointsValue: Number(u.pointsValue ?? 0),
        crusadePoints: Number(u.crusadePoints ?? 0),
        type: u.type ?? "",
        battlesPlayed: 0,
        battlesSurvived: 0,
        enemyUnitsDestroyed: 0,
        xp: 0,
        wargear: [],
        enhancements: [],
        battleHonours: [],
        battleScars: [],
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
  const query = { _id: ObjectId(req.params.id) };
  const updates = {
    $push: { name: req.body }
  };

  let collection = await db.collection("forces");
  let result = await collection.updateOne(query, updates);

  res.send(result).status(200);
});

// Update the force with a new record of achievemnet
router.patch("/recordOfAchievemnet/:id", async (req, res) => {
  const query = { _id: ObjectId(req.params.id) };
  const updates = {
    $push: { recordOfAchievemnet: req.body }
  };

  let collection = await db.collection("forces");
  let result = await collection.updateOne(query, updates);

  res.send(result).status(200);
});

// Delete an entry
router.delete("/:id", async (req, res) => {
  const query = { _id: ObjectId(req.params.id) };

  const collection = db.collection("forces");
  let result = await collection.deleteOne(query);

  res.send(result).status(200);
});

export default router;
