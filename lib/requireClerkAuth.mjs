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
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
  };
}

export const requireClerkAuth = createRequireClerkAuth(verifyToken);
