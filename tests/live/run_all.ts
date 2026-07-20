import './01_combat_tools_live.test';
import './02_spellcasting_live.test';
import './03_inventory_live.test';
import './04_movement_live.test';
import './05_progression_live.test';

console.log('All Tier 3 live tests completed.');
if (process.exitCode) {
  console.log('Some tests failed.');
} else {
  console.log('All tests passed.');
}
