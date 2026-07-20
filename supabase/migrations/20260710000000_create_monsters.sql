



CREATE TABLE IF NOT EXISTS srd_monsters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    size TEXT NOT NULL,
    type TEXT NOT NULL,
    ac INTEGER NOT NULL,
    hp INTEGER NOT NULL,
    hit_dice TEXT NOT NULL,
    stats JSONB NOT NULL,       
    attacks JSONB NOT NULL,     
    challenge_rating NUMERIC NOT NULL,
    xp INTEGER NOT NULL,
    speed TEXT DEFAULT '30 ft.',
    special_abilities JSONB DEFAULT '[]'::jsonb,
    damage_resistances JSONB DEFAULT '[]'::jsonb,
    damage_immunities JSONB DEFAULT '[]'::jsonb,
    damage_vulnerabilities JSONB DEFAULT '[]'::jsonb,
    conditions_immunities JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


ALTER TABLE srd_monsters ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Public select" ON srd_monsters FOR SELECT USING (true);


CREATE POLICY "Public insert" ON srd_monsters FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON srd_monsters FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON srd_monsters FOR DELETE USING (true);


INSERT INTO srd_monsters (name, size, type, ac, hp, hit_dice, stats, attacks, challenge_rating, xp, speed, special_abilities, damage_resistances, damage_immunities, damage_vulnerabilities, conditions_immunities) VALUES
('Commoner', 'Medium', 'humanoid', 10, 4, '1d8', '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}', '[{"name":"Club","toHit":2,"damageDice":"1d4","damageType":"bludgeoning"}]', 0, 10, '30 ft.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Giant Rat', 'Small', 'beast', 12, 7, '2d6', '{"str":7,"dex":15,"con":11,"int":2,"wis":10,"cha":4}', '[{"name":"Bite","toHit":4,"damageDice":"1d4+2","damageType":"piercing"}]', 0.125, 25, '30 ft.', '["Keen Smell: Advantage on Perception (smell)","Pack Tactics: Advantage if ally within 5 ft."]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Kobold', 'Small', 'humanoid', 12, 5, '2d6-2', '{"str":7,"dex":15,"con":9,"int":8,"wis":7,"cha":8}', '[{"name":"Dagger","toHit":4,"damageDice":"1d4+2","damageType":"piercing"},{"name":"Sling","toHit":4,"damageDice":"1d4+2","damageType":"bludgeoning"}]', 0.125, 25, '30 ft.', '["Sunlight Sensitivity: Disadvantage in sunlight","Pack Tactics: Advantage if ally within 5 ft."]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Bandit', 'Medium', 'humanoid', 12, 11, '2d8+2', '{"str":11,"dex":12,"con":12,"int":10,"wis":10,"cha":10}', '[{"name":"Scimitar","toHit":3,"damageDice":"1d6+1","damageType":"slashing"},{"name":"Light Crossbow","toHit":3,"damageDice":"1d8+1","damageType":"piercing"}]', 0.125, 25, '30 ft.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Cultist', 'Medium', 'humanoid', 12, 9, '2d8', '{"str":11,"dex":12,"con":10,"int":10,"wis":11,"cha":10}', '[{"name":"Scimitar","toHit":3,"damageDice":"1d6+1","damageType":"slashing"}]', 0.125, 25, '30 ft.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Goblin', 'Small', 'humanoid', 15, 7, '2d6', '{"str":8,"dex":14,"con":10,"int":10,"wis":8,"cha":8}', '[{"name":"Scimitar","toHit":4,"damageDice":"1d6+2","damageType":"slashing"},{"name":"Shortbow","toHit":4,"damageDice":"1d6+2","damageType":"piercing"}]', 0.25, 50, '30 ft.', '["Nimble Escape: Disengage or Hide as bonus action"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Skeleton', 'Medium', 'undead', 13, 13, '2d8+4', '{"str":10,"dex":14,"con":15,"int":6,"wis":8,"cha":5}', '[{"name":"Shortsword","toHit":4,"damageDice":"1d6+2","damageType":"piercing"},{"name":"Shortbow","toHit":4,"damageDice":"1d6+2","damageType":"piercing"}]', 0.25, 50, '30 ft.', '[]'::jsonb, '[]'::jsonb, '["poison"]'::jsonb, '["bludgeoning"]'::jsonb, '["poisoned","exhaustion"]'::jsonb),
('Zombie', 'Medium', 'undead', 8, 22, '3d8+9', '{"str":13,"dex":6,"con":16,"int":3,"wis":6,"cha":5}', '[{"name":"Slam","toHit":3,"damageDice":"1d6+1","damageType":"bludgeoning"}]', 0.25, 50, '20 ft.', '["Undead Fortitude: CON save vs 5+damage to drop to 1 HP instead of 0 (except radiant/crit)"]'::jsonb, '[]'::jsonb, '["poison"]'::jsonb, '[]'::jsonb, '["poisoned"]'::jsonb),
('Wolf', 'Medium', 'beast', 13, 11, '2d8+2', '{"str":12,"dex":15,"con":12,"int":3,"wis":12,"cha":6}', '[{"name":"Bite","toHit":4,"damageDice":"2d4+2","damageType":"piercing","description":"DC 11 STR save or knocked prone"}]', 0.25, 50, '40 ft.', '["Keen Hearing and Smell: Advantage on Perception","Pack Tactics: Advantage if ally within 5 ft."]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Giant Wasp', 'Medium', 'beast', 12, 13, '3d8', '{"str":10,"dex":14,"con":10,"int":1,"wis":10,"cha":3}', '[{"name":"Sting","toHit":4,"damageDice":"1d6+2","damageType":"piercing","description":"DC 11 CON save or 3d6 poison damage"}]', 0.5, 100, '50 ft.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Hobgoblin', 'Medium', 'humanoid', 18, 11, '2d8+2', '{"str":13,"dex":12,"con":12,"int":10,"wis":10,"cha":9}', '[{"name":"Longsword","toHit":3,"damageDice":"1d8+1","damageType":"slashing"},{"name":"Longbow","toHit":3,"damageDice":"1d8+1","damageType":"piercing"}]', 0.5, 100, '30 ft.', '["Martial Advantage: +2d6 damage if ally within 5 ft."]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Orc', 'Medium', 'humanoid', 13, 15, '2d8+6', '{"str":16,"dex":12,"con":16,"int":7,"wis":11,"cha":10}', '[{"name":"Greataxe","toHit":5,"damageDice":"1d12+3","damageType":"slashing"},{"name":"Javelin","toHit":5,"damageDice":"1d6+3","damageType":"piercing"}]', 0.5, 100, '30 ft.', '["Aggressive: Bonus action move toward enemy"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Gnoll', 'Medium', 'humanoid', 15, 22, '5d8', '{"str":14,"dex":12,"con":11,"int":6,"wis":10,"cha":7}', '[{"name":"Bite","toHit":4,"damageDice":"1d4+2","damageType":"piercing"},{"name":"Spear","toHit":4,"damageDice":"1d6+2","damageType":"piercing"},{"name":"Longbow","toHit":3,"damageDice":"1d8+1","damageType":"piercing"}]', 0.5, 100, '30 ft.', '["Rampage: Bonus action move+attack when reducing creature to 0 HP"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Bugbear', 'Medium', 'humanoid', 16, 27, '5d8+5', '{"str":15,"dex":14,"con":13,"int":8,"wis":11,"cha":9}', '[{"name":"Morningstar","toHit":4,"damageDice":"2d8+2","damageType":"piercing"},{"name":"Javelin","toHit":4,"damageDice":"2d6+2","damageType":"piercing"}]', 1, 200, '30 ft.', '["Brute: Extra damage die on melee","Surprise Attack: +2d6 on first round"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Dire Wolf', 'Large', 'beast', 14, 37, '5d10+10', '{"str":17,"dex":15,"con":15,"int":3,"wis":12,"cha":7}', '[{"name":"Bite","toHit":5,"damageDice":"2d6+3","damageType":"piercing","description":"DC 13 STR save or knocked prone"}]', 1, 200, '50 ft.', '["Pack Tactics: Advantage if ally within 5 ft.","Keen Hearing and Smell"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Ghoul', 'Medium', 'undead', 12, 22, '5d8', '{"str":13,"dex":15,"con":10,"int":7,"wis":10,"cha":6}', '[{"name":"Bite","toHit":2,"damageDice":"2d6+2","damageType":"piercing"},{"name":"Claws","toHit":4,"damageDice":"2d4+2","damageType":"slashing","description":"DC 10 CON save or paralyzed 1 min"}]', 1, 200, '30 ft.', '[]'::jsonb, '[]'::jsonb, '["poison"]'::jsonb, '[]'::jsonb, '["poisoned","charmed","exhaustion"]'::jsonb),
('Giant Spider', 'Large', 'beast', 14, 26, '4d10+4', '{"str":14,"dex":16,"con":12,"int":2,"wis":11,"cha":4}', '[{"name":"Bite","toHit":5,"damageDice":"1d8+3","damageType":"piercing","description":"DC 11 CON save or 2d8 poison damage"},{"name":"Web","toHit":5,"damageDice":"","damageType":"","description":"Restrained (recharge 5-6)"}]', 1, 200, '30 ft.', '["Spider Climb","Web Sense","Web Walker"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Harpy', 'Medium', 'monstrosity', 11, 38, '7d8+7', '{"str":12,"dex":13,"con":12,"int":7,"wis":10,"cha":13}', '[{"name":"Claws","toHit":3,"damageDice":"2d4+1","damageType":"slashing"},{"name":"Club","toHit":3,"damageDice":"1d4+1","damageType":"bludgeoning"}]', 1, 200, '20 ft.', '["Luring Song: DC 11 WIS save or be charmed and move toward harpy"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Ghast', 'Medium', 'undead', 13, 36, '8d8', '{"str":16,"dex":17,"con":10,"int":11,"wis":10,"cha":8}', '[{"name":"Bite","toHit":3,"damageDice":"2d8+3","damageType":"piercing"},{"name":"Claws","toHit":5,"damageDice":"2d6+3","damageType":"slashing","description":"DC 10 CON save or paralyzed 1 min"}]', 2, 450, '30 ft.', '["Stench: Creatures within 5 ft. have disadvantage on attack rolls and DC 10 CON save at start of turn"]'::jsonb, '["necrotic"]'::jsonb, '["poison"]'::jsonb, '[]'::jsonb, '["poisoned","charmed","exhaustion"]'::jsonb),
('Ogre', 'Large', 'giant', 11, 59, '7d10+21', '{"str":19,"dex":8,"con":16,"int":5,"wis":7,"cha":7}', '[{"name":"Greatclub","toHit":6,"damageDice":"2d8+4","damageType":"bludgeoning"},{"name":"Javelin","toHit":6,"damageDice":"2d6+4","damageType":"piercing"}]', 2, 450, '40 ft.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Gargoyle', 'Medium', 'elemental', 15, 52, '7d8+21', '{"str":15,"dex":11,"con":16,"int":6,"wis":11,"cha":7}', '[{"name":"Bite","toHit":4,"damageDice":"1d6+2","damageType":"piercing"},{"name":"Claws","toHit":4,"damageDice":"1d6+2","damageType":"slashing"}]', 2, 450, '30 ft.', '["False Appearance: Indistinguishable from statue while still"]'::jsonb, '["bludgeoning, piercing, slashing from nonmagical weapons"]'::jsonb, '["poison"]'::jsonb, '[]'::jsonb, '["poisoned","exhaustion"]'::jsonb),
('Berserker', 'Medium', 'humanoid', 13, 67, '9d8+27', '{"str":16,"dex":12,"con":17,"int":9,"wis":11,"cha":9}', '[{"name":"Greataxe","toHit":5,"damageDice":"1d12+3","damageType":"slashing"}]', 2, 450, '30 ft.', '["Reckless: Advantage on attacks, attacks against berserker have advantage","Relentless Endurance: Drop to 1 HP instead of 0 once per day"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Minotaur', 'Large', 'monstrosity', 14, 76, '9d10+27', '{"str":18,"dex":11,"con":16,"int":6,"wis":16,"cha":9}', '[{"name":"Greataxe","toHit":6,"damageDice":"2d12+4","damageType":"slashing"},{"name":"Gore","toHit":6,"damageDice":"2d8+4","damageType":"piercing","description":"DC 14 STR save or knocked prone (only when charging)"}]', 3, 700, '40 ft.', '["Charge: If moves 10+ ft. before Gore, +2d8 damage and prone on save","Labyrinthine Recall: Perfect recall of paths"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Owlbear', 'Large', 'monstrosity', 13, 59, '7d10+21', '{"str":20,"dex":12,"con":17,"int":3,"wis":12,"cha":7}', '[{"name":"Beak","toHit":7,"damageDice":"1d10+5","damageType":"piercing"},{"name":"Claws","toHit":7,"damageDice":"2d8+5","damageType":"slashing"}]', 3, 700, '40 ft.', '["Multiattack: Beak + Claws","Keen Sight and Smell: Advantage on Perception"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Wight', 'Medium', 'undead', 14, 45, '6d8+18', '{"str":15,"dex":14,"con":16,"int":10,"wis":13,"cha":15}', '[{"name":"Life Drain","toHit":4,"damageDice":"1d6+2","damageType":"necrotic","description":"DC 13 CON save or HP max reduced"},{"name":"Longsword","toHit":4,"damageDice":"1d8+2","damageType":"slashing"},{"name":"Longbow","toHit":4,"damageDice":"1d8+2","damageType":"piercing"}]', 3, 700, '30 ft.', '["Multiattack: 2 longsword or longbow attacks; can replace one with Life Drain","Sunlight Sensitivity: Disadvantage in sunlight"]'::jsonb, '["necrotic","bludgeoning, piercing, slashing from nonmagical not silvered"]'::jsonb, '["poison"]'::jsonb, '[]'::jsonb, '["poisoned","exhaustion"]'::jsonb),
('Ettin', 'Large', 'giant', 12, 85, '10d10+30', '{"str":21,"dex":8,"con":17,"int":6,"wis":10,"cha":8}', '[{"name":"Battleaxe","toHit":7,"damageDice":"2d8+5","damageType":"slashing"},{"name":"Morningstar","toHit":7,"damageDice":"2d8+5","damageType":"piercing"}]', 4, 1100, '40 ft.', '["Multiattack: Two attacks (one per head)","Two Heads: Advantage on Perception and saves vs blinded/charmed/stunned/unconscious"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Vampire Spawn', 'Medium', 'undead', 15, 82, '11d8+33', '{"str":16,"dex":16,"con":16,"int":11,"wis":10,"cha":12}', '[{"name":"Claws","toHit":6,"damageDice":"2d4+3","damageType":"slashing"},{"name":"Bite","toHit":6,"damageDice":"1d6+3","damageType":"piercing","description":"Plus 2d6 necrotic, HP max reduced, target grappled"}]', 5, 1800, '30 ft.', '["Regeneration: 10 HP at start of turn if not in sunlight or running water","Spider Climb","Sunlight Hypersensitivity","Vampire Weaknesses"]'::jsonb, '["necrotic","bludgeoning, piercing, slashing from nonmagical weapons"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb),
('Troll', 'Large', 'giant', 15, 84, '8d10+40', '{"str":18,"dex":13,"con":20,"int":7,"wis":9,"cha":7}', '[{"name":"Bite","toHit":7,"damageDice":"1d6+4","damageType":"piercing"},{"name":"Claw","toHit":7,"damageDice":"2d6+4","damageType":"slashing"}]', 5, 1800, '30 ft.', '["Multiattack: Bite + 2x Claw","Keen Smell: Advantage on Perception","Regeneration: 10 HP/turn (stopped by acid/fire); dies only if starts turn at 0 HP and can\'t regenerate"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (name) DO UPDATE SET
    size = EXCLUDED.size,
    type = EXCLUDED.type,
    ac = EXCLUDED.ac,
    hp = EXCLUDED.hp,
    hit_dice = EXCLUDED.hit_dice,
    stats = EXCLUDED.stats,
    attacks = EXCLUDED.attacks,
    challenge_rating = EXCLUDED.challenge_rating,
    xp = EXCLUDED.xp,
    special_abilities = EXCLUDED.special_abilities,
    damage_resistances = EXCLUDED.damage_resistances,
    damage_immunities = EXCLUDED.damage_immunities,
    damage_vulnerabilities = EXCLUDED.damage_vulnerabilities,
    conditions_immunities = EXCLUDED.conditions_immunities;
