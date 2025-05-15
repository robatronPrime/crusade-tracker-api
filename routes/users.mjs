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
  let collection = await db.collection("users");
  let query = { clerkID: req.params.id };
  console.log(collection);

  let result = await collection.findOne(query);

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
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

export default router;
