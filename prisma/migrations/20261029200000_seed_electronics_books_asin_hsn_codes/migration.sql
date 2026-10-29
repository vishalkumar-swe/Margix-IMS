-- Baseline Indian GST HSN Master Data for Electronics, Books & E-Commerce Goods
INSERT INTO "hsn_code" ("code", "description", "gst_rate", "keywords", "is_active", "created_at", "updated_at")
VALUES
  ('8517', 'Telephone sets, including smartphones and other apparatus for the transmission or reception of voice, images or other data', 18.00, 'smartphone mobile phone redmi apple iphone samsung oneplus realme xiaomi router modem switch 4g 5g cellular telecom handset', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4901', 'Printed books, brochures, leaflets and similar printed matter, whether or not in single sheets', 0.00, 'book books paperback hardcover textbook novel literature clean code publications edition volume reading author publisher penguin mcgraw harper', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8518', 'Microphones and stands therefor; loudspeakers, whether or not mounted in their enclosures; headphones and earphones', 18.00, 'headphones earphones earbuds airpods headset mic microphone speaker soundbar bluetooth audio boat sony jbl noise boAt', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8523', 'Discs, tapes, solid-state non-volatile storage devices, smart cards and other media for the recording of sound or other phenomena', 18.00, 'pendrive flash drive usb sd card memory microsd ssd external hard drive storage sandisk samsung kingston', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8528', 'Monitors and projectors, not incorporating television reception apparatus; reception apparatus for television', 18.00, 'monitor screen display led lcd tv television projector curved gaming lg samsung dell benq viewsonic', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8473', 'Parts and accessories suitable for use solely or principally with machines of headings 8470 to 8472 (computer peripherals)', 18.00, 'keyboard mouse webcam mousepad laptop charger adapter dock cable cooling pad peripherals logitech hp dell', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('9503', 'Tricycles, scooters, pedal cars and similar wheeled toys; dolls; other toys; reduced-size models and similar recreational models; puzzles', 12.00, 'toy toys lego doll puzzle board game model action figure car educational kids nerf hot wheels barbie', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "gst_rate" = EXCLUDED."gst_rate",
  "keywords" = EXCLUDED."keywords",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
