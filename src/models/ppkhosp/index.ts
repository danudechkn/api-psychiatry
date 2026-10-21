"use strict";

import fs from "fs";
import path from "path";
import { Sequelize, DataTypes } from "sequelize"; // เปลี่ยนมาใช้ sequelize package หลักของ v6

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || "development";

// 1. ดึงค่า Config
const rawConfig = require(
  path.resolve(__dirname, "..", "..", "config", "config"),
);
const config = rawConfig.default ? rawConfig.default[env] : rawConfig[env];

// 2. สร้างอินสแตนซ์ Sequelize v6 ก่อน
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    dialect: config.dialect || "mysql", // ระบุเป็น string เช่น 'mysql', 'postgres'
    port: Number(config.port) || 3306,
    logging: config.logging !== false ? console.log : false,
  },
);

// สร้าง object เปล่าแบบยังไม่ระบุเจาะจงชนิดในช่วงแรก
const db: any = {};

// 3. ค้นหาและโหลดคลาสโมเดลทั้งหมดในโฟลเดอร์นี้แบบอัตโนมัติ
fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 &&
      file !== basename &&
      (file.slice(-3) === ".js" || file.slice(-3) === ".ts") &&
      file.indexOf(".test.js") === -1 &&
      file.indexOf(".test.ts") === -1 &&
      file !== "db.d.ts" // ป้องกันการโหลดไฟล์ Type Definition
    );
  })
  .forEach((file) => {
    const modelModule = require(path.join(__dirname, file));
    // รองรับทั้ง export default และ export ปกติ
    let model = modelModule.default || modelModule;

    // ระบบ v6 มักใช้โครงสร้างฟังก์ชันข้ามไฟล์ (โมเดลแบบเก่า) หรือคลาสที่เขียนแบบใช้สืบทอด
    if (typeof model === "function" && model.init) {
      // สำหรับคลาสโมเดล v6 ที่เขียนสืบทอดมาจาก Model และมีเมธอด init ไว้เรียกใช้งาน
      // ในกรณีนี้โมเดลมักถูกอินิทโครงสร้างแยกในไฟล์ตัวเองแล้ว เราจับยัดเข้า db object ได้เลย
      db[model.name] = model;
    } else if (typeof model === "function") {
      // สำหรับสไตล์ดั้งเดิมของ Sequelize CLI ที่ส่งฟังก์ชันมาให้รันอินิท
      model = model(sequelize, DataTypes);
      db[model.name] = model;
    } else if (model && typeof model === "object") {
      // เก็บตกกรณีที่มีการนำคลาสใส่ไว้ใน object ตัวแปรย่อย
      const actualModel = Object.values(model)[0];
      if (typeof actualModel === "function" && (actualModel as any).init) {
        db[(actualModel as any).name] = actualModel;
      }
    }
  });

// 4. เรียกใช้การเชื่อมความสัมพันธ์ (Associations) หากตัวโมเดลมีฟังก์ชัน associate ตั้งไว้
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// 5. ส่งออกระบบไปใช้ร่วมกัน
db.sequelize = sequelize;
db.Sequelize = Sequelize;

export { sequelize, Sequelize };
export default db;
