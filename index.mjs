import cors from "cors";
import express from "express";
import "express-async-errors";
import "./loadEnvironment.mjs";
import forces from "./routes/forces.mjs";
import units from "./routes/units.mjs";
import users from "./routes/users.mjs";

const PORT = process.env.PORT || 5050;
const app = express();

app.use(cors());
app.use(express.json());

app.use("/forces", forces);
app.use("/users", users);
app.use("/units", units);

// Global error handling
app.use((err, _req, res, next) => {
    res.status(500).send("Uh oh! An unexpected error occured.");
});

// start the Express server
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
