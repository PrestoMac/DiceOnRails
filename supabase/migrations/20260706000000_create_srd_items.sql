CREATE TABLE IF NOT EXISTS srd_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, 
    rarity TEXT NOT NULL, 
    description TEXT NOT NULL,
    weight NUMERIC DEFAULT 0,
    cost TEXT DEFAULT '0 gp',
    stats JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


ALTER TABLE srd_items ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Public select" ON srd_items FOR SELECT USING (true);


CREATE POLICY "Public insert" ON srd_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON srd_items FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON srd_items FOR DELETE USING (true);


INSERT INTO srd_items (name, type, rarity, description, weight, cost, stats) VALUES
('Dagger', 'weapon', 'common', 'A small, sharp knife used for stabbing or throwing.', 1, '2 gp', '{"damage": "1d4", "damageType": "piercing", "properties": ["finesse", "light", "thrown (20/60)"]}'),
('Daggers', 'weapon', 'common', 'A pair of small, easily concealed sharp blades.', 2, '4 gp', '{"damage": "1d4", "damageType": "piercing", "properties": ["finesse", "light", "thrown (20/60)"]}'),
('Shortsword', 'weapon', 'common', 'A short, double-edged blade popular among rogues and dual-wielders.', 2, '10 gp', '{"damage": "1d6", "damageType": "piercing", "properties": ["finesse", "light"]}'),
('Longsword', 'weapon', 'common', 'A versatile two-handed sword favored by knights and warriors.', 4, '15 gp', '{"damage": "1d8", "damageType": "slashing", "properties": ["versatile (1d10)"]}'),
('Greatsword', 'weapon', 'common', 'A massive two-handed sword that deals devastating cuts.', 6, '50 gp', '{"damage": "2d6", "damageType": "slashing", "properties": ["heavy", "two-handed"]}'),
('Warhammer', 'weapon', 'common', 'A heavy war hammer with a crushing head, favored by paladins.', 2, '15 gp', '{"damage": "1d8", "damageType": "bludgeoning", "properties": ["versatile (1d10)"]}'),
('Mace', 'weapon', 'common', 'A heavy club with a metal head, designed to crush armor and bone.', 4, '5 gp', '{"damage": "1d6", "damageType": "bludgeoning"}'),
('Quarterstaff', 'weapon', 'common', 'A simple cylindrical rod of wood, often capped with metal. Light and versatile.', 4, '2 sp', '{"damage": "1d6", "damageType": "bludgeoning", "properties": ["versatile (1d8)"]}'),
('Staff', 'weapon', 'common', 'An arcane staff that doubles as a walking stick and a weapon.', 4, '5 gp', '{"damage": "1d6", "damageType": "bludgeoning", "properties": ["versatile (1d8)"]}'),
('Rock', 'weapon', 'common', 'A simple stone picked up off the ground. Effective when thrown.', 1, '0 gp', '{"damage": "1d4", "damageType": "bludgeoning", "properties": ["thrown (20/60)"]}'),
('Shortbow', 'weapon', 'common', 'A compact bow for hunting and ranged skirmishing.', 2, '25 gp', '{"damage": "1d6", "damageType": "piercing", "properties": ["range (80/320)", "two-handed"]}'),
('Leather Armor', 'armor', 'common', 'Light vest and leggings made of boiled leather.', 8, '10 gp', '{"acFormula": "11 + DEX"}'),
('Hide Armor', 'armor', 'common', 'Crude armor fashioned from thick furs and hides.', 12, '10 gp', '{"acFormula": "12 + DEX"}'),
('Chain Shirt', 'armor', 'common', 'A shirt made of interlocking metal rings, worn between clothing layers.', 20, '50 gp', '{"acFormula": "13 + DEX"}'),
('Chain Mail', 'armor', 'common', 'Heavy interlocking metal rings offering solid protection.', 55, '75 gp', '{"acFormula": "16", "stealthDisadv": true, "strengthReq": 13}'),
('Plate Armor', 'armor', 'common', 'Shaped metal plates covering the entire body. Maximum protection.', 65, '1500 gp', '{"acFormula": "18", "stealthDisadv": true, "strengthReq": 15}'),
('Arcane Robes', 'armor', 'common', 'Light, comfortable robes woven with thread that conducts arcane energy.', 3, '1 gp', '{"acFormula": "10 + DEX"}'),
('Shield', 'shield', 'common', 'A wooden or metal shield carried in one hand to deflect attacks.', 6, '10 gp', '{"acBonus": 2}'),
('Potion of Healing', 'potion', 'common', 'A magical red fluid that seals wounds upon ingestion.', 0.5, '50 gp', '{"healing": "2d4+2"}'),
('Potion of Greater Healing', 'potion', 'uncommon', 'A stronger blend of healing herbs and magic fluid.', 0.5, '150 gp', '{"healing": "4d4+4"}'),
('Potion of Superior Healing', 'potion', 'rare', 'A rare, highly concentrated healing potion.', 0.5, '500 gp', '{"healing": "8d4+8"}'),
('Spellbook', 'gear', 'common', 'A leather-bound journal containing intricate magical formulae and spells.', 3, '50 gp', '{}'),
('Thieves Tools', 'gear', 'common', 'A set of lockpicks and shears for bypassing traps and locks.', 1, '25 gp', '{}'),
('Thieves'' Tools', 'gear', 'common', 'A set of lockpicks and shears for bypassing traps and locks.', 1, '25 gp', '{}'),
('Holy Symbol', 'gear', 'common', 'A representation of a deity, used as a focus for divine spellcasters.', 1, '5 gp', '{}'),
('Backpack', 'gear', 'common', 'A sturdy leather backpack that stores your traveling gear.', 5, '2 gp', '{}'),
('Bedroll', 'gear', 'common', 'A wool blanket and thin pad rolled up for sleeping on the ground.', 7, '1 gp', '{}'),
('Explorer''s Pack', 'gear', 'common', 'A survival pack containing a backpack, bedroll, torches, rations, and waterskin.', 50, '10 gp', '{}'),
('Rope (50ft)', 'gear', 'common', 'Fifty feet of sturdy hempen rope.', 10, '1 gp', '{}'),
('Rope, Hempen (50 ft)', 'gear', 'common', 'Fifty feet of sturdy hempen rope.', 10, '1 gp', '{}'),
('Rations (1 day)', 'gear', 'common', 'Compact, dry rations consisting of jerky, dried fruit, and hardtack.', 2, '5 sp', '{}'),
('Waterskin', 'gear', 'common', 'A leather pouch designed to hold up to four pints of water.', 5, '2 sp', '{}'),
('Torch', 'gear', 'common', 'A wooden stick covered in pitch. Provides bright light in a 20-foot radius.', 1, '1 cp', '{}')
ON CONFLICT (name) DO UPDATE SET
    type = EXCLUDED.type,
    rarity = EXCLUDED.rarity,
    description = EXCLUDED.description,
    weight = EXCLUDED.weight,
    cost = EXCLUDED.cost,
    stats = EXCLUDED.stats;
