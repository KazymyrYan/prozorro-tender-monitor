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

// cloud databases (Neon) only accept encrypted connections
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

// underscored: camelCase fields become snake_case columns
export const sequelize = new Sequelize(url, {
  logging: false,
  define: { underscored: true },
  dialectOptions: isLocal ? {} : { ssl: { require: true } },
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

// every tender whose details we already loaded, matched or not; old rows are purged
export class SeenRow extends Model<
  InferAttributes<SeenRow>,
  InferCreationAttributes<SeenRow>
> {
  declare id: string;
  declare seenAt: CreationOptional<Date>;
}

SeenRow.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    seenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  { sequelize, tableName: "seen_tenders", timestamps: false },
);

// full data, only for tenders that matched our keywords or CPV codes
export class TenderRow extends Model<
  InferAttributes<TenderRow>,
  InferCreationAttributes<TenderRow>
> {
  declare id: string;
  declare tenderNumber: string;
  declare title: string;
  declare procuringEntity: string;
  declare procuringEntityEdrpou: string | null;
  declare procuringEntityRegion: string | null;
  declare procurementMethodType: string;
  // NUMERIC comes back from pg as a string, so money never goes through float
  declare budgetAmount: string | null;
  declare currency: string | null;
  declare tenderPeriodEnd: Date | null;
  declare publishedAt: Date | null;
  declare status: string;
  declare dateModified: Date;
  declare matchedWords: string[];
  declare matchedCpv: string[];
  declare notifiedAt: CreationOptional<Date | null>;
  declare firstSeenAt: CreationOptional<Date>;
  // true for tenders added by hand from the UI
  declare addedManually: CreationOptional<boolean>;
  // from value.valueAddedTaxIncluded, null when the API doesn't say
  declare budgetVatIncluded: boolean | null;
  // end of the question period, only competitive tenders have it
  declare enquiryEnd: Date | null;
}

TenderRow.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    tenderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
    title: { type: DataTypes.TEXT, allowNull: false },
    procuringEntity: { type: DataTypes.TEXT, allowNull: false },
    procuringEntityEdrpou: { type: DataTypes.STRING, allowNull: true },
    procuringEntityRegion: { type: DataTypes.STRING, allowNull: true },
    procurementMethodType: { type: DataTypes.STRING, allowNull: false },
    budgetAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    currency: { type: DataTypes.STRING, allowNull: true },
    tenderPeriodEnd: { type: DataTypes.DATE, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    dateModified: { type: DataTypes.DATE, allowNull: false },
    matchedWords: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
    matchedCpv: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
    // stays empty until the report is sent
    notifiedAt: { type: DataTypes.DATE, allowNull: true },
    firstSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    addedManually: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    budgetVatIncluded: { type: DataTypes.BOOLEAN, allowNull: true },
    enquiryEnd: { type: DataTypes.DATE, allowNull: true },
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

// who won the tender, mostly useful for no-tender contracts
export class AwardRow extends Model<
  InferAttributes<AwardRow>,
  InferCreationAttributes<AwardRow>
> {
  declare id: CreationOptional<number>;
  declare tenderId: string;
  declare supplierName: string;
  declare supplierEdrpou: string | null;
  declare amount: string | null;
  declare currency: string | null;
  declare status: string;
  declare awardedAt: Date | null;
}

AwardRow.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenderId: { type: DataTypes.STRING, allowNull: false },
    supplierName: { type: DataTypes.TEXT, allowNull: false },
    supplierEdrpou: { type: DataTypes.STRING, allowNull: true },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    currency: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    awardedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: "tender_awards", timestamps: false },
);

TenderRow.hasMany(AwardRow, { foreignKey: "tenderId", onDelete: "CASCADE" });
AwardRow.belongsTo(TenderRow, { foreignKey: "tenderId" });

// our own marks on a tender, one row per tender; status is plain text
// (interesting, preparing, submitted, won, lost, archive), empty means none
export class TenderMark extends Model<
  InferAttributes<TenderMark>,
  InferCreationAttributes<TenderMark>
> {
  declare tenderId: string;
  declare status: CreationOptional<string | null>;
  declare manager: CreationOptional<string | null>;
  declare company: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare itemsNote: CreationOptional<string | null>;
  declare paymentTerms: CreationOptional<string | null>;
  declare bankGuaranteeNeeded: CreationOptional<boolean>;
  // sum and percent are free text, the user writes them as he likes
  declare bankGuaranteeSum: CreationOptional<string | null>;
  declare contractSecurityNeeded: CreationOptional<boolean>;
  declare contractSecurityPercent: CreationOptional<string | null>;
  declare updatedAt: CreationOptional<Date>;
}

TenderMark.init(
  {
    tenderId: { type: DataTypes.STRING, primaryKey: true },
    status: { type: DataTypes.STRING, allowNull: true },
    manager: { type: DataTypes.STRING, allowNull: true },
    company: { type: DataTypes.STRING, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    itemsNote: { type: DataTypes.TEXT, allowNull: true },
    paymentTerms: { type: DataTypes.TEXT, allowNull: true },
    bankGuaranteeNeeded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    bankGuaranteeSum: { type: DataTypes.STRING, allowNull: true },
    contractSecurityNeeded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    contractSecurityPercent: { type: DataTypes.STRING, allowNull: true },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  // Sequelize keeps updated_at current on every save
  { sequelize, tableName: "tender_marks", createdAt: false, updatedAt: true },
);

TenderRow.hasOne(TenderMark, { foreignKey: "tenderId", onDelete: "CASCADE" });
TenderMark.belongsTo(TenderRow, { foreignKey: "tenderId" });

// settings edited from the UI (managers, channel switches), values are JSON text
export class AppSetting extends Model<
  InferAttributes<AppSetting>,
  InferCreationAttributes<AppSetting>
> {
  declare key: string;
  declare value: string;
}

AppSetting.init(
  {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: false },
  },
  { sequelize, tableName: "app_settings", timestamps: false },
);

/** Creates the tables if they don't exist yet. */
export async function initDb(): Promise<void> {
  await sequelize.sync();
}
