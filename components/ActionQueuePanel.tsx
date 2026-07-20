import React, { useState } from 'react';
import { QueuedAction } from '../types';

interface ActionQueuePanelProps {
  queue: QueuedAction[];
  userId?: string;
  onRemove: (id: string) => void;
  onUpdate?: (id: string, text: string) => void;
  onReorder?: (newQueue: QueuedAction[]) => void;
  onExecute: () => void;
  isProcessing?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DragIndicator = () => <div className="h-0.5 bg-amber-500 rounded-full mx-2 my-0.5 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.5)]" />;

const EmptyState = () => (
  <div className="h-full flex flex-col items-center justify-center text-stone-600 gap-2 opacity-50 min-h-[100px]">
    <i className="fas fa-hourglass-start text-2xl" /><span className="text-xs uppercase font-bold tracking-wider">Queue is empty</span>
  </div>
);

const ActionQueuePanel: React.FC<ActionQueuePanelProps> = ({
  queue, userId, onRemove, onUpdate, onReorder, onExecute, isProcessing, isCollapsed = false, onToggleCollapse
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx || !onReorder) return;
    const nq = [...queue], [item] = nq.splice(draggedIdx, 1);
    nq.splice(idx, 0, item);
    onReorder(nq);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => { setDraggedIdx(null); setDragOverIdx(null); };

  return (
    <div className={`flex flex-col bg-stone-900/50 rounded-lg border border-stone-800 overflow-hidden transition-all duration-300 ${isCollapsed?'h-auto':'h-full'} ${queue.length>0?'animate-glow-pulse':''}`}>
      <div className={`p-3 border-b border-stone-800 bg-stone-950/80 backdrop-blur flex justify-between items-center ${onToggleCollapse?'cursor-pointer hover:bg-stone-900 transition-colors':''}`} onClick={onToggleCollapse}>
        <div className="flex items-center gap-3">
          {onToggleCollapse && <i className={`fas fa-chevron-down text-stone-500 transition-transform duration-300 ${isCollapsed?'-rotate-90':'rotate-0'}`} />}
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
            <i className="fas fa-layer-group text-amber-600" />Action Queue<span className="bg-stone-800 text-stone-300 px-1.5 rounded text-[10px]">{queue.length}</span>
          </h3>
        </div>
      </div>
      {!isCollapsed && <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {queue.length === 0 ? <EmptyState /> : queue.map((item, idx) => {
          const isOwner = userId && item.playerId === userId, isEditing = editingId === item.id;
          return <React.Fragment key={item.id}>
            {draggedIdx !== null && dragOverIdx === idx && draggedIdx !== idx && <DragIndicator />}
            <div draggable={!isProcessing&&!editingId} onDragStart={e=>{setDraggedIdx(idx);e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOverIdx(idx);}} onDragLeave={()=>setDragOverIdx(null)} onDrop={e=>handleDrop(e,idx)} onDragEnd={handleDragEnd} className={`relative group p-3 rounded-lg border border-stone-800/50 ${isOwner?'bg-amber-950/10 border-amber-900/20':'bg-stone-950'} transition-all hover:border-stone-700 ${draggedIdx!==null&&'cursor-grabbing'}`} onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-2 min-w-0 w-full">
                <div className="text-stone-700 cursor-move opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to reorder"><i className="fas fa-grip-vertical text-xs" /></div>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${item.type==='action'?'bg-red-900/30 text-red-500':'bg-cyan-900/30 text-cyan-500'}`}><i className={`fas ${item.type==='action'?'fa-dice-d20':'fa-comment-alt'}`} /></div>
                <div className="flex flex-col min-w-0 w-full">
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider truncate mb-1">{item.playerName}</span>
                  {isEditing ? <div className="flex flex-col gap-2">
                    <textarea value={editText} onChange={e=>setEditText(e.target.value)} className="w-full bg-stone-900 text-stone-200 text-sm p-2 rounded border border-amber-900/50 focus:outline-none focus:border-amber-600 resize-none font-serif" rows={2} autoFocus onClick={e=>e.stopPropagation()} />
                    <div className="flex gap-2 justify-end">
                      <button onClick={()=>setEditingId(null)} className="px-2 py-1 text-[10px] uppercase font-bold text-stone-500 hover:text-stone-300 transition-colors">Cancel</button>
                      <button onClick={()=>{if(editingId&&onUpdate){onUpdate(editingId,editText);setEditingId(null);}}} className="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] uppercase font-bold transition-colors">Save</button>
                    </div>
                  </div> : <p className="text-stone-300 text-sm leading-tight break-words font-serif">{item.type==='dialogue'&&<span className="text-stone-500">"</span>}{item.text}{item.type==='dialogue'&&<span className="text-stone-500">"</span>}</p>}
                </div>
              </div>
              {isOwner && !isProcessing && !isEditing && <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={()=>{setEditingId(item.id);setEditText(item.text);}} className="p-1.5 text-stone-600 hover:text-amber-500 hover:bg-stone-800 rounded transition-all" title="Edit"><i className="fas fa-pencil-alt text-xs" /></button>
                <button onClick={()=>onRemove(item.id)} className="p-1.5 text-stone-600 hover:text-red-500 hover:bg-red-950/30 rounded transition-all" title="Remove"><i className="fas fa-times text-xs" /></button>
              </div>}
            </div>
          </div>
          </React.Fragment>;
        })}
        {draggedIdx !== null && dragOverIdx === queue.length && <DragIndicator />}
      </div>}
      {!isCollapsed && queue.length > 0 && (
        <div className="p-2.5 border-t border-stone-800 bg-stone-950/60 flex justify-end">
          <button onClick={e=>{e.stopPropagation();onExecute();}} disabled={isProcessing} className={`w-full py-2 text-xs uppercase font-bold tracking-widest rounded flex items-center justify-center gap-2 transition-all ${isProcessing?'bg-stone-800 text-stone-600 cursor-not-allowed':'bg-green-700 hover:bg-green-600 text-green-100 shadow-lg shadow-green-900/20'}`}>
            {isProcessing ? <><i className="fas fa-spinner fa-spin" /> Processing...</> : <><i className="fas fa-play" /> Run All Action Items</>}
          </button>
        </div>
      )}
    </div>
  );
};

export default ActionQueuePanel;
