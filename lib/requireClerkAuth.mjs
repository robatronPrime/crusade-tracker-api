import { verifyToken } from "@clerk/backend";

export function createRequireClerkAuth(verify) {
  return async function requireClerkAuth(req, res, next) {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!process.env.CLERK_SECRET_KEY) {
      console.error("requireClerkAuth: CLERK_SECRET_KEY is not set");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    try {
      const payload = await verify(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      const clerkID = payload?.sub;
      if (!clerkID) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      req.clerkID = clerkID;
      return next();
    } catch (error) {
      console.error(
        "requireClerkAuth: token verify failed",
        error instanceof Error ? error.message : "unknown"
      );
      return res.status(401).json({ error: "Unauthorized" });
    }
  };
}

export const requireClerkAuth = createRequireClerkAuth(verifyToken);
