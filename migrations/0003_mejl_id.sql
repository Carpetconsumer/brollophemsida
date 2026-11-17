-- Resends id för bekräftelsemejlet, så att en studs (POST /api/studs) hittar rätt svar.
-- bekraftelse kan då också bli 'studsade': mejlet kom inte fram (adressen finns inte eller är spärrad hos Resend).
ALTER TABLE svar ADD COLUMN mejl_id TEXT NOT NULL DEFAULT '';
