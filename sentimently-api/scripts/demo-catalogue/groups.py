"""Groups people browse by. Matches the plan: 14 feelings, 8 occasions, 6 recipient groups, 11 categories."""

SENTIMENTS = {
    "miss": ("i-miss-you", "I miss you", "For someone far away"),
    "thanks": ("thank-you", "Thank you", "Say it properly"),
    "sorry": ("im-sorry", "I'm sorry", "When words are not enough"),
    "love": ("i-love-you", "I love you", "For the one who has your heart"),
    "congrats": ("congratulations", "Congratulations", "For wins big and small"),
    "well": ("get-well-soon", "Get well soon", "Comfort for a hard week"),
    "think": ("thinking-of-you", "Thinking of you", "A little reminder you matter"),
    "luck": ("good-luck", "Good luck", "Before the big day"),
    "anniv": ("happy-anniversary", "Happy anniversary", "Years worth celebrating"),
    "best": ("youre-the-best", "You're the best", "For someone who always shows up"),
    "baby": ("welcome-baby", "Welcome, little one", "For new parents"),
    "proud": ("proud-of-you", "Proud of you", "For every milestone"),
    "because": ("just-because", "Just because", "No reason needed"),
    "home": ("welcome-home", "Welcome home", "For a new place or a safe return"),
}

OCCASIONS = {
    "bday": ("birthday", "Birthday"),
    "eid": ("eid", "Eid"),
    "anniv": ("anniversary", "Anniversary"),
    "wedding": ("wedding", "Wedding"),
    "baby": ("new-baby", "New baby"),
    "grad": ("graduation", "Graduation"),
    "mom": ("mothers-day", "Mother's Day"),
    "dad": ("fathers-day", "Father's Day"),
}

RECIPIENTS = {
    "friend": ("friend", "Friend"),
    "partner": ("partner", "Partner"),
    "parent": ("parent", "Parent"),
    "sibling": ("sibling", "Sibling"),
    "colleague": ("colleague", "Colleague"),
    "child": ("child", "Child"),
}

CATEGORIES = {
    "home": ("home", "Home and living"),
    "jewellery": ("jewellery", "Jewellery"),
    "food": ("food", "Food and sweets"),
    "flowers": ("flowers", "Flowers"),
    "plants": ("plants", "Plants"),
    "beauty": ("beauty", "Beauty and fragrance"),
    "accessories": ("accessories", "Accessories"),
    "stationery": ("stationery", "Books and stationery"),
    "tech": ("tech", "Tech"),
    "keepsakes": ("keepsakes", "Keepsakes"),
    "digital": ("digital", "Digital gifts"),
}
