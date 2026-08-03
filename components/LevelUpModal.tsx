import React, { useState, useMemo } from 'react';
import { Character } from '../types';
import { SKILLS_LIST, ASI_LEVELS } from '../constants';
import { cryptoRoll } from '../utils/random';
import { FeatDefinition, FEATS_CATALOG } from '../utils/feats';
import { filterAvailableFeats, validateFeatPrereqs } from '../services/featsService';
import { getClassDef, getSubclassDef, getSpellSaveDc, getSpellAttackBonus, getMod } from '../services/classEngine';
import { SPELLS_BY_ID } from '../utils/spells';
import { INVOCATIONS_CATALOG, getInvocationCount } from '../data/invocations';
import { FIGHTING_STYLE_OPTIONS } from '../data/classes';
import FeatDetailModal from './FeatDetailModal';
import TabButton from './shared/TabButton';
import StatRow from './wizard/shared/StatRow';
import SkillRow from './wizard/shared/SkillRow';
import FeatCard from './wizard/shared/FeatCard';
import FeatSearchBar from './wizard/shared/FeatSearchBar';
import AsiSlotAllocator from './wizard/shared/AsiSlotAllocator';
import AsiOrFeatChoice from './wizard/shared/AsiOrFeatChoice';
import RemainingPointsBanner from './wizard/shared/RemainingPointsBanner';

const STAT_LABELS: Record<string, string> = { str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA' };
const STAT_KEYS = ['str','dex','con','int','wis','cha'] as const;

const ASI_FEAT_IDS = new Set([
  'resilient','lightly-armored','moderately-armored','heavily-armored',
  'heavy-armor-master','actor','athlete','tavern-brawler','linguist','keen-mind'
]);

interface LevelUpModalProps {
  character: Character;
  selectedAllocations: Partial<Record<keyof Character['stats'], number>>;
  remainingPoints: number;
  previewHp: number;
  error: string|null;
  onAllocate: (stat: keyof Character['stats'], delta: number) => void;
  onConfirm: (skillAllocations?: Record<string,number>, hpDeviation?: number) => void;
  onCancel: () => void;
  onConfirmAsi?: () => void | Promise<void>;
  onConfirmFeat?: (opts: {
    featId: string;
    asiBonuses?: Partial<Record<keyof Character['stats'], number>>;
    saveStatChoice?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    skillChoices?: string[];
  }) => void | Promise<void>;
  onAcknowledgeSubclass?: () => void | Promise<void>;
  onConfirmInvocations?: (invocationIds: string[]) => Promise<boolean>;
  onConfirmFightingStyleTwo?: (style: string) => Promise<boolean>;
}

type Tab = 'hp' | 'stats' | 'skills' | 'choice' | 'asi' | 'feat' | 'subclass' | 'resources' | 'spells' | 'invocations' | 'fighting-style-two';

/** Level-up modal with tabs for HP roll, stat allocation, skill points, ASI/feat selection, resources, spells, and Warlock invocations. */
const LevelUpModal: React.FC<LevelUpModalProps> = ({ character, selectedAllocations, remainingPoints, previewHp, error, onAllocate, onConfirm, onCancel, onConfirmAsi, onConfirmFeat, onAcknowledgeSubclass, onConfirmInvocations, onConfirmFightingStyleTwo }) => {
  const isAsi = character.pendingFeatChoice && ASI_LEVELS.includes(character.level);
  const hasSubclassFeature = character.pendingSubclassFeature && character.subclassId;
  const subclassDef = character.subclassId ? getSubclassDef(character.class, character.subclassId) : undefined;
  const newSubclassFeatures = hasSubclassFeature && subclassDef ? subclassDef.features.filter(f => f.level === character.level && !(character.unlockedSubclassFeatures || []).includes(f.level)) : [];
  // Warlock invocation picker visibility: Warlock L2+ with pending choices.
  const hasPendingInvocations = character.class === 'warlock' && (character.pendingInvocations ?? 0) > 0;
  // Champion Fighter L10 "Additional Fighting Style": subclass feature gate.
  const championL10Feature = subclassDef?.features.find(
    f => f.level === character.level && f.id === 'additional-fighting-style'
  );
  const hasPendingFightingStyleTwo = !!(championL10Feature && !character.fightingStyleTwo);
  const defaultTab: Tab = hasSubclassFeature ? 'subclass' : (hasPendingInvocations ? 'invocations' : (hasPendingFightingStyleTwo ? 'fighting-style-two' : (isAsi ? 'choice' : 'hp')));
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [localSkills, setLocalSkills] = useState<Record<string,number>>({});
  const [subclassAcknowledged, setSubclassAcknowledged] = useState(false);
  const classDef = getClassDef(character.class);
  const hitDie = classDef?.hitDie || 8;
  const averageRoll = classDef?.hpPerLevel || 5;
  const [hpRoll, setHpRoll] = useState<number|null>(null);
  const [rolling, setRolling] = useState(false);
  const [tempRoll, setTempRoll] = useState(1);
  const conMod = getMod(character.stats.con + (selectedAllocations.con || 0));
  const startingUnusedSkillPoints = character.unusedSkillPoints || 0;
  const remainingSkillPoints = startingUnusedSkillPoints - Object.values(localSkills).reduce((s,v) => s+v, 0);

  const [choiceType, setChoiceType] = useState<'asi' | 'feat' | null>(null);
  const [selectedFeatId, setSelectedFeatId] = useState<string | null>(null);
  const [featSearch, setFeatSearch] = useState('');
  const [featCategory, setFeatCategory] = useState<string>('all');
  const [viewingFeat, setViewingFeat] = useState<FeatDefinition | null>(null);
  const [saveStatChoice, setSaveStatChoice] = useState<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>(
    (character.featChoices?.['resilient']?.saveStat as string) || 'con'
  );
  const [asiBonusesForFeat, setAsiBonusesForFeat] = useState<Partial<Record<keyof Character['stats'], number>>>({});
  const [skilledChoices, setSkilledChoices] = useState<string[]>([]);
  const [pendingInvocationPicks, setPendingInvocationPicks] = useState<string[]>([]);
  const [pendingFightingStyleTwo, setPendingFightingStyleTwo] = useState<string>('');

  const handleRollHp = () => {
    if (rolling) return;
    setRolling(true);
    let count = 0;
    const interval = setInterval(() => { setTempRoll(cryptoRoll(hitDie)); if (++count>10) { clearInterval(interval); setHpRoll(cryptoRoll(hitDie)); setRolling(false); }}, 70);
  };

  const handleAllocateSkill = (skillName: string, delta: number) => setLocalSkills(p => {
    const nv = (p[skillName]||0)+delta;
    if (nv<0||Object.values({...p,[skillName]:nv}).reduce((s,v)=>s+v,0)>startingUnusedSkillPoints) return p;
    return {...p,[skillName]:nv};
  });

  const hpGain = hpRoll !== null ? Math.max(1, hpRoll+conMod) : 0;
  const hpDeviation = hpRoll !== null ? hpRoll - averageRoll : 0;
  const finalPreviewHp = previewHp + hpDeviation;

  const filteredFeats = useMemo(() => {
    let feats = filterAvailableFeats(character, featSearch);
    if (featCategory !== 'all') {
      feats = feats.filter(f => f.category === featCategory);
    }
    return feats;
  }, [character, featSearch, featCategory]);

  const selectedFeat = useMemo(() => FEATS_CATALOG.find(f => f.id === selectedFeatId) || null, [selectedFeatId]);
  const selectedFeatValidation = useMemo(() => {
    if (!selectedFeat) return null;
    return validateFeatPrereqs(character, selectedFeat.id);
  }, [character, selectedFeat]);

  const featNeedsAsi = selectedFeat && ASI_FEAT_IDS.has(selectedFeat.id);
  const featNeedsSaveStat = selectedFeat?.id === 'resilient';
  const featNeedsSkills = selectedFeat?.id === 'skilled';

  const asiTotalForFeat = Object.values(asiBonusesForFeat).reduce((s, v) => s + (v || 0), 0);
  const asiValid = !featNeedsAsi || asiTotalForFeat === 1;

  const tabs: { key: Tab; icon: string; label: string; show: boolean }[] = [
    { key: 'subclass', icon: 'fa-gem', label: 'Subclass', show: hasSubclassFeature && !subclassAcknowledged },
    { key: 'hp', icon: 'fa-heart', label: 'HP Roll', show: !isAsi && !hasSubclassFeature },
    { key: 'stats', icon: 'fa-shield-alt', label: 'Attributes', show: !isAsi },
    { key: 'skills', icon: 'fa-magic', label: 'Skills', show: !isAsi },
    { key: 'choice', icon: 'fa-star', label: 'ASI / Feat', show: isAsi },
    { key: 'asi', icon: 'fa-arrow-up', label: 'ASI', show: isAsi && choiceType === 'asi' },
    { key: 'feat', icon: 'fa-trophy', label: 'Feat', show: isAsi && choiceType === 'feat' },
    { key: 'invocations', icon: 'fa-eye', label: 'Invocations', show: hasPendingInvocations },
    { key: 'fighting-style-two', icon: 'fa-shield-halved', label: 'Style II', show: hasPendingFightingStyleTwo },
    { key: 'resources', icon: 'fa-bolt', label: 'Resources', show: (character.resources || []).length > 0 },
    { key: 'spells', icon: 'fa-book', label: 'Spells', show: !!classDef?.spellcasting },
  ];

  const renderFeatSelection = () => (
    <div className="space-y-3 py-2 animate-in fade-in duration-350">
      {!choiceType && <AsiOrFeatChoice onChooseAsi={() => { setChoiceType('asi'); setActiveTab('asi'); }} onChooseFeat={() => { setChoiceType('feat'); setActiveTab('feat'); }} />}

      {choiceType === 'asi' && (
        <div className="space-y-3">
          <RemainingPointsBanner label="Points to allocate:" remaining={remainingPoints} total={2} completeColor="text-green-500" />
          {(Object.keys(character.stats) as (keyof Character['stats'])[]).map(stat => {
            const cv = character.stats[stat], al = selectedAllocations[stat] || 0, nv = cv + al, nm = getMod(nv);
            return (
              <StatRow key={stat} stat={stat} currentValue={cv} allocation={al} newValue={nv} modifier={nm}
                disableAdd={remainingPoints <= 0 || nv >= 20 || al >= 2} onAllocate={(s,d) => onAllocate(stat as keyof Character['stats'], d)} />
            );
          })}
          <button onClick={() => setChoiceType(null)} className="w-full py-2 text-[10px] uppercase text-stone-500 hover:text-stone-300">← Back to ASI/Feat choice</button>
        </div>
      )}

      {choiceType === 'feat' && (
        <div className="space-y-3">
          {selectedFeatId && (
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">Selected Feat</p>
                  <h4 className="text-base font-bold text-stone-100">{selectedFeat?.name}</h4>
                </div>
                <button onClick={() => setViewingFeat(selectedFeat)} className="text-amber-500 hover:text-amber-400 text-xs">
                  <i className="fas fa-info-circle mr-1"></i> Details
                </button>
              </div>
              {selectedFeatValidation && !selectedFeatValidation.ok && (
                <p className="text-xs text-red-400 mt-1"><i className="fas fa-exclamation-triangle mr-1"></i> {selectedFeatValidation.reason}</p>
              )}
            </div>
          )}

          {featNeedsAsi && selectedFeat && (
            <AsiSlotAllocator
              stats={character.stats}
              allocations={asiBonusesForFeat as Partial<Record<keyof Character['stats'], number>>}
              totalAllocated={asiTotalForFeat}
              targetTotal={1}
              maxPerStat={1}
              maxValue={20}
              onAllocate={(stat, delta) => {
                setAsiBonusesForFeat(p => ({ ...p, [stat]: delta > 0 ? 1 : 0 }));
              }}
            />
          )}

          {featNeedsSaveStat && (
            <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 space-y-2">
              <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">Choose Saving Throw Proficiency</p>
              <div className="grid grid-cols-3 gap-1">
                {STAT_KEYS.map(stat => (
                  <button key={stat} onClick={() => setSaveStatChoice(stat)}
                    className={`py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${saveStatChoice === stat ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'bg-stone-900 text-stone-400 border border-stone-800 hover:bg-stone-800'}`}>
                    {STAT_LABELS[stat]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {featNeedsSkills && (
            <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 space-y-2">
              <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">Choose 3 Skills ({skilledChoices.length}/3)</p>
              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                {SKILLS_LIST.map(s => {
                  const isSelected = skilledChoices.includes(s.name);
                  const disableAdd = isSelected || skilledChoices.length >= 3;
                  return (
                    <button key={s.name} onClick={() => { if (isSelected) setSkilledChoices(p => p.filter(x => x !== s.name)); else if (!disableAdd) setSkilledChoices(p => [...p, s.name]); }}
                      className={`py-1 px-2 rounded text-[10px] text-left transition-colors ${isSelected ? 'bg-amber-900/40 text-amber-300 border border-amber-800/30' : 'bg-stone-900 text-stone-400 border border-stone-800 hover:bg-stone-800 disabled:opacity-30'}`}
                      disabled={!isSelected && disableAdd}>
                      {isSelected && <i className="fas fa-check text-[8px] mr-1"></i>}{s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <FeatSearchBar search={featSearch} category={featCategory} onSearchChange={setFeatSearch} onCategoryChange={setFeatCategory} />

          <div className="max-h-64 overflow-y-auto pr-1 custom-scrollbar space-y-2">
            {filteredFeats.length === 0 ? (
              <p className="text-center text-stone-500 text-xs py-4">No matching feats available.</p>
            ) : (
              filteredFeats.map(feat => {
                const validation = validateFeatPrereqs(character, feat.id);
                const meetsPrereqs = validation.ok;
                return (
                  <FeatCard
                    key={feat.id}
                    feat={feat}
                    isSelected={selectedFeatId === feat.id}
                    meetsPrereqs={meetsPrereqs}
                    validationReason={meetsPrereqs ? undefined : validation.reason}
                    onSelect={() => meetsPrereqs && setSelectedFeatId(feat.id)}
                    onViewDetail={() => setViewingFeat(feat)}
                  />
                );
              })
            )}
          </div>
          <button onClick={() => { setSelectedFeatId(null); setAsiBonusesForFeat({}); setSkilledChoices([]); }} className="w-full py-2 text-[10px] uppercase text-stone-500 hover:text-stone-300">← Back to choice</button>
        </div>
      )}
    </div>
  );

  const canConfirm = isAsi
    ? (choiceType === 'asi' ? remainingPoints === 0 : (
        choiceType === 'feat' && selectedFeatId && selectedFeatValidation?.ok &&
        asiValid &&
        (!featNeedsSaveStat) &&
        (!featNeedsSkills || skilledChoices.length === 3)
      ))
    : (remainingPoints === 0 && remainingSkillPoints === 0 && hpRoll !== null);

  // Side-tab gating: pending picks must be resolved before the user can confirm the level-up.
  const invocationsPendingUnresolved = hasPendingInvocations && pendingInvocationPicks.length !== (character.pendingInvocations ?? 0);
  const fightingStyleTwoUnresolved = hasPendingFightingStyleTwo && !pendingFightingStyleTwo;
  const sidePicksBlock = invocationsPendingUnresolved || fightingStyleTwoUnresolved;

  return (
    <div className="fixed inset-0 bg-stone-950/90 z-50 flex flex-col items-center justify-center p-4 text-stone-200">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage:'url("https://www.transparenttextures.com/patterns/black-paper.png")'}}></div>
      <div className="max-w-xl w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 backdrop-blur-md shadow-2xl relative flex flex-col max-h-[90vh]">
        <div className="text-center mb-6 shrink-0">
          <div className="text-3xl mb-1"><i className={`fas ${isAsi ? 'fa-star' : 'fa-crown'} text-amber-500 animate-pulse`}></i></div>
          <h2 className="fantasy-font text-2xl font-bold text-amber-500 uppercase tracking-widest">
            {isAsi ? 'Ability Score Improvement' : 'Level Up Progression'}
          </h2>
          <p className="text-stone-400 text-xs mt-0.5">Leveling up <span className="text-amber-500 font-bold">{character.name}</span> — {character.race} {character.class} → Level {character.level}</p>
        </div>
        <div className="flex border-b border-stone-850 mb-4 shrink-0 bg-stone-950/40 rounded-lg p-1">
          {tabs.filter(t => t.show).map(t => {
            const done = t.key==='hp'?hpRoll!==null:
                         t.key==='stats'?remainingPoints===0:
                         t.key==='skills'?remainingSkillPoints===0:
                         t.key==='choice'?choiceType!==null:
                         t.key==='asi'?remainingPoints===0:
                         t.key==='feat'?!!selectedFeatId:false;
            return <TabButton key={t.key} active={activeTab===t.key} done={done} onClick={()=>setActiveTab(t.key)} icon={t.icon}>{t.label}</TabButton>;
          })}
        </div>
        {error&&<div className="mb-4 p-2 bg-red-900/30 border border-red-800 rounded text-red-400 text-xs text-center shrink-0">{error}</div>}
        <div className="flex-1 overflow-y-auto pr-1 min-h-[250px] mb-6 custom-scrollbar">
          {activeTab==='hp'&&<div className="space-y-6 py-2 animate-in fade-in duration-350">
            <div className="text-center p-4 bg-stone-950/60 rounded-xl border border-stone-850">
              <p className="text-stone-400 text-sm">Your calling dictates a <span className="text-amber-500 font-bold">1d{hitDie}</span> Hit Die for leveling up.</p>
              <div className="flex justify-center items-center gap-4 my-6">
                <div className={`w-20 h-20 bg-stone-900 border-2 rounded-xl flex flex-col justify-center items-center relative shadow-2xl transition-all ${rolling?'border-amber-500 scale-105 rotate-12 animate-bounce':'border-stone-800'}`}>
                  <span className="text-[10px] text-stone-600 uppercase font-bold absolute top-1.5 tracking-tighter">d{hitDie}</span>
                  <span className={`text-4xl font-bold font-mono ${rolling?'text-amber-500':hpRoll!==null?'text-green-500':'text-stone-500'}`}>{rolling?tempRoll:hpRoll!==null?hpRoll:'?'}</span>
                </div>
              </div>
              <div className="flex gap-4 max-w-sm mx-auto">
                <button onClick={handleRollHp} disabled={rolling} className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-bold transition-all text-xs uppercase tracking-wider"><i className="fas fa-dice mr-2"></i> Roll Die</button>
                <button onClick={()=>setHpRoll(averageRoll)} disabled={rolling} className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-300 rounded-lg font-bold transition-all text-xs uppercase tracking-wider border border-stone-700">Take Average ({averageRoll})</button>
              </div>
            </div>
            {hpRoll!==null&&<div className="bg-stone-950/40 p-4 rounded-xl border border-stone-850 text-center animate-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-stone-300 font-bold mb-2 uppercase tracking-wide text-xs">HP Gained Summary</h3>
              <div className="flex justify-center items-center gap-4 text-sm font-mono">
                <div><span className="text-stone-500 block text-[10px] uppercase font-sans">Roll Result</span><span className="text-stone-200 text-lg font-bold">{hpRoll}</span></div>
                <span className="text-stone-600 text-xl">+</span>
                <div><span className="text-stone-500 block text-[10px] uppercase font-sans">CON Modifier</span><span className={`${conMod>=0?'text-green-500':'text-red-400'} text-lg font-bold`}>{conMod>=0?'+':''}{conMod}</span></div>
                <span className="text-stone-600 text-xl">=</span>
                <div className="bg-green-950/20 border border-green-900/30 px-3 py-1 rounded"><span className="text-green-600 block text-[10px] uppercase font-sans font-bold">Total Gained</span><span className="text-green-400 text-lg font-bold font-mono">+{hpGain} HP</span></div>
              </div>
              <p className="text-stone-500 text-[10px] mt-3">Max HP: {character.hp.max} <span className="text-amber-600">→</span> {finalPreviewHp}</p>
            </div>}
          </div>}
          {activeTab==='stats'&&<div className="space-y-3 py-2 animate-in fade-in duration-350">
            <RemainingPointsBanner label="Available Attribute Points:" remaining={remainingPoints} />
            {(Object.keys(character.stats) as (keyof Character['stats'])[]).map(stat=>{
              const cv=character.stats[stat], al=selectedAllocations[stat]||0, nv=cv+al, nm=getMod(nv);
              return <StatRow key={stat} stat={stat} currentValue={cv} allocation={al} newValue={nv} modifier={nm} disableAdd={remainingPoints<=0||nv>=20} onAllocate={(s,d) => onAllocate(stat, d as 1|-1)} hover />;
            })}
          </div>}
          {activeTab==='skills'&&<div className="space-y-3 py-2 animate-in fade-in duration-350">
            <RemainingPointsBanner label="Available Skill Points:" remaining={remainingSkillPoints} />
            <div className="space-y-2">{SKILLS_LIST.map(skill=>{
              const cr=character.skills?.[skill.name]||0, pa=localSkills[skill.name]||0, fr=cr+pa, gsv=character.stats[skill.stat]+(selectedAllocations[skill.stat]||0), tm=getMod(gsv)+fr;
              return <SkillRow key={skill.name} label={skill.label} statKey={skill.stat} rank={pa} totalRank={fr} totalMod={tm} remainingPoints={remainingSkillPoints} onAllocate={(d)=>handleAllocateSkill(skill.name,d)} description={skill.description} />;
            })}</div>
          </div>}
          {(activeTab==='choice'||activeTab==='asi'||activeTab==='feat') && renderFeatSelection()}
          {activeTab==='subclass' && <div className="space-y-4 py-2 animate-in fade-in duration-350">
            <div className="bg-amber-950/20 border border-amber-700 rounded-xl p-5 text-center">
              <div className="text-4xl mb-2"><i className="fas fa-gem text-amber-500"></i></div>
              <h3 className="font-bold text-lg text-amber-500">New Subclass Feature Unlocked!</h3>
              {newSubclassFeatures.map(f => (
                <div key={f.id} className="mt-4 bg-stone-950/40 border border-stone-800 rounded-lg p-4 text-left">
                  <p className="text-sm font-bold text-stone-200">{f.name}</p>
                  <p className="text-xs text-stone-400 mt-1">{f.description}</p>
                  {f.choice && <p className="text-[10px] text-amber-600 mt-1 italic">You may need to make a choice for this feature.</p>}
                </div>
              ))}
            </div>
            <button onClick={() => { setSubclassAcknowledged(true); if (onAcknowledgeSubclass) onAcknowledgeSubclass(); setActiveTab('hp'); }} className="w-full py-3 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs">Acknowledge</button>
          </div>}
          {activeTab==='resources' && <div className="space-y-3 py-2 animate-in fade-in duration-350">
            <h3 className="text-xs uppercase font-bold text-stone-400 tracking-widest mb-2">Class & Race Resources</h3>
            {(character.resources || []).filter(r => r.max > 0).map(r => (
              <div key={r.id} className="flex items-center justify-between bg-stone-950/40 border border-stone-850 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  {r.icon && <i className={`fas ${r.icon} text-amber-500 text-xs`}></i>}
                  <div>
                    <span className="text-sm font-bold text-stone-200">{r.name}</span>
                    <span className="text-[10px] text-stone-500 block">Resets on {r.resetOn} rest</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono text-amber-400">{r.current}</span>
                  <span className="text-stone-500 text-sm">/{r.max}</span>
                </div>
              </div>
            ))}
            {(character.resources || []).filter(r => r.max > 0).length === 0 && <p className="text-xs text-stone-500 text-center py-6 italic">No resource pools available.</p>}
          </div>}
          {activeTab==='invocations' && <div className="space-y-3 py-2 animate-in fade-in duration-350">
            <div className="bg-amber-950/20 border border-amber-700 rounded-xl p-4 text-center">
              <div className="text-3xl mb-1"><i className="fas fa-eye text-amber-500"></i></div>
              <h3 className="font-bold text-amber-500">Eldritch Invocations</h3>
              <p className="text-[10px] text-stone-400 mt-1">
                Pick {character.pendingInvocations} new invocation{character.pendingInvocations === 1 ? '' : 's'} from the list below.
                Your current invocation budget is {getInvocationCount(character.level)} at L{character.level}.
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 custom-scrollbar space-y-2">
              {INVOCATIONS_CATALOG.filter(inv => inv.minLevel <= character.level && !(character.invocations ?? []).includes(inv.id)).map(inv => {
                const isSelected = pendingInvocationPicks.includes(inv.id);
                const disablePick = !isSelected && pendingInvocationPicks.length >= (character.pendingInvocations ?? 0);
                return (
                  <button key={inv.id} onClick={() => {
                    if (isSelected) setPendingInvocationPicks(p => p.filter(x => x !== inv.id));
                    else if (!disablePick) setPendingInvocationPicks(p => [...p, inv.id]);
                  }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${isSelected ? 'bg-amber-900/40 border-amber-700/50 text-amber-200' : 'bg-stone-950/40 border-stone-800 hover:bg-stone-900 disabled:opacity-40'}`}
                    disabled={!isSelected && disablePick}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-stone-200">{inv.name}{inv.prerequisite ? <span className="text-[9px] text-stone-500 ml-1">· {inv.prerequisite}</span> : null}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">{inv.description}</p>
                      </div>
                      {isSelected && <i className="fas fa-check text-amber-400 text-xs"></i>}
                    </div>
                  </button>
                );
              })}
              {INVOCATIONS_CATALOG.filter(inv => inv.minLevel <= character.level && !(character.invocations ?? []).includes(inv.id)).length === 0 && (
                <p className="text-center text-stone-500 text-xs py-4 italic">No new invocations available at this level.</p>
              )}
            </div>
            <button
              onClick={async () => {
                if (!onConfirmInvocations) return;
                const ok = await onConfirmInvocations(pendingInvocationPicks);
                if (ok) setPendingInvocationPicks([]);
              }}
              disabled={pendingInvocationPicks.length !== (character.pendingInvocations ?? 0)}
              className="w-full py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs">
              Learn {pendingInvocationPicks.length > 0 ? `(${pendingInvocationPicks.length}/${character.pendingInvocations ?? 0})` : ''}
            </button>
          </div>}
          {activeTab==='fighting-style-two' && <div className="space-y-3 py-2 animate-in fade-in duration-350">
            <div className="bg-amber-950/20 border border-amber-700 rounded-xl p-4 text-center">
              <div className="text-3xl mb-1"><i className="fas fa-shield-halved text-amber-500"></i></div>
              <h3 className="font-bold text-amber-500">Additional Fighting Style</h3>
              <p className="text-[10px] text-stone-400 mt-1">Champion L10 — pick a second fighting style (cannot duplicate your first).</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {FIGHTING_STYLE_OPTIONS.filter(fs => fs.id !== 'protection' && fs.id !== character.fightingStyle).map(fs => (
                <button key={fs.id} onClick={() => setPendingFightingStyleTwo(fs.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${pendingFightingStyleTwo === fs.id ? 'bg-amber-900/40 border-amber-700/50 text-amber-200' : 'bg-stone-950/40 border-stone-800 hover:bg-stone-900'}`}>
                  <p className="text-xs font-bold text-stone-200">{fs.label}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">{fs.description}</p>
                </button>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!onConfirmFightingStyleTwo || !pendingFightingStyleTwo) return;
                const ok = await onConfirmFightingStyleTwo(pendingFightingStyleTwo);
                if (ok) setPendingFightingStyleTwo('');
              }}
              disabled={!pendingFightingStyleTwo}
              className="w-full py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs">
              Confirm Style
            </button>
          </div>}
          {activeTab==='spells' && <div className="space-y-3 py-2 animate-in fade-in duration-350">
            {character.pendingSpellSwap && classDef?.spellcasting?.prepMode === 'known' && (
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5 flex items-center gap-2 text-xs text-amber-200">
                <i className="fas fa-arrows-rotate text-amber-400"></i>
                <span>You may swap one known spell for another. Use the "Manage Spells" button on your character sheet or input bar after closing this modal.</span>
              </div>
            )}
            {character.class === 'wizard' && (
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5 flex items-center gap-2 text-xs text-amber-200">
                <i className="fas fa-book-bookmark text-amber-400"></i>
                <span>
                  Wizard Spellbook: You gain 2 new spells of your choice for your spellbook on level-up.
                  {character.pendingWizardSpells ? ` (${character.pendingWizardSpells} pending)` : ''} Use the "Spellbook" button on your character sheet to learn them anytime.
                </span>
              </div>
            )}
            {classDef?.spellcasting && <div className="bg-stone-950/40 border border-stone-850 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase text-stone-400 font-bold">Spellcasting Ability</span>
                <span className="text-xs font-bold text-amber-400">{classDef.spellcasting.ability.toUpperCase()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase text-stone-400 font-bold">Spell Save DC</span>
                <span className="text-xs font-bold text-amber-400">{getSpellSaveDc(character)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase text-stone-400 font-bold">Spell Attack Bonus</span>
                <span className="text-xs font-bold text-amber-400">+{getSpellAttackBonus(character)}</span>
              </div>
            </div>}
            <div className="space-y-2">
              {(character.resources || []).filter(r => r.id.startsWith('spell-slot-') && r.max > 0).map(slot => (
                <div key={slot.id} className="flex items-center justify-between bg-stone-950/40 border border-stone-850 rounded-lg p-2.5">
                  <span className="text-xs text-stone-300">Level {slot.id.slice(-1)} Slots</span>
                  <div className="flex items-center gap-1">
                    {Array.from({length: slot.max}).map((_, i) => (
                      <span key={i} className={`w-4 h-4 rounded-full ${i < slot.current ? 'bg-amber-600' : 'bg-stone-800 border border-stone-700'}`}></span>
                    ))}
                    <span className="text-xs text-stone-500 ml-1">{slot.current}/{slot.max}</span>
                  </div>
                </div>
              ))}
            </div>
            {classDef?.spellcasting && <div>
              <h4 className="text-[10px] uppercase font-bold text-stone-400 tracking-widest mb-2 mt-3">
                {character.class === 'wizard' ? 'Spellbook Spells (Known)' : classDef.spellcasting.prepMode === 'prepared' ? 'Prepared Spells' : 'Known Spells'}
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                {(character.knownSpells || []).map(sid => {
                  const spell = SPELLS_BY_ID[sid];
                  const isPrep = (character.preparedSpells || []).includes(sid);
                  return spell ? <div key={sid} className="flex items-center justify-between bg-stone-950/30 border border-stone-850 rounded p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-300">{spell.name}</span>
                      {character.class === 'wizard' && spell.level > 0 && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isPrep ? 'bg-amber-900/40 text-amber-300 border border-amber-800/40' : 'bg-stone-800 text-stone-500'}`}>
                          {isPrep ? 'Prepared' : 'In Spellbook'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-stone-500 capitalize">{spell.school} L{spell.level}</span>
                  </div> : null;
                })}
                {(character.knownSpells || []).length === 0 && <p className="text-xs text-stone-500 text-center py-4 italic">Select spells at character creation or during level-up.</p>}
              </div>
            </div>}
          </div>}
        </div>
        <div className="border-t border-stone-800 pt-4 shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-stone-400 font-mono bg-stone-950/40 p-2.5 rounded-lg border border-stone-850">
            {!isAsi && (
              <>
                <div>HP: <span className="text-stone-200">{character.hp.max}</span> → <span className="text-green-400 font-bold">{hpRoll!==null?finalPreviewHp:'?'}</span></div>
                <div>Stats: <span className="text-stone-200">{remainingPoints} left</span></div>
                <div>Skills: <span className="text-stone-200">{remainingSkillPoints} left</span></div>
              </>
            )}
            {isAsi && choiceType === 'asi' && (
              <div className="w-full text-center">Points: <span className={remainingPoints===0?'text-green-400':'text-amber-500'}>2</span> — {remainingPoints} remaining</div>
            )}
            {isAsi && choiceType === 'feat' && (
              <div className="w-full text-center">
                {selectedFeatId
                  ? <span className="text-green-400">Feat selected: {selectedFeat?.name}</span>
                  : <span className="text-amber-500">Choose a feat below</span>}
              </div>
            )}
            {isAsi && !choiceType && (
              <div className="w-full text-center text-amber-500">Choose: Ability Score Improvement or a Feat</div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 bg-stone-800 hover:bg-stone-700 rounded-lg font-bold text-stone-400 transition-colors uppercase tracking-wider text-xs border border-stone-700">Later</button>
            {isAsi ? (
              <button
                onClick={() => {
                  if (choiceType === 'asi' && onConfirmAsi) {
                    onConfirmAsi();
                  } else if (choiceType === 'feat' && onConfirmFeat && selectedFeatId) {
                    onConfirmFeat({
                      featId: selectedFeatId,
                      asiBonuses: featNeedsAsi ? asiBonusesForFeat : undefined,
                      saveStatChoice: featNeedsSaveStat ? saveStatChoice : undefined,
                      skillChoices: featNeedsSkills ? skilledChoices : undefined
                    });
                  } else {
                    alert('Please make a choice first.');
                  }
                }}
                disabled={!canConfirm}
                className="flex-1 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs shadow-lg shadow-amber-950/40"
              >
                {choiceType === 'asi' ? 'Confirm ASI' : choiceType === 'feat' ? `Take ${selectedFeat?.shortName || 'Feat'}` : 'Choose First'}
              </button>
            ) : (
              <button onClick={() => { if (remainingPoints>0||remainingSkillPoints>0) { alert("Please allocate all available attribute and skill points."); return; } if (hpRoll===null) { alert("Please roll for HP or take average before continuing."); return; } if (sidePicksBlock) { alert("Please resolve your pending invocation or fighting-style picks first."); return; } onConfirm(localSkills, hpDeviation); }} disabled={remainingPoints>0||remainingSkillPoints>0||hpRoll===null||sidePicksBlock} className="flex-1 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs shadow-lg shadow-amber-950/40">Confirm Level Up</button>
            )}
          </div>
        </div>
      </div>
      {viewingFeat && <FeatDetailModal feat={viewingFeat} onClose={() => setViewingFeat(null)} />}
    </div>
  );
};

export default LevelUpModal;
