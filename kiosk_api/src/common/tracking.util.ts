export function generateTrackingCode(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(10000 + Math.random() * 90000);
  return `BN-${year}-${seq}`;
}

export function generateReceiptNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `RC-${ts}`;
}
