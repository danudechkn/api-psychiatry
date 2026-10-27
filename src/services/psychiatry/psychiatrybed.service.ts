import db from "../../models/ppkhosp/index";
import { QueryTypes } from "sequelize";
import { DateUtil } from "../../utils/date.util";
import { LoggerUtil } from "../../utils/logger.util";

export interface PsychiatryBedData {
    bedName: string;          // รหัสหรือชื่อเตียง (เช่น PN01 หรือ 01)
    statusAvailable: number;  // สถานะเตียง 1 ว่าง, 0 ไม่ว่าง
    ward: string;             // รหัส ward
    wardName: string;         // ชื่อ ward
    pdx: string;              // OPD icd10 หลัก
    dx0: string;              // OPD icd10 รอง 1
    dx1: string;              // OPD icd10 รอง 2
    dx2: string;              // OPD icd10 รอง 3
    dx3: string;              // OPD icd10 รอง 4
    dx4: string;              // OPD icd10 รอง 5
    dx5: string;              // OPD icd10 รอง 6
    sex: string;              // 1 ชาย, 2 หญิง
    age_y: number;            // อายุปี
    age_m: number;            // อายุเดือน
    age_d: number;            // อายุวัน
}

export interface SendPsychBedReportOptions {
    targetUrl?: string;
    query?: Record<string, any>;
    sendType?: string;
    timeoutMs?: number;
}

export interface SendPsychBedReportResult {
    success: boolean;
    status: number;
    message: string;
    sentPayload: { beds: PsychiatryBedData[]; sendType: string };
    response?: any;
}

export class PsychiatrybedService {

    /**
     * ดึงข้อมูลสถานะเตียงผู้ป่วยจิตเวช พร้อมข้อมูลการวินิจฉัยโรค (pdx, dx0-dx5), เพศ และอายุ
     */
    static async getPsychiatrybed(query: Record<string, any> = {}): Promise<PsychiatryBedData[]> {
        try {
            // รหัสวอร์ดจิตเวช (ค่าเริ่มต้น 4090 หรือจาก PSYCHIATRY_WARD_ID ใน .env)
            const targetLocationId =
                query?.locationid ||
                process.env.PSYCHIATRY_WARD_ID ||
                "4090";

            // คำนำหน้าชื่อเตียง เช่น 'PN' (ถ้ามีระบุใน query หรือ .env)
            const bedPrefix =
                query?.prefix ||
                query?.bedPrefix ||
                process.env.PSYCHIATRY_BED_PREFIX ||
                "";

            // 1. ดึงชื่อวอร์ดจาก location หรือ v_getward
            const locRows = await db.sequelize.query(
                "SELECT detailtext, shortname FROM location WHERE id = :targetLocationId LIMIT 1",
                {
                    replacements: { targetLocationId },
                    type: QueryTypes.SELECT,
                }
            );
            const loc = locRows[0] as { detailtext?: string; shortname?: string } | undefined;
            const wardName = loc?.detailtext || loc?.shortname || "หอผู้ป่วยจิตเวช";

            // 2. ดึงเตียงทั้งหมดของวอร์ดจิตเวช เชื่อมกับข้อมูลผู้ป่วยที่นอนอยู่ปัจจุบัน
            const beds = await db.sequelize.query(
                `
                SELECT 
                    b.locationid,
                    b.bedno,
                    b.roomno,
                    b.bedtype,
                    b.ipdregid,
                    b.flag_active,
                    b.bedno_beddiagram,
                    r.id AS reg_id,
                    r.an,
                    r.hn,
                    r.startdatetime,
                    r.enddatetime,
                    r.flag_end,
                    a.patvisitid,
                    a.frompatregid,
                    a.admitdatetime,
                    a.dischargedatetime,
                    p.sex,
                    p.birthdatetime
                FROM ipd_bed b
                LEFT JOIN ipd_reg r 
                    ON b.ipdregid = r.id 
                    AND (r.enddatetime IS NULL)
                LEFT JOIN pat_admit a 
                    ON r.an = a.an 
                    AND (a.dischargedatetime IS NULL OR a.dischargedatetime > NOW())
                LEFT JOIN pat p 
                    ON r.hn = p.hn
                WHERE b.locationid = :targetLocationId
                  AND (b.flag_active = 'Y' OR b.flag_active IS NULL OR b.flag_active = '')
                  AND b.bedtype = 'A'
                ORDER BY b.bedno ASC
                `,
                {
                    replacements: { targetLocationId },
                    type: QueryTypes.SELECT,
                }
            ) as any[];

            // 3. รวบรวมข้อมูลผู้ป่วยที่ครองเตียงอยู่เพื่อดึง OPD Diagnosis (pat_diag) ในครั้งเดียว
            const occupiedBeds = beds.filter(
                (b) =>
                    b.ipdregid &&
                    Number(b.ipdregid) > 0 &&
                    b.reg_id &&
                    (!b.dischargedatetime || new Date(b.dischargedatetime) > new Date())
            );

            const anList = Array.from(new Set(occupiedBeds.map((b) => b.an).filter(Boolean)));
            const visitList = Array.from(new Set(occupiedBeds.map((b) => b.patvisitid).filter(Boolean)));
            const regList = Array.from(new Set(occupiedBeds.map((b) => b.frompatregid).filter(Boolean)));

            let diagList: any[] = [];
            if (anList.length > 0 || visitList.length > 0 || regList.length > 0) {
                const diagConditions: string[] = [];
                const replacements: Record<string, any> = {};

                if (anList.length > 0) {
                    diagConditions.push("an IN (:anList)");
                    replacements.anList = anList;
                }
                if (visitList.length > 0) {
                    diagConditions.push("patvisitid IN (:visitList)");
                    replacements.visitList = visitList;
                }
                if (regList.length > 0) {
                    diagConditions.push("patregid IN (:regList)");
                    replacements.regList = regList;
                }

                diagList = (await db.sequelize.query(
                    `
                    SELECT id, hn, an, patvisitid, patregid, icdcode, diagtype, opdipd
                    FROM pat_diag
                    WHERE (${diagConditions.join(" OR ")})
                    AND opdipd = 'O'
                    ORDER BY (CASE WHEN diagtype = 1 THEN 0 ELSE 1 END), diagtype ASC, id ASC
                    `,
                    {
                        replacements,
                        type: QueryTypes.SELECT,
                    }
                )) as any[];
            }

            // 4. ประกอบข้อมูลผลลัพธ์ตามโครงสร้างที่กำหนด
            const results: PsychiatryBedData[] = beds.map((b) => {
                const rawBedNo = (b.bedno_beddiagram && String(b.bedno_beddiagram).trim())
                    ? String(b.bedno_beddiagram).trim()
                    : String(b.bedno).trim();

                const bedName = bedPrefix ? `${bedPrefix}${rawBedNo}` : rawBedNo;

                // ตรวจสอบว่าเตียงว่างหรือไม่ (1 = ว่าง, 0 = ไม่ว่าง)
                const isOccupied = Boolean(
                    b.ipdregid &&
                    Number(b.ipdregid) > 0 &&
                    b.reg_id &&
                    (!b.dischargedatetime || new Date(b.dischargedatetime) > new Date())
                );
                const statusAvailable = isOccupied ? 0 : 1;

                if (!isOccupied) {
                    return {
                        bedName,
                        statusAvailable: 1,
                        ward: String(targetLocationId),
                        wardName,
                        pdx: "",
                        dx0: "",
                        dx1: "",
                        dx2: "",
                        dx3: "",
                        dx4: "",
                        dx5: "",
                        sex: "",
                        age_y: 0,
                        age_m: 0,
                        age_d: 0,
                    };
                }

                // ดึงการวินิจฉัยของผู้ป่วยในเตียงนี้
                const patientDiags = diagList.filter(
                    (d) =>
                        (d.an && d.an === b.an) ||
                        (d.patvisitid && d.patvisitid === b.patvisitid) ||
                        (d.patregid && d.patregid === b.frompatregid)
                );

                let pdx = "";
                const secondaryDx: string[] = [];

                // ค้นหาหลัก (diagtype === 1) ก่อน
                const primaryDiag = patientDiags.find(
                    (d) => d.diagtype === 1 && d.icdcode && String(d.icdcode).trim() !== ""
                );
                if (primaryDiag) {
                    pdx = String(primaryDiag.icdcode).trim();
                }

                // นำ diags อื่นๆ มาเป็น diag รอง (กรองรหัสว่างและไม่ซ้ำ)
                for (const d of patientDiags) {
                    if (!d.icdcode) continue;
                    const code = String(d.icdcode).trim();
                    if (!code) continue;
                    if (primaryDiag && d.id === primaryDiag.id) continue;
                    if (code === pdx && !secondaryDx.includes(code)) continue;
                    if (!secondaryDx.includes(code)) {
                        secondaryDx.push(code);
                    }
                }

                // หากไม่มี diagtype === 1 แต่มี diag อื่น ให้ตัวแรกเป็น pdx
                if (!pdx && secondaryDx.length > 0) {
                    pdx = secondaryDx.shift()!;
                }

                // เพศ: 1 ชาย, 2 หญิง
                const sex = b.sex != null ? String(b.sex) : "";

                // อายุ
                const { age_y, age_m, age_d } = DateUtil.calculateAge(b.birthdatetime);

                return {
                    bedName,
                    statusAvailable: 0,
                    ward: String(targetLocationId),
                    wardName,
                    pdx,
                    dx0: secondaryDx[0] || "",
                    dx1: secondaryDx[1] || "",
                    dx2: secondaryDx[2] || "",
                    dx3: secondaryDx[3] || "",
                    dx4: secondaryDx[4] || "",
                    dx5: secondaryDx[5] || "",
                    sex,
                    age_y,
                    age_m,
                    age_d,
                };
            });
            return results;
        } catch (error) {
            console.error("Error in PsychiatrybedService.getPsychiatrybed:", error);
            throw error;
        }
    }

    /**
     * ส่งรายงานสถานะเตียงจิตเวชไปยัง PBMS API ผ่าน HTTP POST /api/v1/psych-bed/report
     * ตามสเปก ReportBedDto: { beds: [...], sendType: "REST API" }
     */
    static async sendPsychBedReport(
        options: SendPsychBedReportOptions = {}
    ): Promise<SendPsychBedReportResult> {
        const targetUrl = options.targetUrl || process.env.EXTERNAL_PSYCH_BED_REPORT_URL;
        const sendType = options.sendType || "REST API";
        const timeoutMs = options.timeoutMs ?? 15000;
        let payload: { beds: PsychiatryBedData[]; sendType: string } = { beds: [], sendType };

        try {
            // 1. ตรวจสอบ Target URL ก่อน (Fail-fast ป้องกันการ query DB หากไม่มี URL ปลายทาง)
            if (!targetUrl) {
                const message = "Missing targetUrl: please provide targetUrl or set EXTERNAL_PSYCH_BED_REPORT_URL in .env";
                const result: SendPsychBedReportResult = {
                    success: false,
                    status: 400,
                    message,
                    sentPayload: payload,
                };

                LoggerUtil.writeApiLog({
                    service: "PsychiatrybedService",
                    action: "sendPsychBedReport",
                    targetUrl: "",
                    success: false,
                    status: 400,
                    message,
                    sentPayload: payload,
                });

                return result;
            }

            // 2. ดึงข้อมูลสถานะเตียงและจัดเตรียม Payload
            const beds = await this.getPsychiatrybed(options.query || {});
            payload = { beds, sendType };

            // 3. เตรียม Authentication Headers
            const clientId = process.env.CLIENT_ID || process.env.ClIENT_ID || "";
            const secretKey = process.env.SECRET_KEY || "";

            // 4. ส่ง HTTP POST พร้อม Timeout Control ป้องกัน Request ค้าง
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            let response: Response;
            try {
                response = await fetch(targetUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-client-id": clientId,
                        "x-secret-key": secretKey,
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }

            // 5. อ่าน Response จากปลายทาง
            const resData = await response.json().catch(() => null);
            const isSuccess = response.ok;

            const result: SendPsychBedReportResult = {
                success: isSuccess,
                status: response.status,
                message: isSuccess
                    ? "Successfully sent psych bed report to PBMS API"
                    : `PBMS API responded with status ${response.status}`,
                sentPayload: payload,
                response: resData,
            };

            // 6. บันทึก Audit Log
            LoggerUtil.writeApiLog({
                service: "PsychiatrybedService",
                action: "sendPsychBedReport",
                targetUrl,
                success: result.success,
                status: result.status,
                message: result.message,
                sentPayload: payload,
                response: resData,
            });

            return result;
        } catch (error: any) {
            console.error("Error in PsychiatrybedService.sendPsychBedReport:", error);

            const isTimeout = error?.name === "AbortError";
            const message = isTimeout
                ? `Request timed out after ${timeoutMs}ms`
                : (error?.message || "Internal server error");

            LoggerUtil.writeApiLog({
                service: "PsychiatrybedService",
                action: "sendPsychBedReport",
                targetUrl: targetUrl || "",
                success: false,
                status: isTimeout ? 408 : 500,
                message,
                sentPayload: payload,
                error: error?.stack || error,
            });
            return {
                success: false,
                status: isTimeout ? 408 : 500,
                message,
                sentPayload: payload,
                response: error?.response || null,
            };
        }
    }
}