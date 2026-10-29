-- Baseline Indian GST HSN Master Data for Periodicals (ISSN), Medical Devices & Reagents (PZN)
INSERT INTO "hsn_code" ("code", "description", "gst_rate", "keywords", "is_active", "created_at", "updated_at")
VALUES
  ('4902', 'Newspapers, journals and periodicals, whether or not illustrated or containing advertising material', 0.00, 'newspaper newspapers journal journals periodical periodicals magazine magazines publication news times daily weekly monthly chronicle gazette press issn', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('9018', 'Instruments and appliances used in medical, surgical, dental or veterinary sciences (including syringes, needles, diagnostic instruments)', 12.00, 'medical device syringe needle surgical catheter stethoscope bp monitor thermometer dental surgical instrument cannula pzn apparatus healthcare', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3822', 'Diagnostic or laboratory reagents on a backing, prepared diagnostic or laboratory reagents (test kits, PCR, strips)', 12.00, 'reagent diagnostic test kit lab laboratory blood test rapid test urine test strip pcr buffer solution pzn pathology clinical', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "gst_rate" = EXCLUDED."gst_rate",
  "keywords" = EXCLUDED."keywords",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
