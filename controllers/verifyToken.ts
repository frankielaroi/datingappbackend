import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

function verifyToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-access-token"] as string | undefined;
  if (!token) {
    return res.status(403).json({ error: "A token is required for authentication" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach the entire decoded token, which should include userId
    next();
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid Token" });
  }
}

export { verifyToken };
