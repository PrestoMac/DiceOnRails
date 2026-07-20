import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Character, InventoryItem, Currency, ActiveCondition } from '../types';
import { SKILLS_LIST } from '../constants';
import { cryptoRoll } from '../utils/random';
import { getAllFeats } from '../services/featsService';
import { FeatDefinition } from '../utils/feats';
import { getClassDef, getSubclassDef, calculateAc, getProficiencyBonus, calculateSpeed, getDarkvisionRange, getSavingThrowBonus, getSpellSaveDc, getSpellAttackBonus, getDamageResistances, canEquipArmor, getMod } from '../services/classEngine';
import { parseExhaustionLevel } from '../services/conditionEngine';
import { SPELLS_BY_ID } from '../utils/spells';
import FeatDetailModal from './FeatDetailModal';

const BUFF_SOURCES = new Set([
  'mage-armor', 'shield', 'shield-of-faith', 'barkskin',
  'heroism', 'hunters-mark', 'divine-favor', 'branding-smite', 'magic-weapon',
  'bless',
]);

function isBuffCondition(c: ActiveCondition): boolean {
  if (BUFF_SOURCES.has(c.source)) return true;
  if (c.id.endsWith('-ac')) return true;
  if (typeof c.onRemove === 'object' && c.onRemove?.kind === 'acBonus') return true;
  if (c.id === 'bless') return true;
  return false;
}

function formatConditionDuration(c: ActiveCondition): string {
  if (c.durationUnit === 'permanent') return 'permanent';
  if (c.duration == null || c.duration < 0) return 'permanent';
  if (c.durationUnit === 'minute') {
    if (c.duration >= 60) {
      const h = Math.floor(c.duration / 60);
      const m = c.duration % 60;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    return `${c.duration}m`;
  }
  return `${c.duration}r`;
}

interface CharacterSheetProps {
  character: Character;
  onUpdateInventory: (inv: InventoryItem[]) => void;
  onUpdateCurrency: (c: Currency) => void;
  onLevelUp?: (characterId: string) => void;
  onSendMessage?: (text: string) => void;
  onTriggerDiceRoll?: (rollData: any) => Promise<void>;
}

const rarityStyle = (rarity?: string) =>
  rarity === 'uncommon' ? 'text-blue-400 border-l-blue-500' :
  rarity === 'rare' ? 'text-purple-400 border-l-purple-500' :
  rarity === 'very rare' ? 'text-pink-400 border-l-pink-500' :
  rarity === 'legendary' ? 'text-amber-500 border-l-amber-500' :
  'text-stone-400 border-l-stone-500';

const CurrencyRow: React.FC<{ label: string; iconColor: string; field: keyof Currency; value: number; isEditing: boolean; input: string; onStartEdit: ()=>void; onChange: (v:string)=>void; onSave: ()=>void; inputClass: string }> = ({ label, iconColor, field, value, isEditing, input, onStartEdit, onChange, onSave, inputClass }) => (
  <div className="flex items-center gap-2 font-medium text-xs">
    <i className={`fas fa-coins ${iconColor}`}></i>
    {isEditing ? (
      <input autoFocus type="number" value={input} onChange={e=>onChange(e.target.value)} onBlur={onSave} onKeyDown={e=>e.key==='Enter'&&onSave()} className={`bg-stone-950 border rounded px-2 py-0.5 outline-none w-16 ${inputClass}`} />
    ) : (
      <span onClick={onStartEdit} className="cursor-pointer hover:opacity-80">{value} {label}</span>
    )}
  </div>
);

const InfoChip: React.FC<{ icon: string; iconColor: string; label: string; value: React.ReactNode }> = ({ icon, iconColor, label, value }) => (
  <div className="bg-stone-900/40 border border-stone-850 p-2 rounded flex items-center gap-2 text-xs">
    <i className={`fas ${icon} ${iconColor}`}></i><span className="text-stone-400">{label}:</span><span className="font-bold text-stone-200">{value}</span>
  </div>
);

const FeatureList: React.FC<{ title: string; icon: string; features?: Array<{ id: string; level: number; name: string; description: string }>; level: number }> = ({ title, icon, features, level }) => {
  const filtered = (features ?? []).filter(f => f.level <= level);
  if (filtered.length === 0) return null;
  return <div className="space-y-2 mt-2">
    <h3 className="text-xs uppercase font-bold text-amber-500 tracking-widest border-b border-stone-850 pb-1 text-left flex items-center gap-2"><i className={`fas ${icon} text-[10px]`}></i>{title}</h3>
    <div className="text-left">{filtered.map(f => <details key={f.id} className="text-xs text-stone-400 mb-1">
      <summary className="cursor-pointer text-stone-300 hover:text-amber-500 transition-colors"><span className="text-amber-700 text-[10px]">L{f.level}:</span> {f.name}</summary>
      <p className="pl-4 text-[10px] text-stone-500 mt-1">{f.description}</p>
    </details>)}</div>
  </div>;
};

const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onUpdateInventory, onUpdateCurrency, onLevelUp, onSendMessage, onTriggerDiceRoll }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [editingIdx, setEditingIdx] = useState<number|null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingQty, setEditingQty] = useState('');
  const [isEditingCurrency, setIsEditingCurrency] = useState<keyof Currency|null>(null);
  const [currencyInput, setCurrencyInput] = useState('');
  const [hoveredItem, setHoveredItem] = useState<InventoryItem|null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x:0, y:0 });
  const [viewingFeat, setViewingFeat] = useState<FeatDefinition | null>(null);
  const feats = getAllFeats(character);

  const handleMouseEnter = (item: InventoryItem, e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect(), tw=288, th=240;
    let x = r.right + 12, y = r.top;
    if (x+tw > window.innerWidth) x = Math.max(12, r.left-tw-12);
    if (y+th > window.innerHeight) y = Math.max(12, window.innerHeight-th-12);
    if (window.innerWidth <= 768) { x = Math.max(12, Math.min(r.left, window.innerWidth-tw-12)); y = Math.max(12, Math.min(r.bottom+12, r.top-th-12)); }
    setHoveredItem(item); setTooltipPos({ x, y });
  };

  const rollDiceFormula = (formula: string) => {
    const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(formula.replace(/\s+/g, ''));
    if (m) { const r = Array.from({length:+m[1]},()=>cryptoRoll(+m[2])); return { results: r, total: r.reduce((a,b)=>a+b,0)+(+(m[3]??0)) }; }
    return isNaN(+formula) ? { results:[4], total:4 } : { results:[+formula], total:+formula };
  };

  const handleToggleEquip = (idx: number) => {
    const newInv = [...character.inventory], item = newInv[idx];
    if (!item) return;
    ['weapon','armor','shield'].forEach(t => { if (item.type === t && !item.equipped) newInv.forEach(i => { if (i.type === t) i.equipped = false; }); });
    newInv[idx] = {...item, equipped: !item.equipped};
    onUpdateInventory(newInv);
  };

  const equippedArmorItem = character.inventory.find(i => i.equipped && i.type === 'armor') || null;
  const totalAc = calculateAc(character, equippedArmorItem);
  const profBonus = getProficiencyBonus(character);
  const speed = calculateSpeed(character);
  const darkvision = getDarkvisionRange(character);
  const classDef = getClassDef(character.class);
  const subclassDef = character.subclassId ? getSubclassDef(character.class, character.subclassId) : undefined;
  const damageResistances = getDamageResistances(character);
  const spellSaveDc = classDef?.spellcasting ? getSpellSaveDc(character) : null;
  const spellAttackBonus = classDef?.spellcasting ? getSpellAttackBonus(character) : null;
  const hpPercent = (character.hp.current / character.hp.max) * 100;
  const nextLevelXp = character.experienceToNextLevel || 300;
  const xpPercent = nextLevelXp > 0 ? Math.min(100, Math.max(0, (character.experience / nextLevelXp) * 100)) : 100;
  const activeResources = (character.resources ?? []).filter(r => r.max > 0);
  const isPreparedCaster = classDef?.spellcasting?.prepMode === 'prepared';
  const spellList = isPreparedCaster ? character.preparedSpells : character.knownSpells;

  const handleAddItem = () => {
    const qty = parseInt(newItemQty, 10);
    if (!newItemName.trim() || isNaN(qty)) return;
    const idx = character.inventory.findIndex(i => i.name.toLowerCase() === newItemName.trim().toLowerCase());
    if (idx > -1) { const n = [...character.inventory]; n[idx].quantity += qty; onUpdateInventory(n); }
    else onUpdateInventory([...character.inventory, { name: newItemName.trim(), quantity: qty } as InventoryItem]);
    setNewItemName(''); setNewItemQty('1'); setIsAdding(false);
  };

  const handleRemoveItem = (idx: number) => { const n = [...character.inventory]; n.splice(idx, 1); onUpdateInventory(n); };
  const saveEdit = () => {
    const qty = parseInt(editingQty, 10);
    if (editingIdx === null || !editingName.trim() || isNaN(qty)) return;
    const n = [...character.inventory];
    n[editingIdx] = {...n[editingIdx], name: editingName.trim(), quantity: qty};
    onUpdateInventory(n); setEditingIdx(null);
  };

  const handleCurrencyEdit = (key: keyof Currency) => {
    const val = parseInt(currencyInput, 10);
    if (!isNaN(val)) onUpdateCurrency({...character.currency, [key]: val});
    setIsEditingCurrency(null);
  };

  const renderItemTooltip = () => hoveredItem && createPortal(
    <div className={`fixed z-[9999] w-72 bg-stone-950/95 backdrop-blur-md border border-stone-800 rounded-xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.9)] pointer-events-none text-left flex flex-col gap-2 border-l-4 animate-in fade-in duration-100 ${rarityStyle(hoveredItem.rarity)}`} style={{left:`${tooltipPos.x}px`,top:`${tooltipPos.y}px`}}>
      <div className="flex items-start justify-between">
        <h4 className="font-bold text-sm text-stone-100 fantasy-font leading-tight">{hoveredItem.name}</h4>
        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-stone-900/60 border border-stone-800">x{hoveredItem.quantity}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-wider">
        <span className={rarityStyle(hoveredItem.rarity)}>{hoveredItem.rarity||'common'}</span>
        <span className="text-stone-600">•</span><span className="text-stone-400">{hoveredItem.type||'item'}</span>
      </div>
      <p className="text-xs text-stone-400 italic font-medium leading-relaxed mt-1">"{hoveredItem.description||'No description available.'}"</p>
      <div className="border-t border-stone-900 my-1"></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono">
        {hoveredItem.type === 'weapon' && hoveredItem.stats && <><div className="text-stone-500">Damage:</div><div className="text-stone-200 text-right">{hoveredItem.stats.damage} {hoveredItem.stats.damageType}</div>{hoveredItem.stats.properties?.length ? <><div className="text-stone-500">Properties:</div><div className="text-stone-200 text-right truncate">{hoveredItem.stats.properties.join(', ')}</div></> : null}</>}
        {hoveredItem.type === 'armor' && hoveredItem.stats && <><div className="text-stone-500">Armor Class:</div><div className="text-stone-200 text-right">{hoveredItem.stats.acFormula}</div>{hoveredItem.stats.strengthReq ? <><div className="text-stone-500">Strength Req:</div><div className="text-stone-200 text-right">{hoveredItem.stats.strengthReq}</div></> : null}{hoveredItem.stats.stealthDisadv ? <><div className="text-stone-500">Stealth:</div><div className="text-red-400 text-right">Disadvantage</div></> : null}</>}
        {hoveredItem.type === 'shield' && hoveredItem.stats && <><div className="text-stone-500">Armor Class:</div><div className="text-stone-200 text-right">+{hoveredItem.stats.acBonus}</div></>}
        {hoveredItem.type === 'potion' && hoveredItem.stats && <><div className="text-stone-500">Healing:</div><div className="text-green-400 text-right">{hoveredItem.stats.healing}</div></>}
        <div className="text-stone-500">Weight:</div><div className="text-stone-300 text-right">{hoveredItem.weight||0} lbs</div>
        <div className="text-stone-500">Cost:</div><div className="text-stone-300 text-right">{hoveredItem.cost||'0 gp'}</div>
      </div>
    </div>, document.body
  );

  return (
    <div className="flex flex-col gap-6 fantasy-font">
      <div className="text-center relative">
        <h2 className="text-3xl font-bold text-amber-500 uppercase tracking-widest">{character.name}</h2>
        <div className="flex items-center justify-center gap-2">
          <p className="text-stone-400 italic">Level {character.level} {character.race} {character.class}</p>
          {((character.unusedStatPoints||0)>0||(character.unusedSkillPoints||0)>0)&&onLevelUp&&<button onClick={()=>onLevelUp(character.id)} className="px-2 py-0.5 bg-amber-700 hover:bg-amber-600 rounded text-[9px] uppercase font-bold text-white tracking-widest animate-pulse transition-all shadow-[0_0_8px_rgba(217,119,6,0.6)]"><i className="fas fa-arrow-up text-[8px] mr-1"></i> Level Up!</button>}
        </div>
        {feats.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 px-2">
            {feats.map(feat => (
              <button
                key={feat.id}
                onClick={() => setViewingFeat(feat)}
                title={feat.name}
                className="group flex items-center gap-1.5 px-2 py-0.5 bg-stone-900/60 hover:bg-amber-950/30 border border-stone-800 hover:border-amber-700/50 rounded-full text-[10px] uppercase font-bold tracking-wider text-amber-500 transition-all"
              >
                <i className={`fas ${feat.icon} text-[9px] group-hover:text-amber-300`}></i>
                <span className="hidden sm:inline">{feat.shortName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm uppercase font-bold tracking-wider"><span>Vitality</span><span className={character.hp.current<5?'text-red-500 animate-pulse':'text-stone-300'}>{character.hp.current} / {character.hp.max} HP</span></div>
        <div className="h-3 bg-stone-900 rounded-full overflow-hidden border border-stone-800"><div className={`h-full transition-all duration-500 ${hpPercent<30?'bg-red-600':'bg-green-600'}`} style={{width:`${hpPercent}%`}}/></div>
      </div>

      <div className="flex items-center justify-between bg-stone-900/40 border border-stone-850 p-2.5 rounded-lg">
        <div className="flex items-center gap-2"><i className="fas fa-shield-halved text-amber-500"></i><span className="text-xs uppercase font-bold tracking-wider text-stone-400">Armor Class</span></div>
        <span className="text-lg font-bold font-mono text-amber-400">{totalAc} AC</span>
      </div>

      <div className="space-y-1 mt-2">
        <div className="flex justify-between text-xs uppercase font-bold tracking-wider"><span>Experience</span><span className="text-amber-600">{character.experience||0} / {character.experienceToNextLevel||300} XP</span></div>
        <div className="h-2 bg-stone-900 rounded-full overflow-hidden border border-stone-800"><div className="h-full bg-amber-600/70 transition-all duration-700" style={{width:`${xpPercent}%`}}/></div>
        {((character.unusedStatPoints||0)>0||(character.unusedSkillPoints||0)>0)&&onLevelUp&&<button onClick={()=>onLevelUp(character.id)} className="w-full py-2 bg-amber-700 hover:bg-amber-600 rounded font-bold text-white animate-pulse uppercase tracking-wider text-xs mt-2 transition-all shadow-md shadow-amber-900/20 flex items-center justify-center gap-1.5 border border-amber-600/30"><i className="fas fa-crown text-[10px]"></i>Level Up Available!{character.unusedStatPoints>0&&<span className="bg-amber-900/50 px-1.5 py-0.5 rounded text-[8px] font-mono font-normal">+{character.unusedStatPoints} Stats</span>}{(character.unusedSkillPoints||0)>0&&<span className="bg-amber-950/50 px-1.5 py-0.5 rounded text-[8px] font-mono font-normal">+{character.unusedSkillPoints} Skills</span>}</button>}
      </div>

      <div className="grid grid-cols-3 gap-3">{(Object.entries(character.stats) as [string,number][]).map(([stat,val])=><div key={stat} className="bg-stone-900/50 border border-stone-800 p-2 rounded text-center"><div className="text-[10px] uppercase text-stone-500 font-bold">{stat}</div><div className="text-xl font-bold text-stone-100">{val}</div><div className="text-[10px] text-amber-600 font-medium">{getMod(val)>=0?'+':''}{getMod(val)}</div></div>)}</div>

      {classDef && <div className="flex flex-wrap gap-3 mt-1">
        <InfoChip icon="fa-shoe-prints" iconColor="text-amber-600" label="Speed" value={`${speed} ft`} />
        {darkvision > 0 && <InfoChip icon="fa-eye" iconColor="text-blue-500" label="Darkvision" value={`${darkvision} ft`} />}
        <InfoChip icon="fa-medal" iconColor="text-amber-600" label="Prof Bonus" value={`+${profBonus}`} />
        {character.hitDice && classDef?.hitDie && <InfoChip icon="fa-dice-d20" iconColor="text-amber-600" label="Hit Dice" value={`${character.hitDice.current}/${character.hitDice.max} d${classDef.hitDie}`} />}
        {spellSaveDc && <InfoChip icon="fa-magic" iconColor="text-purple-500" label="Spell DC" value={spellSaveDc} />}
        {spellAttackBonus && <InfoChip icon="fa-crosshairs" iconColor="text-purple-500" label="Spell Atk" value={`+${spellAttackBonus}`} />}
      </div>}

      {classDef && <FeatureList title={`${classDef.name} Features`} icon="fa-hat-wizard" features={classDef.features} level={character.level} />}
      {subclassDef && <FeatureList title={subclassDef.name} icon="fa-gem" features={subclassDef.features} level={character.level} />}

      <div className="mt-4">
        <h3 className="text-xs uppercase font-bold text-stone-400 tracking-widest border-b border-stone-850 pb-1 text-left">Saving Throws</h3>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          {(['str','dex','con','int','wis','cha'] as const).map(stat => {
            const bonus = getSavingThrowBonus(character, stat);
            const isProf = classDef?.savingThrowProfs.includes(stat);
            return <div key={stat} className="flex items-center justify-between bg-stone-950/30 border border-stone-850 p-1.5 rounded text-xs">
              <div className="flex items-center gap-1.5">
                {isProf && <i className="fas fa-circle text-[6px] text-amber-600"></i>}
                <span className="uppercase font-bold text-stone-400">{stat}</span>
              </div>
              <span className={`font-mono font-bold ${bonus >= 0 ? 'text-green-500' : 'text-red-400'}`}>{bonus >= 0 ? '+' : ''}{bonus}</span>
            </div>;
          })}
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xs uppercase font-bold text-stone-400 tracking-widest border-b border-stone-850 pb-1 text-left">Resources</h3>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {activeResources.map(r => (
            <div key={r.id} className="bg-stone-950/40 border border-stone-850 px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5">
              {r.icon && <i className={`fas ${r.icon} text-amber-500 text-[9px]`}></i>}
              <span className="text-stone-400">{r.name}:</span>
              <span className="font-bold text-amber-400">{r.current}</span>
              <span className="text-stone-600">/</span>
              <span className="text-stone-500">{r.max}</span>
              <span className="text-[8px] text-stone-600 uppercase">({r.resetOn})</span>
            </div>
          ))}
          {activeResources.length === 0 && <p className="text-[10px] text-stone-600">None</p>}
        </div>
      </div>

      {classDef?.spellcasting && <div className="mt-4 space-y-2">
        <h3 className="text-xs uppercase font-bold text-stone-400 tracking-widest border-b border-stone-850 pb-1 text-left">Spellcasting</h3>
        <div className="flex flex-wrap gap-1.5">
          {activeResources.filter(r => r.id.startsWith('spell-slot-')).map(slot => {
            const level = slot.id.slice(-1);
            return <div key={slot.id} className="bg-stone-950/30 border border-stone-850 rounded px-2 py-1 text-[10px] flex items-center gap-1.5">
              <span className="text-stone-500">L{level}</span>
              {Array.from({length: slot.max}).map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < slot.current ? 'bg-amber-600' : 'bg-stone-800 border border-stone-700'}`}></span>
              ))}
              <span className="text-stone-500">{slot.current}/{slot.max}</span>
            </div>;
          })}
        </div>
        {spellList?.length > 0 && <div className="text-xs text-left">
          <p className="text-[10px] text-stone-500 uppercase font-bold mb-1">{isPreparedCaster ? 'Prepared' : 'Known'} Spells</p>
          <div className="flex flex-wrap gap-1">
            {(spellList ?? []).map(sid => {
              const spell = SPELLS_BY_ID[sid];
              return spell ? <span key={sid} className="text-[10px] text-stone-400 bg-stone-900/50 px-1.5 py-0.5 rounded border border-stone-800">{spell.name}</span> : null;
            })}
          </div>
        </div>}
      </div>}

      {character.concentrationSpellId && <div className="bg-amber-950/20 border border-amber-800/30 p-2 rounded-lg mt-2 text-center">
        <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest flex items-center justify-center gap-1.5"><i className="fas fa-spinner text-[10px] animate-spin"></i> Concentrating</p>
        <p className="text-xs text-stone-300 font-bold">{SPELLS_BY_ID[character.concentrationSpellId]?.name || character.concentrationSpellId}</p>
      </div>}

      {(() => {
        const exhaustionLevel = parseExhaustionLevel(character);
        const visibleConditions = (character.conditions ?? []).filter(c => !c.id.startsWith('exhaustion-'));
        const buffs = visibleConditions.filter(isBuffCondition);
        const debuffs = visibleConditions.filter(c => !isBuffCondition(c));
        if (exhaustionLevel === 0 && buffs.length === 0 && debuffs.length === 0) return null;

        const CONDITION_INFO: Record<string, { icon: string; summary: string }> = {
          blinded:       { icon: 'fa-eye-slash',        summary: 'Auto-fail sight checks; attacks have disadvantage; attacks against you have advantage.' },
          charmed:       { icon: 'fa-heart',             summary: "Can't attack charmer; charmer has advantage on social checks against you." },
          deafened:      { icon: 'fa-deaf',              summary: 'Auto-fail hearing checks; immune to sonic effects.' },
          frightened:    { icon: 'fa-ghost',             summary: 'Disadvantage on ability checks/attacks while source is in sight; cannot move closer to source.' },
          grappled:      { icon: 'fa-hand-grab',         summary: 'Speed becomes 0.' },
          incapacitated: { icon: 'fa-ban',               summary: "Can't take actions or reactions." },
          invisible:     { icon: 'fa-user-secret',       summary: 'Attacks against you have disadvantage; your attacks have advantage.' },
          paralyzed:     { icon: 'fa-person-falling',    summary: "Incapacitated, can't move or speak; attacks against you have advantage; hits within 5 ft auto-crit." },
          petrified:     { icon: 'fa-cube',              summary: 'Incapacitated, resistant to all damage, immune to poison/disease.' },
          poisoned:      { icon: 'fa-skull-crossbones',  summary: 'Disadvantage on attack rolls and ability checks.' },
          prone:         { icon: 'fa-person-falling',    summary: 'Disadvantage on attacks; melee attacks against you have advantage, ranged have disadvantage.' },
          restrained:    { icon: 'fa-link',              summary: 'Speed 0; attacks against you have advantage; disadvantage on DEX saves.' },
          stunned:       { icon: 'fa-dizzy',             summary: "Incapacitated, can't move; attacks against you have advantage; auto-fail STR/DEX saves." },
          unconscious:   { icon: 'fa-bed',               summary: 'Incapacitated, can\'t move/speak; attacks against you have advantage; hits within 5 ft auto-crit.' },
          bane:          { icon: 'fa-minus-circle',      summary: 'Roll 1d4 and subtract from attack rolls and saving throws.' },
          bless:         { icon: 'fa-plus-circle',       summary: 'Roll 1d4 and add to attack rolls and saving throws.' },
          'mage-armor-ac':     { icon: 'fa-shield-halved',   summary: '+3 AC while unarmored (Mage Armor).' },
          'shield-ac':         { icon: 'fa-shield',          summary: '+5 AC bonus (Shield reaction).' },
          'shield-of-faith-ac':{ icon: 'fa-shield-halved',   summary: '+2 AC bonus (Shield of Faith).' },
          heroism:       { icon: 'fa-medal',          summary: 'Immune to frightened; temporary HP each turn.' },
          'hunters-mark':    { icon: 'fa-bullseye',     summary: '+1d6 weapon damage vs marked target.' },
          'divine-favor':    { icon: 'fa-sun',          summary: '+1d4 radiant damage on weapon hits.' },
          'branding-smite':  { icon: 'fa-eye',          summary: 'Next hit deals +2d6 radiant and prevents invisibility.' },
          'magic-weapon':    { icon: 'fa-wand-magic',   summary: '+1 to attack and damage rolls with affected weapon.' },
        };

        const renderCondition = (c: ActiveCondition, tone: 'red' | 'emerald') => {
          const info = CONDITION_INFO[c.id];
          const toneText = tone === 'red' ? 'text-red-300' : 'text-emerald-300';
          const toneIcon = tone === 'red' ? 'text-red-400' : 'text-emerald-400';
          const toneBg = tone === 'red' ? 'bg-red-900/20 border-red-800/20' : 'bg-emerald-900/20 border-emerald-800/20';
          return (
            <div key={`${c.id}-${c.source}`} className={`${toneBg} border rounded px-2 py-1.5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <i className={`fas ${info?.icon ?? 'fa-circle'} ${toneIcon} text-[10px]`}></i>
                  <span className={`text-xs font-bold ${toneText} capitalize`}>{c.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {c.saveEnd && c.saveDC && c.saveDC > 0 && (
                    <span className="text-[9px] font-mono text-amber-500 bg-amber-950/30 px-1 rounded">DC {c.saveDC} {c.saveEnd.toUpperCase()}</span>
                  )}
                  <span className="text-[9px] font-mono text-stone-500">{formatConditionDuration(c)} left</span>
                </div>
              </div>
              {info && (
                <p className="text-[9px] text-stone-500 mt-0.5 leading-relaxed">{info.summary}</p>
              )}
            </div>
          );
        };

        return (
          <>
            {exhaustionLevel > 0 && (
              <div className="bg-orange-950/20 border border-orange-800/30 p-3 rounded-lg mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <i className="fas fa-battery-quarter text-orange-400 text-[11px]"></i>
                    <span className="text-[10px] uppercase font-bold text-orange-400 tracking-widest">Exhaustion</span>
                  </div>
                  <span className="text-[10px] font-mono text-orange-300 bg-orange-900/30 px-1.5 rounded">Level {exhaustionLevel}</span>
                </div>
                <p className="text-[9px] text-stone-500 mt-1 leading-relaxed">
                  {exhaustionLevel >= 1 && 'Disadvantage on ability checks. '}
                  {exhaustionLevel >= 2 && 'Speed halved. '}
                  {exhaustionLevel >= 3 && 'Disadvantage on attacks and saves. '}
                  {exhaustionLevel >= 4 && 'HP max halved. '}
                  {exhaustionLevel >= 5 && 'Speed reduced to 0. '}
                  {exhaustionLevel >= 6 && 'Dead. '}
                  {!exhaustionLevel || exhaustionLevel < 1 ? '' : `Speed penalty: -${exhaustionLevel * 5} ft. `}
                </p>
              </div>
            )}

            {buffs.length > 0 && (
              <div className="bg-emerald-950/20 border border-emerald-800/30 p-3 rounded-lg mt-2">
                <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest flex items-center gap-1.5 mb-2">
                  <i className="fas fa-shield-halved text-[10px]"></i> Active Buffs
                </p>
                <div className="flex flex-col gap-1.5">
                  {buffs.map(c => renderCondition(c, 'emerald'))}
                </div>
              </div>
            )}

            {debuffs.length > 0 && (
              <div className="bg-red-950/20 border border-red-800/30 p-3 rounded-lg mt-2">
                <p className="text-[10px] uppercase font-bold text-red-400 tracking-widest flex items-center gap-1.5 mb-2">
                  <i className="fas fa-exclamation-triangle text-[10px]"></i> Active Conditions
                </p>
                <div className="flex flex-col gap-1.5">
                  {debuffs.map(c => renderCondition(c, 'red'))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {damageResistances.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1">
        {damageResistances.map(dr => (
          <span key={dr} className="text-[9px] uppercase font-bold text-blue-400 bg-blue-950/20 border border-blue-900/30 px-1.5 py-0.5 rounded">{dr} Resistance</span>
        ))}
      </div>}

      <div className="space-y-2 mt-1">
        <h3 className="text-xs uppercase font-bold text-stone-400 tracking-widest border-b border-stone-850 pb-1 text-left">Proficient Skills</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.entries(character.skills??{}).map(([sN,rank])=>{
            const sd = SKILLS_LIST.find(s=>s.name===sN);
            if (!sd) return null;
            const totalMod = getMod(character.stats[sd.stat]??10)+rank;
            return <div key={sN} className="flex justify-between items-center bg-stone-950/40 border border-stone-850 p-2 rounded hover:bg-stone-900/30 transition-colors"><div className="flex flex-col"><span className="font-bold text-stone-300 capitalize text-left">{sd.label}</span><span className="text-[8px] text-stone-500 uppercase font-mono text-left">{sd.stat} (Rank {rank})</span></div><span className={`font-mono font-bold ${totalMod>=0?'text-green-500':'text-red-400'} text-right`}>{totalMod>=0?'+':''}{totalMod}</span></div>;
          })}
          {(!character.skills||Object.keys(character.skills??{}).length===0)&&<div className="col-span-2 text-center text-[10px] text-stone-600 py-2">No skills trained yet.</div>}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center border-b border-stone-800 pb-1"><h3 className="text-lg font-bold text-stone-300 uppercase tracking-tighter">Inventory</h3><button onClick={()=>setIsAdding(true)} className="text-amber-600 hover:text-amber-500 transition-colors text-xs"><i className="fas fa-plus-circle mr-1"></i> Add</button></div>
        <ul className="text-sm space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {character.inventory.map((item,idx)=>(
            <li key={idx} onMouseEnter={e=>handleMouseEnter(item,e)} onMouseLeave={()=>setHoveredItem(null)} className="group flex flex-col text-stone-400 hover:bg-stone-900/40 p-2 rounded transition-colors border border-transparent hover:border-stone-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-amber-900/60 text-[10px]">◈</span>
                  {editingIdx===idx ? <div className="flex flex-col gap-2 w-full">
                    <input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} className="bg-stone-950 border border-amber-900/50 rounded px-2 py-1 text-stone-200 outline-none w-full" placeholder="Name" />
                    <div className="flex items-center gap-2"><label className="text-[10px] uppercase text-stone-500">Qty:</label><input type="number" value={editingQty} onChange={e=>setEditingQty(e.target.value)} className="bg-stone-950 border border-amber-900/50 rounded px-2 py-1 text-amber-500 outline-none w-16"/><button onClick={saveEdit} className="text-green-600 ml-auto hover:text-green-500"><i className="fas fa-save"></i></button></div>
                  </div> : <div className="flex justify-between items-center w-full">
                    <span onClick={()=>{setEditingIdx(idx);setEditingName(item.name);setEditingQty(item.quantity.toString());}} className="cursor-pointer hover:text-stone-200 transition-colors flex-1">{item.name}{item.equipped&&<span className="ml-2 text-[8px] uppercase font-bold px-1.5 py-0.5 bg-amber-950/40 text-amber-400 border border-amber-800/30 rounded">Equipped</span>}</span>
                    <div className="flex items-center gap-1.5 ml-2">
                      {(item.type==='weapon'||item.type==='armor'||item.type==='shield')&&<button onClick={e=>{e.stopPropagation();handleToggleEquip(idx);}} className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all flex items-center gap-1 shrink-0 ${item.equipped?'bg-amber-900/30 border-amber-800/50 text-amber-400 hover:bg-amber-900/50':'bg-stone-850 border-stone-800 hover:bg-stone-800 text-stone-400 hover:text-stone-300'}`}><i className={`fas ${item.type==='weapon'?'fa-crosshairs':(item.equipped?'fa-shield-halved':'fa-shield')} text-[8px]`}></i>{item.equipped?'Equipped':'Equip'}</button>}
                      {item.type==='potion'&&<button onClick={e=>{e.stopPropagation();const hf=item.stats?.healing||'2d4+2',roll=rollDiceFormula(hf),ah=roll.total;if(onTriggerDiceRoll)onTriggerDiceRoll({characterName:character.name,rollType:'damage',label:`${item.name} Healing`,rollResult:roll.results.reduce((a,b)=>a+b,0),modifier:+(hf.match(/(\d+)$/)||[0,0])[1],sides:+(hf.match(/d(\d+)/)||[0,4])[1]});const nhp=Math.min(character.hp.max,character.hp.current+ah);character.hp.current=nhp;const ni=[...character.inventory];ni[idx].quantity>1?ni[idx]={...ni[idx],quantity:ni[idx].quantity-1}:ni.splice(idx,1);onUpdateInventory(ni);onSendMessage&&onSendMessage(`[Use Potion] ${character.name} drinks ${item.name}!\\n• Healing: **+${ah}** HP restored (${hf})\\n• Vitality: **${nhp} / ${character.hp.max}** HP.`);}} className="px-2 py-0.5 bg-stone-850 hover:bg-stone-800 text-green-500 rounded text-[9px] font-bold border border-stone-800 hover:border-green-900/50 transition-all flex items-center gap-1 shrink-0"><i className="fas fa-flask text-[8px]"></i> Drink</button>}
                      <span className="text-stone-500 text-[10px] font-mono px-1.5 py-0.5 bg-stone-900/60 rounded border border-stone-850 shrink-0">x{item.quantity}</span>
                    </div>
                  </div>}
                </div>
                {editingIdx!==idx&&<button onClick={()=>handleRemoveItem(idx)} className="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-900 transition-all ml-2"><i className="fas fa-trash-alt text-[10px]"></i></button>}
              </div>
            </li>
          ))}
          {isAdding&&<li className="p-2 border border-amber-900/30 rounded bg-stone-900/40 space-y-2 mt-2"><input autoFocus value={newItemName} onChange={e=>setNewItemName(e.target.value)} placeholder="Item name..." className="bg-stone-950 border border-amber-900/50 rounded px-2 py-1 text-stone-200 outline-none w-full text-xs"/><div className="flex items-center gap-2"><input type="number" value={newItemQty} onChange={e=>setNewItemQty(e.target.value)} placeholder="Qty" className="bg-stone-950 border border-amber-900/50 rounded px-2 py-1 text-amber-500 outline-none w-16 text-xs"/><div className="flex-1"></div><button onClick={()=>setIsAdding(false)} className="text-stone-600 text-xs">Cancel</button><button onClick={handleAddItem} className="text-green-700 hover:text-green-600"><i className="fas fa-plus"></i></button></div></li>}
          <li className="space-y-2 pt-2 border-t border-stone-900 mt-2">
            <h4 className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-2">Wealth</h4>
            <div className="flex flex-col gap-2">
              {(['gp','sp','cp'] as (keyof Currency)[]).map(f=><CurrencyRow key={f} label={f.toUpperCase()} iconColor={f==='gp'?'text-amber-400':f==='sp'?'text-stone-400':'text-orange-800'} field={f} value={character.currency[f]} isEditing={isEditingCurrency===f} input={currencyInput} onChange={setCurrencyInput} onStartEdit={()=>{setIsEditingCurrency(f);setCurrencyInput(character.currency[f].toString());}} onSave={()=>handleCurrencyEdit(f)} inputClass={f==='gp'?'border-amber-900/50 text-amber-500':f==='sp'?'border-stone-700 text-stone-300':'border-orange-900/50 text-orange-600'} />)}
            </div>
          </li>
        </ul>
      </div>

      <div className="space-y-2 mt-auto"><h3 className="text-lg font-bold border-b border-stone-800 pb-1 text-stone-300 uppercase tracking-tighter">Current Location</h3><p className="text-sm text-stone-400 leading-relaxed italic"><i className="fas fa-map-marker-alt text-red-900 mr-2 opacity-50"></i>{character.location}</p></div>

      {renderItemTooltip()}
      <FeatDetailModal feat={viewingFeat} onClose={() => setViewingFeat(null)} />
    </div>
  );
};

export default CharacterSheet;
