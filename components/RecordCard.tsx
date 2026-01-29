
import React from 'react';

interface RecordCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onAdd?: () => void;
  className?: string;
}

const RecordCard: React.FC<RecordCardProps> = ({ title, icon, children, onAdd, className = "" }) => {
  return (
    <div className={`bg-white rounded-[2.5rem] shadow-[0_4px_25px_-5px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-[0_25px_50px_-15px_rgba(0,0,0,0.08)] flex flex-col ${className}`}>
      <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/40">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-[0_4px_10px_-2px_rgba(0,0,0,0.05)] border border-slate-100 flex items-center justify-center text-indigo-600 text-xl transition-transform group-hover:scale-110">
            {icon}
          </div>
          <h3 className="font-black text-slate-800 tracking-[0.05em] uppercase text-[11px]">{title}</h3>
        </div>
        {onAdd && (
          <button 
            onClick={onAdd}
            className="text-[10px] font-black text-indigo-600 hover:text-white transition-all bg-indigo-50 hover:bg-indigo-600 px-5 py-2.5 rounded-2xl uppercase tracking-[0.1em] flex items-center gap-2 group"
          >
            <i className="fas fa-plus-circle text-sm group-hover:rotate-90 transition-transform"></i>
            Add Record
          </button>
        )}
      </div>
      <div className="p-8 flex-grow">
        {children}
      </div>
    </div>
  );
};

export default RecordCard;
