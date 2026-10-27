import db from "../../models/ppkhosp/index";
import { Op, QueryTypes } from "sequelize";
import { DateUtil } from "../../utils/date.util";
import { LoggerUtil } from "../../utils/logger.util";

export interface PsychiatryRateData {
    month: string;              // Format: "YYYY-MM" (เดือน)
    startDate: string;          // Format: "YYYY-MM-DD" (วันแรกของเดือน)
    endDate: string;            // Format: "YYYY-MM-DD" (วันสุดท้ายของเดือน)
    totalPatientDays: number;   // Int (จำนวนวันนอนรวมทุกคน)
    totalBeds: number;          // Int (จำนวนเตียงจิตเวช)
    daysInPeriod: number;       // Int (จำนวนวันในเดือน)
    bedOccupancyRate: number;   // Float (อัตราครองเตียง %)
}

export interface SendBedOccupancyOptions {
    targetUrl?: string;
    query?: Record<string, any>;
    timeoutMs?: number;
}

export interface SendBedOccupancyResult {
    success: boolean;
    status: number;
    message: string;
    sentPayload: { data: PsychiatryRateData[] };
    response?: any;
}

export class PsychiatryrateService {
    /**
     * คำนวณผลต่างจำนวนวันตามปฏิทินระหว่างวันที่สองวัน (รูปแบบ YYYY-MM-DD)
     */
    private static diffInDays(startDateStr: string, endDateStr: string): number {
        return DateUtil.diffInDays(startDateStr, endDateStr);
    }

    /**
     * แปลง Date หรือ string ให้อยู่ในรูป 'YYYY-MM-DD'
     */
    private static formatDate(d: Date | string): string {
        return DateUtil.formatDate(d);
    }

    /**
     * คำนวณจำนวนวันนอนของผู้ป่วย 1 การ Admit ในรอบระยะเวลา [periodStartStr, periodEndStr]
     * ตามยอดจำนวนวันนอนทั้งหมดใน ward
     */
    private static calculateAdmissionDays(
        admitdatetime: Date | string,
        dischargedatetime: Date | string | null | undefined,
        periodStartStr: string,
        periodEndStr: string
    ): number {
        const admitDateStr = typeof admitdatetime === "string" && admitdatetime.length === 10
            ? admitdatetime
            : this.formatDate(admitdatetime);

        const hasValidDischarge =
            dischargedatetime &&
            (typeof dischargedatetime === "string" ? dischargedatetime.length >= 10 : (
                !isNaN(new Date(dischargedatetime).getTime()) &&
                new Date(dischargedatetime).getFullYear() > 1970
            ));

        const dischDateStr = hasValidDischarge
            ? (typeof dischargedatetime === "string" && dischargedatetime.length === 10
                ? dischargedatetime
                : this.formatDate(dischargedatetime!))
            : null;

        // อยู่นอกช่วงการประเมิน
        if (dischDateStr && dischDateStr < periodStartStr) return 0;
        if (admitDateStr > periodEndStr) return 0;

        // Safeguard: ป้องกันผู้ป่วยในอดีตที่ลืมกดจำหน่ายในระบบ (dischargedatetime เป็น null นานเกิน 60 วัน)
        if (!hasValidDischarge && this.diffInDays(admitDateStr, periodStartStr) > 60) {
            return 0;
        }

        const effStartStr = admitDateStr < periodStartStr ? periodStartStr : admitDateStr;
        const effEndStr = (dischDateStr && dischDateStr < periodEndStr) ? dischDateStr : periodEndStr;

        if (admitDateStr === dischDateStr && dischDateStr >= periodStartStr && dischDateStr <= periodEndStr) {
            // รับไว้รักษาและจำหน่ายในวันเดียวกัน นับเป็น 1 วันนอน
            return 1;
        }

        // ถ้าผู้ป่วยยังนอนอยู่ ณ สิ้นช่วง (ไม่มี discharge หรือ discharge หลังสิ้นช่วง) ให้บวก 1
        // เพื่อนับวันครองเตียงทั้งหมด (รวมวันสุดท้ายของช่วง)
        const stillInAtPeriodEnd = !dischDateStr || dischDateStr > periodEndStr;
        const bonus = stillInAtPeriodEnd ? 1 : 0;

        return Math.max(0, this.diffInDays(effStartStr, effEndStr) + bonus);
    }

    /**
     * ดึงข้อมูลและคำนวณอัตราการครองเตียงผู้ป่วยจิตเวช ย้อนหลัง 12 เดือนจากเดือนปัจจุบัน (หรือตามจำนวนเดือนที่ระบุใน query.months)
     */
    static async getPsychiatryrate(query: Record<string, any> = {}): Promise<PsychiatryRateData[]> {
        try {
            // รหัสวอร์ดจิตเวช (ค่าเริ่มต้น 4090 หรือจาก PSYCHIATRY_WARD_ID ใน .env)
            const targetLocationId =
                query?.locationid ||
                process.env.PSYCHIATRY_WARD_ID ||
                "4090";

            // จำนวนเดือนย้อนหลัง (ค่าเริ่มต้น 12 เดือน)
            const monthsCount = Math.max(1, Number(query?.months) || 12);

            // นับจำนวนเตียงจากตาราง ipd_bed โดยตรงตาม locationid (เช่น 4090)
            let totalBeds = 20;

            // 1. กำหนดช่วงเดือนเป้าหมาย (ค่าเริ่มต้น 12 เดือน)
            const targetMonths: { year: number; month: number }[] = [];
            const now = new Date();

            for (let i = monthsCount - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                targetMonths.push({
                    year: d.getFullYear(),
                    month: d.getMonth() + 1,
                });
            }

            // 2. ดึงข้อมูลการครองเตียงของผู้ป่วยจิตเวชจาก pat_admit เชื่อมกับ ipd_reg
            const firstMonth = targetMonths[0];
            const lastMonth = targetMonths[targetMonths.length - 1];
            const overallStart = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
            const lastMonthDays = new Date(lastMonth.year, lastMonth.month, 0).getDate();
            const overallEnd = `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-${String(lastMonthDays).padStart(2, "0")}`;

            const overallStartDateTime = new Date(`${overallStart}T00:00:00.000`);
            const overallEndDateTime = new Date(`${overallEnd}T23:59:59.999`);

            // ดึงข้อมูลการครองเตียงของผู้ป่วยจิตเวชจาก pat_admit
            const admissions = (await db.sequelize.query(
                `
                SELECT 
                    a.an,
                    a.hn,
                    DATE_FORMAT(a.admitdatetime, '%Y-%m-%d') AS admitdatetime,
                    DATE_FORMAT(a.dischargedatetime, '%Y-%m-%d') AS dischargedatetime
                FROM pat_admit a
                WHERE (
                    a.tolocationid = :targetLocationId 
                    OR a.dischlocationid = :targetLocationId 
                    OR a.presentlocationid = :targetLocationId
                    OR EXISTS (
                        SELECT 1 FROM ipd_reg r 
                        WHERE r.an = a.an 
                          AND r.locationid = :targetLocationId 
                          AND (r.flag_status IS NULL OR r.flag_status != 'C')
                    )
                )
                  AND (a.flag_cancel IS NULL OR a.flag_cancel != 'Y')
                  AND a.admitdatetime <= :overallEndDateTime
                  AND (
                      a.dischargedatetime IS NULL 
                      OR a.dischargedatetime >= :overallStartDateTime
                  )
                ORDER BY a.admitdatetime ASC
                `,
                {
                    replacements: {
                        targetLocationId,
                        overallStartDateTime,
                        overallEndDateTime,
                    },
                    type: QueryTypes.SELECT,
                }
            )) as Array<{ an: string; hn: string; admitdatetime: string; dischargedatetime: string | null }>;

            const results: PsychiatryRateData[] = [];

            // 3. คำนวณสถิติแยกรายเดือน
            for (const { year, month } of targetMonths) {
                const monthStr = String(month).padStart(2, "0");
                const monthKey = `${year}-${monthStr}`;
                const startDate = `${year}-${monthStr}-01`;
                const daysInPeriod = new Date(year, month, 0).getDate();
                const endDate = `${year}-${monthStr}-${String(daysInPeriod).padStart(2, "0")}`;

                let totalPatientDays = 0;

                for (const admit of admissions) {
                    const days = this.calculateAdmissionDays(
                        admit.admitdatetime,
                        admit.dischargedatetime,
                        startDate,
                        endDate
                    );
                    totalPatientDays += days;
                }

                // หากระบุ skipEmpty=true จะข้ามเดือนที่ไม่มีผู้ป่วยนอน
                if (query?.skipEmpty === "true" && totalPatientDays <= 0) {
                    continue;
                }

                // คำนวณอัตราครองเตียง (Bed Occupancy Rate: BOR)
                // สูตร: (จำนวนวันนอนรวมทุกคน / (จำนวนเตียงจิตเวช * จำนวนวันในเดือน)) * 100
                const totalBedDays = totalBeds * daysInPeriod;
                const rawRate = totalBedDays > 0 ? (totalPatientDays / totalBedDays) * 100 : 0;
                const bedOccupancyRate = parseFloat(rawRate.toFixed(1));

                results.push({
                    month: monthKey,
                    startDate,
                    endDate,
                    totalPatientDays,
                    totalBeds,
                    daysInPeriod,
                    bedOccupancyRate,
                });
            }

            // เรียงลำดับจากเดือนล่าสุดไปหาเดือนแรกสุด
            results.sort((a, b) => b.month.localeCompare(a.month));

            return results;
        } catch (error) {
            console.error("Error in PsychiatryrateService.getPsychiatryrate:", error);
            throw error;
        }
    }

    /**
     * ส่งข้อมูลอัตราการครองเตียง (Bed Occupancy Rate) ไปยังระบบปลายทางผ่าน HTTP POST
     * ตามสเปก POST /api/v1/bed-occupancy (Headers: x-client-id, x-secret-key, Body: { data })
     */
    static async sendBedOccupancy(
        options: SendBedOccupancyOptions = {}
    ): Promise<SendBedOccupancyResult> {
        const targetUrl = options.targetUrl || process.env.EXTERNAL_BED_OCCUPANCY_URL;
        const timeoutMs = options.timeoutMs ?? 15000;
        let payload: { data: PsychiatryRateData[] } = { data: [] };

        try {
            // 1. ตรวจสอบ Target URL ก่อน (Fail-fast ป้องกันการ query ข้อมูลหากไม่ได้กำหนด URL)
            if (!targetUrl) {
                const message = "Missing targetUrl: please provide targetUrl or set EXTERNAL_BED_OCCUPANCY_URL in .env";
                const result: SendBedOccupancyResult = {
                    success: false,
                    status: 400,
                    message,
                    sentPayload: payload,
                };

                LoggerUtil.writeApiLog({
                    service: "PsychiatryrateService",
                    action: "sendBedOccupancy",
                    targetUrl: "",
                    success: false,
                    status: 400,
                    message,
                    sentPayload: payload,
                });

                return result;
            }

            // 2. ดึงข้อมูลอัตราครองเตียงและจัดเตรียม Payload
            const rateData = await this.getPsychiatryrate(options.query || {});
            payload = { data: rateData };

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

            const result: SendBedOccupancyResult = {
                success: isSuccess,
                status: response.status,
                message: isSuccess
                    ? "Successfully sent bed occupancy data to external API"
                    : `External API responded with status ${response.status}`,
                sentPayload: payload,
                response: resData,
            };

            // 6. บันทึก Audit Log
            LoggerUtil.writeApiLog({
                service: "PsychiatryrateService",
                action: "sendBedOccupancy",
                targetUrl,
                success: result.success,
                status: result.status,
                message: result.message,
                sentPayload: payload,
                response: resData,
            });

            return result;
        } catch (error: any) {
            console.error("Error in PsychiatryrateService.sendBedOccupancy:", error);

            const isTimeout = error?.name === "AbortError";
            const message = isTimeout
                ? `Request timed out after ${timeoutMs}ms`
                : (error?.message || "Internal server error");

            LoggerUtil.writeApiLog({
                service: "PsychiatryrateService",
                action: "sendBedOccupancy",
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