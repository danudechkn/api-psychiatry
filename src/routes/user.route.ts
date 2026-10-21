import { Router } from "express";
import { BedController } from "../controllers/bed.controllers";
import { verifyApiKey } from "../middleware/auth.middleware";

const router = Router();

// =======================================================
// 1. หมวดอัตราการครองเตียง (Bed Occupancy Rate)
// =======================================================
// [GET] ดึงข้อมูลอัตราการครองเตียง
router.get("/psychiatry-rate", verifyApiKey, BedController.getPsychiatryrate);

// [POST] ส่งรายงานอัตราการครองเตียง (ตรงกับ /api/v1/bed-occupancy ของ PBMS)
router.post("/psychiatry-rate", verifyApiKey, BedController.postBedOccupancy);


// =======================================================
// 2. หมวดสถานะเตียงจิตเวช 30 เตียง (Psychiatry Bed Status)
// =======================================================
// [GET] ดึงข้อมูลสถานะเตียงและโรคประจำเตียง (pdx, dx0-dx5, sex, age)
router.get("/psych-bed/report", verifyApiKey, BedController.getPsychiatrybed);

// [POST] ส่งรายงานสถานะเตียง (ตรงกับ /api/v1/psych-bed/report ของ PBMS)
router.post("/psych-bed/report", verifyApiKey, BedController.postPsychiatrybed);

export default router;
