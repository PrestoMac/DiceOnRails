import React from 'react';

interface AdjBtnProps {
  onClick: () => void;
  disabled?: boolean;
}

const AdjBtn: React.FC<AdjBtnProps> = ({ onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} className="w-7 h-7 flex items-center justify-center rounded bg-stone-800 hover:bg-red-950 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-stone-400 hover:text-red-400 text-xs border border-stone-700"><i className="fas fa-minus text-[9px]"></i></button>
);

export default AdjBtn;
