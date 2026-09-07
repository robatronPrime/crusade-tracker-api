import cors from "cors";
import express from "express";
import "express-async-errors";
import "./loadEnvironment.mjs";
import { requireClerkAuth } from "./lib/requireClerkAuth.mjs";
import forces from "./routes/forces.mjs";
import units from "./routes/units.mjs";
import users from "./routes/users.mjs";

const PORT = process.env.PORT || 5050;
const app = express();

const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  console.error("CORS_ORIGIN is not set");
}

app.use(
  cors({
    origin: corsOrigin || false,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/forces", requireClerkAuth, forces);
app.use("/users", requireClerkAuth, users);
app.use("/units", requireClerkAuth, units);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send("Uh oh! An unexpected error occured.");
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
