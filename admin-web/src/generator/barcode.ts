/**
 * 1-D barcode encoders: Code 128 (auto B/C), Code 39, EAN-13.
 * Each returns a module string ("1" = bar, "0" = space) without quiet zones,
 * plus the human-readable text to print under the bars.
 */
export type BarcodeFormat = "code128" | "code39" | "ean13";
export type BarcodeResult = { modules: string; text: string };

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

function widthsToModules(widths: string, startWithBar = true): string {
  let out = "", bar = startWithBar;
  for (const w of widths) { out += (bar ? "1" : "0").repeat(Number(w)); bar = !bar; }
  return out;
}

function code128(text: string): BarcodeResult {
  const clean = Array.from(text).filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126).join("");
  if (!clean) throw new Error("Code 128 needs printable ASCII text");
  const codes: number[] = [];
  let set: "B" | "C" | null = null;
  let i = 0;
  const digitRun = (from: number) => { let n = 0; while (from + n < clean.length && /\d/.test(clean[from + n])) n++; return n; };
  while (i < clean.length) {
    const run = digitRun(i);
    const useC = run >= 4 && (set === "C" || run >= (i === 0 || i + run === clean.length ? 4 : 6));
    if (useC) {
      if (set !== "C") { codes.push(set === null ? START_C : CODE_C); set = "C"; }
      const pairs = Math.floor(run / 2);
      for (let p = 0; p < pairs; p++) { codes.push(Number(clean.slice(i, i + 2))); i += 2; }
      continue;
    }
    if (set !== "B") { codes.push(set === null ? START_B : CODE_B); set = "B"; }
    codes.push(clean.charCodeAt(i) - 32);
    i++;
  }
  let checksum = codes[0];
  for (let k = 1; k < codes.length; k++) checksum += codes[k] * k;
  codes.push(checksum % 103, STOP);
  return { modules: codes.map((c) => widthsToModules(CODE128_PATTERNS[c])).join(""), text: clean };
}

const CODE39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*";
const CODE39_PATTERNS = [
  "nnnwwnwnn", "wnnwnnnnw", "nnwwnnnnw", "wnwwnnnnn", "nnnwwnnnw", "wnnwwnnnn", "nnwwwnnnn", "nnnwnnwnw", "wnnwnnwnn", "nnwwnnwnn",
  "wnnnnwnnw", "nnwnnwnnw", "wnwnnwnnn", "nnnnwwnnw", "wnnnwwnnn", "nnwnwwnnn", "nnnnnwwnw", "wnnnnwwnn", "nnwnnwwnn", "nnnnwwwnn",
  "wnnnnnnww", "nnwnnnnww", "wnwnnnnwn", "nnnnwnnww", "wnnnwnnwn", "nnwnwnnwn", "nnnnnnwww", "wnnnnnwwn", "nnwnnnwwn", "nnnnwnwwn",
  "wwnnnnnnw", "nwwnnnnnw", "wwwnnnnnn", "nwnnwnnnw", "wwnnwnnnn", "nwwnwnnnn", "nwnnnnwnw", "wwnnnnwnn", "nwwnnnwnn", "nwnwnwnnn",
  "nwnwnnnwn", "nwnnnwnwn", "nnnwnwnwn", "nwnnwnwnn",
];

function code39(text: string, withCheck = false): BarcodeResult {
  let clean = text.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, "");
  if (!clean) throw new Error("Code 39 supports A–Z, 0–9 and - . $ / + % space");
  if (withCheck) {
    const sum = Array.from(clean).reduce((s, c) => s + CODE39_CHARS.indexOf(c), 0);
    clean += CODE39_CHARS[sum % 43];
  }
  const all = "*" + clean + "*";
  const ratio = 3;
  const modules = Array.from(all).map((c) => {
    const pattern = CODE39_PATTERNS[CODE39_CHARS.indexOf(c)];
    return widthsToModules(Array.from(pattern).map((p) => (p === "w" ? String(ratio) : "1")).join("")) + "0";
  }).join("").replace(/0$/, "");
  return { modules, text: clean };
}

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(twelve: string): number {
  const sum = Array.from(twelve).reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

function ean13(text: string): BarcodeResult {
  let digits = text.replace(/\D/g, "");
  if (digits.length > 13) throw new Error("EAN-13 needs 12 or 13 digits");
  if (digits.length < 12) digits = digits.padStart(12, "0");
  if (digits.length === 12) digits += String(ean13CheckDigit(digits));
  else if (Number(digits[12]) !== ean13CheckDigit(digits.slice(0, 12))) throw new Error("EAN-13 check digit is wrong");
  const parity = EAN_PARITY[Number(digits[0])];
  let modules = "101";
  for (let i = 1; i <= 6; i++) modules += (parity[i - 1] === "L" ? EAN_L : EAN_G)[Number(digits[i])];
  modules += "01010";
  for (let i = 7; i <= 12; i++) modules += EAN_R[Number(digits[i])];
  modules += "101";
  return { modules, text: digits };
}

export function encodeBarcode(format: BarcodeFormat, text: string): BarcodeResult {
  if (format === "code39") return code39(text);
  if (format === "ean13") return ean13(text);
  return code128(text);
}
