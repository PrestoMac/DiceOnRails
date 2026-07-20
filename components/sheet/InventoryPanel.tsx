import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Character, InventoryItem, Currency } from '../../types';
import { cryptoRoll } from '../../utils/random';

/** Props for the InventoryPanel component. */
interface InventoryPanelProps {
  character: Character;
  onUpdateInventory: (inv: InventoryItem[]) => void;
  onUpdateCurrency: (c: Currency) => void;
  onTriggerDiceRoll?: (d: any) => Promise<void>;
  onSendMessage?: (text: string) => void;
}

/** Returns a Tailwind class string for styling an item's border/text based on its rarity tier. */
const rarityStyle = (rarity?: string) =>
  rarity === 'uncommon' ? 'text-blue-400 border-l-blue-500' :
  rarity === 'rare' ? 'text-purple-400 border-l-purple-500' :
  rarity === 'very rare' ? 'text-pink-400 border-l-pink-500' :
  rarity === 'legendary' ? 'text-amber-500 border-l-amber-500' :
  'text-stone-400 border-l-stone-500';

/** A single editable row displaying a currency type (GP, SP, or CP) with inline editing. */
const CurrencyRow: React.FC<{
  label: string; iconColor: string; field: keyof Currency; value: number;
  isEditing: boolean; input: string; onStartEdit: ()=>void; onChange: (v:string)=>void; onSave: ()=>void; inputClass: string;
}> = ({ label, iconColor, field, value, isEditing, input, onStartEdit, onChange, onSave, inputClass }) => (
  <div className="flex items-center gap-2 font-medium text-xs">
    <i className={`fas fa-coins ${iconColor}`}></i>
    {isEditing ? (
      <input autoFocus type="number" value={input} onChange={e=>onChange(e.target.value)} onBlur={onSave} onKeyDown={e=>e.key==='Enter'&&onSave()} className={`bg-stone-950 border rounded px-2 py-0.5 outline-none w-16 ${inputClass}`} />
    ) : (
      <span onClick={onStartEdit} className="cursor-pointer hover:opacity-80">{value} {label}</span>
    )}
  </div>
);

/** Full inventory management panel including item listing, equip/use actions, currency editing, and item tooltips. */
const InventoryPanel: React.FC<InventoryPanelProps> = ({ character, onUpdateInventory, onUpdateCurrency, onTriggerDiceRoll, onSendMessage }) => {
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
    <div className="space-y-3">
      <div className="flex justify-between items-center border-b border-stone-800 pb-1">
        <h3 className="text-lg font-bold text-stone-300 uppercase tracking-tighter">Inventory</h3>
        <button onClick={()=>setIsAdding(true)} className="text-amber-600 hover:text-amber-500 transition-colors text-xs"><i className="fas fa-plus-circle mr-1"></i> Add</button>
      </div>
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
      {renderItemTooltip()}
    </div>
  );
};

export default InventoryPanel;
