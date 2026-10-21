import cron from "node-cron";
import { PsychiatrybedService } from "../psychiatry/psychiatrybed.service";
import { PsychiatryrateService } from "../psychiatry/psychiatryrate.service";

export class CronService {
    private static isInitialized = false;

    /**
     * เริ่มต้นการทำงานของระบบตั้งเวลาส่งข้อมูลอัตโนมัติ (Cron Jobs)
     */
    static init() {
        if (this.isInitialized) {
            console.log("[CRON] ระบบ Cron Job ได้รับการเริ่มต้นไปแล้ว");
            return;
        }

        const isEnabled = process.env.ENABLE_DAILY_CRON !== "false";
        if (!isEnabled) {
            console.log("[CRON] ระบบส่งข้อมูลอัตโนมัติถูกปิดอยู่ (ENABLE_DAILY_CRON=false)");
            return;
        }

        // กำหนด Timezone เป็นเวลาประเทศไทย (Asia/Bangkok)
        const cronOptions = {
            timezone: "Asia/Bangkok",
        };

        // 1. ตั้งเวลาส่งสถานะเตียงจิตเวชประจำวัน (psych-bed/report)
        // ค่าเริ่มต้น: ทุกวัน เวลา 06:00 น. ("0 6 * * *")
        const bedCronTime = process.env.CRON_DAILY_BED_SCHEDULE || "0 6 * * *";
        cron.schedule(
            bedCronTime,
            async () => {
                const nowStr = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
                console.log(`\n========================================`);
                console.log(`[CRON ${nowStr}] เริ่มส่งข้อมูลสถานะเตียงจิตเวชประจำวัน (psych-bed/report)...`);
                try {
                    const result = await PsychiatrybedService.sendPsychBedReport();
                    console.log(`[CRON] ผลการส่งสถานะเตียง: ${result.message} (status: ${result.status})`);
                } catch (error: any) {
                    console.error(`[CRON] เกิดข้อผิดพลาดในการส่งสถานะเตียง:`, error?.message || error);
                }
                console.log(`========================================\n`);
            },
            cronOptions
        );
        console.log(`[CRON] ลงทะเบียนส่งเตียงประจำวันสำเร็จ: "${bedCronTime}" (Asia/Bangkok)`);

        // 2. ตั้งเวลาส่งอัตราการครองเตียง (bed-occupancy)
        // ค่าเริ่มต้น: ทุกวัน เวลา 06:05 น. ("5 6 * * *")
        const rateCronTime = process.env.CRON_DAILY_RATE_SCHEDULE || "5 6 * * *";
        cron.schedule(
            rateCronTime,
            async () => {
                const nowStr = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
                console.log(`\n========================================`);
                console.log(`[CRON ${nowStr}] เริ่มส่งข้อมูลอัตราการครองเตียง (bed-occupancy)...`);
                try {
                    const result = await PsychiatryrateService.sendBedOccupancy();
                    console.log(`[CRON] ผลการส่งอัตราครองเตียง: ${result.message} (status: ${result.status})`);
                } catch (error: any) {
                    console.error(`[CRON] เกิดข้อผิดพลาดในการส่งอัตราครองเตียง:`, error?.message || error);
                }
                console.log(`========================================\n`);
            },
            cronOptions
        );
        console.log(`[CRON] ลงทะเบียนส่งอัตราครองเตียงสำเร็จ: "${rateCronTime}" (Asia/Bangkok)`);

        this.isInitialized = true;
    }
}
