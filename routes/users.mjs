import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/conn.mjs";

const router = express.Router();

// Get list of users
router.get("/", async (req, res) => {
  let collection = await db.collection("users");
  let results = await collection.find({}).limit(50).toArray();

  res.send(results).status(200);
});

// Get single user
router.get("/:id", async (req, res) => {
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

  const result = {
    ...user,
    forces: forceDocs,
  }

  console.log(result);
  
  return res.status(200).send(result);
});

// Add new user
router.post("/", async (req, res) => {
  try {
    let collection = await db.collection("users");
    const { clerkID, forces } = req.body;
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
  const query = { _id: ObjectId(req.params.id) };

  const collection = db.collection("users");
  let result = await collection.deleteOne(query);

  res.send(result).status(200);
});

router.get("/:id/forces", async (req, res) => {
  try {
    const user = await db.collection("users").findOne({ clerkID: req.params.id });

    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }

    const forces = await db
      .collection("forces")
      .find({ _id: { $in: user.forces.map((id) => new ObjectId(id)) } })
      .toArray();

    return res.status(200).send(forces);
  } catch (error) {
    console.error("Error fetching user forces:", error);
    return res.status(500).send({ error: "Server error" });
  }
});

export default router;
