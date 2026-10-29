-- Delete poisoned placeholder entries from global_product_catalog
DELETE FROM "global_product_catalog" WHERE "source" = 'inferred' OR "name" LIKE 'Scanned Item%' OR "name" LIKE '%Product (000000)';

-- Baseline Indian GST HSN Master Data (Official Schedule)
INSERT INTO "hsn_code" ("code", "description", "gst_rate", "keywords", "is_active", "created_at", "updated_at")
VALUES
  -- Food & Agriculture
  ('0401', 'Milk and cream, not concentrated nor containing added sugar or other sweetening matter', 0.00, 'milk fresh dairy cream raw', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0402', 'Milk and cream, concentrated or containing added sugar, dairy whitener, milk powder', 5.00, 'milk powder dairy whitener condensed everyday amul', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0405', 'Butter and other fats and oils derived from milk; dairy spreads, ghee', 12.00, 'butter ghee dairy spread amul britannia mother dairy', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0406', 'Cheese and curd, paneer', 5.00, 'cheese paneer curd dairy processed', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0713', 'Dried leguminous vegetables, shelled, whether or not skinned or split (pulses, toor, moong, chana, arhar dal)', 5.00, 'pulses dal toor moong urad chana arhar sampann lentils', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0801', 'Coconuts, Brazil nuts and cashew nuts, fresh or dried', 5.00, 'cashew nuts kaju dry fruits dryfruits', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0901', 'Coffee, whether or not roasted or decaffeinated; coffee husks and skins', 5.00, 'coffee beans roasted ground filter coffee', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0902', 'Tea, whether or not flavoured (black tea, green tea, CTC tea)', 5.00, 'tea chai green black ctc assam darjeeling tata taj mahal wagh bakri', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0910', 'Ginger, saffron, turmeric (curcuma), thyme, bay leaves, curry and other spices', 5.00, 'spices turmeric haldi ginger masala everest mdh catch seasonings', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1006', 'Rice (basmati, non-basmati, parboiled, broken rice)', 5.00, 'rice basmati chawal grain daawat india gate fortune', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1101', 'Wheat or meslin flour (atta, maida, suji)', 5.00, 'wheat flour atta maida suji aashirvaad grain chakki', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1509', 'Olive oil and its fractions, whether or not refined', 5.00, 'olive oil extra virgin cooking oil pomace', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1512', 'Sunflower-seed, safflower or cotton-seed oil and fractions thereof', 5.00, 'sunflower oil cooking edible oil fortune sunlite refined', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1513', 'Coconut (copra), palm kernel or babassu oil and fractions thereof', 5.00, 'coconut oil copra edible parachute marico pure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1515', 'Other fixed vegetable or microbial fats and oils (mustard oil, groundnut oil, sesame oil)', 5.00, 'mustard groundnut sesame sarson til cooking oil kachi ghani', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1701', 'Cane or beet sugar and chemically pure sucrose, in solid form (sugar, jaggery)', 5.00, 'sugar refined jaggery gur sweetener madhur', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1806', 'Chocolate and other food preparations containing cocoa (bars, wafer chocolates, cocoa powder)', 18.00, 'chocolate kitkat cadbury dairy milk perk munch 5 star confectionery cocoa', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1901', 'Malt extract; food preparations of flour, groats, meal, starch (Horlicks, Bournvita, baby food)', 18.00, 'malt horlicks bournvita boost complan nutrition drink baby food cerelac', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1902', 'Pasta, whether or not cooked or stuffed; instant noodles (Maggi, Yippee, Knorr)', 12.00, 'noodles instant maggi pasta yippee macaroni vermicelli sewai', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1905', 'Bread, pastry, cakes, biscuits and other bakers wares (Parle-G, Good Day, Marie Gold, toast, rusks)', 18.00, 'biscuits cookies parle-g good day marie oreo bourbon rusk bakery cake bread', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2009', 'Fruit juices (including grape must) and vegetable juices, unfermented (Real, Tropicana)', 12.00, 'juice fruit real tropicana mango apple orange mixed fruit guava', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2101', 'Extracts, essences and concentrates of coffee, tea or mate (instant coffee powder, Nescafe, Bru)', 18.00, 'instant coffee nescafe bru classic gold chicory concentrate', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2103', 'Sauces and preparations therefor; mixed condiments and mixed seasonings (ketchup, chili sauce)', 12.00, 'ketchup sauce tomato kisan maggi chili soya schezwan mayonnaise condiment', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2106', 'Food preparations not elsewhere specified (namkeen, bhujia, snacks, protein powders, energy mixes)', 18.00, 'namkeen bhujia haldirams bikaji snacks chips lays kurkure food supplement', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2201', 'Waters, including natural or artificial mineral waters and aerated waters (Bisleri, Kinley, Aquafina)', 18.00, 'water packaged mineral drinking bottle bisleri kinley aquafina himalayan bailley soda', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2202', 'Waters, including mineral waters and aerated waters, containing added sugar or other sweetening (Coca Cola, Pepsi, Sprite, Fanta)', 28.00, 'soft drink aerated carbonated cold drink coke pepsi thums up sprite fanta limca mountain dew', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2501', 'Salt (including table salt and denatured salt) and pure sodium chloride (Tata Salt, Aashirvaad)', 0.00, 'salt cooking iodised table namak vacuum tata rock sendha', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Personal Care, Cosmetics & Soaps
  ('3304', 'Beauty or make-up preparations and preparations for the care of the skin (lotions, creams, moisturizers, Vaseline, Nivea)', 18.00, 'lotion body cream skin moisturizer vaseline nivea ponds cold cream fairness sunscreen face wash', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3305', 'Preparations for use on the hair (shampoos, hair conditioners, hair oils, hair color)', 18.00, 'shampoo hair conditioner oil clinic plus dove sunsilk head shoulders tresemme parachute', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3306', 'Preparations for oral or dental hygiene, including dentifrice (toothpaste, tooth powder, mouthwash)', 18.00, 'toothpaste oral dental colgate pepsodent sensodyne dabur red closeup brush floss', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3307', 'Pre-shave, shaving or after-shave preparations, personal deodorants, bath preparations, perfumes', 18.00, 'deodorant perfume shaving cream razor blade aftershave axe fog wild stone nivea men', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3401', 'Soap; organic surface-active products and preparations for use as soap, in the form of bars, cakes (Dettol, Lux, Dove, Mysore Sandal)', 18.00, 'soap bathing bar toilet dettol lux dove pears mysore sandal lifebuoy cinthol medimix santoor handwash', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3402', 'Organic surface-active agents; washing preparations and cleaning preparations (detergent powder, dishwash, Surf Excel, Ariel, Vim)', 18.00, 'detergent washing powder liquid surf excel ariel tide rin surf dishwash bar vim liquid cleaner', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Pharmaceuticals & Healthcare
  ('3004', 'Medicaments consisting of mixed or unmixed products for therapeutic or prophylactic uses (tablets, capsules, syrups, formulations)', 12.00, 'medicine tablet capsule syrup pharma paracetamol dolo azithral pantocid antibiotic ointment formulation', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3005', 'Wadding, gauze, bandages and similar articles (dressings, adhesive plasters, poultices)', 12.00, 'bandage dressing gauze band-aid cotton adhesive plaster medical surgical', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3006', 'Pharmaceutical goods, sterile surgical catgut, diagnostic reagents, blood grouping reagents', 12.00, 'diagnostic test kit strip reagent blood sugar sterile medical', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Chemicals, Lubricants, Paints & Adhesives
  ('2710', 'Petroleum oils, oils from bituminous minerals, preparations containing petroleum oils (engine oil, lubricants, grease, Castrol)', 18.00, 'engine oil lubricant motor grease castrol motul servo mobil transmission brake fluid 4t 20w-40', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2712', 'Petroleum jelly; paraffin wax, microcrystalline petroleum wax', 18.00, 'petroleum jelly vaseline pure wax paraffin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3208', 'Paints and varnishes based on synthetic polymers or chemically modified natural polymers (enamel, solvent paints)', 18.00, 'paint enamel primer varnish solvent synthetic gloss asian paints berger nerolac dulux', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3209', 'Paints and varnishes based on synthetic polymers (acrylic emulsion paints, water based distempers)', 18.00, 'paint emulsion distemper interior exterior acrylic wall asian paints tractor apex royale', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3506', 'Prepared glues and other prepared adhesives (Fevicol, Araldite, cyanoacrylate, wood adhesive, epoxy)', 18.00, 'adhesive glue fevicol araldite quick resin synthetic wood bond silicone sealant fevikwik', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3808', 'Insecticides, rodenticides, fungicides, herbicides, anti-sprouting products (Good Knight, AllOut, Baygon)', 18.00, 'mosquito repellent insecticide pesticide goodknight allout baygon hit spray coil liquid', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3824', 'Prepared binders for foundry moulds or cores; chemical products and preparations (Dr. Fixit, waterproofing)', 18.00, 'waterproofing chemical compound concrete admixture dr fixit fosroc sika integral', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Plastics, Rubber, Pipes & Packaging
  ('3917', 'Tubes, pipes and hoses, and fittings therefor (for example, joints, elbows, flanges), of plastics (CPVC, UPVC, PVC)', 18.00, 'pipe pvc cpvc upvc plumbing drainage hose astral supreme ashirvad finolex fittings elbow tee coupler', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3923', 'Articles for the conveyance or packing of goods, of plastics; stoppers, lids, caps and other closures, of plastics', 18.00, 'plastic container bottle jar packaging box crate cap closure bag pouch', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3926', 'Other articles of plastics and articles of other materials of headings 3901 to 3914', 18.00, 'plastic moulded articles sheet bushing spacer nylon teflon washer', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4011', 'New pneumatic tyres, of rubber (motorcycle, car, truck, tractor tyres)', 28.00, 'tyre tire rubber mrf apollo ceat michelin jk tube pneumatic', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4016', 'Other articles of vulcanised rubber other than hard rubber (gaskets, washers, seals, o-rings)', 18.00, 'rubber gasket seal o-ring washer grommet bush vulcanised automotive industrial', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4819', 'Cartons, boxes, cases, bags and other packing containers, of paper, paperboard, cellulose wadding', 18.00, 'carton box corrugated packaging paperboard shipping master carton corrugated box', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4820', 'Registers, account books, note books, order books, receipt books, letter pads, memorandum pads', 12.00, 'notebook register diary stationery copy pad account book paper spiral', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('6404', 'Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of textile materials (shoes, sandals)', 12.00, 'footwear shoes sandals slippers sneakers boots bata relaxo sparx puma sports', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Iron, Steel, Hardware & Fasteners
  ('6804', 'Millstones, grindstones, grinding wheels and the like (abrasives, cutting discs, grinding stones, Bosch)', 18.00, 'cutting disc grinding wheel abrasive cut-off flap disc sand paper bosch norton grindwell', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7214', 'Other bars and rods of iron or non-alloy steel (TMT bars, rebars, Tata Tiscon, JSW Steel)', 18.00, 'tmt bar rebar steel rod reinforcement construction iron 550d tata tiscon jsw jindal kamdhenu', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7306', 'Other tubes, pipes and hollow profiles (for example, open seam or welded, riveted or similarly closed), of iron or steel', 18.00, 'steel pipe erw tube hollow section square pipe ms gi galvanized iron structural', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7318', 'Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (fasteners, high tensile)', 18.00, 'bolt nut screw fastener hex washer rivet anchor tvs unbrako high tensile grade 8.8 m8 m10 m12 hardware', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Hand Tools, Power Tools & Machinery
  ('8203', 'Files, rasps, pliers (including cutting pliers), pincers, tweezers, metal-cutting shears, pipe-cutters', 18.00, 'pliers cutting tool file rasp pincer cutter stripper taparia stanley hand tool', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8204', 'Hand-operated spanners and wrenches (including torque wrenches); interchangeable spanner sockets', 18.00, 'spanner wrench socket tool ring open end adjustable taparia stanley torque', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8205', 'Hand tools (including glaziers diamonds), not elsewhere specified or included; screwdrivers, hammers', 18.00, 'screwdriver hammer clamp vice tool kit hand tool taparia stanley', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8207', 'Interchangeable tools for hand tools, whether or not power-operated (drill bits, cutting bits, tool tips)', 18.00, 'drill bit masonry sds sds-plus hss carbide tip hole saw router bit bosch dewalt', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8413', 'Pumps for liquids, whether or not fitted with a measuring device; liquid elevators (water pumps, submersible)', 18.00, 'water pump submersible pump centrifugal liquid motor pump kirloskar cri crompton texmo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8414', 'Air or vacuum pumps, air or other gas compressors and fans; ventilating or recycling hoods (fans, compressors)', 18.00, 'fan exhaust compressor blower air pump industrial ventilation ceiling fan crompton havells usha', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8471', 'Automatic data processing machines and units thereof; magnetic or optical readers (computers, laptops, scanners)', 18.00, 'computer laptop scanner barcode reader desktop server cpu memory printer hardware', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8481', 'Taps, cocks, valves and similar appliances for pipes, boiler shells, tanks, vats or the like (industrial valves, ball valves)', 18.00, 'valve ball valve gate butterfly check safety cock plumbing industrial water gas steam', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8482', 'Ball or roller bearings (deep groove ball bearings, roller bearings, needle bearings, SKF, FAG, Timken)', 18.00, 'bearing ball bearing roller bearing skf fag timken ntn nbc 6205 6204 6308 industrial machinery', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8483', 'Transmission shafts (including cam shafts and crank shafts) and cranks; bearing housings and plain shaft bearings; gears', 18.00, 'gear gearbox shaft transmission coupling pulley chain sprocket industrial drive', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Electrical Switchgear, Wiring & Electronics
  ('8501', 'Electric motors and generators (excluding generating sets)', 18.00, 'motor electric motor ac motor induction three phase single phase siemens abb bharat bijlee', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8504', 'Electrical transformers, static converters (for example, rectifiers) and inductors (inverters, adapters, power supplies)', 18.00, 'transformer smps power supply adapter inverter charger rectifier voltage stabilizer', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8507', 'Electric accumulators, including separators therefor, whether or not rectangular (batteries, lead-acid, lithium)', 28.00, 'battery accumulator lead acid inverter car bike exide amaron luminous livguard', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8536', 'Electrical apparatus for switching or protecting electrical circuits (MCB, MCCB, switches, relays, fuses, plugs, sockets)', 18.00, 'mcb mccb circuit breaker switch relay fuse contactor socket plug switchgear havells schneider legrand l&t', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8537', 'Boards, panels, consoles, desks, cabinets and other bases, equipped with two or more apparatus of heading 8535 or 8536', 18.00, 'panel distribution board db box enclosure control electrical mcb box', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8539', 'Electric filament or discharge lamps; LED lamps and light fittings (LED bulbs, tubes, downlights, panels)', 18.00, 'led bulb tube light panel batten floodlight luminaire philips crompton havells wipro syska', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8541', 'Semiconductor devices (diodes, transistors, semiconductor based transducers, photosensitive devices)', 18.00, 'diode transistor semiconductor solar cell mosfet led chip component electronic', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8542', 'Electronic integrated circuits (microprocessors, microcontrollers, memories, amplifiers, digital ICs)', 18.00, 'ic integrated circuit microcontroller processor chip smd pcb logic memory', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8544', 'Insulated (including enamelled or anodised) wire, cable and other insulated electric conductors (Polycab, Finolex)', 18.00, 'wire cable electrical copper copper wire polycab finolex havells rr kabel armoured flexible frl', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Automotive Spares & Vehicles
  ('8708', 'Parts and accessories of the motor vehicles of headings 8701 to 8705 (brake pads, clutch, filters, auto spares)', 18.00, 'automotive spare parts brake pad clutch filter spark plug suspension shocker sensor bosch tvs mahle', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8714', 'Parts and accessories of vehicles of headings 8711 to 8713 (motorcycle and two wheeler parts)', 18.00, 'bike motorcycle scooter spare parts chain sprocket mirror lever cable brake shoe hero bajaj honda', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('9026', 'Instruments and apparatus for measuring or checking the flow, level, pressure or other variables of liquids or gases', 18.00, 'pressure gauge meter flow level temperature sensor measuring instrument industrial', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('9608', 'Ball point pens; felt tipped and other porous-tipped pens and markers; fountain pens, stylograph pens', 18.00, 'pen ballpoint marker gel pen cello reynolds reynolds flair parker stabilo stationery', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "gst_rate" = EXCLUDED."gst_rate",
  "keywords" = EXCLUDED."keywords",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
