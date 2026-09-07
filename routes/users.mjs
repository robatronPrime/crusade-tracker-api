import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/conn.mjs";
import { resolveForcesUnits } from "../lib/resolveForceUnits.mjs";
import { assertSelf } from "../lib/ownership.mjs";

const router = express.Router();

// Get list of users
router.get("/", async (req, res) => {
  return res.status(403).json({ error: "Forbidden" });
});

// Get single user
router.get("/:id", async (req, res) => {
  if (!assertSelf(req, res, req.params.id)) {
    return;
  }

  let query = { clerkID: req.params.id };
  let users = await db.collection("users");
  const forces = await db.collection("forces");

  let user = await users.findOne(query);

  if (!user) {
    return res.status(404).send("Not found");
  }

  const forceDocs = await forces
    .find({
      _id: { $in: user.forces },
    })
    .toArray();

  const populatedForces = await resolveForcesUnits(db, forceDocs);

  const result = {
    ...user,
    forces: populatedForces,
  };
  
  return res.status(200).send(result);
});

// Add new user
router.post("/", async (req, res) => {
  try {
    let collection = await db.collection("users");
    const clerkID = req.clerkID;
    const forces = req.body?.forces ?? [];
    const existingUser = await collection.findOne({ clerkID });
    if (existingUser) {
      return res.status(200).send({ message: "User already exists", user: existingUser });
    }
    const result = await collection.insertOne({ clerkID, forces });
    return res.status(201).send({ message: "User created", result });
  } catch (error) {
    console.error("Error creating user:", err);
    return res.status(500).send({ error: "Internal Server Error" });
  }
});

// Delete user
router.delete("/:id", async (req, res) => {
  if (req.params.id.startsWith("user_")) {
    if (!assertSelf(req, res, req.params.id)) {
      return;
    }
  } else {
    const user = await db.collection("users").findOne({
      _id: ObjectId(req.params.id),
    });
    if (!user) {
      return res.status(404).send("Not found");
    }
    if (!assertSelf(req, res, user.clerkID)) {
      return;
    }
  }

  const query = { _id: ObjectId(req.params.id) };

  const collection = db.collection("users");
  let result = await collection.deleteOne(query);

  res.send(result).status(200);
});

router.get("/:id/forces", async (req, res) => {
  try {
    if (!assertSelf(req, res, req.params.id)) {
      return;
    }

    const user = await db.collection("users").findOne({ clerkID: req.params.id });

    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }

    const forces = await db
      .collection("forces")
      .find({ _id: { $in: user.forces.map((id) => new ObjectId(id)) } })
      .toArray();

    const populated = await resolveForcesUnits(db, forces);
    return res.status(200).send(populated);
  } catch (error) {
    console.error("Error fetching user forces:", error);
    return res.status(500).send({ error: "Server error" });
  }
});

export default router;
