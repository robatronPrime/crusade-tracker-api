import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/conn.mjs";

const router = express.Router();

// Get list of units
router.get("/", async (req, res) => {
    try {
        let collection = await db.collection("units");
        let results = await collection.find({}).limit(50).toArray();

        res.send(results).status(200);
    } catch (error) {
        console.log(error);
        res.send("error").status(500);
    }
});

router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Invalid unit ID"
      });
    }

    const unit = await db
      .collection("units")
      .findOne({
        _id: new ObjectId(req.params.id)
      });

    if (!unit) {
      return res.status(404).json({
        error: "Unit not found"
      });
    }

    return res.status(200).json(unit);
  } catch (error) {
    console.error("GET /units/:id error:", error);

    return res.status(500).json({
      error: "Internal Server Error"
    });
  }
});

// Add new unit
router.post("/", async (req, res) => {
  try {
    const {
      forceId,
      name,
      modelCount,
      pointsValue,
      crusadePoints,
      type
    } = req.body;

    if (!forceId || !name) {
      return res.status(400).json({
        error: "forceId and name are required"
      });
    }

    if (!ObjectId.isValid(forceId)) {
      return res.status(400).json({
        error: "Invalid force ID"
      });
    }

    const forceObjectId = new ObjectId(forceId);

    // Optional but recommended:
    // make sure the force actually exists.
    const force = await db.collection("forces").findOne({
      _id: forceObjectId
    });

    if (!force) {
      return res.status(404).json({
        error: "Force not found"
      });
    }

    const unit = {
      forceId: forceObjectId,

      name,
      modelCount: Number(modelCount ?? 0),
      pointsValue: Number(pointsValue ?? 0),
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
      updatedAt: new Date()
    };

    const result = await db
      .collection("units")
      .insertOne(unit);

    return res.status(201).json({
      unitId: result.insertedId
    });
  } catch (error) {
    console.error("POST /units error:", error);

    return res.status(500).json({
      error: "Internal Server Error"
    });
  }
});

router.get("/force/:forceId", async (req, res) => {
  try {
    const { forceId } = req.params;

    if (!ObjectId.isValid(forceId)) {
      return res.status(400).json({
        error: "Invalid force ID"
      });
    }

    const units = await db
      .collection("units")
      .find({
        forceId: new ObjectId(forceId)
      })
      .toArray();

    return res.status(200).json(units);
  } catch (error) {
    console.error("GET /units/force/:forceId error:", error);

    return res.status(500).json({
      error: "Internal Server Error"
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Invalid unit ID"
      });
    }

    const updates = {
      ...req.body,
      updatedAt: new Date()
    };

    // Never allow these to be replaced through this endpoint
    delete updates._id;
    delete updates.forceId;

    const result = await db
      .collection("units")
      .updateOne(
        {
          _id: new ObjectId(req.params.id)
        },
        {
          $set: updates
        }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Unit not found"
      });
    }

    return res.status(200).json({
      success: true
    });
  } catch (error) {
    console.error("PATCH /units/:id error:", error);

    return res.status(500).json({
      error: "Internal Server Error"
    });
  }
});

// Delete unit
router.delete("/:id", async (req, res) => {
    const query = { _id: ObjectId(req.params.id) };

    const collection = db.collection("units");
    let result = await collection.deleteOne(query);

    res.send(result).status(200);
});

export default router;
