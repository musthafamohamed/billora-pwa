/** Amount in words, Indian numbering system (crore / lakh / thousand).
 *  Returns e.g. "One Lakh Twenty Five Thousand Rupees and Fifty Paise Only".
 *  Handles 0 and paise; amounts above 99 crore are still rendered by
 *  repeating the crore group, which keeps the function total. */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`.trim();
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  const rest = n % 100;
  return ` ${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${twoDigits(rest)}` : ''}`.trim();
}

export function numberToIndianWords(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return 'Zero';
  let remaining = v;
  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (remaining) parts.push(threeDigits(remaining));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  const rupeePart = `${numberToIndianWords(rupees)} ${rupees === 1 ? 'Rupee' : 'Rupees'}`;
  if (paise === 0) return `${rupeePart} Only`;
  return `${rupeePart} and ${numberToIndianWords(paise)} ${paise === 1 ? 'Paise' : 'Paise'} Only`;
}
