import React, { useState, useEffect } from 'react';

// Basic text input
const Input = ({ value, onChange, className = "", placeholder, readOnly = false }) => (
  <input
    value={value || ''}
    onChange={e => onChange && !readOnly && onChange(e.target.value)}
    className={`outline-none bg-transparent text-center font-mono text-black ${className} ${readOnly ? 'cursor-default' : ''}`}
    spellCheck={false}
    placeholder={placeholder}
    readOnly={readOnly}
  />
);

// Circle toggling A / B
const ABCircle = ({ value, onChange, size = 24 }) => (
  <div
    onClick={() => {
      if (!onChange) return;
      if (!value) onChange('A');
      else if (value === 'A') onChange('B');
      else onChange('');
    }}
    className="rounded-full border border-black flex items-center justify-center cursor-pointer font-bold bg-white hover:bg-gray-50 select-none text-black"
    style={{ width: size, height: size, fontSize: size * 0.5 }}
  >
    {value || ''}
  </div>
);

// Outcome selector
const OutcomeSelector = ({ value, onChange, isRefRequest = false }) => {
  const teamOutcomes = ['', 'UNSUC', 'SUC', 'MUNAV'];
  const refOutcomes = ['', 'IN', 'OUT', 'MUNAV'];
  const outcomes = isRefRequest ? refOutcomes : teamOutcomes;

  return (
    <div
      onClick={() => {
        if (!onChange) return;
        const currentIndex = outcomes.indexOf(value || '');
        const nextIndex = (currentIndex + 1) % outcomes.length;
        onChange(outcomes[nextIndex]);
      }}
      className="border border-black flex items-center justify-center cursor-pointer bg-white hover:bg-gray-50 select-none text-black font-mono text-[9px] w-full h-5 px-0.5"
    >
      {value || '-'}
    </div>
  );
};

export default function BMPSheet({ matchData }) {
  const [data, setData] = useState({});
  const [dataInitialized, setDataInitialized] = useState(false);

  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const get = (k) => data[k];

  // Initialize data from matchData
  useEffect(() => {
    if (matchData && !dataInitialized) {
      const { match } = matchData;
      const team1Team = matchData.team1Team || matchData.team_1Team;
      const team2Team = matchData.team2Team || matchData.team_2Team;
      const team1Players = matchData.team1Players || matchData.team_1Players || [];
      const team2Players = matchData.team2Players || matchData.team_2Players || [];

      if (match) {
        // Event/Competition name
        if (match.eventName) set('event', match.eventName);
        else if (match.league) set('event', match.league);

        // Match number
        if (match.matchNumber) set('match_no', String(match.matchNumber));

        // Date
        if (match.date) {
          const d = new Date(match.date);
          set('date', d.toLocaleDateString('en-GB')); // DD/MM/YYYY format
        }

        // Phase - format nicely
        const phaseValue = match.matchPhase || match.phase || '';
        const formattedPhase = phaseValue
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        set('phase', formattedPhase);

        // Gender
        const genderValue = match.matchGender || match.gender;
        if (genderValue === 'men') set('gender', 'Men');
        else if (genderValue === 'women') set('gender', 'Women');
      }

      // Team names with country codes
      const formatTeamName = (team, players) => {
        if (!team && (!players || players.length === 0)) return '';

        const countryCode = team?.countryCode || players?.[0]?.countryCode || '';
        const playerNames = players?.map(p => p.lastName || p.name || '').filter(Boolean).join('/') || '';

        if (playerNames && countryCode) {
          return `${playerNames} (${countryCode})`;
        } else if (playerNames) {
          return playerNames;
        } else if (team?.name) {
          return countryCode ? `${team.name} (${countryCode})` : team.name;
        }
        return '';
      };

      set('team_a', formatTeamName(team1Team, team1Players));
      set('team_b', formatTeamName(team2Team, team2Players));

      setDataInitialized(true);
    }
  }, [matchData, dataInitialized]);

  const NUM_BMP_ROWS = 16;
  
  // Common cell style - 10 columns = 10% each
  const cellStyle = { 
    width: '10%', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center' 
  };

  return (
    <div className="bg-gray-300 min-h-screen p-2 flex items-start justify-center overflow-auto">
      {/* A4 Landscape: 297mm x 210mm */}
      <div 
        className="bg-white shadow-xl flex flex-col"
        style={{ 
          width: '297mm', 
          minWidth: '297mm',
          height: '210mm', 
          minHeight: '210mm',
          padding: '6mm',
          boxSizing: 'border-box',
          fontFamily: 'Arial, sans-serif',
          overflow: 'hidden'
        }}
      >
        {/* TITLE */}
        <div className="text-center mb-2">
          <h1 className="text-lg font-bold text-black">Ball Mark Protocol Remark Form</h1>
          <div className="text-[9px] text-gray-600">(complementary to Scoresheet)</div>
        </div>

        {/* EVENT INFO */}
        <div className="border-2 border-black mb-2">
          <div className="flex border-b border-black">
            <div className="flex items-center px-2 py-1 flex-1 border-r border-black">
              <span className="font-bold mr-2 text-[10px]">EVENT:</span>
              <Input value={get('event')} onChange={v => set('event', v)} className="flex-1 text-left text-[10px] border-b border-dotted border-gray-400" />
            </div>
            <div className="flex items-center px-2 py-1 w-36">
              <span className="font-bold mr-2 text-[10px]">DATE:</span>
              <Input value={get('date')} onChange={v => set('date', v)} className="flex-1 text-center text-[10px] border-b border-dotted border-gray-400" />
            </div>
          </div>
          
          <div className="flex text-[10px]">
            <div className="flex items-center px-2 py-1 border-r border-black">
              <span className="font-bold mr-1">MATCH NO:</span>
              <Input value={get('match_no')} onChange={v => set('match_no', v)} className="w-12 text-center text-[10px] border-b border-dotted border-gray-400" />
            </div>
            <div className="flex items-center px-2 py-1 border-r border-black">
              <span className="font-bold mr-1">PHASE:</span>
              <Input value={get('phase')} onChange={v => set('phase', v)} className="w-16 text-center text-[10px] border-b border-dotted border-gray-400" />
            </div>
            <div className="flex items-center px-2 py-1 border-r border-black">
              <span className="font-bold mr-1">GENDER:</span>
              <Input value={get('gender')} onChange={v => set('gender', v)} className="w-10 text-center text-[10px] border-b border-dotted border-gray-400" />
            </div>
            <div className="flex items-center px-2 py-1 border-r border-black flex-1">
              <span className="font-bold mr-1">TEAM A:</span>
              <Input value={get('team_a')} onChange={v => set('team_a', v)} className="flex-1 text-center text-[10px] border-b border-dotted border-gray-400" />
            </div>
            <div className="flex items-center px-2 py-1 flex-1">
              <span className="font-bold mr-1">TEAM B:</span>
              <Input value={get('team_b')} onChange={v => set('team_b', v)} className="flex-1 text-center text-[10px] border-b border-dotted border-gray-400" />
            </div>
          </div>
        </div>

        {/* SECTION TITLE */}
        <div className="bg-gray-100 border-2 border-black px-2 py-1 text-center font-bold text-[10px]">
          During the match
        </div>

        {/* BMP TABLE - Takes remaining space */}
        <div className="border-2 border-t-0 border-black flex-1 flex flex-col">
          {/* Header - 10 equal columns */}
          <div className="flex bg-gray-50 border-b-2 border-black text-[8px] font-bold">
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Start<br/>time</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              Set
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Score at time<br/>of BMP request</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Team<br/>serving (at time of request)</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Request by<br/>(A / B / Ref)</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">BMP request<br/>Outcome</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Team<br/>serving (after decision)</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Score after<br/>decision</div>
            </div>
            <div style={cellStyle} className="border-r border-black py-2">
              <div className="text-center leading-tight">Time match<br/>resumed</div>
            </div>
            <div style={cellStyle} className="py-2">
              Duration
            </div>
          </div>
          
          {/* Rows - 16 rows, no row numbers */}
          <div className="flex-1 flex flex-col">
            {Array.from({ length: NUM_BMP_ROWS }).map((_, i) => (
              <div key={i} className={`flex text-[9px] flex-1 min-h-0 ${i < NUM_BMP_ROWS - 1 ? 'border-b border-black' : ''}`}>
                <div style={cellStyle} className="border-r border-black">
                  <Input value={get(`bmp_${i}_start`)} onChange={v => set(`bmp_${i}_start`, v)} className="w-full h-full text-[9px]" />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <Input value={get(`bmp_${i}_set`)} onChange={v => set(`bmp_${i}_set`, v)} className="w-full h-full text-[9px]" />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <Input value={get(`bmp_${i}_score_a`)} onChange={v => set(`bmp_${i}_score_a`, v)} className="w-8 text-[9px] text-right" />
                  <span className="mx-0.5 text-[9px]">:</span>
                  <Input value={get(`bmp_${i}_score_b`)} onChange={v => set(`bmp_${i}_score_b`, v)} className="w-8 text-[9px] text-left" />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <ABCircle value={get(`bmp_${i}_serving1`)} onChange={v => set(`bmp_${i}_serving1`, v)} size={18} />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <Input value={get(`bmp_${i}_request`)} onChange={v => set(`bmp_${i}_request`, v)} className="w-full h-full text-[9px]" />
                </div>
                <div style={cellStyle} className="border-r border-black px-1">
                  <OutcomeSelector 
                    value={get(`bmp_${i}_outcome`)} 
                    onChange={v => set(`bmp_${i}_outcome`, v)} 
                    isRefRequest={get(`bmp_${i}_request`)?.toLowerCase()?.includes('ref')} 
                  />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <ABCircle value={get(`bmp_${i}_serving2`)} onChange={v => set(`bmp_${i}_serving2`, v)} size={18} />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <Input value={get(`bmp_${i}_score2_a`)} onChange={v => set(`bmp_${i}_score2_a`, v)} className="w-8 text-[9px] text-right" />
                  <span className="mx-0.5 text-[9px]">:</span>
                  <Input value={get(`bmp_${i}_score2_b`)} onChange={v => set(`bmp_${i}_score2_b`, v)} className="w-8 text-[9px] text-left" />
                </div>
                <div style={cellStyle} className="border-r border-black">
                  <Input value={get(`bmp_${i}_resumed`)} onChange={v => set(`bmp_${i}_resumed`, v)} className="w-full h-full text-[9px]" />
                </div>
                <div style={cellStyle}>
                  <Input value={get(`bmp_${i}_duration`)} onChange={v => set(`bmp_${i}_duration`, v)} className="w-full h-full text-[9px]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SIGNATURES */}
        <div className="flex gap-4 mt-2">
          <div className="flex-1 border-2 border-black">
            <div className="bg-gray-100 border-b border-black px-2 py-1 font-bold text-[9px]">Scorer's signature</div>
            <div className="h-8 p-1">
              <Input value={get('scorer_sig')} onChange={v => set('scorer_sig', v)} className="w-full h-full text-left text-[10px]" />
            </div>
          </div>
          <div className="flex-1 border-2 border-black">
            <div className="bg-gray-100 border-b border-black px-2 py-1 font-bold text-[9px]">First Referee's signature</div>
            <div className="h-8 p-1">
              <Input value={get('ref_sig')} onChange={v => set('ref_sig', v)} className="w-full h-full text-left text-[10px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
