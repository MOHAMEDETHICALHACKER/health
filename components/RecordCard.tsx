
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
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center space-x-3">
          <span className="text-indigo-600 text-lg">{icon}</span>
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        {onAdd && (
          <button 
            onClick={onAdd}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            + ADD NEW
          </button>
        )}
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
};

export default RecordCard;
