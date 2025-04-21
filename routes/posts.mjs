import router from "express/lib/router";
import { ObjectId } from "mongodb";

router.get("/", async (req, res) => {
    let collection = await db.collection("posts");
    let results = await collection.find({}).limit(50).toArray();
    res.send(results).status(200);
});

router.get("/:id", async (req, res) => {
    let collection = await db.collection("posts");
    let query = {_id: ObjectId(req.params.id)}
    let results = await collection.findOne(query);
    if (!results) {
        res.send("Not found").status(404);
    } else {
        res.send(results).status(200);
    }
});