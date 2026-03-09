// Input validation helpers

// E.164 or local Indonesian format
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // E.164: +[country][number] (7-15 digits)
  // Local: 08xx or just digits
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

// Validate required fields exist and are non-empty strings
function requireFields(body, fields) {
  const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  return null;
}

// Basic CSV validation - check it has content and a header
function isValidCsv(csv) {
  if (!csv || typeof csv !== 'string') return false;
  const lines = csv.trim().split('\n');
  return lines.length >= 1; // at least header
}

module.exports = { isValidPhone, requireFields, isValidCsv };
