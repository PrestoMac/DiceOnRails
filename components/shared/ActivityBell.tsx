import React from 'react';

/** Props for the ActivityBell component. */
interface ActivityBellProps {
  activities: string[];
}

/** Bell icon with a badge count and a hover tooltip listing recent party activities. */
const ActivityBell: React.FC<ActivityBellProps> = ({ activities }) => {
  if (!activities.length) return null;
  return (
    <div className="relative group">
      <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-500 border-2 border-stone-950 animate-pulse z-10 flex items-center justify-center">
        <span className="text-[8px] font-bold text-stone-950">{activities.length}</span>
      </div>
      <div className="opacity-0 group-hover:opacity-100 absolute top-full right-0 mt-2 w-56 bg-stone-900 border border-stone-700 rounded-lg shadow-2xl p-2 z-50 transition-opacity duration-200 pointer-events-none">
        {activities.map((a, i) => <div key={i} className="text-[10px] text-stone-300 px-2 py-1 truncate">{a}</div>)}
      </div>
      <div className="p-1.5 hover:bg-stone-900 rounded-lg text-stone-500 hover:text-amber-500 transition-colors cursor-default" title="Recent party activity">
        <i className="fas fa-bell text-sm" />
      </div>
    </div>
  );
};

export default ActivityBell;
