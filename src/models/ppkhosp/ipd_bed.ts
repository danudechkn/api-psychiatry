import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
} from "sequelize";
import { sequelize } from "./index";

class ipd_bed extends Model<
    InferAttributes<ipd_bed>,
    InferCreationAttributes<ipd_bed>
> {
    declare locationid: number;
    declare bedno: string;
    declare roomno: CreationOptional<string>;
    declare bedtype: CreationOptional<string | null>;
    declare sextype: CreationOptional<string | null>;
    declare ipdregid: CreationOptional<number | null>;
    declare flag_active: CreationOptional<string | null>;
    declare nurseline: CreationOptional<string | null>;
    declare flag_bed: CreationOptional<string | null>;
    declare docline: CreationOptional<string | null>;
    declare bedno_beddiagram: CreationOptional<string | null>;
    declare erp_exportcode: CreationOptional<string | null>;

    static associate(models: any) {}
}

ipd_bed.init(
    {
        locationid: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
        },
        bedno: {
            type: DataTypes.STRING(4),
            allowNull: false,
            primaryKey: true,
        },
        roomno: {
            type: DataTypes.STRING(4),
            allowNull: false,
        },
        bedtype: {
            type: DataTypes.STRING(1),
            allowNull: true,
        },
        sextype: {
            type: DataTypes.STRING(1),
            allowNull: true,
        },
        ipdregid: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        flag_active: {
            type: DataTypes.STRING(1),
            allowNull: true,
        },
        nurseline: {
            type: DataTypes.STRING(1),
            allowNull: true,
        },
        flag_bed: {
            type: DataTypes.STRING(1),
            allowNull: true,
        },
        docline: {
            type: DataTypes.STRING(3),
            allowNull: true,
        },
        bedno_beddiagram: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        erp_exportcode: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "ipd_bed",
        freezeTableName: true,
        timestamps: false,
    },
);

export default ipd_bed;
