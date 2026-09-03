import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/conn.mjs";
import {
  isObjectIdRef,
  parseFiniteNumber,
  recalculateSupplyUsed,
  sumPointsValue,
} from "../lib/resolveForceUnits.mjs";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const results = await db.collection("units").find({}).limit(50).toArray();
    return res.status(200).json(results);
  } catch (error) {
    console.error("GET /units error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// MUST be before /:id
router.get("/force/:forceId", async (req, res) => {
  try {
    const { forceId } = req.params;

    if (!ObjectId.isValid(forceId)) {
      return res.status(400).json({ error: "Invalid force ID" });
    }

    const units = await db
      .collection("units")
      .find({ forceId: new ObjectId(forceId) })
      .toArray();

    return res.status(200).json(units);
  } catch (error) {
    console.error("GET /units/force/:forceId error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const unit = await db.collection("units").findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }

    return res.status(200).json(unit);
  } catch (error) {
    console.error("GET /units/:id error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { forceId, name, modelCount, pointsValue, crusadePoints, type } =
      req.body;

    if (!forceId) {
      return res.status(400).json({ error: "forceId is required" });
    }
    if (!name || String(name).trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    if (!ObjectId.isValid(forceId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const forceObjectId = new ObjectId(forceId);
    const force = await db.collection("forces").findOne({ _id: forceObjectId });

    if (!force) {
      return res.status(404).json({ error: "Force not found" });
    }

    const currentUsed = await recalculateSupplyUsed(db, forceObjectId);
    const incomingPoints = parseFiniteNumber(pointsValue, 0);
    if (incomingPoints === null) {
      return res.status(400).json({ error: "Invalid pointsValue" });
    }
    const parsedModelCount = parseFiniteNumber(modelCount, 0);
    if (parsedModelCount === null) {
      return res.status(400).json({ error: "Invalid modelCount" });
    }
    const supplyLimit = Number(force.supplyLimit ?? 0);
    const supplyUsed = currentUsed + incomingPoints;

    if (supplyUsed > supplyLimit) {
      return res.status(400).json({
        error: "Supply limit exceeded",
        supplyUsed,
        supplyLimit,
      });
    }

    const unit = {
      forceId: forceObjectId,
      name: String(name).trim(),
      modelCount: parsedModelCount,
      pointsValue: incomingPoints,
      crusadePoints: Number(crusadePoints ?? 0),
      type: type ?? "",
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

    const result = await db.collection("units").insertOne(unit);

    await db.collection("forces").updateOne(
      { _id: forceObjectId },
      {
        $push: { units: result.insertedId },
        $set: { supplyUsed },
      }
    );

    return res.status(201).json({ unitId: result.insertedId });
  } catch (error) {
    console.error("POST /units error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const unitObjectId = new ObjectId(req.params.id);
    const existing = await db.collection("units").findOne({ _id: unitObjectId });

    if (!existing) {
      return res.status(404).json({ error: "Unit not found" });
    }

    const updates = { ...req.body, updatedAt: new Date() };
    delete updates._id;
    delete updates.forceId;
    delete updates.id;

    if (updates.modelCount !== undefined) {
      const parsedModelCount = parseFiniteNumber(updates.modelCount, 0);
      if (parsedModelCount === null) {
        return res.status(400).json({ error: "Invalid modelCount" });
      }
      updates.modelCount = parsedModelCount;
    }

    if (updates.pointsValue !== undefined) {
      const parsedPoints = parseFiniteNumber(updates.pointsValue, 0);
      if (parsedPoints === null) {
        return res.status(400).json({ error: "Invalid pointsValue" });
      }
      updates.pointsValue = parsedPoints;
      const force = await db.collection("forces").findOne({
        _id: existing.forceId,
      });
      if (!force) {
        return res.status(404).json({ error: "Force not found" });
      }

      const siblings = await db
        .collection("units")
        .find({ forceId: existing.forceId })
        .toArray();

      const embedded = (Array.isArray(force.units) ? force.units : []).filter(
        (entry) => !isObjectIdRef(entry) && typeof entry === "object"
      );

      const others = siblings.filter((u) => String(u._id) !== String(unitObjectId));
      const supplyUsed =
        sumPointsValue(others) +
        sumPointsValue(embedded) +
        Number(updates.pointsValue);
      const supplyLimit = Number(force.supplyLimit ?? 0);

      if (supplyUsed > supplyLimit) {
        return res.status(400).json({
          error: "Supply limit exceeded",
          supplyUsed,
          supplyLimit,
        });
      }

      await db.collection("units").updateOne(
        { _id: unitObjectId },
        { $set: updates }
      );

      await db.collection("forces").updateOne(
        { _id: existing.forceId },
        { $set: { supplyUsed } }
      );

      return res.status(200).json({ success: true });
    }

    await db.collection("units").updateOne(
      { _id: unitObjectId },
      { $set: updates }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("PATCH /units/:id error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const unitObjectId = new ObjectId(req.params.id);
    const existing = await db.collection("units").findOne({ _id: unitObjectId });

    if (!existing) {
      return res.status(404).json({ error: "Unit not found" });
    }

    await db.collection("units").deleteOne({ _id: unitObjectId });

    await db.collection("forces").updateOne(
      { _id: existing.forceId },
      { $pull: { units: unitObjectId } }
    );

    const supplyUsed = await recalculateSupplyUsed(db, existing.forceId);
    await db.collection("forces").updateOne(
      { _id: existing.forceId },
      { $set: { supplyUsed } }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE /units/:id error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
