ALTER TABLE "kiosk_devices"
ADD COLUMN "tickerText" TEXT;

UPDATE "kiosk_devices"
SET "tickerText" = 'Thứ Hai - Thứ Sáu: 07:30-17:00  |  Thứ Bảy: 07:30-11:30  |  Hotline: 1900 6017  |  Giải quyết không hẹn đối với thủ tục đơn giản  |  '
WHERE "tickerText" IS NULL;
