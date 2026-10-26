import db from "../../models/ppkhosp/index";
import { Op, QueryTypes } from "sequelize";
import { DateUtil } from "../../utils/date.util";

export interface PsychiatryRateData {
    month: string;              // Format: "YYYY-MM" (เดือน)
    startDate: string;          // Format: "YYYY-MM-DD" (วันแรกของเดือน)
    endDate: string;            // Format: "YYYY-MM-DD" (วันสุดท้ายของเดือน)
    totalPatientDays: number;   // Int (จำนวนวันนอนรวมทุกคน)
    totalBeds: number;          // Int (จำนวนเตียงจิตเวช)
    daysInPeriod: number;       // Int (จำนวนวันในเดือน)
    bedOccupancyRate: number;   // Float (อัตราครองเตียง %)
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
     * ตามหลักสถิติสาธารณสุขและการตรวจนับยอดเที่ยงคืน (Midnight Census)
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
        const isDischargedInMonth = dischDateStr !== null && dischDateStr <= periodEndStr;

        if (!isDischargedInMonth) {
            // ยังนอนรักษาอยู่จนสิ้นสุดเดือน / ยังไม่จำหน่าย
            return this.diffInDays(effStartStr, periodEndStr) + 1;
        } else {
            // มีการจำหน่ายออกภายในเดือนนี้
            if (admitDateStr < periodStartStr) {
                // เข้ารักษาก่อนเดือนนี้ และจำหน่ายในเดือนนี้
                const days = this.diffInDays(periodStartStr, dischDateStr!);
                return Math.max(0, days);
            } else {
                // ทั้งเข้ารักษาและจำหน่ายออกในเดือนเดียวกัน
                if (admitDateStr === dischDateStr) {
                    // รับไว้รักษาและจำหน่ายในวันเดียวกัน นับเป็น 1 วันนอน
                    return 1;
                } else {
                    return Math.max(1, this.diffInDays(effStartStr, dischDateStr!));
                }
            }
        }
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
            let totalBeds = await db.ipd_bed.count({
                where: {
                    locationid: targetLocationId,
                    [Op.or]: [
                        { flag_active: "Y" },
                        { flag_active: null },
                        { flag_active: "" },
                    ],
                },
            });

            // หากไม่มี flag_active ให้ลองนับเตียงทั้งหมดตาม locationid
            if (!totalBeds || totalBeds === 0) {
                totalBeds = await db.ipd_bed.count({
                    where: { locationid: targetLocationId },
                });
            }

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

            // 2. ดึงข้อมูลการครองเตียงเฉพาะที่เกิดขึ้นในวอร์ดจาก ipd_reg ครอบคลุมช่วงเวลาใน Query เดียว
            const firstMonth = targetMonths[0];
            const lastMonth = targetMonths[targetMonths.length - 1];
            const overallStart = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
            const lastMonthDays = new Date(lastMonth.year, lastMonth.month, 0).getDate();
            const overallEnd = `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-${String(lastMonthDays).padStart(2, "0")}`;

            const overallStartDateTime = new Date(`${overallStart}T00:00:00.000`);
            const overallEndDateTime = new Date(`${overallEnd}T23:59:59.999`);

            // ดึงข้อมูลการครองเตียงเฉพาะที่เกิดขึ้นจริงในวอร์ดจิตเวชจาก ipd_reg เชื่อมกับ pat_admit
            const admissions = (await db.sequelize.query(
                `
                SELECT 
                    r.an,
                    r.hn,
                    DATE_FORMAT(r.startdatetime, '%Y-%m-%d') AS admitdatetime,
                    DATE_FORMAT(COALESCE(r.enddatetime, a.dischargedatetime), '%Y-%m-%d') AS dischargedatetime
                FROM ipd_reg r
                INNER JOIN pat_admit a ON r.an = a.an
                WHERE r.locationid = :targetLocationId
                  AND (r.flag_status IS NULL OR r.flag_status != 'C')
                  AND (a.flag_cancel IS NULL OR a.flag_cancel != 'Y')
                  AND (a.admitdoctorid IS NOT NULL)
                  AND r.startdatetime <= :overallEndDateTime
                  AND (
                      COALESCE(r.enddatetime, a.dischargedatetime) IS NULL 
                      OR COALESCE(r.enddatetime, a.dischargedatetime) >= :overallStartDateTime
                  )
                ORDER BY r.startdatetime ASC
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
    static async sendBedOccupancy(options: {
        targetUrl?: string;
        query?: Record<string, any>;
    } = {}): Promise<{
        success: boolean;
        status: number;
        message: string;
        sentPayload: { data: PsychiatryRateData[] };
        response?: any;
    }> {
        try {
            // 1. ดึงข้อมูลอัตราครองเตียง
            const rateData = await this.getPsychiatryrate(options.query || {});

            // 2. จัดรูปแบบ payload: { data: [...] }
            const payload = {
                data: rateData,
            };

            const targetUrl =
                options.targetUrl ||
                process.env.EXTERNAL_BED_OCCUPANCY_URL

            if (!targetUrl) {
                // หากยังไม่มีการกำหนด URL ปลายทาง ให้คืนค่า payload ที่เตรียมไว้พร้อมแจ้งเตือน
                return {
                    success: false,
                    status: 400,
                    message: "Missing targetUrl: please provide targetUrl or set EXTERNAL_BED_OCCUPANCY_URL in .env",
                    sentPayload: payload,
                };
            }

            const clientId =
                process.env.CLIENT_ID ||
                process.env.ClIENT_ID ||
                "";
            const secretKey =
                process.env.SECRET_KEY ||
                "";

            // 3. ส่ง HTTP POST ไปยังระบบปลายทาง
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-client-id": clientId,
                    "x-secret-key": secretKey,
                },
                body: JSON.stringify(payload),
            });

            const resData = await response.json().catch(() => null);

            return {
                success: response.ok || response.status === 201,
                status: response.status,
                message: response.ok || response.status === 201
                    ? "Successfully sent bed occupancy data to external API"
                    : `External API responded with status ${response.status}`,
                sentPayload: payload,
                response: resData,
            };
        } catch (error: any) {
            console.error("Error in PsychiatryrateService.sendBedOccupancy:", error);
            throw error;
        }
    }
}