export interface AgeResult {
  age_y: number; // อายุปี
  age_m: number; // อายุเดือน
  age_d: number; // อายุวัน
}

export class DateUtil {
  /**
   * คำนวณอายุ ปี เดือน วัน จากวันเดือนปีเกิด
   * @param birthDate วันเกิด (Date หรือ string หรือ null/undefined)
   */
  static calculateAge(birthDate: Date | string | null | undefined): AgeResult {
    if (!birthDate) {
      return { age_y: 0, age_m: 0, age_d: 0 };
    }

    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
      return { age_y: 0, age_m: 0, age_d: 0 };
    }

    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    let days = today.getDate() - birth.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    return {
      age_y: Math.max(0, years),
      age_m: Math.max(0, months),
      age_d: Math.max(0, days),
    };
  }

  /**
   * แปลง Date หรือ string ให้อยู่ในรูป 'YYYY-MM-DD'
   */
  static formatDate(d: Date | string): string {
    const dateObj = new Date(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * คำนวณผลต่างจำนวนวันตามปฏิทินระหว่างวันที่สองวัน (รูปแบบ YYYY-MM-DD)
   */
  static diffInDays(startDateStr: string, endDateStr: string): number {
    const d1 = new Date(`${startDateStr}T00:00:00Z`).getTime();
    const d2 = new Date(`${endDateStr}T00:00:00Z`).getTime();
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }
}

export default DateUtil;
