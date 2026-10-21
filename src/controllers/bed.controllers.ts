import { Request, Response } from "express";
import { PsychiatryrateService } from "../services/psychiatry/psychiatryrate.service";
import { PsychiatrybedService } from "../services/psychiatry/psychiatrybed.service";

export class BedController {
    /**
     * GET /api/psychiatry-rate
     * ดึงสถิติอัตราครองเตียงผู้ป่วยจิตเวช
     */
    static async getPsychiatryrate(req: Request, res: Response) {
        try {
            const data = await PsychiatryrateService.getPsychiatryrate(req.query);

            // หากระบุ raw=true ใน query ให้ส่งคืนเป็น array ตรงๆ
            if (req.query.raw === "true") {
                return res.status(200).json(data);
            }

            // รูปแบบมาตรฐาน { success: true, data }
            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error: any) {
            console.error("Error in BedController.getPsychiatryrate:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error",
            });
        }
    }

    /**
     * GET /api/psychiatry-bed
     * ดึงข้อมูลสถานะเตียงผู้ป่วยจิตเวช
     */
    static async getPsychiatrybed(req: Request, res: Response) {
        try {
            const data = await PsychiatrybedService.getPsychiatrybed(req.query);

            // หากระบุ raw=true ใน query ให้ส่งคืนเป็น array ตรงๆ
            if (req.query.raw === "true") {
                return res.status(200).json(data);
            }

            // รูปแบบมาตรฐาน { success: true, data }
            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error: any) {
            console.error("Error in BedController.getPsychiatrybed:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error",
            });
        }
    }

    /**
     * POST /api/user/bed-occupancy หรือ POST /api/v1/bed-occupancy
     * รายงานอัตราการครองเตียงรายเดือน (ส่ง payload { data } ไปยังระบบปลายทาง หรือคืนค่า payload)
     */
    static async postBedOccupancy(req: Request, res: Response) {
        try {
            const targetUrl =
                req.body?.targetUrl ||
                (req.query?.targetUrl as string) ||
                process.env.EXTERNAL_BED_OCCUPANCY_URL;

            // หากมี targetUrl กำหนดไว้ ให้ยิงส่ง payload ไปยังระบบปลายทาง
            if (targetUrl) {
                const result = await PsychiatryrateService.sendBedOccupancy({
                    targetUrl,
                    query: req.query,
                });

                return res.status(result.status || 200).json(result);
            }

            // หากยังไม่มี targetUrl ให้จัดเตรียม payload รูปแบบ { data: [...] } ตามสเปกของปลายทาง
            const rateData = await PsychiatryrateService.getPsychiatryrate(req.query);
            const payload = {
                data: rateData,
            };

            // คืนค่ารูปแบบ payload { data: [...] } ตามสเปก Swagger
            return res.status(201).json(payload);
        } catch (error: any) {
            console.error("Error in BedController.postBedOccupancy:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error",
            });
        }
    }

    /**
     * POST /api/user/psychiatry-bed หรือ POST /api/v1/psych-bed/report
     * รายงานสถานะเตียงจิตเวช (ส่ง payload { beds, sendType } ไปยังระบบปลายทาง หรือคืนค่า payload)
     */
    static async postPsychiatrybed(req: Request, res: Response) {
        try {
            const targetUrl =
                req.body?.targetUrl ||
                (req.query?.targetUrl as string) ||
                process.env.EXTERNAL_PSYCH_BED_REPORT_URL;

            if (targetUrl) {
                const result = await PsychiatrybedService.sendPsychBedReport({
                    targetUrl,
                    query: req.query,
                    sendType: req.body?.sendType || "REST API",
                });

                return res.status(result.status || 200).json(result);
            }

            const beds = await PsychiatrybedService.getPsychiatrybed(req.query);
            const payload = {
                beds,
                sendType: req.body?.sendType || "REST API",
            };

            return res.status(201).json(payload);
        } catch (error: any) {
            console.error("Error in BedController.postPsychiatrybed:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error",
            });
        }
    }
}

export default BedController;
