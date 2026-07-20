import React from 'react';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
  done?: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, children, done }) => (
  <button onClick={onClick} className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-wider rounded-md transition-all flex items-center justify-center gap-2 ${active ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'text-stone-500 hover:text-stone-300'}`}>
    {icon && <i className={`fas ${icon} text-[10px]`}></i>}{children}{done && <i className="fas fa-check text-green-500 text-[8px]"></i>}
  </button>
);

export default TabButton;
