// stems, not full words: "шин" catches "шини", "шин", "шинами"
export const KEYWORDS = ["шин", "комп'ютер", "прибиран"];

// CPV (ДК 021:2015) divisions we care about; a tender matches if any item falls under one of them
export const CPV_CODES = [
  "14000000-1", // mining products
  "19000000-6", // leather, textile, plastic and rubber materials
  "35000000-4", // security, fire-fighting, police equipment
  "39000000-2", // furniture
  "43000000-3", // mining machinery
  "44000000-0", // construction materials
];