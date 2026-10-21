import { Request, Response, NextFunction } from "express";

/**
 * Middleware สำหรับตรวจสอบ Client ID และ Secret Key จาก Request Headers
 * รองรับชื่อ Headers ได้ทั้ง:
 * - x-client-id / x-secret-key

 */
export const verifyApiKey = (req: Request, res: Response, next: NextFunction) => {
  const clientId = (req.headers["x-client-id"]) as string | undefined;

  const secretKey = (req.headers["x-secret-key"]) as string | undefined;

  const expectedClientId = process.env.CLIENT_ID || process.env.ClIENT_ID;
  const expectedSecretKey = process.env.SECRET_KEY;

  if (!clientId || !secretKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Missing Client ID or Secret Key in headers",
    });
  }

  if (clientId !== expectedClientId || secretKey !== expectedSecretKey) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Invalid Client ID or Secret Key",
    });
  }

  next();
};
