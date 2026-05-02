const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
  /(--|;|\/\*|\*\/|@@|@@version)/,
  /(union.*select|union.*all)/i,
  /(\bor\b\s+\d+\s*=\s*\d+)/i,
  /(\band\b\s+\d+\s*=\s*\d+)/i,
];

const NOSQL_PATTERNS = /\$where|\$regex|\$gt|\$lt|\$ne|\$in|\$nin|\$exists/;

const detectSqlInjection = (value) => {
  if (typeof value !== 'string') return false;
  return SQL_PATTERNS.some((p) => p.test(value));
};

const detectNoSqlInjection = (key) => {
  if (typeof key !== 'string') return false;
  return NOSQL_PATTERNS.test(key);
};

const checkObject = (obj) => {
  if (!obj) return true;
  if (typeof obj === 'string') return !detectSqlInjection(obj);
  if (typeof obj !== 'object') return true;

  for (const key of Object.keys(obj)) {
    if (detectNoSqlInjection(key)) return false;
    const val = obj[key];
    if (typeof val === 'string' && detectSqlInjection(val)) return false;
    if (typeof val === 'object' && !checkObject(val)) return false;
  }
  return true;
};

console.log("Testing checkObject...");
checkObject({ a: 1 });
console.log("Done");
