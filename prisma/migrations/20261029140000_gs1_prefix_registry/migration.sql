-- CreateTable
CREATE TABLE IF NOT EXISTS "gs1_prefix_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prefix" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "default_uom" TEXT NOT NULL,
    "default_hsn" TEXT,
    "default_gst" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gs1_prefix_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "gs1_prefix_registry_prefix_key" ON "gs1_prefix_registry"("prefix");
CREATE INDEX IF NOT EXISTS "gs1_prefix_registry_prefix_idx" ON "gs1_prefix_registry"("prefix");
CREATE INDEX IF NOT EXISTS "gs1_prefix_registry_brand_idx" ON "gs1_prefix_registry"("brand");

-- Row access grants for margix_app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'margix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "gs1_prefix_registry" TO margix_app;
  END IF;
END $$;

-- Baseline GS1 India Manufacturer Prefixes
INSERT INTO "gs1_prefix_registry" ("prefix", "manufacturer", "brand", "category", "default_uom", "default_hsn", "default_gst")
VALUES
  ('8901012', 'Colgate-Palmolive (India) Limited', 'Colgate', 'Personal Care & Oral Care', 'PCS', '33061020', '18'),
  ('8901015', 'Pidilite Industries Limited', 'Pidilite', 'Stationery & Adhesives', 'PCS', '35061000', '18'),
  ('8901022', 'Wipro Enterprises Private Limited', 'Wipro', 'Personal Care & Soap', 'PCS', '34011110', '18'),
  ('8901023', 'Reckitt Benckiser (India) Limited', 'Dettol / Reckitt', 'Hygiene & Home Care', 'PCS', '34011110', '18'),
  ('8901030', 'Hindustan Unilever Limited', 'HUL', 'Personal Care & Home Care', 'PCS', '34011110', '18'),
  ('8901034', 'Asian Paints Limited', 'Asian Paints', 'Paints & Coatings', 'CAN', '32091090', '18'),
  ('8901052', 'Tata Consumer Products Limited', 'Tata', 'Grocery & Beverages', 'PACK', '09024020', '5'),
  ('8901058', 'Nestlé India Limited', 'Nestlé', 'Packaged Foods & Beverages', 'PACK', '19023010', '12'),
  ('8901063', 'Britannia Industries Limited', 'Britannia', 'Bakery & Biscuits', 'PACK', '19053100', '18'),
  ('8901067', 'Bata India Limited', 'Bata', 'Footwear', 'PAIR', '64041990', '12'),
  ('8901088', 'Procter & Gamble Home Products', 'P&G', 'Home & Personal Care', 'PACK', '34029099', '18'),
  ('8901138', 'PepsiCo India Holdings Private Limited', 'PepsiCo', 'Packaged Snacks & Beverages', 'PACK', '19059040', '12'),
  ('8901207', 'Dabur India Limited', 'Dabur', 'Healthcare & Ayurvedic', 'PCS', '30049011', '12'),
  ('8901233', 'Mondelez India Foods Private Limited', 'Cadbury', 'Confectionery & Chocolates', 'PCS', '18063200', '18'),
  ('8901262', 'Marico Limited', 'Marico', 'Personal Care & Edible Oils', 'PCS', '15131900', '5'),
  ('8901288', 'Vicco Laboratories', 'Vicco', 'Personal Care & Skin Care', 'PCS', '30049011', '12'),
  ('8901314', 'Emami Limited', 'Emami', 'Personal Care & Healthcare', 'PCS', '30049089', '12'),
  ('8901323', 'GD Pharmaceuticals Private Limited', 'Boroline', 'Personal Care & Skin Care', 'PCS', '30049089', '12'),
  ('8901387', 'Mahashian Di Hatti Private Limited (MDH)', 'MDH', 'Spices & Seasonings', 'PACK', '09109100', '5'),
  ('8901416', 'Karnataka Soaps and Detergents Limited', 'Mysore Sandal', 'Personal Care & Bathing', 'PCS', '34011110', '18'),
  ('8901491', 'Coca-Cola India Private Limited', 'Coca-Cola', 'Beverages', 'PCS', '22021010', '28'),
  ('8901499', 'ITC Limited', 'ITC', 'Packaged Goods & Staples', 'PACK', '11010000', '5'),
  ('8901512', 'Bikanervala Foods Private Limited', 'Bikano', 'Packaged Snacks', 'PACK', '21069099', '12'),
  ('8901525', 'Raymond Limited', 'Raymond', 'Textiles & Apparel', 'MTR', '55151100', '5'),
  ('8901526', 'L''Oréal India Private Limited', 'L''Oréal', 'Personal Care & Hair Care', 'PCS', '33051090', '18'),
  ('8901582', 'Balaji Wafers Private Limited', 'Balaji', 'Packaged Snacks', 'PACK', '19059040', '12'),
  ('8901648', 'Mother Dairy Fruit & Vegetable', 'Mother Dairy', 'Dairy Products', 'PACK', '04012000', '5'),
  ('8901719', 'Parle Products Private Limited', 'Parle', 'Bakery & Biscuits', 'PACK', '19053100', '18'),
  ('8901725', 'Haldiram Foods International', 'Haldiram''s', 'Snacks & Sweets', 'PACK', '21069099', '12'),
  ('8901764', 'Godrej Consumer Products Limited', 'Godrej', 'Home & Personal Care', 'PCS', '38089191', '18'),
  ('8901844', 'Bikaji Foods International Limited', 'Bikaji', 'Packaged Snacks', 'PACK', '21069099', '12'),
  ('8902080', 'MTR Foods Private Limited', 'MTR', 'Instant Foods & Packaged Goods', 'PACK', '21069099', '12'),
  ('8902579', 'Patanjali Ayurved Limited', 'Patanjali', 'Ayurvedic & Staples', 'PCS', '04059020', '12'),
  ('8904004', 'Himalaya Wellness Company', 'Himalaya', 'Personal Care & Wellness', 'PCS', '34013000', '18'),
  ('8904018', 'Cholayil Private Limited', 'Medimix', 'Personal Care & Bathing', 'PCS', '34011110', '18'),
  ('8904052', 'Nivea India Private Limited', 'Nivea', 'Personal Care & Skin Care', 'PCS', '33049990', '18'),
  ('8904153', 'Hector Beverages Private Limited', 'Paper Boat', 'Beverages', 'PCS', '22029920', '12'),
  ('8906001', 'Gujarat Co-operative Milk Marketing Federation (Amul)', 'Amul', 'Dairy Products', 'PACK', '04051000', '12'),
  ('8906003', 'Bisleri International Private Limited', 'Bisleri', 'Packaged Drinking Water & Beverages', 'PCS', '22011010', '18'),
  ('8906005', 'Everest Food Products Private Limited', 'Everest', 'Spices & Seasonings', 'PACK', '09109100', '5'),
  ('8906007', 'Amul Dairy Products (GCMMF)', 'Amul', 'Dairy Products', 'PCS', '04011000', '5'),
  ('8906010', 'Adani Wilmar Limited', 'Fortune', 'Edible Oils & Staples', 'PACK', '15121910', '5'),
  ('8906014', 'Dharampal Satyapal Limited (DS Group)', 'Catch', 'Spices & Seasonings', 'PCS', '25010010', '5'),
  ('8906018', 'Hamdard Laboratories India', 'Hamdard', 'Beverages & Ayurvedic', 'PCS', '21069019', '18'),
  ('8906020', 'KRBL Limited', 'India Gate', 'Grains & Rice', 'BAG', '10063020', '5'),
  ('8906079', 'LT Foods Limited', 'Daawat', 'Grains & Rice', 'BAG', '10063020', '5'),
  ('8908000', 'Indian Railway Catering and Tourism Corporation (IRCTC)', 'Rail Neer', 'Packaged Drinking Water & Beverages', 'PCS', '22011010', '18'),
  ('8908006', 'Cholayil Private Limited', 'Medimix', 'Personal Care & Bathing', 'PCS', '34011110', '18'),
  ('89060074', 'RSH Global Private Limited (Joy Personal Care)', 'Joy', 'Personal Care & Skin Care', 'PCS', '33049990', '18'),
  ('8901736', 'Havells India Limited', 'Havells', 'Electrical Switchgear & Cables', 'PCS', '85362030', '18'),
  ('8904128', 'Polycab India Limited', 'Polycab', 'Wires, Cables & Electricals', 'MTR', '85444999', '18'),
  ('8901804', 'Schneider Electric India Private Limited', 'Schneider Electric', 'Electrical Switchgear & Automation', 'PCS', '85362030', '18'),
  ('8901614', 'Legrand (India) Private Limited', 'Legrand', 'Electrical Switchgear & Enclosures', 'PCS', '85362030', '18'),
  ('8901768', 'Finolex Cables Limited', 'Finolex', 'Electrical Cables & Wires', 'MTR', '85444999', '18'),
  ('8901848', 'SKF India Limited', 'SKF', 'Industrial Bearings & Seals', 'PCS', '84821011', '18'),
  ('8901872', 'Bosch Limited (India)', 'Bosch', 'Automotive Spares & Power Tools', 'PCS', '87082900', '18'),
  ('8901248', 'Castrol India Limited', 'Castrol', 'Industrial Lubricants & Oils', 'LTR', '27101980', '18'),
  ('8901460', 'Berger Paints India Limited', 'Berger', 'Paints, Coatings & Primers', 'CAN', '32091090', '18'),
  ('8901254', 'Kansai Nerolac Paints Limited', 'Nerolac', 'Paints & Coatings', 'CAN', '32091090', '18'),
  ('8901962', 'UltraTech Cement Limited', 'UltraTech', 'Building Materials & Cement', 'BAG', '25232910', '28'),
  ('8901198', 'Tata Steel Limited', 'Tata Tiscon', 'TMT Steel Rebars & Wires', 'TON', '72142090', '18'),
  ('8904256', 'Astral Limited', 'Astral Pipes', 'Plumbing & Drainage Pipes', 'MTR', '39172310', '18'),
  ('8901942', 'Supreme Industries Limited', 'Supreme', 'Industrial Piping & Plastics', 'MTR', '39172310', '18'),
  ('8901886', 'Sundram Fasteners Limited (TVS)', 'TVS Fasteners', 'High Tensile Fasteners & Bolts', 'PCS', '73181500', '18'),
  ('8901117', 'Sun Pharmaceutical Industries Limited', 'Sun Pharma', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12'),
  ('8901086', 'Cipla Limited', 'Cipla', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12'),
  ('8901148', 'Dr. Reddy''s Laboratories Limited', 'Dr. Reddy''s', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12'),
  ('8904103', 'Mankind Pharma Limited', 'Mankind', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12'),
  ('8901235', 'Torrent Pharmaceuticals Limited', 'Torrent', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12'),
  ('8901038', 'Abbott India Limited', 'Abbott', 'Pharmaceutical & Nutrition', 'STRIP', '30049099', '12'),
  ('8901092', 'Lupin Limited', 'Lupin', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12'),
  ('8901124', 'Alkem Laboratories Limited', 'Alkem', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12')
ON CONFLICT ("prefix") DO NOTHING;

-- Baseline Industrial and Technical Products Seeded into Global Product Catalog
INSERT INTO "global_product_catalog" ("barcode", "name", "brand", "description", "category", "uom", "hsn_code", "gst_rate", "source", "confidence")
VALUES
  ('8901848062058', 'SKF Deep Groove Ball Bearing 6205-2RSH', 'SKF', 'Single row deep groove ball bearing 25x52x15mm rubber sealed', 'Industrial Bearings & Seals', 'PCS', '84821011', '18', 'curated', 'high'),
  ('8901848062041', 'SKF Deep Groove Ball Bearing 6204-2Z', 'SKF', 'Single row deep groove ball bearing 20x47x14mm metal shielded', 'Industrial Bearings & Seals', 'PCS', '84821011', '18', 'curated', 'high'),
  ('8901848063086', 'SKF Deep Groove Ball Bearing 6308-2RS1', 'SKF', 'Single row deep groove ball bearing 40x90x23mm rubber sealed', 'Industrial Bearings & Seals', 'PCS', '84821011', '18', 'curated', 'high'),
  ('8901736116012', 'Havells Euro-II Miniature Circuit Breaker (MCB) Single Pole 16A C-Curve', 'Havells', 'Havells Euro-II 10kA C-Curve SP MCB 16A 240V', 'Electrical Switchgear & Cables', 'PCS', '85362030', '18', 'curated', 'high'),
  ('8901736132012', 'Havells Euro-II Miniature Circuit Breaker (MCB) Single Pole 32A C-Curve', 'Havells', 'Havells Euro-II 10kA C-Curve SP MCB 32A 240V', 'Electrical Switchgear & Cables', 'PCS', '85362030', '18', 'curated', 'high'),
  ('8901736163016', 'Havells Euro-II Miniature Circuit Breaker (MCB) Triple Pole 63A C-Curve', 'Havells', 'Havells Euro-II 10kA C-Curve TP MCB 63A 415V', 'Electrical Switchgear & Cables', 'PCS', '85362030', '18', 'curated', 'high'),
  ('8901804016015', 'Schneider Acti9 iC60N Miniature Circuit Breaker SP 16A C-Curve', 'Schneider Electric', 'Schneider Electric Acti9 iC60N 6kA/10kA single pole MCB 16A', 'Electrical Switchgear & Automation', 'PCS', '85362030', '18', 'curated', 'high'),
  ('8901804032015', 'Schneider Acti9 iC60N Miniature Circuit Breaker SP 32A C-Curve', 'Schneider Electric', 'Schneider Electric Acti9 iC60N 6kA/10kA single pole MCB 32A', 'Electrical Switchgear & Automation', 'PCS', '85362030', '18', 'curated', 'high'),
  ('8901804363017', 'Schneider EasyPact TVS 3-Pole Contactor LC1E18 18A 220V Coil', 'Schneider Electric', 'Schneider EasyPact TVS power contactor 3P 18A AC-3 220V 50Hz', 'Electrical Switchgear & Automation', 'PCS', '85364900', '18', 'curated', 'high'),
  ('8901614016018', 'Legrand DX3 Miniature Circuit Breaker Single Pole 16A C-Curve', 'Legrand', 'Legrand DX3 10kA C-curve SP MCB 16A', 'Electrical Switchgear & Enclosures', 'PCS', '85362030', '18', 'curated', 'high'),
  ('8904128015014', 'Polycab 1.5 sq mm Single Core FR PVC Insulated Copper Wire 90m Red', 'Polycab', 'Polycab Flame Retardant (FR) multi-strand copper wire 1.5 sq mm 90m coil', 'Wires, Cables & Electricals', 'ROLL', '85444999', '18', 'curated', 'high'),
  ('8904128025013', 'Polycab 2.5 sq mm Single Core FR PVC Insulated Copper Wire 90m Red', 'Polycab', 'Polycab Flame Retardant (FR) multi-strand copper wire 2.5 sq mm 90m coil', 'Wires, Cables & Electricals', 'ROLL', '85444999', '18', 'curated', 'high'),
  ('8904128040016', 'Polycab 4.0 sq mm Single Core FR PVC Insulated Copper Wire 90m Blue', 'Polycab', 'Polycab Flame Retardant (FR) multi-strand copper wire 4.0 sq mm 90m coil', 'Wires, Cables & Electricals', 'ROLL', '85444999', '18', 'curated', 'high'),
  ('8901768015017', 'Finolex 1.5 sq mm Single Core FR PVC Industrial Wire 90m Red', 'Finolex', 'Finolex FR PVC insulated unsheathed industrial copper wire 1.5 sq mm 90m', 'Electrical Cables & Wires', 'ROLL', '85444999', '18', 'curated', 'high'),
  ('8901768025016', 'Finolex 2.5 sq mm Single Core FR PVC Industrial Wire 90m Red', 'Finolex', 'Finolex FR PVC insulated unsheathed industrial copper wire 2.5 sq mm 90m', 'Electrical Cables & Wires', 'ROLL', '85444999', '18', 'curated', 'high'),
  ('8901015010012', 'Fevicol SH Synthetic Resin Synthetic Wood Adhesive 1kg', 'Fevicol', 'Pidilite Fevicol SH all-round synthetic resin wood glue (1kg bucket)', 'Stationery & Adhesives', 'CAN', '35061000', '18', 'curated', 'high'),
  ('8901015020011', 'Fevicol SH Synthetic Resin Synthetic Wood Adhesive 5kg', 'Fevicol', 'Pidilite Fevicol SH synthetic resin adhesive (5kg bucket)', 'Stationery & Adhesives', 'CAN', '35061000', '18', 'curated', 'high'),
  ('8901015001010', 'Dr. Fixit 101 LW+ Integral Waterproofing Liquid 1L', 'Dr. Fixit', 'Pidilite Dr. Fixit 101 LW+ integral liquid waterproofing compound for concrete (1L)', 'Chemicals & Waterproofing', 'CAN', '38244090', '18', 'curated', 'high'),
  ('8901015005018', 'Dr. Fixit 101 LW+ Integral Waterproofing Liquid 5L', 'Dr. Fixit', 'Pidilite Dr. Fixit 101 LW+ integral liquid waterproofing compound for concrete (5L)', 'Chemicals & Waterproofing', 'CAN', '38244090', '18', 'curated', 'high'),
  ('8901248010011', 'Castrol Activ 4T 20W-40 Motorcycle Engine Oil 1L', 'Castrol', 'Castrol Activ 4T 20W-40 4-Stroke bike engine oil with Actibond molecules (1L)', 'Industrial Lubricants & Oils', 'CAN', '27101980', '18', 'curated', 'high'),
  ('8901248035014', 'Castrol GTX 20W-50 Engine Oil 3.5L', 'Castrol', 'Castrol GTX 20W-50 anti-sludge formula petrol & diesel engine oil (3.5L)', 'Industrial Lubricants & Oils', 'CAN', '27101980', '18', 'curated', 'high'),
  ('8901248050017', 'Castrol CRB Turbomax 15W-40 Heavy Commercial Vehicle Diesel Oil 5L', 'Castrol', 'Castrol CRB Turbomax 15W-40 heavy-duty truck & commercial diesel engine oil (5L)', 'Industrial Lubricants & Oils', 'CAN', '27101980', '18', 'curated', 'high'),
  ('8901872010013', 'Bosch Professional SDS-Plus-1 Concrete Drill Bit 6x160mm', 'Bosch', 'Bosch SDS plus hammer drill bit for masonry and concrete 6mm dia 160mm length', 'Automotive Spares & Power Tools', 'PCS', '82075059', '18', 'curated', 'high'),
  ('8901872010020', 'Bosch Professional SDS-Plus-1 Concrete Drill Bit 8x160mm', 'Bosch', 'Bosch SDS plus hammer drill bit for masonry and concrete 8mm dia 160mm length', 'Automotive Spares & Power Tools', 'PCS', '82075059', '18', 'curated', 'high'),
  ('8901872020012', 'Bosch Standard for Metal Inox Cutting Disc 100x1.2x16mm (4-Inch)', 'Bosch', 'Bosch 4-inch thin stainless steel and mild steel angle grinder cut-off wheel', 'Abrasives & Cutting Tools', 'PCS', '68042210', '18', 'curated', 'high'),
  ('8901886008502', 'TVS High Tensile Hex Head Bolt Grade 8.8 M8 x 50mm Full Thread', 'TVS Fasteners', 'Sundram Fasteners TVS Grade 8.8 high tensile steel hex bolt M8x50mm', 'High Tensile Fasteners & Bolts', 'PCS', '73181500', '18', 'curated', 'high'),
  ('8901886010505', 'TVS High Tensile Hex Head Bolt Grade 8.8 M10 x 50mm Full Thread', 'TVS Fasteners', 'Sundram Fasteners TVS Grade 8.8 high tensile steel hex bolt M10x50mm', 'High Tensile Fasteners & Bolts', 'PCS', '73181500', '18', 'curated', 'high'),
  ('8901886012608', 'TVS High Tensile Hex Head Bolt Grade 8.8 M12 x 60mm Full Thread', 'TVS Fasteners', 'Sundram Fasteners TVS Grade 8.8 high tensile steel hex bolt M12x60mm', 'High Tensile Fasteners & Bolts', 'PCS', '73181500', '18', 'curated', 'high'),
  ('8904256025015', 'Astral CPVC Pro SDR-11 Plumbing Pipe 1-Inch (25mm) 3 Meter', 'Astral Pipes', 'Astral CPVC Pro hot and cold water plumbing pipe 25mm SDR-11 (3m)', 'Plumbing & Drainage Pipes', 'PCS', '39172310', '18', 'curated', 'high'),
  ('8904256032013', 'Astral CPVC Pro SDR-11 Plumbing Pipe 1.25-Inch (32mm) 3 Meter', 'Astral Pipes', 'Astral CPVC Pro hot and cold water plumbing pipe 32mm SDR-11 (3m)', 'Plumbing & Drainage Pipes', 'PCS', '39172310', '18', 'curated', 'high'),
  ('8901942025017', 'Supreme uPVC Pressure Pipe Class 3 25mm 6 Meter', 'Supreme', 'Supreme Industries uPVC solvent-cement joint cold water pressure pipe 25mm 6m', 'Industrial Piping & Plastics', 'PCS', '39172310', '18', 'curated', 'high'),
  ('8901962050012', 'UltraTech 53 Grade Ordinary Portland Cement (OPC 53) 50kg Bag', 'UltraTech', 'UltraTech Cement OPC 53 Grade high-strength structural construction cement (50kg)', 'Building Materials & Cement', 'BAG', '25232910', '28', 'curated', 'high'),
  ('8901962050029', 'UltraTech Super Weather Plus Waterproof Cement 50kg Bag', 'UltraTech', 'UltraTech Super composite weather & moisture protection cement (50kg)', 'Building Materials & Cement', 'BAG', '25232930', '28', 'curated', 'high'),
  ('8901198012015', 'Tata Tiscon 550D High Strength TMT Rebar 12mm 12 Meter', 'Tata Tiscon', 'Tata Tiscon 550D earthquake resistant rib-pattern thermo-mechanically treated bar 12mm', 'TMT Steel Rebars & Wires', 'PCS', '72142090', '18', 'curated', 'high'),
  ('8901198016013', 'Tata Tiscon 550D High Strength TMT Rebar 16mm 12 Meter', 'Tata Tiscon', 'Tata Tiscon 550D earthquake resistant TMT reinforcement bar 16mm', 'TMT Steel Rebars & Wires', 'PCS', '72142090', '18', 'curated', 'high'),
  ('8901117010014', 'Azithral 500mg Azithromycin Tablets (Strip of 5)', 'Sun Pharma', 'Sun Pharma Azithral 500mg Azithromycin IP broad-spectrum antibacterial tablets', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12', 'curated', 'high'),
  ('8901117020013', 'Pantocid 40mg Pantoprazole Gastro-Resistant Tablets (Strip of 15)', 'Sun Pharma', 'Sun Pharma Pantocid 40mg acid-reducer GERD gastro-resistant tablets', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12', 'curated', 'high'),
  ('8901086010017', 'Dolo 650mg Paracetamol Tablets (Strip of 15)', 'Micro Labs', 'Micro Labs Dolo 650 antipyretic & analgesic paracetamol tablets 650mg', 'Pharmaceutical Formulations', 'STRIP', '30049060', '12', 'curated', 'high'),
  ('8901086020016', 'Ciplox 500mg Ciprofloxacin Tablets (Strip of 10)', 'Cipla', 'Cipla Ciplox 500mg Ciprofloxacin antibacterial tablets', 'Pharmaceutical Formulations', 'STRIP', '30049099', '12', 'curated', 'high')
ON CONFLICT ("barcode") DO NOTHING;
