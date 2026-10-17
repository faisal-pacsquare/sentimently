"""The demo catalogue. Placeholder content for development: names, prices and pictures are made up.

Each row: (name, category, price, picture, palette, description, feelings, occasions, recipients, flags)
flags: "m5-7" made to order in 5 to 7 working days, "p" perishable, "o850" offer price, "s12" stock, "eg" e-gift card, "gc" greeting card.
"""

ITEMS = [
    # ---------------------------------------------------------------- home
    ("Photo mug", "home", 1200, "mug", 0, "A ceramic mug printed with your favourite photograph and a short message. Dishwasher safe.", "miss,thanks,love", "bday,anniv", "friend,partner,parent", "o999 s25"),
    ("Couple mugs set", "home", 2400, "mug", 8, "Two matching mugs with your names, boxed together. A warm start to every shared morning.", "love,anniv", "anniv,wedding", "partner", "s18"),
    ("Scented soy candle", "home", 1500, "candle", 0, "A hand-poured soy candle in rose and vanilla, about 40 hours of slow, clean burn.", "think,because,thanks", "bday,mom", "friend,parent", "s30"),
    ("Candle trio gift set", "home", 3600, "candle", 2, "Three small candles in oud, jasmine and sandalwood, packed in a keepsake sleeve.", "thanks,home,best", "eid,wedding", "friend,colleague", "o3200 s14"),
    ("Wooden photo frame", "home", 1800, "frame", 7, "A solid sheesham frame for a 5 by 7 photograph, with a small engraved line along the base.", "miss,think", "bday,anniv", "parent,partner", "s22"),
    ("Personalised cushion", "home", 2200, "pillow", 8, "A soft velvet cushion with a name and a short message embroidered in the corner.", "love,home", "wedding,bday", "partner,sibling", "m3-4"),
    ("Ceramic bud vase", "home", 1400, "plant", 6, "A small hand-glazed vase in sea green, made for a single flower or a sprig from the garden.", "because,thanks", "mom,eid", "friend,parent", "s20"),
    ("Fairy-light memory jar", "home", 1100, "candle", 1, "A glass jar of warm fairy lights with space to slip in notes and tiny photographs.", "miss,think,sorry", "bday", "friend,sibling,partner", "s35"),
    ("Calligraphy wall art", "home", 2900, "frame", 3, "A framed print with a line of verse in elegant calligraphy. Choose Urdu or English.", "love,proud", "wedding,eid", "parent,partner", "m4-6"),
    ("Brass table lamp", "home", 5400, "lamp", 1, "A compact brass-finish lamp with a linen shade. Gives a gentle pool of light for a reading corner.", "home,congrats", "wedding", "friend,sibling", "s9"),
    ("Aroma diffuser set", "home", 4200, "bottle", 6, "An ultrasonic diffuser with three essential oils: lavender, eucalyptus and citrus.", "well,think", "mom", "parent,friend", "o3700 s16"),
    ("Cotton throw blanket", "home", 3800, "pillow", 7, "A woven cotton throw in soft stone, light enough for summer evenings and warm enough for winter.", "home,thanks", "wedding", "parent,friend", "s12"),
    ("Serving tray set", "home", 3100, "tin", 5, "Two hand-painted serving trays that nest together. Good for chai, sweets or a gift of their own.", "thanks,home", "eid,wedding", "parent,colleague", "s15"),
    ("Chai and cup set", "home", 2700, "mug", 1, "Two cups, a tea strainer and a small tin of loose-leaf chai blend.", "thanks,best", "eid,bday", "colleague,friend", "s26"),

    # ---------------------------------------------------------------- jewellery
    ("Cursive name necklace", "jewellery", 3500, "pendant", 4, "A silver necklace engraved with a name in cursive. Made to order.", "love,miss,best", "bday,anniv", "partner,friend,sibling", "m5-7"),
    ("Initial pendant", "jewellery", 2800, "pendant", 1, "A gold-plated initial on a fine chain. Choose any letter from A to Z.", "because,love", "bday,mom", "partner,friend,sibling", "s24"),
    ("Birthstone ring", "jewellery", 4900, "ring", 8, "A sterling silver ring set with the stone of the month. Sizes 5 to 9.", "proud,love", "bday,anniv", "partner,sibling", "o4400 s11"),
    ("Silver bracelet", "jewellery", 3300, "pendant", 4, "A slim silver bracelet with an adjustable clasp and a small engraved charm.", "think,thanks", "bday", "friend,sibling", "s17"),
    ("Pearl drop earrings", "jewellery", 3900, "ring", 7, "Freshwater pearls on gold-plated hooks, light enough to wear all day.", "thanks,congrats", "wedding,mom", "parent,friend", "s13"),
    ("Couple promise bands", "jewellery", 6800, "ring", 2, "A matching pair of brushed steel bands, engraved inside with a date or a word.", "love,anniv", "anniv,wedding", "partner", "m6-8"),
    ("Engraved bangle", "jewellery", 4600, "ring", 1, "A gold-plated bangle with a short message engraved on the inside curve.", "love,proud,best", "bday,eid", "partner,parent,sibling", "m5-7"),
    ("Fine gold-plated chain", "jewellery", 2500, "pendant", 1, "A delicate 18 inch chain that layers beautifully with a pendant of your own.", "because", "bday", "friend,sibling", "s28"),
    ("Charm bracelet", "jewellery", 5200, "pendant", 8, "Start a story: a silver bracelet with three charms, with room for more over the years.", "proud,because", "bday,grad", "friend,sibling", "o4700 s10"),
    ("Zodiac constellation necklace", "jewellery", 3600, "pendant", 2, "A pendant showing your sign's constellation in tiny stars, on a silver chain.", "think,love", "bday", "friend,partner", "s19"),
    ("Heart locket", "jewellery", 4400, "pendant", 0, "A small heart locket that opens to hold a photo. Sterling silver with a rose finish.", "miss,love,sorry", "anniv,bday", "partner,parent", "s14"),
    ("Engraved cufflinks", "jewellery", 3700, "ring", 9, "Stainless steel cufflinks engraved with initials. Arrive in a slim presentation box.", "proud,congrats", "wedding,dad", "partner,parent,colleague", "m4-5"),

    # ---------------------------------------------------------------- food
    ("Luxury chocolate box", "food", 1800, "tin", 5, "Twelve hand-finished chocolates: salted caramel, hazelnut praline, dark orange and more.", "thanks,sorry,love", "bday,eid", "friend,partner,colleague", "p s30"),
    ("Dates gift tray", "food", 2600, "tin", 1, "Premium Ajwa and Medjool dates arranged on a wooden tray, ready for Ramadan and Eid.", "thanks,home", "eid", "parent,colleague", "s40"),
    ("Celebration cake (1 kg)", "food", 3200, "cake", 0, "A fresh vanilla and strawberry cake with a short message piped on top. Baked the day it is sent.", "congrats,love", "bday,anniv", "friend,partner,child", "p s10"),
    ("Gourmet cookie tin", "food", 1900, "tin", 7, "Twelve big cookies in a keepsake tin: chocolate chunk, oat and sea-salt caramel.", "thanks,because,sorry", "bday,eid", "friend,colleague,child", "s32"),
    ("Dry fruit hamper", "food", 4800, "tin", 1, "Almonds, pistachios, walnuts and dried apricots in a hand-woven basket.", "thanks,home", "eid,wedding", "parent,colleague", "o4300 s16"),
    ("Tea and honey set", "food", 2400, "tin", 6, "Three loose-leaf teas and a jar of wild honey, with a wooden dipper.", "well,think,thanks", "mom", "parent,friend", "s21"),
    ("Macarons box (12)", "food", 2300, "cake", 0, "Twelve French-style macarons in rose, pistachio, salted caramel and coffee.", "love,congrats", "bday,anniv", "partner,friend", "p s18"),
    ("Fudge brownie box", "food", 1600, "cake", 7, "Eight dense chocolate brownies, cut into squares and wrapped in ribbon.", "sorry,because,best", "bday", "friend,colleague,child", "p s26"),
    ("Mithai assortment", "food", 2900, "tin", 1, "Barfi, gulab jamun, rasmalai and kaju katli from a family confectioner, in a decorative box.", "congrats,thanks", "eid,wedding,baby", "parent,colleague", "p s22"),
    ("Coffee lover's hamper", "food", 4100, "tin", 7, "Freshly roasted beans, a small grinder and a ceramic mug for the one who needs their cup.", "thanks,best", "bday,dad", "colleague,friend,parent", "s11"),
    ("Hazelnut spread jar", "food", 900, "bottle", 5, "A jar of smooth roasted hazelnut and cocoa spread, made in small batches.", "because,sorry", "bday", "friend,child", "s45"),
    ("Baklava box", "food", 2700, "tin", 1, "Layers of flaky pastry with pistachio and honey, packed fresh in a gold-trimmed box.", "thanks,congrats", "eid,wedding", "parent,colleague", "p s20"),

    # ---------------------------------------------------------------- flowers
    ("Red roses bouquet (12)", "flowers", 3400, "bouquet", 8, "Twelve long-stem red roses with eucalyptus, hand tied and wrapped in paper.", "love,sorry", "anniv,bday", "partner", "p s20"),
    ("Pastel mixed bouquet", "flowers", 3000, "bouquet", 0, "Roses, carnations and lisianthus in soft pinks and creams, tied with a satin ribbon.", "thanks,congrats,think", "bday,mom", "friend,parent", "p s16"),
    ("Sunflower bunch", "flowers", 2200, "bouquet", 1, "Seven bright sunflowers with greens. Impossible not to smile at.", "well,proud,because", "bday,grad", "friend,sibling", "p s14"),
    ("White lilies bouquet", "flowers", 3600, "bouquet", 7, "A generous bunch of fragrant white lilies, for sympathy, welcome or celebration.", "sorry,well,home", "baby,wedding", "parent,friend", "p s9"),
    ("Tulip bunch", "flowers", 2800, "bouquet", 8, "Fifteen tulips in mixed spring colours, wrapped in kraft paper.", "because,think", "mom,bday", "friend,parent", "p s12"),
    ("Rose box", "flowers", 4200, "giftbox", 8, "Fresh roses arranged in a round hat box that you can keep afterwards.", "love,anniv", "anniv,bday", "partner", "o3800 p s15"),
    ("Dried flower posy", "flowers", 2000, "bouquet", 5, "A small bunch of dried gypsophila, lavender and wheat. Lasts for months.", "think,thanks,home", "mom,eid", "friend,parent", "s24"),
    ("Carnation basket", "flowers", 3100, "plant", 0, "Pink and white carnations in a woven basket, ready to stand on a table.", "well,thanks", "mom", "parent,friend", "p s13"),
    ("Orchid arrangement", "flowers", 5900, "plant", 2, "A double-stem orchid in a ceramic pot, with lasting blooms for weeks.", "congrats,home", "wedding,baby", "friend,colleague", "s7"),
    ("Gerbera daisies", "flowers", 2300, "bouquet", 1, "A cheerful mix of gerbera daisies in orange, yellow and pink.", "proud,well,best", "grad,bday", "friend,child", "p s17"),

    # ---------------------------------------------------------------- plants
    ("Money plant in a pot", "plants", 1300, "plant", 3, "A hardy trailing plant in a glazed pot. Forgiving, fast-growing and said to bring luck.", "luck,home", "wedding,eid", "friend,colleague", "s34"),
    ("Succulent trio", "plants", 1700, "plant", 6, "Three small succulents in matching terracotta pots, with a tray.", "think,because", "bday", "friend,colleague,sibling", "s27"),
    ("Peace lily", "plants", 2400, "plant", 3, "A graceful indoor plant with white blooms, known for clearing the air.", "sorry,well,home", "baby,mom", "parent,friend", "s12"),
    ("Mini cactus garden", "plants", 1900, "plant", 5, "A tiny desert in a bowl: five cacti and a layer of coloured sand.", "because,luck", "bday,grad", "colleague,child", "s22"),
    ("Lucky bamboo", "plants", 1500, "plant", 3, "Three stalks of lucky bamboo in a glass vase with pebbles.", "luck,congrats", "wedding", "colleague,friend", "s30"),
    ("Snake plant", "plants", 2100, "plant", 7, "A sculptural, nearly indestructible plant for brighter or dimmer rooms alike.", "home,thanks", "wedding", "colleague,friend", "s19"),
    ("Glass terrarium", "plants", 3400, "plant", 6, "A closed glass terrarium with moss, small ferns and a stone path. Almost no care needed.", "think,because", "bday", "friend,partner", "o3000 s8"),
    ("Herb garden kit", "plants", 1800, "plant", 3, "Basil, coriander and mint seeds with pots, soil and a small trowel.", "thanks,home", "bday,mom", "parent,friend", "s23"),

    # ---------------------------------------------------------------- beauty
    ("Signature perfume for her", "beauty", 5800, "bottle", 0, "A warm floral fragrance with notes of jasmine, amber and musk. 50 ml.", "love,thanks", "bday,mom,anniv", "partner,parent", "s21"),
    ("Signature perfume for him", "beauty", 5800, "bottle", 9, "A woody, spiced fragrance with notes of cedar, cardamom and leather. 50 ml.", "love,proud", "bday,dad", "partner,parent", "s21"),
    ("Spa day hamper", "beauty", 4600, "tin", 6, "A bath bomb, body scrub, face mask and candle, packed for a slow evening.", "well,thanks,best", "mom,bday", "friend,parent", "o4100 s12"),
    ("Skincare essentials set", "beauty", 6200, "bottle", 3, "Cleanser, toner and moisturiser for everyday skin, in travel sizes.", "thanks,think", "bday", "friend,sibling", "s14"),
    ("Oud attar", "beauty", 3900, "bottle", 5, "A rich, alcohol-free attar oil in a hand-cut glass bottle.", "thanks,congrats", "eid,dad", "parent,friend,partner", "s17"),
    ("Bath bomb collection", "beauty", 1700, "cake", 8, "Six fizzing bath bombs in rose, lavender, citrus, vanilla, mint and ocean.", "because,well", "bday", "friend,sibling", "s28"),
    ("Body mist trio", "beauty", 2900, "bottle", 0, "Three light body mists: peach blossom, sea salt and cherry.", "because,thanks", "bday", "friend,sibling,colleague", "s24"),
    ("Hair care ritual set", "beauty", 3300, "bottle", 3, "A nourishing oil, a mask and a wooden comb, for glossier hair.", "thanks,think", "mom,bday", "friend,parent", "s15"),
    ("Lip care duo", "beauty", 1200, "bottle", 8, "A tinted balm and a sleeping lip mask in a small satin pouch.", "because,best", "bday", "friend,colleague", "s40"),
    ("Silk eye mask and pouch", "beauty", 1600, "pillow", 2, "A soft silk sleep mask with a matching pouch, for travel or lazy mornings.", "well,thanks", "bday,mom", "friend,parent", "s26"),

    # ---------------------------------------------------------------- accessories
    ("Leather bifold wallet", "accessories", 3900, "bag", 7, "A slim wallet in full-grain leather with six card slots and a note compartment. Initials on request.", "proud,thanks,love", "bday,dad", "partner,parent,colleague", "m3-4"),
    ("Canvas tote bag", "accessories", 1900, "bag", 5, "A sturdy cotton tote with a printed name or short quote. Big enough for a laptop.", "because,thanks", "bday,grad", "friend,colleague", "s33"),
    ("Silk scarf", "accessories", 3200, "pillow", 8, "A square silk-blend scarf in a floral print, to wear on the neck, hair or bag.", "thanks,think", "mom,eid", "parent,friend", "s18"),
    ("Classic men's watch", "accessories", 7800, "watch", 9, "A simple steel watch with a navy dial and a leather strap. Water resistant to 30 m.", "proud,congrats", "dad,grad,bday", "partner,parent", "o6900 s9"),
    ("Women's rose-gold watch", "accessories", 7200, "watch", 0, "A slim rose-gold watch with a mesh strap and a mother-of-pearl face.", "love,proud", "bday,anniv", "partner,sibling", "s10"),
    ("Polarised sunglasses", "accessories", 3500, "watch", 7, "Lightweight frames with UV400 polarised lenses and a soft case.", "because,best", "bday", "friend,sibling", "s20"),
    ("Leather keychain", "accessories", 900, "ring", 5, "A hand-stitched leather keyfob with initials pressed in gold.", "thanks,luck", "bday,grad", "friend,colleague", "m2-3"),
    ("Passport holder", "accessories", 1800, "bag", 7, "A leather passport holder with card slots and a name stamped on the cover.", "luck,miss", "bday,grad", "friend,sibling", "s25"),
    ("Everyday handbag", "accessories", 6400, "bag", 8, "A structured faux-leather handbag with an inner zip pocket and a detachable strap.", "love,thanks", "mom,bday", "partner,parent", "s8"),
    ("Woollen winter set", "accessories", 3100, "pillow", 9, "A matching cap, scarf and gloves in soft wool, in charcoal or camel.", "think,home", "bday", "parent,friend,child", "s16"),

    # ---------------------------------------------------------------- stationery
    ("Personalised leather diary", "stationery", 2800, "book", 7, "A refillable A5 diary with a name pressed on the cover and 200 cream pages.", "proud,thanks", "grad,bday", "friend,colleague,sibling", "m3-4"),
    ("Fountain pen set", "stationery", 4300, "book", 9, "A weighty fountain pen with two ink cartridges, in a wooden presentation case.", "congrats,proud", "grad,dad", "colleague,parent", "s12"),
    ("Notebook trio", "stationery", 1400, "book", 3, "Three pocket notebooks in dotted, lined and plain, with a pen loop.", "because,thanks", "bday", "colleague,friend", "s38"),
    ("Desk planner", "stationery", 1700, "book", 6, "A dated weekly planner with goal pages and a cover in soft sage.", "luck,proud", "grad", "colleague,sibling", "s24"),
    ("Poetry collection", "stationery", 1500, "book", 2, "A hardback collection of ghazals and nazms, in Urdu with English translation.", "love,miss,think", "bday,eid", "friend,partner,parent", "s19"),
    ("Photo book (20 pages)", "stationery", 4500, "book", 8, "A hardcover book printed with your photographs and captions. Made to order.", "miss,love,proud", "anniv,wedding,bday", "partner,parent,friend", "m6-8"),
    ("Calligraphy starter set", "stationery", 2600, "book", 5, "Pens, ink, practice paper and a guide book, for beautiful handwriting.", "because,luck", "bday,eid", "friend,child", "s13"),
    ("Magnetic bookmark set", "stationery", 800, "book", 4, "Six magnetic bookmarks in a tin, in gold and enamel.", "thanks,because", "bday", "friend,colleague", "s50"),

    # ---------------------------------------------------------------- tech
    ("Wireless earbuds", "tech", 6900, "gadget", 9, "True wireless earbuds with 20 hours of battery in the case and a pocket-sized charger.", "proud,thanks,best", "bday,grad", "friend,sibling,partner", "o5900 s14"),
    ("Bluetooth speaker", "tech", 5200, "gadget", 3, "A small, loud, water-resistant speaker with 12 hours of play time.", "thanks,congrats", "bday,grad", "friend,sibling", "s17"),
    ("Power bank 10,000 mAh", "tech", 3400, "gadget", 7, "A slim power bank that charges a phone twice. Fast charging over USB-C.", "thanks,luck", "bday", "colleague,friend", "s30"),
    ("Smart fitness band", "tech", 5600, "watch", 4, "A fitness band tracking steps, heart rate and sleep, with a 10 day battery.", "proud,well", "bday", "friend,parent", "s12"),
    ("Personalised phone case", "tech", 1700, "gadget", 8, "A slim, shock-absorbing case with your photo or a name printed on the back.", "miss,love,because", "bday", "friend,partner,sibling", "m3-4"),
    ("Charging desk organiser", "tech", 4100, "gadget", 7, "A wooden desk stand with a wireless charging pad and a slot for your pens and cards.", "thanks,proud", "grad,bday", "colleague,partner", "s11"),
    ("Mini photo printer", "tech", 8900, "gadget", 0, "A pocket printer that turns phone pictures into sticky-back prints in under a minute.", "miss,because", "bday,grad", "friend,sibling,partner", "s6"),
    ("Smart LED night light", "tech", 2600, "lamp", 2, "A colour-changing night light that you control from your phone.", "think,home", "bday,baby", "child,friend", "s21"),

    # ---------------------------------------------------------------- keepsakes
    ("Engraved photo lamp", "keepsakes", 4900, "lamp", 4, "A glowing acrylic lamp engraved with your photograph. A gift that is hard to put down.", "miss,love,proud", "anniv,bday", "partner,parent", "m4-6"),
    ("Memory keepsake box", "keepsakes", 2600, "giftbox", 1, "A wooden box with a hinged lid, engraved with a name and date, for letters and tickets.", "love,miss,proud", "anniv,wedding,baby", "partner,parent,child", "m4-5"),
    ("Star map print", "keepsakes", 3200, "frame", 9, "The night sky exactly as it was on a date that matters to you, printed on heavy paper.", "love,anniv", "anniv,wedding,baby", "partner,parent", "m3-5"),
    ("Couple's journal", "keepsakes", 2200, "book", 0, "A shared journal with prompts, to write in by turns and keep for years.", "love,miss", "anniv,wedding", "partner", "s17"),
    ("Love coupon book", "keepsakes", 1100, "book", 8, "Twenty tear-out coupons: a night in, a long drive, a favourite dinner and more.", "love,sorry,because", "anniv,bday", "partner", "s30"),
    ("Time capsule box", "keepsakes", 3500, "giftbox", 7, "A sealed box with note cards and a ribbon, to be opened in five or ten years.", "proud,love,baby", "baby,grad,wedding", "child,partner,parent", "s14"),
    ("Name jigsaw puzzle", "keepsakes", 2100, "frame", 4, "A 120-piece wooden puzzle that, once solved, spells a name or a short message.", "because,love", "bday", "child,partner,friend", "m3-4"),
    ("Custom caricature portrait", "keepsakes", 5500, "frame", 5, "A hand-drawn caricature from your photo, framed and ready to hang. Made to order.", "congrats,proud,best", "bday,wedding", "friend,colleague,parent", "m7-10"),

    # ---------------------------------------------------------------- digital
    ("E-gift card Rs 1,000", "digital", 1000, "egift", 3, "A digital gift card delivered by email, valid for 12 months. Redeem against anything in the shop.", "thanks,because,best", "bday,eid", "friend,colleague", "eg"),
    ("E-gift card Rs 2,000", "digital", 2000, "egift", 4, "A digital gift card delivered by email, valid for 12 months. Redeem against anything in the shop.", "thanks,congrats", "bday,eid,grad", "friend,sibling", "eg"),
    ("E-gift card Rs 3,000", "digital", 3000, "egift", 0, "A digital gift card delivered by email, valid for 12 months. Redeem against anything in the shop.", "thanks,love", "bday,anniv", "friend,partner", "eg"),
    ("E-gift card Rs 5,000", "digital", 5000, "egift", 2, "A digital gift card delivered by email, valid for 12 months. Redeem against anything in the shop.", "proud,congrats,love", "wedding,bday", "partner,parent", "eg"),
    ("E-gift card Rs 10,000", "digital", 10000, "egift", 1, "A digital gift card delivered by email, valid for 12 months. Redeem against anything in the shop.", "congrats,thanks", "wedding,baby", "parent,sibling", "eg"),
    ("Birthday greeting card", "digital", 400, "card", 0, "An animated birthday card with your message, sent by email at the time you choose.", "best,because", "bday", "friend,sibling,colleague", "gc"),
    ("Anniversary greeting card", "digital", 400, "card", 8, "An animated card for years together, with your words and a small slideshow.", "anniv,love", "anniv", "partner,parent", "gc"),
    ("Thank-you greeting card", "digital", 350, "card", 3, "A warm animated thank-you card that arrives by email, with your own message.", "thanks", "bday,eid", "colleague,friend,parent", "gc"),
    ("Get-well greeting card", "digital", 350, "card", 6, "A gentle animated card to send comfort and good wishes to someone unwell.", "well,think", "bday", "friend,parent", "gc"),
    ("Eid Mubarak greeting card", "digital", 400, "card", 1, "An animated Eid card with crescent moons and your personal wishes.", "because,best", "eid", "friend,parent,colleague", "gc"),
    ("Congratulations greeting card", "digital", 400, "card", 4, "A cheerful animated card for a new job, a degree, a new home or a new chapter.", "congrats,proud", "grad,wedding,baby", "friend,colleague,sibling", "gc"),
    ("Sorry greeting card", "digital", 350, "card", 2, "A sincere animated card to say sorry, with space for what you really mean.", "sorry", "bday", "friend,partner,parent", "gc"),
    ("Love note greeting card", "digital", 450, "card", 8, "An animated love note with drifting hearts and a message in your own words.", "love,miss,think", "anniv", "partner", "gc"),
    ("Welcome baby greeting card", "digital", 400, "card", 5, "A soft animated card to welcome a new baby and congratulate the family.", "baby,congrats", "baby", "friend,parent,sibling", "gc"),

    # ---------------------------------------------------------------- ribbon flower bouquets
    ("Single ribbon rose", "ribbon", 350, "rr1k", 8, "One satin ribbon rose with baby's breath, wrapped in black paper and tied with a red bow. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,think,sorry", "bday,anniv", "partner,friend", "m2-3"),
    ("Ribbon rose bouquet (3)", "ribbon", 750, "rr3w", 8, "Three satin ribbon roses in cream wrap with a satin bow. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,thanks,sorry", "bday,anniv", "partner,friend,parent", "m2-3"),
    ("Ribbon rose bouquet (5)", "ribbon", 1100, "rr5k", 0, "Five ribbon roses in soft pink, wrapped in black tissue and tied with ribbon. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,congrats,thanks", "bday,anniv,eid", "partner,friend,sibling", "m2-3"),
    ("Ribbon rose bouquet (7)", "ribbon", 1450, "rr7w", 0, "Seven ribbon roses in pink and blush, wrapped in cream paper. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,best,thanks", "bday,mom,anniv", "partner,parent,friend", "m2-3"),
    ("Ribbon rose bouquet (10)", "ribbon", 1900, "rr10k", 8, "Ten deep red ribbon roses in a black wrap with a satin bow. A classic for anniversaries. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,anniv,sorry", "anniv,bday", "partner", "m2-3 o1750"),
    ("Ribbon rose bouquet (20)", "ribbon", 3300, "rr20k", 8, "Twenty red ribbon roses with baby's breath in a black wrap. Generous, bold and made to be remembered. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,anniv,proud", "anniv,bday,wedding", "partner", "m3-4"),
    ("Ribbon rose bouquet (50)", "ribbon", 7500, "rr50k", 8, "Fifty ribbon roses packed into one statement bouquet. The one for a proposal or a big milestone. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,anniv,proud", "anniv,wedding,engage", "partner", "m4-5"),
    ("Ribbon rose bouquet (100)", "ribbon", 13500, "rr100k", 8, "One hundred ribbon roses, hand folded and arranged by our team. Made to order with a few days of notice. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,anniv", "anniv,wedding,engage", "partner", "m5-7"),
    ("Glitter red rose bouquet", "ribbon", 3800, "rr16kg", 8, "Sixteen sparkling red ribbon roses in a black wrap. They catch the light from every angle. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,anniv,because", "anniv,bday", "partner", "m3-4"),
    ("Emerald glitter rose bouquet", "ribbon", 2900, "rr12wg", 3, "Twelve deep green glitter ribbon roses in cream paper with a brown edge. A distinctive, modern bouquet. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "congrats,thanks,best", "bday,eid", "friend,sibling,colleague", "m3-4"),
    ("Sky blue butterfly bouquet", "ribbon", 2600, "rr14wb", 4, "Fourteen sky blue ribbon roses with baby's breath and little butterflies, in kraft-coloured paper. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "congrats,baby,because", "bday,baby,grad", "friend,sibling,child", "m3-4"),
    ("Lavender ribbon flower bouquet", "ribbon", 2400, "rr9w", 2, "Large lavender blooms with soft green leaves, wrapped in lilac paper and tied with a ribbon. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "thanks,best,congrats", "bday,mom,eid", "friend,parent,sibling", "m3-4"),
    ("White rose mini bouquet", "ribbon", 1500, "rr1kx", 7, "A single white rose with dried foliage in luxury black wrapping and satin ribbon. Simple, elegant, timeless. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "think,thanks,love", "bday,anniv,wedding", "partner,friend,colleague", "m2-3"),
    ("Maroon satin rose trio", "ribbon", 1700, "rr3k", 10, "Three large maroon satin roses in black wrap with a red ribbon. Smaller than a bouquet, bigger than a flower. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,sorry,thanks", "anniv,bday", "partner", "m2-3"),
    ("Birthday glitter rose bouquet", "ribbon", 4200, "rr18kgs", 8, "Eighteen glitter ribbon roses with a black sash that carries your birthday message in gold. Hand-folded from satin ribbon, so it never wilts and can be kept for years.", "love,best,because", "bday", "partner,friend,sibling", "m3-4"),

    # ---------------------------------------------------------------- gajray and floral jewellery
    ("Simple ribbon gajray, pair", "gajray", 450, "gj1", 0, "A pair of hand-folded ribbon flower gajray for the wrist, in the colour of your choice. A light, graceful finish for Mehndi and Eid.", "because,best,thanks", "mehndi,eid,wedding", "friend,sibling,partner", "m3-5"),
    ("Ribbon gajray with stamens, pair", "gajray", 850, "gj2", 8, "Satin ribbon roses finished with silver and gold stamens for extra sparkle. A pair. Choose any colour.", "because,best", "mehndi,engage,wedding", "friend,sibling,partner", "m3-5"),
    ("Ribbon gajray with pearl latkans, pair", "gajray", 1300, "gj3", 5, "Ribbon roses with pearl strands and small flower latkans that sway as you move. A pair, made in any colour.", "congrats,because", "mehndi,engage,wedding", "friend,sibling,partner", "m3-5"),
    ("Bridal maroon gajray set", "gajray", 2800, "gj3", 10, "A full bridal set: two large gajray with pearl latkans in maroon and gold. Made to order for your date.", "congrats,love,proud", "wedding,engage,mehndi", "friend,sibling,partner", "m5-7"),
    ("Purple wrist corsage", "gajray", 700, "gj0", 2, "A single wrist corsage of violet ribbon roses with silver stamens and a pearl in the centre of each bloom.", "congrats,best,thanks", "wedding,grad,bday", "friend,sibling,partner", "m3-5"),
    ("Emerald mehndi ring pair", "gajray", 900, "gj0", 3, "Two ring flowers in deep green with gold beading, worn on the hand with the gajray. Adjustable fit.", "because,best", "mehndi,eid,wedding", "friend,sibling", "m3-5"),
    ("Ribbon flower hair crown", "gajray", 1600, "gj4", 0, "A crown of ribbon roses and baby's breath on a soft band, with a satin bow at the back. Choose the colour.", "congrats,love,proud", "wedding,engage,bday", "friend,sibling,partner,child", "m4-6"),
    ("White ribbon floral crown", "gajray", 1400, "gj4x", 7, "A crown of white ribbon roses with pearl beads and a satin bow. For Nikkah, engagement and photoshoots.", "congrats,love,best", "wedding,engage", "friend,sibling,partner", "m4-6"),

    # ---------------------------------------------------------------- chocolate bouquets
    ("Cadbury and KitKat chocolate bouquet", "chocbq", 2800, "cq1", 2, "A fan of Cadbury Dairy Milk and KitKat bars, wrapped in white paper with a gold ribbon. Made fresh to order.", "thanks,congrats,best", "bday,eid,grad", "friend,colleague,sibling", "m1-2"),
    ("Dairy Milk chocolate bouquet", "chocbq", 2200, "cq1", 5, "Fifteen Dairy Milk bars arranged as a bouquet in kraft paper with a ribbon bow. A crowd-pleaser.", "thanks,sorry,because", "bday,eid", "friend,colleague,child", "m1-2"),
    ("Mini chocolate bouquet", "chocbq", 1200, "cq0", 1, "Five chocolate bars in a small wrapped bouquet. A friendly little thank-you.", "thanks,because,best", "bday,eid", "friend,colleague", "m1-2"),
]
