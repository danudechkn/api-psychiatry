import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
} from "sequelize";
import { sequelize } from "./index"; // ✨ แก้จุดนี้: ให้ดึงอินสแตนซ์มาจากศูนย์กลาง index.ts ในโฟลเดอร์เดียวกัน

// 1. สร้าง Class โดยใช้ InferAttributes เพื่อให้ดึง Type ไปใช้ได้อัตโนมัติ
class pat extends Model<
    InferAttributes<pat>,
    InferCreationAttributes<pat>
> {
    declare hn: string;
    declare birthdatetime: Date;


    // 📝 เพิ่มช่องสำหรับทำความสัมพันธ์ (Associations) รองรับระบบใน index.ts v6
    static associate(models: any) {
        // ตัวอย่างการเชื่อมตาราง: User.hasMany(models.Post, { foreignKey: 'userId' });
    }
}

// 2. กำหนดโครงสร้างคอลัมน์ (Schema) ของตาราง
pat.init(
    {
        hn: {
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true,
        },
        birthdatetime: {
            type: DataTypes.DATE,
            allowNull: false,
        },

    },
    {
        sequelize, // ใช้ตัวแปรอินสแตนซ์ที่ดึงมาจาก index.ts
        tableName: "pat",
        freezeTableName: true,
        timestamps: false,
    },
);

export default pat;
