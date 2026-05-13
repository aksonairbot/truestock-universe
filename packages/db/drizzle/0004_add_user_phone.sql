-- Add phone number to users for WhatsApp notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
-- WhatsApp group number for team summary (stored in app config, not here)
