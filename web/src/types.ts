export type Status =
  | "interesting"
  | "preparing"
  | "submitted"
  | "won"
  | "lost"
  | "archive";

export const STATUSES: Status[] = [
  "interesting",
  "preparing",
  "submitted",
  "won",
  "lost",
  "archive",
];

export const STATUS_LABELS: Record<Status, string> = {
  interesting: "Цікаво",
  preparing: "Готуємо",
  submitted: "Подали",
  won: "Виграли",
  lost: "Програли",
  archive: "Архів",
};

export interface Word {
  text: string;
  strong: boolean;
  // "pos" = found in an item, "title" = only in the title
  place: "title" | "pos";
}

export interface Mark {
  status: Status | null;
  manager: string | null;
  company: string | null;
  note: string | null;
  itemsNote: string | null;
  paymentTerms: string | null;
  bankGuaranteeNeeded: boolean;
  bankGuaranteeSum: string | null;
  contractSecurityNeeded: boolean;
  contractSecurityPercent: string | null;
  updatedAt: string;
}

export interface Tender {
  id: string;
  number: string;
  title: string;
  customer: string;
  customerEdrpou: string | null;
  region: string | null;
  type: "competitive" | "no-tender";
  procurementMethodType: string;
  // money comes as a string from the API
  budget: string | null;
  currency: string | null;
  budgetVatIncluded: boolean | null;
  deadline: string | null;
  enquiryEnd: string | null;
  publishedAt: string | null;
  manual: boolean;
  words: Word[];
  cpv: string[];
  blocks: string[];
  weak: boolean;
  matchedItems: number[];
  items: {
    description: string;
    quantity: string | null;
    unit: string | null;
    cpvCode: string;
  }[];
  winner: {
    supplier: string;
    edrpou: string | null;
    amount: string | null;
    awardedAt: string | null;
  } | null;
  mark: Mark | null;
}

export interface TendersResponse {
  // today in Kyiv, YYYY-MM-DD
  today: string;
  tenders: Tender[];
}

export const COMPANIES = ["УПИ", "УИ", "СХППП"];

export interface Settings {
  managers: string[];
  telegramEnabled: boolean;
}
