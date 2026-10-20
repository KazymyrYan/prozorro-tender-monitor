import "dotenv/config";
import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set, check your .env");

// underscored: camelCase fields become snake_case columns
export const sequelize = new Sequelize(url, {
  logging: false,
  define: { underscored: true },
});

// key-value storage, for now only the feed offset
export class SyncState extends Model<
  InferAttributes<SyncState>,
  InferCreationAttributes<SyncState>
> {
  declare key: string;
  declare value: string;
}

SyncState.init(
  {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: false },
  },
  { sequelize, tableName: "sync_state", timestamps: false },
);

export class TenderRow extends Model<
  InferAttributes<TenderRow>,
  InferCreationAttributes<TenderRow>
> {
  declare id: string;
  declare tenderNumber: string;
  declare title: string;
  declare procuringEntity: string;
  // NUMERIC comes back from pg as a string, so money never goes through float
  declare budgetAmount: string | null;
  declare currency: string | null;
  declare tenderPeriodEnd: Date | null;
  declare status: string;
  declare matchedWords: string[];
  declare matchedCpv: string[];
  declare isMatched: boolean;
  declare notifiedAt: CreationOptional<Date | null>;
  declare firstSeenAt: CreationOptional<Date>;
}

TenderRow.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    tenderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
    title: { type: DataTypes.TEXT, allowNull: false },
    procuringEntity: { type: DataTypes.TEXT, allowNull: false },
    budgetAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    currency: { type: DataTypes.STRING, allowNull: true },
    tenderPeriodEnd: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    matchedWords: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
    matchedCpv: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
    isMatched: { type: DataTypes.BOOLEAN, allowNull: false },
    // stays empty until the report is sent
    notifiedAt: { type: DataTypes.DATE, allowNull: true },
    firstSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  { sequelize, tableName: "tenders", timestamps: false },
);

export class ItemRow extends Model<
  InferAttributes<ItemRow>,
  InferCreationAttributes<ItemRow>
> {
  declare id: CreationOptional<number>;
  declare tenderId: string;
  declare description: string;
  declare quantity: string | null;
  declare unit: string | null;
  declare cpvCode: string;
}

ItemRow.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenderId: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
    unit: { type: DataTypes.STRING, allowNull: true },
    cpvCode: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, tableName: "tender_items", timestamps: false },
);

// deleting a tender removes its items too
TenderRow.hasMany(ItemRow, { foreignKey: "tenderId", onDelete: "CASCADE" });
ItemRow.belongsTo(TenderRow, { foreignKey: "tenderId" });

/** Creates the tables if they don't exist yet. */
export async function initDb(): Promise<void> {
  await sequelize.sync();
}
