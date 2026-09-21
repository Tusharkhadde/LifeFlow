import { ParsedExpense } from "@/lib/expense-parser";

const SMS_PATTERNS = [
  /(?:debited|spent|paid|txn|transaction).*?(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{2})?)/i,
  /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{2})?)\s*(?:debited|spent|paid|deducted)/i,
  /(?:debited|spent).*?(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{2})?)/i,
];

export function parseBankSms(text: string): ParsedExpense | null {
  const trimmed = text.trim();
  let amount: number | null = null;

  for (const pattern of SMS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ""));
      break;
    }
  }

  if (!amount || amount <= 0) return null;

  let merchant: string | undefined;
  const merchantMatch = trimmed.match(/(?:at|to|from)\s+([A-Z0-9\s&.-]{3,40})/i);
  if (merchantMatch) merchant = merchantMatch[1].trim();

  let category = "general";
  if (/swiggy|zomato|restaurant|food/i.test(trimmed)) category = "food";
  else if (/amazon|flipkart|shopping/i.test(trimmed)) category = "shopping";
  else if (/petrol|fuel|uber|ola/i.test(trimmed)) category = "transport";
  else if (/electricity|bill|recharge|jio|airtel/i.test(trimmed)) category = "utilities";

  return { amount, category, merchant, description: trimmed.slice(0, 200) };
}
