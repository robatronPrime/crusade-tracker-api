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
    let collection = await db.collection("users");
    let newDocument = req.body;
    let result = await collection.insertOne(newDocument);
    res.send(result).status(200);
});

// Delete user
router.delete("/:id", async (req, res) => {
    const query = { _id: ObjectId(req.params.id) };

    const collection = db.collection("users");
    let result = await collection.deleteOne(query);

    res.send(result).status(200);
});

export default router;
