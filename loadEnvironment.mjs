import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
dotenv.config({ path: envPath });
