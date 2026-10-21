import db from "../../models/ppkhosp/index";
import { Op } from "sequelize";

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
        const d1 = new Date(`${startDateStr}T00:00:00Z`).getTime();
        const d2 = new Date(`${endDateStr}T00:00:00Z`).getTime();
        return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    /**
     * แปลง Date หรือ string ให้อยู่ในรูป 'YYYY-MM-DD'
     */
    private static formatDate(d: Date | string): string {
        const dateObj = new Date(d);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
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
        const admitDateStr = this.formatDate(admitdatetime);
        const hasValidDischarge =
            dischargedatetime &&
            !isNaN(new Date(dischargedatetime).getTime()) &&
            new Date(dischargedatetime).getFullYear() > 1970;

        const dischDateStr = hasValidDischarge
            ? this.formatDate(dischargedatetime!)
            : null;

        // อยู่นอกช่วงการประเมิน
        if (dischDateStr && dischDateStr < periodStartStr) return 0;
        if (admitDateStr > periodEndStr) return 0;

        // Safeguard: ป้องกันผู้ป่วยในอดีตที่ลืมกดจำหน่ายในระบบ (dischargedatetime เป็น null นานเกิน 90 วัน)
        if (!hasValidDischarge && this.diffInDays(admitDateStr, periodStartStr) > 90) {
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
                query?.wardId ||
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

            const wardCondition = {
                [Op.or]: [
                    { tolocationid: String(targetLocationId) },
                    { dischlocationid: String(targetLocationId) },
                ],
            };

            // 1. ค้นหาช่วงวันแรกสุดและวันล่าสุดที่มีการ admit ผู้ป่วยจิตเวชในฐานข้อมูล
            const earliest = await db.pat_admit.findOne({
                where: {
                    ...wardCondition,
                    admitdatetime: {
                        [Op.and]: [
                            { [Op.ne]: null },
                            { [Op.gt]: new Date("1990-01-01") },
                        ],
                    },
                },
                order: [["admitdatetime", "ASC"]],
                attributes: ["admitdatetime"],
                raw: true,
            });

            const latest = await db.pat_admit.findOne({
                where: {
                    ...wardCondition,
                    admitdatetime: {
                        [Op.and]: [
                            { [Op.ne]: null },
                            { [Op.gt]: new Date("1990-01-01") },
                        ],
                    },
                },
                order: [["admitdatetime", "DESC"]],
                attributes: ["admitdatetime", "dischargedatetime"],
                raw: true,
            });

            const targetMonths: { year: number; month: number }[] = [];
            const now = new Date();

            for (let i = monthsCount - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                targetMonths.push({
                    year: d.getFullYear(),
                    month: d.getMonth() + 1,
                });
            }

            // 2. ดึงข้อมูล pat_admit ทั้งหมดครอบคลุมช่วงเวลา 12 เดือนใน Query เดียว
            const firstMonth = targetMonths[0];
            const lastMonth = targetMonths[targetMonths.length - 1];
            const overallStart = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
            const lastMonthDays = new Date(lastMonth.year, lastMonth.month, 0).getDate();
            const overallEnd = `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-${String(lastMonthDays).padStart(2, "0")}`;

            const overallStartDateTime = new Date(`${overallStart}T00:00:00.000`);
            const overallEndDateTime = new Date(`${overallEnd}T23:59:59.999`);

            const admissions = await db.pat_admit.findAll({
                where: {
                    admitdatetime: {
                        [Op.lte]: overallEndDateTime,
                    },
                    [Op.or]: [
                        { dischargedatetime: null },
                        { dischargedatetime: { [Op.gte]: overallStartDateTime } },
                    ],
                    [Op.and]: [wardCondition],
                },
                attributes: ["an", "hn", "admitdatetime", "dischargedatetime"],
                raw: true,
            });

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
                process.env.EXTERNAL_BED_OCCUPANCY_URL ||
                process.env.EXTERNAL_API_URL;

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