




CREATE OR REPLACE FUNCTION get_character_xp(game_state JSONB, character_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE((party_item->>'experience')::INTEGER, 0)
  FROM jsonb_array_elements(game_state->'party') AS party_item
  WHERE party_item->>'id' = character_id;
$$ LANGUAGE sql IMMUTABLE;


CREATE OR REPLACE FUNCTION get_character_level(game_state JSONB, character_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE((party_item->>'level')::INTEGER, 1)
  FROM jsonb_array_elements(game_state->'party') AS party_item
  WHERE party_item->>'id' = character_id;
$$ LANGUAGE sql IMMUTABLE;


CREATE OR REPLACE FUNCTION get_character_unused_points(game_state JSONB, character_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE((party_item->>'unusedStatPoints')::INTEGER, 0)
  FROM jsonb_array_elements(game_state->'party') AS party_item
  WHERE party_item->>'id' = character_id;
$$ LANGUAGE sql IMMUTABLE;


CREATE OR REPLACE VIEW campaign_party_progression AS
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  c.host_id,
  c.created_at,
  p.name AS character_name,
  p.class AS character_class,
  p.race AS character_race,
  COALESCE((p.level)::INTEGER, 1) AS character_level,
  COALESCE((p.experience)::INTEGER, 0) AS character_xp,
  COALESCE((p."experienceToNextLevel")::INTEGER, 300) AS xp_to_next,
  COALESCE((p."unusedStatPoints")::INTEGER, 0) AS unused_stat_points,
  (p."hp")->>'current' AS hp_current,
  (p."hp")->>'max' AS hp_max
FROM campaigns c,
  jsonb_to_recordset(c.game_state->'party') AS p(
    id TEXT, name TEXT, class TEXT, race TEXT, level INTEGER,
    experience INTEGER, "experienceToNextLevel" INTEGER, "unusedStatPoints" INTEGER,
    hp JSONB
  );


