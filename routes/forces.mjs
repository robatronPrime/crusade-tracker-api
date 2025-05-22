import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/conn.mjs";

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

// Get a single post
router.get("/:id", async (req, res) => {
  let collection = await db.collection("forces");
  let query = { _id: ObjectId(req.params.id) };
  let result = await collection.findOne(query);

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Add a new document to the collection
router.post("/", async (req, res) => {
  try {
    const forceData = req.body;

    if (!forceData || !forceData.userId) {
      console.error("Error 400: Missing force data or userId");
      return res.status(400).json({ error: "Missing force data or userId" });
    }

    const forceDoc = {
      ...forceData,
      date: new Date()
    };

    const collection = await db.collection("forces");
    const insertResult = await collection.insertOne(forceDoc);

    if (!insertResult.acknowledged) {
      console.error("Error 500: Failed to insert force");
      return res.status(500).json({ error: "Failed to insert force" });
    }

    const forceId = insertResult.insertedId;

    const userCollection = await db.collection("users");
    const query = { clerkID: forceData.userId };
    const update = { $push: { forces: ObjectId(forceId) } };
    const updateResult = await userCollection.updateOne(query, update);

    if (updateResult.modifiedCount === 0) {
      console.error("Error 500: Failed to update user with force ID");
      return res.status(500).json({ error: "Failed to update user with force ID" });
    }

    console.log(res);

    return res.status(201).json({ forceId });
  } catch (error) {
    console.error("POST /forces error:", error);
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
