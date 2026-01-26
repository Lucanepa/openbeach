import React from 'react';

// Basic text input
export const Input = ({ 
  value, 
  onChange, 
  className = "", 
  style = {},
  placeholder,
  readOnly = false
}: { 
  value?: string; 
  onChange?: (val: string) => void; 
  className?: string; 
  style?: React.CSSProperties;
  placeholder?: string;
  readOnly?: boolean;
}) => (
  <input
    value={value || ''}
    onChange={e => onChange && !readOnly && onChange(e.target.value)}
    className={`outline-none bg-transparent text-center font-mono text-black ${className} ${readOnly ? 'cursor-default' : ''}`}
    style={style}
    spellCheck={false}
    placeholder={placeholder}
    readOnly={readOnly}
  />
);

// Box that toggles 'X'
export const XBox = ({ 
  checked, 
  onChange, 
  size = 14, 
  className = "" 
}: { 
  checked?: boolean; 
  onChange?: (val: boolean) => void; 
  size?: number; 
  className?: string; 
}) => (
  <div
    onClick={() => onChange && onChange(!checked)}
    className={`border border-black flex items-center justify-center cursor-pointer bg-white hover:bg-gray-50 text-black ${className}`}
    style={{ width: size, height: size, fontSize: size - 2, lineHeight: 1 }}
  >
    {checked ? 'X' : ''}
  </div>
);

// Circle toggling A / B
export const ABCircle = ({ 
  value, 
  onChange,
  size = 24,
  className = ""
}: { 
  value?: string; 
  onChange?: (val: string) => void; 
  size?: number;
  className?: string;
}) => (
  <div
    onClick={() => {
      if (!onChange) return;
      if (!value) onChange('A');
      else if (value === 'A') onChange('B');
      else onChange('');
    }}
    className={`rounded-full border border-black flex items-center justify-center cursor-pointer font-bold bg-white hover:bg-gray-50 select-none text-black ${className}`}
    style={{ width: size, height: size, fontSize: size * 0.6 }}
  >
    {value || ''}
  </div>
);

// Score Input Pair (Input : Input)
export const ScoreInputPair = ({ 
  valA, valB, onChangeA, onChangeB, className = "" 
}: { 
  valA?: string, valB?: string, onChangeA: (v: string) => void, onChangeB: (v: string) => void, className?: string 
}) => (
  <div className={`flex items-center justify-center w-full h-full ${className}`}>
    <Input value={valA} onChange={onChangeA} className="w-1/2 h-full text-[8px] text-right pr-0.5" />
    <span className="text-[8px] leading-none">:</span>
    <Input value={valB} onChange={onChangeB} className="w-1/2 h-full text-[8px] text-left pl-0.5" />
  </div>
);

// Point Cell (1-44)
// States: null -> 'slash' -> 'circle' -> null
export const PointCell = ({ num, value, onClick }: { num: number, value: string, onClick: () => void }) => (
  <div onClick={onClick} className="relative flex items-center justify-center h-full w-full cursor-pointer select-none group">
    {/* Unbolded number */}
    <span className="z-10 text-[9px] text-black font-normal">{num}</span>
    
    {/* Slash: Bottom-Left to Top-Right (-45deg) */}
    {value === 'slash' && (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <div className="w-[140%] h-[1px] bg-black -rotate-45 transform origin-center"></div>
      </div>
    )}
    
    {/* Circle: Perfect circle */}
    {value === 'circle' && (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <div className="h-[98%] aspect-square rounded-full border border-black"></div>
      </div>
    )}
  </div>
);

