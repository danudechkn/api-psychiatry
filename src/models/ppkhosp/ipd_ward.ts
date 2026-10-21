import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
} from "sequelize";
import { sequelize } from "./index"; // ✨ แก้จุดนี้: ให้ดึงอินสแตนซ์มาจากศูนย์กลาง index.ts ในโฟลเดอร์เดียวกัน

// 1. สร้าง Class โดยใช้ InferAttributes เพื่อให้ดึง Type ไปใช้ได้อัตโนมัติ
class ipd_ward extends Model<
    InferAttributes<ipd_ward>,
    InferCreationAttributes<ipd_ward>
> {
    declare locationid: number;
    declare locationtext: CreationOptional<string | null>;
    declare bedstandard: CreationOptional<number | null>;

    // 📝 เพิ่มช่องสำหรับทำความสัมพันธ์ (Associations) รองรับระบบใน index.ts v6
    static associate(models: any) {
        // ตัวอย่างการเชื่อมตาราง: User.hasMany(models.Post, { foreignKey: 'userId' });
    }
}

// 2. กำหนดโครงสร้างคอลัมน์ (Schema) ของตาราง
ipd_ward.init(
    {
        locationid: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
        },
        locationtext: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bedstandard: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        sequelize, // ใช้ตัวแปรอินสแตนซ์ที่ดึงมาจาก index.ts
        tableName: "ipd_ward",
        freezeTableName: true,
        timestamps: false,
    },
);

export default ipd_ward;
