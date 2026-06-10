export const HEADRAIL_OPTS = ["SL","OR","ZSL","ZST","3FA","4FA(Duo)","ZRO"];
export const CONTROL_OPTS = ["CH","STR","WC","CLF","CLS","CLO", "Motor"];
export const CONTROL_SUR = { CLF:16, CLS:30, CLO:24, WC:25 };
export const SPRING_ASSIST_PRICE = 16;

export const MOTORS = [
  { code:"AK25", label:"A-OK AM25D (ZIGBEE)", price:240 },
  { code:"S28",  label:"Somfy Sonesse 28 WireFree RTS", price:560 },
  { code:"S30",  label:"Somfy Sonesse 30 RTS",           price:790 },
  { code:"S40",  label:"Somfy Sonesse 40 RTS",           price:920 },
];
export const MOTOR_PRICE = Object.fromEntries(MOTORS.map(m=>[m.code, m.price]));

export const HDR_TBL = {
  "3FA": {
    tiers: [[30,48],[36,57],[42,66],[48,75],[54,84],[60,93],[66,102],[72,111],[78,120],[84,129],[90,138],[96,147],[102,156],[108,165]],
    per6: 9
  },
  "4FA(Duo)": {
    tiers: [[30,60],[36,71],[42,82],[48,93],[54,104],[60,115],[66,126],[72,137],[78,148],[84,159],[90,170],[96,181],[102,192],[108,203]],
    per6: 11
  },
  "ZSL": {
    tiers: [[30,55],[36,65],[42,75],[48,85],[54,95],[60,105],[66,115],[72,125],[78,135],[84,145],[90,155],[96,165],[102,175],[108,185]],
    per6: 10
  },
  "ZST": {
    tiers: [[30,75],[36,90],[42,105],[48,120],[54,135],[60,150],[66,165],[72,180],[78,195],[84,210],[90,225],[96,240],[102,255],[108,270]],
    per6: 15
  }
};

export const ACCESSORY_CATALOG = [
  { code: "CHARGER",     label: "Charger",     unit: "ea", price: 31.25 },
  { code: "BATTERY PACK",label: "Li-battery pack", unit: "ea", price: 115 },
  { code: "SOLAR PANEL",label: "Solar Panel", unit: "ea", price: 137.5 },
  { code: "REMOTE_1CH",  label: "Remote 1CH",  unit: "ea", price: 106.25 },
  { code: "REMOTE_5CH",  label: "Remote 5CH",  unit: "ea", price: 137.5 },
  { code: "REMOTE_16CH", label: "Remote 16CH", unit: "ea", price: 470 },
  { code: "EXTENSION CABLE",label: "EX-Cable", unit: "ea", price: 12 },
  { code: "HUB",         label: "Hub",         unit: "ea", price: 362.5 },
];

export const ACCESSORY_PRICE_MAP = Object.fromEntries(ACCESSORY_CATALOG.map(a => [a.code, a.price]));
export const ACC_CAT_OPTS = ["Motor", "Etc"];
export const ACC_TYPE_OPTS = ["Remote", "Charger", "Hub"];
export const REMOTE_DETAIL_OPTS = ["1CH","5CH","16CH"];

export const MOUNT_OPTS = ["IN","FF","FW","FD","FC","INF","INW","INC"];
export const BOTTOM_TYPES = ["OP","ES","NB"];
export const COLOR_COMMON = ["01","02","03","05"];
export const HW_COLOR_LABELS = { "01":"01 (White)","02":"02 (Ivory)","03":"03 (Grey)","05":"05 (Black)" };

export const SPACE_OPTS = [
  "Living","Master","Entrance","Kitchen","Dining","Bath","Room","Bonus Room","Window",
  "Deck Door","Deck Single Door","Door Window","Stairs","Office","Laundry","Flex Room","MANUAL"
];
export const SPACE_LABELS = { MANUAL: "Manual input" };

