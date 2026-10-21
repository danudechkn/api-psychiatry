import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
} from "sequelize";
import { sequelize } from "./index"; // ✨ แก้จุดนี้: ให้ดึงอินสแตนซ์มาจากศูนย์กลาง index.ts ในโฟลเดอร์เดียวกัน

// 1. สร้าง Class โดยใช้ InferAttributes เพื่อให้ดึง Type ไปใช้ได้อัตโนมัติ
class pat_admit extends Model<
    InferAttributes<pat_admit>,
    InferCreationAttributes<pat_admit>
> {
    declare an: CreationOptional<string>;
    declare hn: string;
    declare tolocationid: CreationOptional<string | null>;
    declare dischlocationid: CreationOptional<string | null>;
    declare admitdatetime: Date;
    declare dischargedatetime: CreationOptional<Date | null>;

    // 📝 เพิ่มช่องสำหรับทำความสัมพันธ์ (Associations) รองรับระบบใน index.ts v6
    static associate(models: any) {
        // ตัวอย่างการเชื่อมตาราง: User.hasMany(models.Post, { foreignKey: 'userId' });
    }
}

// 2. กำหนดโครงสร้างคอลัมน์ (Schema) ของตาราง
pat_admit.init(
    {
        an: {
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true,
        },
        hn: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        tolocationid: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        dischlocationid: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        admitdatetime: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        dischargedatetime: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize, // ใช้ตัวแปรอินสแตนซ์ที่ดึงมาจาก index.ts
        tableName: "pat_admit",
        freezeTableName: true,
        timestamps: false,
    },
);

export default pat_admit;
