import express from "express";
import { ObjectId } from "mongodb";

const router = express.Router();

// Get list of units
router.get("/", async (req, res) => {
    let collection = await db.collection("units");
    let results = await collection.fint({}).limit(50).toArray();

    res.send(results).status(200);
});

// Get single unit
router.get("/:id", async (req, res) => {
    let collection = await db.collection("units");
    let query = { _id: ObjectId(req.params.id) };
    let result = await collection.findOne(query);

    if (!result) res.send("Not found").status(404);
    else res.send(result).status(200);
});

// Add new unit
router.post("/", async (req, res) => {
    let collection = await db.collection("units");
    let newDocument = req.body;
    let result = await collection.insertOne(newDocument);
    res.send(result).status(200);
});

// Delete unit
router.delete("/:id", async (req, res) => {
    const query = { _id: ObjectId(req.params.id) };

    const collection = db.collection("units");
    let result = await collection.deleteOne(query);

    res.send(result).status(200);
});
