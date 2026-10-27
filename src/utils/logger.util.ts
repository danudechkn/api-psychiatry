import fs from "fs";
import path from "path";

export interface ApiLogEntry {
    service: string;
    action: string;
    targetUrl: string;
    success: boolean;
    status: number;
    message: string;
    sentPayload?: any;
    response?: any;
    error?: any;
}

export class LoggerUtil {
    private static logsDir = path.resolve(process.cwd(), "logs");

    /**
     * บันทึก Log การส่งข้อมูล API ออกไปยังภายนอกลงไฟล์รายวัน (.log)
     * ตัวอย่างไฟล์: logs/api-report-2026-10-27.log
     */
    static writeApiLog(entry: ApiLogEntry) {
        try {
            if (!fs.existsSync(this.logsDir)) {
                fs.mkdirSync(this.logsDir, { recursive: true });
            }

            const now = new Date();
            // วันที่รูปแบบ YYYY-MM-DD
            const dateStr = now.toLocaleDateString("en-CA");
            // เวลาประเทศไทย HH:mm:ss
            const timeStr = now.toLocaleTimeString("th-TH", {
                timeZone: "Asia/Bangkok",
                hour12: false,
            });

            const logFileName = `api-report-${dateStr}.log`;
            const filePath = path.join(this.logsDir, logFileName);

            const divider = "================================================================================";
            const logLines = [
                divider,
                `[TIMESTAMP]  : ${dateStr} ${timeStr} (Asia/Bangkok)`,
                `[SERVICE]    : ${entry.service}`,
                `[ACTION]     : ${entry.action}`,
                `[TARGET URL] : ${entry.targetUrl}`,
                `[HTTP STATUS]: ${entry.status} (${entry.success ? "SUCCESS" : "FAILED"})`,
                `[MESSAGE]    : ${entry.message}`,
            ];

            if (entry.error) {
                logLines.push(`[ERROR]      : ${typeof entry.error === "object" ? JSON.stringify(entry.error) : entry.error}`);
            }

            if (entry.sentPayload !== undefined) {
                logLines.push(`[PAYLOAD]    : ${JSON.stringify(entry.sentPayload)}`);
            }

            if (entry.response !== undefined) {
                logLines.push(`[RESPONSE]   : ${JSON.stringify(entry.response)}`);
            }

            logLines.push(""); // บรรทัดว่างคั่น

            fs.appendFileSync(filePath, logLines.join("\n") + "\n", "utf-8");
        } catch (err) {
            console.error("Failed to write api log to file:", err);
        }
    }
}

export default LoggerUtil;
