/**
 * Margix IMS Copilot Domain Guardrail.
 * Ensures the agent remains strictly within the boundary of Enterprise ERP,
 * Inventory, Warehouse Operations, Supply Chain, APMC Mandi, and GST Compliance.
 * Rejects off-topic inquiries (e.g. general programming, code generation, creative fiction)
 * before consuming upstream tokens or producing off-brand responses.
 */

export interface GuardResult {
  blocked: boolean;
  reason?: string;
  refusalText?: string;
}

// Patterns that indicate programming / code generation requests
const CODE_GENERATION_PATTERNS = [
  /\b(write|generate|create|build|implement|code|give me)\s+(a\s+)?(python|javascript|typescript|java|c\+\+|c#|golang|rust|php|ruby|swift|kotlin|bash|shell|powershell|html|css|react|vue|angular|node|nextjs|express|django|flask)\s+(script|code|program|app|function|class|component|page|file|snippet|server|bot)\b/i,
  /\b(write|generate|create|build)\s+(a\s+)?(html|css|html\s+and\s+css|react|vue|angular|python|javascript|typescript|c\+\+|java|rust|bash|sql)\b/i,
  /\b(write|generate|give me)\s+(some\s+)?(code|script|program)\s+(for|to|that)\b/i,
  /\b(leetcode|hackerrank|codeforces|two\s*sum|reverse\s*linked\s*list|binary\s*tree|quicksort|mergesort|bubble\s*sort|fibonacci\s*(in|using)?\s*(python|c\+\+|js|java)?)\b/i,
  /\b(how\s+to\s+write\s+(a\s+)?(function|script|algorithm|regex)\s+(in|using)\s+(python|c\+\+|js|java|rust))\b/i,
  /\b(fix|debug|refactor)\s+(this|my)\s+(code|script|python|function|c\+\+|java)\b/i,
  /\bwrite\s+a\s+(python|js|c\+\+|java|bash)\b/i,
  /\b(create|make)\s+a\s+(calculator|game|snake|tic\s*tac\s*toe|todo\s*app|chess|flappy\s*bird)\b/i,
];

// Patterns that indicate creative writing, non-business trivia, or homework
const NON_BUSINESS_PATTERNS = [
  /\b(write\s+(a\s+)?(poem|song|story|novel|essay|joke|riddle|rap))\b/i,
  /\b(who\s+won\s+the\s+(world\s*cup|ipl|super\s*bowl|oscars|olympics))\b/i,
  /\b(who\s+is\s+better\s+(messi|ronaldo|virat|dhoni))\b/i,
  /\b(tell\s+me\s+a\s+(joke|story|fairytale))\b/i,
  /\b(solve\s+my\s+physics|chemistry|calculus|algebra|homework)\b/i,
];

// Jailbreak / Prompt injection patterns
const JAILBREAK_PATTERNS = [
  /\b(ignore\s+(all\s+)?previous\s+instructions|disregard\s+all\s+rules|dan\s+mode|jailbreak|system\s+prompt\s+leak|print\s+your\s+system\s+prompt)\b/i,
  /\b(you\s+are\s+now\s+(an\s+unrestricted|a\s+free|chaos|evil))\b/i,
];

// Safe business phrases containing the word "code" that should NOT be blocked
const SAFE_BUSINESS_CODE_PATTERNS = [
  /\b(hsn|sac|gst|sku|item|product|godown|warehouse|pin|postal|bar|qr|tax|reason|uom|discount|promo)\s*code\b/i,
  /\bcode\s+(for|of)\s+([a-z0-9\s]+)\b/i, // e.g. "code for sugar"
];

export function checkDomainGuard(message: string): GuardResult {
  const text = message.trim();
  const lower = text.toLowerCase();

  // If user is asking for ERP codes (HSN, SKU, Barcode), let it pass
  const hasSafeBusinessCode = SAFE_BUSINESS_CODE_PATTERNS.some((pattern) => pattern.test(lower));

  // Check programming / code generation
  const isCodeRequest = CODE_GENERATION_PATTERNS.some((pattern) => pattern.test(lower));
  if (isCodeRequest && !hasSafeBusinessCode) {
    const isHindi = /[\u0900-\u097F]|(kripya|kijiye|batao|kardo|likho)/i.test(lower);
    return {
      blocked: true,
      reason: "code_generation",
      refusalText: isHindi
        ? `🛡️ **मार्जिक्स एंटरप्राइज डोमेन सीमा (Domain Guardrail)**\n\nमैं केवल **Margix IMS** के लिए अधिकृत व्यावसायिक व इन्वेंट्री सहायक हूँ। मैं वेयरहाउस स्टॉक, परचेज ऑर्डर, चालान (Invoices), डिस्पेच, APMC मंडी भाव और GST अनुपालन में सहायता कर सकता हूँ।\n\nमैं सामान्य सॉफ्टवेयर प्रोग्रामिंग या कोडिंग (Python, JS, C++, आदि) करने के लिए अधिकृत नहीं हूँ। कृपया मार्जिक्स इन्वेंट्री या व्यापार संचालन से संबंधित प्रश्न पूछें।`
        : `🛡️ **Out of Scope (Margix Enterprise Guardrail)**\n\nI am specialized exclusively as your **Margix IMS Enterprise & Operations Copilot**. My capabilities are dedicated to:\n- 📦 Multi-godown inventory, batch tracking, and FEFO allocation\n- 📋 Purchase orders, GRN receipts, vendor supply chains, and billing\n- 🧾 GST e-invoicing, outward dispatches, and customer accounts\n- ⚖️ Double-entry inventory ledger, adjustments, and reconciliation\n- 🌾 APMC mandi prices, wholesale commodity intelligence, and market quotes\n\nI cannot generate arbitrary software code, write computer programs, or assist with general software engineering. Please ask an inventory, procurement, or trade-related question within Margix.`,
    };
  }

  // Check creative writing / trivia
  const isNonBusiness = NON_BUSINESS_PATTERNS.some((pattern) => pattern.test(lower));
  if (isNonBusiness) {
    return {
      blocked: true,
      reason: "non_business",
      refusalText: `🛡️ **Out of Scope (Margix Enterprise Guardrail)**\n\nI am designed specifically for **Margix IMS enterprise commerce & warehouse operations**. I cannot write creative fiction, solve academic homework, or provide general entertainment trivia. Let me know how I can assist with your warehouse stock, orders, dispatches, or trade analytics!`,
    };
  }

  // Check jailbreak
  const isJailbreak = JAILBREAK_PATTERNS.some((pattern) => pattern.test(lower));
  if (isJailbreak) {
    return {
      blocked: true,
      reason: "jailbreak_attempt",
      refusalText: `🛡️ **Security Policy Violation**\n\nSystem prompts, security instructions, and enterprise access boundaries are strictly protected and cannot be modified or bypassed. How can I assist you with your Margix inventory or trade operations?`,
    };
  }

  return { blocked: false };
}
