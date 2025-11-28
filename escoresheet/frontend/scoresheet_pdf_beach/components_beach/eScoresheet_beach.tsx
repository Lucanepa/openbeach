import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// --- Shared Components ---

// Basic text input
const Input = ({ 
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
const XBox = ({ 
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
const ABCircle = ({ 
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
const ScoreInputPair = ({ 
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
const PointCell = ({ num, value, onClick }: { num: number, value: string, onClick: () => void }) => (
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
         <div className="h-[80%] aspect-square rounded-full border border-black"></div>
      </div>
    )}
  </div>
);

export default function OpenbeachScoresheet({ matchData }: { matchData?: any }) {
  const [data, setData] = useState<Record<string, any>>({});
  const [dataInitialized, setDataInitialized] = useState(false);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  
  const set = (k: string, v: any) => setData(p => ({ ...p, [k]: v }));
  const get = (k: string) => data[k];

  // Initialize data from matchData (only for non-test matches, completely offline)
  useEffect(() => {
    // Only initialize if matchData exists and is not a test match
    if (matchData && !dataInitialized && matchData.match && matchData.match.test !== true) {
      const { match, homeTeam, awayTeam, sets, events, homePlayers, awayPlayers } = matchData;
      
      if (match) {
        // Match header info
        if (match.league) set('competition', match.league);
        if (match.externalId) set('match_no', match.externalId);
        if (match.city) set('site', match.city);
        if (match.hall) set('beach', match.hall);
        if (match.court) set('court', String(match.court));
        
        // Date
        if (match.scheduledAt) {
          const date = new Date(match.scheduledAt);
          set('date_d', String(date.getDate()).padStart(2, '0'));
          set('date_m', String(date.getMonth() + 1).padStart(2, '0'));
          set('date_y', String(date.getFullYear()).slice(-2));
        }
        
        // Match ID
        if (match.id) set('match_id', match.id);
      }
      
      // Teams
      if (homeTeam) {
        set('t1_name', homeTeam.name || '');
        set('t1_country', homeTeam.country || '');
        set('b_t1_country', homeTeam.country || '');
      }
      if (awayTeam) {
        set('t2_name', awayTeam.name || '');
        set('t2_country', awayTeam.country || '');
        set('b_t2_country', awayTeam.country || '');
      }
      
      // Players (for Set 1 starting lineup)
      if (homePlayers && homePlayers.length >= 2) {
        set('b_t1_p1_no', String(homePlayers[0]?.number || ''));
        set('b_t1_p1_name', `${homePlayers[0]?.firstName || ''} ${homePlayers[0]?.lastName || ''}`.trim());
        set('b_t1_p2_no', String(homePlayers[1]?.number || ''));
        set('b_t1_p2_name', `${homePlayers[1]?.firstName || ''} ${homePlayers[1]?.lastName || ''}`.trim());
      }
      if (awayPlayers && awayPlayers.length >= 2) {
        set('b_t2_p1_no', String(awayPlayers[0]?.number || ''));
        set('b_t2_p1_name', `${awayPlayers[0]?.firstName || ''} ${awayPlayers[0]?.lastName || ''}`.trim());
        set('b_t2_p2_no', String(awayPlayers[1]?.number || ''));
        set('b_t2_p2_name', `${awayPlayers[1]?.firstName || ''} ${awayPlayers[1]?.lastName || ''}`.trim());
      }
      
      // Sets data
      if (sets && Array.isArray(sets)) {
        sets.forEach((set: any, index: number) => {
          const setNum = index + 1;
          const prefix = setNum === 1 ? 's1' : setNum === 2 ? 's2' : 's3';
          
          // Set start/end times
          if (set.startTime) {
            const start = new Date(set.startTime);
            set(`${prefix}_start_hh`, String(start.getHours()).padStart(2, '0'));
            set(`${prefix}_start_mm`, String(start.getMinutes()).padStart(2, '0'));
          }
          if (set.endTime) {
            const end = new Date(set.endTime);
            set(`${prefix}_end_hh`, String(end.getHours()).padStart(2, '0'));
            set(`${prefix}_end_mm`, String(end.getMinutes()).padStart(2, '0'));
          }
          
          // Set sides (A/B) - determine from match data
          // For Set 1, home team is typically on side A
          if (setNum === 1) {
            set('t1_side', 'A');
            set('t2_side', 'B');
            set('b_t1_side', 'A');
            set('b_t2_side', 'B');
          } else if (setNum === 2) {
            // For Set 2, teams typically switch sides
            set('b_t1_side', 'B');
            set('b_t2_side', 'A');
          }
          
          // Set scores (will be filled from events/points)
          // Note: Individual point tracking would require parsing events
        });
      }
      
      // Results section - calculate from finished sets
      if (sets && Array.isArray(sets)) {
        const finishedSets = sets.filter((s: any) => s.finished);
        finishedSets.forEach((set: any, index: number) => {
          const setNum = index + 1;
          if (setNum <= 3) {
            // Set scores
            const homePoints = set.homePoints || 0;
            const awayPoints = set.awayPoints || 0;
            set(`res_s${setNum}_p_a`, String(homePoints));
            set(`res_s${setNum}_p_b`, String(awayPoints));
            
            // Set wins (1 if team won, 0 if lost)
            set(`res_s${setNum}_w_a`, homePoints > awayPoints ? '1' : '0');
            set(`res_s${setNum}_w_b`, awayPoints > homePoints ? '1' : '0');
            
            // Set duration (calculate from start/end times)
            if (set.startTime && set.endTime) {
              const start = new Date(set.startTime);
              const end = new Date(set.endTime);
              const duration = Math.round((end.getTime() - start.getTime()) / 60000); // minutes
              set(`res_s${setNum}_dur`, String(duration));
            }
          }
        });
        
        // Total
        const totalHome = finishedSets.reduce((sum: number, s: any) => sum + (s.homePoints || 0), 0);
        const totalAway = finishedSets.reduce((sum: number, s: any) => sum + (s.awayPoints || 0), 0);
        const totalHomeWins = finishedSets.filter((s: any) => (s.homePoints || 0) > (s.awayPoints || 0)).length;
        const totalAwayWins = finishedSets.filter((s: any) => (s.awayPoints || 0) > (s.homePoints || 0)).length;
        set('res_tot_p_a', String(totalHome));
        set('res_tot_p_b', String(totalAway));
        set('res_tot_w_a', String(totalHomeWins));
        set('res_tot_w_b', String(totalAwayWins));
        
        // Total duration (already calculated above in match duration)
        if (finishedSets.length > 0) {
          const resFirstSet = finishedSets[0];
          const resLastSet = finishedSets[finishedSets.length - 1];
          if (resFirstSet?.startTime && resLastSet?.endTime) {
            const resStart = new Date(resFirstSet.startTime);
            const resEnd = new Date(resLastSet.endTime);
            const resTotalMinutes = Math.round((resEnd.getTime() - resStart.getTime()) / 60000);
            set('res_tot_dur', String(resTotalMinutes));
          }
        }
        
        // Match duration and times
        if (finishedSets.length > 0) {
          const matchFirstSet = finishedSets[0];
          const matchLastSet = finishedSets[finishedSets.length - 1];
          
          if (matchFirstSet?.startTime && matchLastSet?.endTime) {
            const matchStart = new Date(matchFirstSet.startTime);
            const matchEnd = new Date(matchLastSet.endTime);
            const totalMinutes = Math.round((matchEnd.getTime() - matchStart.getTime()) / 60000);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            set('match_dur_h', String(hours));
            set('match_dur_m', String(minutes));
            
            // Match start/end times
            set('match_start_h', String(matchStart.getHours()).padStart(2, '0'));
            set('match_start_m', String(matchStart.getMinutes()).padStart(2, '0'));
            set('match_end_h', String(matchEnd.getHours()).padStart(2, '0'));
            set('match_end_m', String(matchEnd.getMinutes()).padStart(2, '0'));
          }
        }
        
        // Winner
        const homeSetsWon = finishedSets.filter((s: any) => s.homePoints > s.awayPoints).length;
        const awaySetsWon = finishedSets.filter((s: any) => s.awayPoints > s.homePoints).length;
        if (homeSetsWon > awaySetsWon && homeTeam) {
          set('winner_name', homeTeam.name || '');
          set('winner_country', homeTeam.country || '');
        } else if (awaySetsWon > homeSetsWon && awayTeam) {
          set('winner_name', awayTeam.name || '');
          set('winner_country', awayTeam.country || '');
        }
      }
      
      // Officials (from match.officials if available)
      if (match?.officials) {
        const officials = typeof match.officials === 'string' ? JSON.parse(match.officials) : match.officials;
        if (officials) {
          if (officials.referee1) {
            set('ref1_name', officials.referee1.name || '');
            set('ref1_country', officials.referee1.country || '');
          }
          if (officials.referee2) {
            set('ref2_name', officials.referee2.name || '');
            set('ref2_country', officials.referee2.country || '');
          }
          if (officials.scorer) {
            set('scorer_name', officials.scorer.name || '');
            set('scorer_country', officials.scorer.country || '');
          }
          if (officials.assistantScorer) {
            set('asst_scorer_name', officials.assistantScorer.name || '');
            set('asst_scorer_country', officials.assistantScorer.country || '');
          }
          if (officials.lineJudges && Array.isArray(officials.lineJudges)) {
            officials.lineJudges.forEach((lj: any, idx: number) => {
              if (idx < 4) {
                set(`lj${idx + 1}`, lj.name || '');
              }
            });
          }
        }
      }
      
      setDataInitialized(true);
    }
  }, [matchData, dataInitialized]);

  const handleSavePDF = async () => {
    if (!page1Ref.current || !page2Ref.current) {
      alert('Pages not ready');
      return;
    }

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Helper function to fix flex alignment in cloned document for html2canvas
      const fixFlexAlignment = (clonedDoc: Document, pageId: string) => {
        const page = clonedDoc.querySelector(`#${pageId}`) as HTMLElement;
        if (!page) return;

        // Find all flex containers and convert them to use line-height or padding for centering
        const allElements = page.querySelectorAll('*');
        allElements.forEach((el) => {
          const element = el as HTMLElement;
          const computed = clonedDoc.defaultView?.getComputedStyle(element);
          if (!computed) return;
          
          const display = computed.display;
          const alignItems = computed.alignItems;
          
          // Fix flex containers with vertical centering
          if ((display === 'flex' || display === 'inline-flex') && alignItems === 'center') {
            const height = element.offsetHeight;
            
            // Check if element has only text content (no child elements or just one text node)
            const hasOnlyText = element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE;
            const hasSingleChild = element.children.length === 1 && !element.querySelector('br');
            
            if (hasOnlyText && height > 0) {
              // For pure text, use line-height
              element.style.display = 'block';
              element.style.lineHeight = `${height}px`;
              element.style.textAlign = 'center';
            } else if (hasSingleChild && height > 0) {
              // For single child, calculate padding
              const child = element.children[0] as HTMLElement;
              const childHeight = child.offsetHeight;
              const paddingTop = Math.max(0, (height - childHeight) / 2);
              element.style.paddingTop = `${paddingTop}px`;
              element.style.boxSizing = 'border-box';
              element.style.display = 'block';
              element.style.textAlign = 'center';
            }
          }
        });
        
        page.style.transform = 'none';
        page.style.position = 'relative';
      };

      // Capture Page 1
      const canvas1 = await html2canvas(page1Ref.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => fixFlexAlignment(clonedDoc, 'page-1')
      });
      const imgData1 = canvas1.toDataURL('image/png', 1.0);
      pdf.addImage(imgData1, 'PNG', 0, 0, 297, 210);

      // Add Page 2
      pdf.addPage();
      const canvas2 = await html2canvas(page2Ref.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => fixFlexAlignment(clonedDoc, 'page-2')
      });
      const imgData2 = canvas2.toDataURL('image/png', 1.0);
      pdf.addImage(imgData2, 'PNG', 0, 0, 297, 210);

      // Save PDF
      // Create a file name using matchid, team names, and date (YYMMDD)
      const matchid = get('match_id') || 'match';
      const t1 = (get('t1_name') || 'TeamA').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      const t2 = (get('t2_name') || 'TeamB').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      // Use 2-digit year if possible, fallback to 'YY'
      const yy = (get('date_y') && get('date_y').length === 2 ? get('date_y') : 'YY');
      const mm = (get('date_m') && get('date_m').padStart(2, '0')) || 'MM';
      const dd = (get('date_d') && get('date_d').padStart(2, '0')) || 'DD';
      const fileName = `${matchid}_${t1}_vs_${t2}_${yy}${mm}${dd}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };


  // --- Layout Constants ---
  const W_COL_STD = "w-9"; // Standard column width (approx 36px)
  
  // Columns 1-7 now all same width
  const W_COL1 = W_COL_STD; 
  const W_COL2 = W_COL_STD; 
  const W_COL3 = W_COL_STD; 
  const W_COL4 = W_COL_STD; 
  const W_COL5 = W_COL_STD; 
  const W_COL6 = W_COL_STD; 
  const W_COL7 = W_COL_STD; // Disq column now same as others

  // Height constants - adjusted for A4 landscape filling
  const H_HEADER_ROW = "h-5"; 
  const H_INPUT_ROW = "h-5";

  // Inline styles for centering - the onclone function in handleSavePDF will fix these for html2canvas
  const centerStyle: React.CSSProperties = { 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center'
  };
  const centerStyleCol: React.CSSProperties = { 
    display: 'flex', 
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center'
  };  

  // --- Render Helpers ---

  // 1. Header Row
  const renderHeaderRow = (setNum: number, prefix: string) => {
    const label = setNum === 1 ? "1st" : setNum === 2 ? "2nd" : "3rd";
    return (
      <div className="flex border-b border-black text-black">
        {/* Left Block */}
        <div className="flex h-10">
            <div className={`${W_COL1} border-r border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
                service<br/>order
            </div>
            <div className={`${W_COL2} border-r border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
                player<br/>no.
            </div>
            <div className={`${W_COL3} border-r border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
                Formal<br/>Warn.
            </div>
        </div>

        {/* Right Block */}
        <div className="flex-1 flex h-10">
            {/* Group 1: Misconduct Sanctions (Columns 4,5,6,7) */}
            <div className="flex flex-col flex-none">
                 {/* Title */}
                 <div className={`h-5 border-b border-r border-black text-[6px] bg-gray-50 font-bold`} style={centerStyle}>
                     Misconduct sanctions
                 </div>
                 {/* Sub-labels */}
                 <div className="h-5 flex">
                    <div className={`${W_COL4} border-r border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Pen.</div>
                    <div className={`${W_COL5} border-r border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Pen.</div>
                    <div className={`${W_COL6} border-r border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Exp.</div>
                    <div className={`${W_COL7} border-r border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Disq.</div>
                 </div>
            </div>

            {/* Group 2: SET Label (Centered in remaining space) */}
            <div className="flex-1 h-full font-bold text-lg leading-none" style={centerStyle}>
                {label} SET
            </div>

            {/* Group 3: Start Time (Aligned Right) */}
            <div className="w-36 h-full px-2 gap-1 text-xs bg-white" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span className="text-[10px] font-bold">Start time:</span>
                <Input value={get(`${prefix}_start_hh`)} onChange={v => set(`${prefix}_start_hh`, v)} className="w-5 border-b border-black text-[10px]" />
                <span className="text-[10px]">:</span>
                <Input value={get(`${prefix}_start_mm`)} onChange={v => set(`${prefix}_start_mm`, v)} className="w-5 border-b border-black text-[10px]" />
            </div>
        </div>
      </div>
    );
  };

  // 2. Footer Row (Mirrored Header)
  const renderFooterRow = (setNum: number, prefix: string) => {
    return (
      <div className="flex  border-black text-black">
        {/* Left Block */}
        <div className="flex h-8">
            <div className={`${W_COL1} border-r border-black p-0.5 text-[5px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
                service<br/>order
            </div>
            <div className={`${W_COL2} border-r border-black p-0.5 text-[5px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
                player<br/>no.
            </div>
            <div className={`${W_COL3} border-r border-black p-0.5 text-[5px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
                Formal<br/>Warn.
            </div>
        </div>

        {/* Right Block */}
        <div className="flex-1 flex h-8">
             {/* Group 1: Misconduct Sanctions Mirrored */}
             <div className="flex flex-col flex-none">
                 {/* Sub-labels (Top) */}
                 <div className="h-4 flex border-b border-black">
                    <div className={`${W_COL4} border-r border-black text-[5px] text-center bg-gray-50 font-bold`} style={centerStyle}>Pen.</div>
                    <div className={`${W_COL5} border-r border-black text-[5px] text-center bg-gray-50 font-bold`} style={centerStyle}>Pen.</div>
                    <div className={`${W_COL6} border-r border-black text-[5px] text-center bg-gray-50 font-bold`} style={centerStyle}>Exp.</div>
                    <div className={`${W_COL7} border-r border-black text-[5px] text-center bg-gray-50 font-bold`} style={centerStyle}>Disq.</div>
                 </div>
                 {/* Title (Bottom) */}
                 <div className={`h-4 border-r border-black text-[5px] bg-gray-50 font-bold`} style={centerStyle}>
                     Misconduct sanctions
                 </div>
            </div>

            {/* Spacer to match Set Label width above */}
            <div className="flex-1 bg-white h-full"></div>

            {/* Group 2: End Time Area */}
            <div className="w-32 h-full px-2 gap-1 bg-white" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span className="text-[10px] font-bold">End time:</span>
                <Input value={get(`${prefix}_end_hh`)} onChange={v => set(`${prefix}_end_hh`, v)} className="w-5 border-b border-black text-[10px]" />
                <span className="text-[10px]">:</span>
                <Input value={get(`${prefix}_end_mm`)} onChange={v => set(`${prefix}_end_mm`, v)} className="w-5 border-b border-black text-[10px]" />
            </div>
        </div>
      </div>
    );
  };

  // 3. Player Row
  const renderPlayerRow = (setPrefix: string, rowLabel: string, rowKeySuffix: string) => (
    <div className="flex h-5 border-b border-black text-black">
      {/* Label */}
      <div className={`${W_COL1} border-r border-black font-bold text-xs bg-gray-50`} style={centerStyle}>
        {rowLabel}
      </div>
      {/* Player No */}
      <div className={`${W_COL2} border-r border-black p-0.5`} style={centerStyle}>
        <Input 
          value={get(`${setPrefix}_${rowKeySuffix}_player`)} 
          onChange={v => set(`${setPrefix}_${rowKeySuffix}_player`, v)} 
          className="w-full h-full text-xs" 
        />
      </div>
      {/* Formal Warn */}
      <div className={`${W_COL3} border-r border-black`} style={centerStyle}>
        <ScoreInputPair 
          valA={get(`${setPrefix}_${rowKeySuffix}_fw_a`)} 
          onChangeA={v => set(`${setPrefix}_${rowKeySuffix}_fw_a`, v)}
          valB={get(`${setPrefix}_${rowKeySuffix}_fw_b`)} 
          onChangeB={v => set(`${setPrefix}_${rowKeySuffix}_fw_b`, v)}
        />
      </div>
      {/* Sanctions */}
      <div className={`${W_COL4} border-r border-black`} style={centerStyle}>
         <ScoreInputPair 
            valA={get(`${setPrefix}_${rowKeySuffix}_s1_a`)} onChangeA={v => set(`${setPrefix}_${rowKeySuffix}_s1_a`, v)}
            valB={get(`${setPrefix}_${rowKeySuffix}_s1_b`)} onChangeB={v => set(`${setPrefix}_${rowKeySuffix}_s1_b`, v)}
         />
      </div>
      <div className={`${W_COL5} border-r border-black`} style={centerStyle}>
         <ScoreInputPair 
            valA={get(`${setPrefix}_${rowKeySuffix}_s2_a`)} onChangeA={v => set(`${setPrefix}_${rowKeySuffix}_s2_a`, v)}
            valB={get(`${setPrefix}_${rowKeySuffix}_s2_b`)} onChangeB={v => set(`${setPrefix}_${rowKeySuffix}_s2_b`, v)}
         />
      </div>
      <div className={`${W_COL6} border-r border-black`} style={centerStyle}>
         <ScoreInputPair 
            valA={get(`${setPrefix}_${rowKeySuffix}_s3_a`)} onChangeA={v => set(`${setPrefix}_${rowKeySuffix}_s3_a`, v)}
            valB={get(`${setPrefix}_${rowKeySuffix}_s3_b`)} onChangeB={v => set(`${setPrefix}_${rowKeySuffix}_s3_b`, v)}
         />
      </div>
      <div className={`${W_COL7} border-r border-black`} style={centerStyle}>
         <ScoreInputPair 
            valA={get(`${setPrefix}_${rowKeySuffix}_s4_a`)} onChangeA={v => set(`${setPrefix}_${rowKeySuffix}_s4_a`, v)}
            valB={get(`${setPrefix}_${rowKeySuffix}_s4_b`)} onChangeB={v => set(`${setPrefix}_${rowKeySuffix}_s4_b`, v)}
         />
      </div>

      {/* Points 1-21 Grid */}
      <div className="flex-1 flex">
        {Array.from({ length: 21 }).map((_, i) => (
          <div key={i} className="flex-1 border-r border-black relative group last:border-r-0">
             <span className="absolute top-[1px] right-[1px] text-[5px] leading-none select-none text-gray-500">{i + 1}</span>
             <Input 
                value={get(`${setPrefix}_${rowKeySuffix}_pt_${i+1}`)} 
                onChange={v => set(`${setPrefix}_${rowKeySuffix}_pt_${i+1}`, v)} 
                className="w-full h-full text-[10px] group-hover:bg-blue-50"
             />
          </div>
        ))}
      </div>
    </div>
  );

  // 4. Team Control Row
  const renderTeamControlRow = (setPrefix: string, teamSuffix: string, inverted = false, setNum: number) => {
    
    // Time Out - height should match DelayHeaderBox + DelaySubHeaderBox (2 * H_HEADER_ROW = h-8)
    const TimeOutLabelBox = (
        <div className={`h-8 text-[5px] text-center leading-tight bg-gray-50 font-bold ${W_COL1}`} style={centerStyleCol}>
             Time<br/>Out
        </div>
    );
    const TimeOutInputBox = (
        <div className={`${H_INPUT_ROW} px-1 bg-white border-black ${W_COL1}`} style={centerStyle}>
             <ScoreInputPair 
                valA={get(`${setPrefix}_${teamSuffix}_to_a`)} onChangeA={v => set(`${setPrefix}_${teamSuffix}_to_a`, v)}
                valB={get(`${setPrefix}_${teamSuffix}_to_b`)} onChangeB={v => set(`${setPrefix}_${teamSuffix}_to_b`, v)}
             />
        </div>
    );

    // Delay Sanctions
    const DelayHeaderBox = (
        <div className={`${H_HEADER_ROW} border-b border-black text-[5px] bg-gray-50 font-bold flex-1`} style={centerStyle}>
            Delay sanctions
        </div>
    );
    // DelaySubHeaderBox - border depends on position (top or bottom)
    const DelaySubHeaderBox = (hasTopBorder: boolean = false) => (
        <div className={`${H_HEADER_ROW} ${hasTopBorder ? 'border-t' : 'border-b'} border-black flex text-[5px] text-center bg-gray-50 font-bold`}>
            <div className={`${W_COL2} border-r border-black h-full`} style={centerStyle}>Warn.</div>
            <div className={`${W_COL3} border-r border-black h-full`} style={centerStyle}>Pen.</div>
            <div className={`${W_COL4} border-r border-black h-full`} style={centerStyle}>Pen.</div>
            <div className={`${W_COL5} h-full`} style={centerStyle}>Pen.</div>
        </div>
    );
    const DelayInputBox = (
       <div className={`${H_INPUT_ROW} flex bg-white`}>
           <div className={`${W_COL2} border-r border-black p-0.5`}>
               <ScoreInputPair 
                  valA={get(`${setPrefix}_${teamSuffix}_ds_w_a`)} onChangeA={v => set(`${setPrefix}_${teamSuffix}_ds_w_a`, v)}
                  valB={get(`${setPrefix}_${teamSuffix}_ds_w_b`)} onChangeB={v => set(`${setPrefix}_${teamSuffix}_ds_w_b`, v)}
               />
           </div>
           <div className={`${W_COL3} border-r border-black p-0.5`}>
               <ScoreInputPair 
                  valA={get(`${setPrefix}_${teamSuffix}_ds_p1_a`)} onChangeA={v => set(`${setPrefix}_${teamSuffix}_ds_p1_a`, v)}
                  valB={get(`${setPrefix}_${teamSuffix}_ds_p1_b`)} onChangeB={v => set(`${setPrefix}_${teamSuffix}_ds_p1_b`, v)}
               />
           </div>
           <div className={`${W_COL4} border-r border-black p-0.5`}>
                <ScoreInputPair 
                  valA={get(`${setPrefix}_${teamSuffix}_ds_p2_a`)} onChangeA={v => set(`${setPrefix}_${teamSuffix}_ds_p2_a`, v)}
                  valB={get(`${setPrefix}_${teamSuffix}_ds_p2_b`)} onChangeB={v => set(`${setPrefix}_${teamSuffix}_ds_p2_b`, v)}
               />
           </div>
           <div className={`${W_COL5} p-0.5`}>
                <ScoreInputPair 
                  valA={get(`${setPrefix}_${teamSuffix}_ds_p3_a`)} onChangeA={v => set(`${setPrefix}_${teamSuffix}_ds_p3_a`, v)}
                  valB={get(`${setPrefix}_${teamSuffix}_ds_p3_b`)} onChangeB={v => set(`${setPrefix}_${teamSuffix}_ds_p3_b`, v)}
               />
           </div>
       </div>
    );

    // Points - Merged with row above, label above circle+name box
    const PointsRow = (
        <div className={`h-8 flex items-center bg-white flex-1 `}>
            <div className="w-32 flex flex-col ml-1">

                {/* A or B + Team Name Input Box */}
                <div className={`h-8 flex items-center border border-black`}>
                    <div className="flex items-center justify-center p-0.5 w-8">
                       
                        <ABCircle 
                            value={get(`${setPrefix}_${teamSuffix}_team_circle`)} 
                            onChange={v => set(`${setPrefix}_${teamSuffix}_team_circle`, v)} 
                            size={18}
                        />
                    </div>
                    <div className="flex-1 p-0.5 h-full">
                        <Input value={get(`${setPrefix}_${teamSuffix}_team_label`)} onChange={v => set(`${setPrefix}_${teamSuffix}_team_label`, v)} className="w-full h-full text-[10px] text-left" placeholder=""/>
                    </div>
                </div>
            </div>

            {/* Right: Points 1-44 Grid - Centered vertically */}
            <div className="flex-1 flex items-center">
                {Array.from({ length: 44 }).map((_, i) => (
                    <div key={i} className="flex-1 flex items-center justify-center relative">
                        <PointCell 
                          num={i + 1}
                          value={get(`${setPrefix}_${teamSuffix}_pt_lg_${i+1}`)}
                          onClick={() => {
                            const k = `${setPrefix}_${teamSuffix}_pt_lg_${i+1}`;
                            const cur = get(k);
                            const next = !cur ? 'slash' : cur === 'slash' ? 'circle' : '';
                            set(k, next);
                          }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );

    if (!inverted) {
        // TOP TEAM (Standard)
        return (
            <div className="flex border-b border-black text-black">
                {/* Time Out */}
                <div className="flex flex-col border-r border-black">
                    <div className="border-b border-black">{TimeOutLabelBox}</div>
                    {TimeOutInputBox}
                </div>
                {/* Delay */}
                <div className="flex flex-col border-r border-black">
                    {DelayHeaderBox}
                    {DelaySubHeaderBox(false)}
                    {DelayInputBox}
                </div>
                {/* Points */}
                <div className="flex-1 flex flex-col">
                    {PointsRow}
                </div>
            </div>
        );
    } else {
        // BOTTOM TEAM (Inverted)
        return (
            <div className="flex border-b border-black text-black">
                {/* Time Out */}
                <div className="flex flex-col border-r border-black">
                     <div className="border-b border-black">{TimeOutInputBox}</div>
                     {TimeOutLabelBox}
                </div>
                {/* Delay */}
                <div className="flex flex-col border-r border-black">
                     {DelayInputBox}
                     {DelaySubHeaderBox(true)}
                     <div className={`${H_HEADER_ROW} border-t border-black text-[5px] bg-gray-50 font-bold`} style={centerStyle}>Delay sanctions</div>
                </div>
                {/* Points */}
                <div className="flex-1 flex flex-col">
                     {PointsRow}
                </div>
            </div>
        );
    }
  };

  const renderSet = (setNum: number) => {
    const prefix = `s${setNum}`;
    
    return (
        <div className="border-2 border-black flex mt-1 mb-1 text-black bg-white" style={{ fontSize: '0.7rem' }}>
        {/* MAIN SCORING AREA */}
        <div className="flex-1 flex flex-col">
            
            {/* SET HEADER */}
            {renderHeaderRow(setNum, prefix)}

            {/* TEAM 1 (Top) Service Order */}
            <div className="border-r border-black border-r">
            {renderPlayerRow(prefix, 'I', 'r1')}
            {renderPlayerRow(prefix, 'III', 'r3')}
            </div>
            {/* GAP (Whitespace) */}
            <div className="h-0.5 w-full bg-white border-b border-white border-r"></div>

            {/* TEAM CONTROL 1 (With Top Border) */}
            <div className="border-t border-black border-r">
                {renderTeamControlRow(prefix, 't1', false, setNum)}
            </div>

            {/* GAP + SEPARATOR LINE */}
            <div className="h-0.5 w-full bg-white"></div>
            <div className="h-[2px] w-full bg-black"></div>
            <div className="h-0.5 w-full bg-white"></div>

            {/* TEAM CONTROL 2 (With Top Border) */}
            <div className="border-t border-black border-r">
                {renderTeamControlRow(prefix, 't2', true, setNum)}
            </div>

            {/* GAP (Whitespace) */}
            <div className="h-0.5 w-full bg-white"></div>

            {/* TEAM 2 (Bottom) Service Order (With Top Border) */}
            <div className="border-t border-black border-r">
                {renderPlayerRow(prefix, 'II', 'r2')}
                {renderPlayerRow(prefix, 'IV', 'r4')}
            </div>

            {/* SET FOOTER */}
            {renderFooterRow(setNum, prefix)}
        </div>

        {/* RIGHT SIDEBAR - COURT SWITCH */}
        <div className="w-14 border-r-0 border-l border-black flex flex-col ml-1">
            <div className="h-4 border-b border-black text-[7px] text-center leading-tight font-bold bg-gray-50 text-black" style={centerStyle}>
                Court switch
            </div>
            <div className="h-4 border-black text-[8px] text-center font-bold bg-gray-100 text-black" style={centerStyle}>
                A : B
            </div>
            {/* Court Switch Inputs */}
            {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 border border-l-0 border-r-0 border-b-0 border-black flex items-center justify-center relative ${
                    i === 2 ? 'border border-black' : ''
                  }`}
                >
                    {/* TTO with Box for Set 1 & 2 */}
                    {i === 2 && setNum !== 3 && (
                        <div className="absolute top-0 right-0 px-[1px] bg-white text-[5px] font-bold z-10 leading-none" style={{ right: '0px', top: '0px' }}>TTO</div>
                    )}
                    <Input value={get(`${prefix}_cs_${i}_a`)} onChange={v => set(`${prefix}_cs_${i}_a`, v)} className="w-5 h-full text-[9px]" />
                    <span className="text-[8px] text-black">:</span>
                    <Input value={get(`${prefix}_cs_${i}_b`)} onChange={v => set(`${prefix}_cs_${i}_b`, v)} className="w-5 h-full text-[9px]" />
                </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto text-black">
      {/* Save PDF Button */}
      <div className="mb-4 flex justify-center">
        <button 
          onClick={handleSavePDF}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold"
        >
          Save PDF
        </button>
      </div>
      
      {/* ================= PAGE 1 ================= */}
      <div 
        ref={page1Ref}
        id="page-1" 
        className="page-boundary flex flex-col bg-white mx-auto mb-4" 
        style={{ 
          width: '277mm', 
          height: '190mm', 
          padding: '2mm',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
          {/* Print Area Corner Indicators */}
          <div className="print-corner tl"></div>
          <div className="print-corner tr"></div>
          <div className="print-corner bl"></div>
          <div className="print-corner br"></div>
          {/* Page Break Indicator - visible on screen only */}
          <div className="page-break-indicator"></div>
          {/* HEADER */}
          <div className="bg-blue-900 text-white px-2 py-0.5 flex justify-between items-center mb-0.5">
            <span className="text-[10px]">Beach volley eScoresheet Openvolley</span>
          </div>

          {/* METADATA ROWS */}
          <div className="border border-black mb-2">
            {/* Row 1 */}
            <div className="flex items-center px-1 py-1 border-b border-black h-5">
                <span className="text-[10px] w-28 text-black">Name of Competition:</span>
                <Input value={get('competition')} onChange={v => set('competition', v)} className="flex-1 text-left px-1 text-sm font-bold text-black" />
                <span className="text-[8px] text-black">v1.0 11/2025</span>
            </div>

            {/* Row 2 */}
            <div className="flex items-center text-[10px] h-8 divide-x divide-black text-black border-b border-black">
                <div className="flex items-center px-2 gap-1">
                    <span>Match No.:</span>
                    <Input value={get('match_no')} onChange={v => set('match_no', v)} className="w-5 border-b border-black" />
                </div>
                <div className="flex items-center px-2 gap-1 flex-1">
                    <span>Site:</span>
                    <Input value={get('site')} onChange={v => set('site', v)} className="flex-1 border-b border-black" />
                </div>
                <div className="flex items-center px-2 gap-1 flex-1">
                    <span>Beach:</span>
                    <Input value={get('beach')} onChange={v => set('beach', v)} className="flex-1 border-b border-black" />
                </div>
                <div className="flex items-center px-2 gap-1">
                    <span>Court:</span>
                    <Input value={get('court')} onChange={v => set('court', v)} className="w-8 border-b border-black" />
                </div>
                <div className="flex items-center px-2 gap-1">
                    <span>Date:</span>
                    <Input value={get('date_d')} onChange={v => set('date_d', v)} className="w-3 text-center" placeholder="DD" />
                    <span>/</span>
                    <Input value={get('date_m')} onChange={v => set('date_m', v)} className="w-3 text-center" placeholder="MM" />
                    <span>/</span>
                    <Input value={get('date_y')} onChange={v => set('date_y', v)} className="w-3 text-center" placeholder="YY" />
                </div>
                <div className="flex items-center px-2 gap-2">
                    <div className="flex items-center gap-1">
                        <span>Men</span>
                        <XBox checked={get('cat_men')} onChange={v => set('cat_men', v)} size={12} />
                    </div>
                    <div className="flex items-center gap-1">
                        <span>Women</span>
                        <XBox checked={get('cat_women')} onChange={v => set('cat_women', v)} size={12} />
                    </div>
                </div>
                <div className="flex items-center px-2 gap-2">
                    <div className="flex items-center gap-1">
                        <span>Main Draw</span>
                        <XBox checked={get('md')} onChange={v => set('md', v)} size={12} />
                    </div>
                    <div className="flex items-center gap-1">
                        <span>Qual.</span>
                        <XBox checked={get('qual')} onChange={v => set('qual', v)} size={12} />
                    </div>
                </div>
                <div className="flex items-center px-2 gap-2 text-[9px]">
                    <div className="flex items-center gap-0.5"><span>P.P.</span><XBox checked={get('pp')} onChange={v => set('pp', v)} size={10} /></div>
                    <div className="flex items-center gap-0.5"><span>W.B.</span><XBox checked={get('wb')} onChange={v => set('wb', v)} size={10} /></div>
                    <div className="flex items-center gap-0.5"><span>Class.</span><XBox checked={get('class')} onChange={v => set('class', v)} size={10} /></div>
                    <div className="flex items-center gap-0.5"><span>S-F</span><XBox checked={get('sf')} onChange={v => set('sf', v)} size={10} /></div>
                    <div className="flex items-center gap-0.5"><span>Finals</span><XBox checked={get('final')} onChange={v => set('final', v)} size={10} /></div>
                </div>
            </div>
          </div>

          {/* TEAMS HEADER */}
          <div className="flex border border-black mb-0.5 p-0.5 items-center gap-2 text-black">
              <div className="flex-1 flex gap-2 items-end h-full">
                <div className="flex flex-col items-center justify-center h-full ml-1">
                    <ABCircle value={get('t1_side')} onChange={v => set('t1_side', v)} size={20} />
                </div>
                <div className="w-[80%] pb-0.5">
                    <Input value={get('t1_name')} onChange={v => set('t1_name', v)} className="w-full text-left font-bold text-lg" placeholder="Team / Team" />
                </div>
                <div className="flex-1 pb-0.5">
                    <Input value={get('t1_country')} onChange={v => set('t1_country', v)} className="w-full text-left font-bold text-lg" placeholder="CCC" />
                </div>
              </div>
              
              <div className="font-bold text-xl italic text-black">VS.</div>

              <div className="flex-1 flex gap-2 items-end h-full">
                <div className="flex flex-col items-center justify-center h-full ml-1">
                    <ABCircle value={get('t2_side')} onChange={v => set('t2_side', v)} size={20} />
                </div>
                <div className="w-[80%] pb-0.5">
                    <Input value={get('t2_name')} onChange={v => set('t2_name', v)} className="w-full text-left font-bold text-lg" placeholder="Team / Team" />
                </div>
                <div className="flex-1 pb-0.5">
                    <Input value={get('t2_country')} onChange={v => set('t2_country', v)} className="w-full text-left font-bold text-lg" placeholder="CCC" />
                </div>
              </div>
          </div>

          {/* SETS 1 & 2 - Stretched to fill remaining space */}
          <div className="flex-1 flex flex-col gap-2" style={{ minHeight: 0 }}>
            <div className="flex-1" style={{ minHeight: 0 }}>{renderSet(1)}</div>
            <div className="flex-1" style={{ minHeight: 0 }}>{renderSet(2)}</div>
          </div>
      </div>

      {/* ================= PAGE 2 ================= */}
      <div 
        ref={page2Ref}
        id="page-2" 
        className="page-boundary page-2 flex flex-col bg-white mx-auto" 
        style={{ 
          width: '277mm', 
          height: '190mm', 
          padding: '2mm',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
          {/* Margin Label */}
          {/* Print Area Corner Indicators */}
          <div className="print-corner tl"></div>
          <div className="print-corner tr"></div>
          <div className="print-corner bl"></div>
          <div className="print-corner br"></div>
          {/* Page Break Indicator - visible on screen only */}
          <div className="page-break-indicator"></div>
          {/* SET 3 */}
          <div>
            {renderSet(3)}
          </div>

          {/* FOOTER GRID */}
          <div className="flex gap-1 mt-1 text-black flex-1">
            
            {/* LEFT COLUMN: TEAMS, RESULTS, APPROVAL */}
            <div className="flex-1 flex flex-col gap-1 w-1/2">
                
                {/* TEAMS BOX - Side by Side */}
                <div className="border-2 border-black flex">
                    <div className="w-8 font-bold text-sm border-r border-black bg-gray-50 text-black relative overflow-hidden" style={{ minHeight: '80px' }}>
                      <span style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%) rotate(-90deg)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.1em'
                      }}>TEAMS</span>
                    </div>
                    
                    {/* Team A Col */}
                    <div className="flex-1 border-r border-black p-0.5 flex flex-col">
                        <div className="flex items-end mb-0.5 justify-end mr-2">
                             <Input value={get('b_t1_country')} onChange={v => set('b_t1_country', v)} className="w-10 border-b border-black text-xs font-bold text-center" />
                             <ABCircle value={get('b_t1_side')} onChange={v => set('b_t1_side', v)} size={16} className="ml-2" />
                        </div>
                        <div className="flex text-[9px] h-4 border-black">
                             <div className="w-6 border border-b-0 border-black text-center">No.</div>
                             <div className="flex-1 pl-1 border border-b-0 border-l-0 border-black">Player's Name</div>
                        </div>
                        {/* Player 1 */}
                        <div className="flex text-[9px] h-5">
                             <div className="w-6 border border-black"><Input value={get('b_t1_p1_no')} onChange={v => set('b_t1_p1_no', v)} className="w-full" /></div>
                             <div className="flex-1 border border-l-0 border-black"><Input value={get('b_t1_p1_name')} onChange={v => set('b_t1_p1_name', v)} className="w-full text-left px-1" /></div>
                        </div>
                        {/* Player 2 */}
                        <div className="flex text-[9px] h-5">
                             <div className="w-6 border border-t-0 border-black"><Input value={get('b_t1_p2_no')} onChange={v => set('b_t1_p2_no', v)} className="w-full" /></div>
                             <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t1_p2_name')} onChange={v => set('b_t1_p2_name', v)} className="w-full text-left px-1" /></div>
                        </div>
                        <div className="text-[4px]  pb-4">Captain's pre-match signature:</div>
                    </div>

                    {/* Team B Col */}
                    <div className="flex-1 p-0.5 flex flex-col">
                        <div className="flex items-center mb-0.5 justify-left ml-2">
                        <ABCircle value={get('b_t2_side')} onChange={v => set('b_t2_side', v)} size={16} />
                             
                             <Input value={get('b_t2_country')} onChange={v => set('b_t2_country', v)} className="w-10 border-b border-black text-xs font-bold ml-2 text-center" />
                        </div>
                        <div className="flex text-[9px] h-4 border-b border-black">
                             <div className="w-6 border border-b-0 border-black text-center">No.</div>
                             <div className="flex-1 pl-1 border border-b-0 border-l-0 border-black">Player's Name</div>
                        </div>
                         {/* Player 1 */}
                        <div className="flex text-[9px] h-5">
                             <div className="w-6 border border-t-0 border-black"><Input value={get('b_t2_p1_no')} onChange={v => set('b_t2_p1_no', v)} className="w-full" /></div>
                             <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t2_p1_name')} onChange={v => set('b_t2_p1_name', v)} className="w-full text-left px-1" /></div>
                        </div>
                        {/* Player 2 */}
                        <div className="flex text-[9px] h-5">
                             <div className="w-6 border border-t-0 border-black"><Input value={get('b_t2_p2_no')} onChange={v => set('b_t2_p2_no', v)} className="w-full" /></div>
                             <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t2_p2_name')} onChange={v => set('b_t2_p2_name', v)} className="w-full text-left px-1" /></div>
                        </div>
                        <div className="text-[4px] h-2 pb-4">Captain's pre-match signature:</div>
                    </div>
                </div>

                {/* RESULTS TABLE */}
                <div className="border-2 border-black flex">
                    <div className="w-8 font-bold text-sm border-r border-black bg-gray-400 text-black relative overflow-hidden" style={{ minHeight: '120px' }}>
                      <span style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%) rotate(-90deg)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.1em'
                      }}>RESULTS</span>
                    </div>
                    <div className="flex-1">
                        {/* Table Header */}
                        <div className="flex text-[9px] text-center font-bold border-b border-black bg-gray-100 text-black">
                            <div className="flex-1 border-r border-black">Time-Outs</div>
                            <div className="flex-1 border-r border-black">Wins</div>
                            <div className="flex-1 border-r border-black">Points</div>
                            <div className="w-32 border-r border-black">Set Duration</div>
                            <div className="flex-1 border-r border-black">Points</div>
                            <div className="flex-1 border-r border-black">Wins</div>
                            <div className="flex-1">Time-Outs</div>
                        </div>
                        {/* Rows: Set 1, 2, 3 */}
                        {[1, 2, 3].map(s => (
                            <div key={s} className="flex border-b border-black text-xs" style={{ alignItems: 'center' }}>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_s${s}_to_a`)} onChange={v => set(`res_s${s}_to_a`, v)} className="w-full h-full" /></div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_s${s}_w_a`)} onChange={v => set(`res_s${s}_w_a`, v)} className="w-full h-full" /></div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_s${s}_p_a`)} onChange={v => set(`res_s${s}_p_a`, v)} className="w-full h-full" /></div>
                                <div className="w-32 border-r border-black bg-gray-50 text-black" style={centerStyle}>
                                    <span className="text-[9px] mr-1">Set {s}</span>
                                    <span className="text-[9px]">(</span>
                                    <Input value={get(`res_s${s}_dur`)} onChange={v => set(`res_s${s}_dur`, v)} className="w-8 text-[9px]" />
                                    <span className="text-[9px] ml-1">min)</span>
                                </div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_s${s}_p_b`)} onChange={v => set(`res_s${s}_p_b`, v)} className="w-full h-full" /></div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_s${s}_w_b`)} onChange={v => set(`res_s${s}_w_b`, v)} className="w-full h-full" /></div>
                                <div className="flex-1" style={centerStyle}><Input value={get(`res_s${s}_to_b`)} onChange={v => set(`res_s${s}_to_b`, v)} className="w-full h-full" /></div>
                            </div>
                        ))}
                        {/* Total Row */}
                        <div className="flex border-b border-black text-xs bg-gray-50 font-bold text-black" style={{ alignItems: 'center' }}>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_tot_to_a`)} onChange={v => set(`res_tot_to_a`, v)} className="w-full h-full" /></div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_tot_w_a`)} onChange={v => set(`res_tot_w_a`, v)} className="w-full h-full" /></div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_tot_p_a`)} onChange={v => set(`res_tot_p_a`, v)} className="w-full h-full" /></div>
                                <div className="w-32 border-r border-black" style={centerStyle}>
                                    <span className="text-[9px] mr-1">Total (</span>
                                    <Input value={get(`res_tot_dur`)} onChange={v => set(`res_tot_dur`, v)} className="w-8 text-[9px]" />
                                    <span className="text-[9px] ml-1">min)</span>
                                </div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_tot_p_b`)} onChange={v => set(`res_tot_p_b`, v)} className="w-full h-full" /></div>
                                <div className="flex-1 border-r border-black" style={centerStyle}><Input value={get(`res_tot_w_b`)} onChange={v => set(`res_tot_w_b`, v)} className="w-full h-full" /></div>
                                <div className="flex-1" style={centerStyle}><Input value={get(`res_tot_to_b`)} onChange={v => set(`res_tot_to_b`, v)} className="w-full h-full" /></div>
                        </div>
                        {/* Match Times */}
                        <div className="flex h-6 border-b border-black text-[9px] p-1 items-center justify-around">
                            <div className="flex  items-center">
                                <span>Match starting time</span>
                                <div className="flex items-center gap-1">
                                    <Input value={get('match_start_h')} onChange={v => set('match_start_h', v)} className="w-4" />
                                    <span>h</span>
                                    <Input value={get('match_start_m')} onChange={v => set('match_start_m', v)} className="w-4" />
                                    <span>min</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 px-2 text-black p-1 bg-gray-100">
                                <span className="font-normal text-[8px]">Total Match Duration</span>
                                <div className="flex items-center gap-1 font-bold">
                                    <Input value={get('match_dur_h')} onChange={v => set('match_dur_h', v)} className="w-4" />
                                    <span>h</span>
                                    <Input value={get('match_dur_m')} onChange={v => set('match_dur_m', v)} className="w-4" />
                                    <span>min</span>
                                </div>
                            </div>
                            <div className="flex  items-center">
                                <span>Match ending time</span>
                                <div className="flex items-center gap-1">
                                    <Input value={get('match_end_h')} onChange={v => set('match_end_h', v)} className="w-4" />
                                    <span>h</span>
                                    <Input value={get('match_end_m')} onChange={v => set('match_end_m', v)} className="w-4" />
                                    <span>min</span>
                                </div>
                            </div>
                        </div>
                        {/* Winner */}
                        <div className="flex h-6 p-1 items-center bg-gray-400">
                            <span className="font-bold text-xs mr-2">Winning team</span>
                            <Input value={get('winner_name')} onChange={v => set('winner_name', v)} className="flex-1 text-left font-bold" />
                            <Input value={get('winner_country')} onChange={v => set('winner_country', v)} className="w-12 text-center font-bold ml-2" />
                            <div className="ml-4 font-bold text-lg flex items-center">
                                <span>2</span>
                                <span className="mx-1">:</span>
                                <Input value={get('win_score_other')} onChange={v => set('win_score_other', v)} className="w-6" />
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* APPROVAL TABLE */}
                <div className="border-2 border-black flex">
                    <div className="w-8 font-bold text-xs border-r border-black bg-white text-black relative overflow-hidden" style={{ minHeight: '100px' }}>
                      <span style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%) rotate(-90deg)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.08em'
                      }}>APPROVAL</span>
                    </div>
                    <table className="flex-1 border-collapse text-[8px]" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <colgroup>
                            <col style={{ width: '70px' }} />
                            <col style={{ width: 'auto' }} />
                            <col style={{ width: '40px' }} />
                            <col style={{ width: 'auto' }} />
                        </colgroup>
                        {/* Header */}
                        <thead>
                            <tr className="bg-gray-100 text-black font-bold text-center h-3">
                                <td className="border-r border-b border-black px-1 py-0.5">Officials</td>
                                <td className="border-r border-b border-black px-1 py-0.5">Name</td>
                                <td className="border-r border-b border-black px-1 py-0.5">Country</td>
                                <td className="border-b border-black px-1 py-0.5">Signature</td>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Referees */}
                            {[
                                { l: '1st Referee', k: 'ref1' },
                                { l: '2nd Referee', k: 'ref2' },
                                { l: 'Scorer', k: 'scorer' },
                                { l: 'Asst. Scorer', k: 'asst_scorer' }
                            ].map(r => (
                                <tr key={r.k} className="h-5">
                                    <td className="border-r border-b border-black px-1 font-bold">{r.l}</td>
                                    <td className="border-r border-b border-black p-0"><Input value={get(`${r.k}_name`)} onChange={v => set(`${r.k}_name`, v)} className="w-full h-full text-left px-1" /></td>
                                    <td className="border-r border-b border-black p-0"><Input value={get(`${r.k}_country`)} onChange={v => set(`${r.k}_country`, v)} className="w-full h-full text-center" /></td>
                                    <td className="border-b border-black bg-gray-50"></td>
                                </tr>
                            ))}
                            {/* Line Judges - spans across Name, Country, Signature columns */}
                            <tr>
                                <td rowSpan={2} className="border-r border-b border-black px-1 font-bold text-center align-middle">Line<br/>Judges</td>
                                <td colSpan={3} className="border-b border-black p-0">
                                    <div className="flex h-4">
                                        <div className="flex-1 flex border-r border-black">
                                            <span className="w-4 border-r border-black font-bold" style={centerStyle}>1</span>
                                            <Input value={get('lj1')} onChange={v => set('lj1', v)} className="flex-1 text-left px-1" />
                                        </div>
                                        <div className="flex-1 flex">
                                            <span className="w-4 border-r border-black font-bold" style={centerStyle}>2</span>
                                            <Input value={get('lj2')} onChange={v => set('lj2', v)} className="flex-1 text-left px-1" />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="border-b border-black p-0">
                                    <div className="flex h-4">
                                        <div className="flex-1 flex border-r border-black">
                                            <span className="w-4 border-r border-black font-bold" style={centerStyle}>3</span>
                                            <Input value={get('lj3')} onChange={v => set('lj3', v)} className="flex-1 text-left px-1" />
                                        </div>
                                        <div className="flex-1 flex">
                                            <span className="w-4 border-r border-black font-bold" style={centerStyle}>4</span>
                                            <Input value={get('lj4')} onChange={v => set('lj4', v)} className="flex-1 text-left px-1" />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            {/* Post-match Signatures - each takes half the width */}
                            <tr style={{ height: '2rem' }}>
                                <td colSpan={2} className="border-r border-black p-1 align-top">
                                    <span className="text-[4px]">Captain's post-match signature</span>
                                </td>
                                <td colSpan={2} className="p-1 align-top">
                                    <span className="text-[4px]">Captain's post-match signature</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

            </div>

            {/* RIGHT COLUMN: MEDICAL ASSISTANCE, REMARKS */}
            <div className="flex flex-col gap-1 w-1/2">
                
                {/* MEDICAL ASSISTANCE CHART */}
                <div className="border-2 border-black flex flex-col" style={{ minHeight: 'fit-content' }}>
                    <div className="text-center font-bold text-xs border-b border-black text-black">Medical Assistance chart</div>
                    {/* Headers - split into two rows: MTO/RIT above, Blood/etc. below */}
                    <div className="flex flex-col text-[8px] font-bold text-center">
                        <div className="flex">
                            {/* Team label spans both rows */}
                            <div className="w-24 border-r border-black box-border row-span-2" style={centerStyleCol}>
                                <div>Team</div>
                            </div>
                            {/* Player label spans both rows */}
                            <div className="w-10 border-r border-black box-border row-span-2" style={centerStyle}>
                                Player
                            </div>
                            {/* MTO section (with one subcategory: Blood) */}
                            <div className="flex-1 border-r border-black flex flex-col">
                                <div className="flex-1" style={centerStyle}>MTO</div>
                                <div className="flex-1 text-[7px] border-t border-black" style={centerStyle}>Blood</div>
                            </div>
                            {/* RIT section (with three subcategories) */}
                            <div className="flex-[3] flex-1 flex border-black flex-col">
                                <div className="flex-1" style={centerStyle}>RIT</div>
                                <div className="flex flex-row border-t border-black w-full text-[7px]">
                                    <div className="flex-1 border-r border-black" style={centerStyle}>No blood</div>
                                    <div className="flex-1 border-r border-black" style={centerStyle}>Weather</div>
                                    <div className="flex-1" style={centerStyle}>Toilet</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rows */}
                    {/* "Merged" row with ABCircle and country input on left, and Player 1 & 2 rows to its right */}
                    {([1, 2].map(team => (
                        <div key={team} className={`flex items-stretch box-border  border-black`}>
                            {/* Team (ABCircle + Country), vertically centered across Player 1 & 2 */}
                            <div className="w-24 border-r border-t border-black flex items-center justify-start text-black px-1 box-border" style={{ flexDirection: "column", justifyContent: "center" }}>
                                <div className="flex items-center justify-start h-full">
                                    <ABCircle value={get(`ma_side_${team}`)} onChange={v => set(`ma_side_${team}`, v)} size={14} className="scale-200 mr-2" />
                                    <Input value={get(`ma_ctry_${team}`)} onChange={v => set(`ma_ctry_${team}`, v)} className="w-14 text-[20px]" />
                                </div>
                            </div>
                            {/* Player column with 2 stacked rows for player 1 and 2 */}
                            <div className="flex flex-col flex-1">
                                {[1, 2].map(player => {
                                    const idx = (team - 1) * 2 + (player - 1);
                                    return (
                                        <div key={player} className={`flex border-black box-border h-5 ${player === 2 ? '' : 'border-t border-b'}`} style={{ alignItems: 'center' }}>
                                            {/* Player number */}
                                            <div className="w-10 border-r border-black text-center text-xs box-border h-full" style={centerStyle}>{player}</div>
                                            {/* MTO Blood */}
                                            <div className="flex-1 border-r border-black box-border h-full" style={centerStyle}>
                                                <XBox checked={get(`ma_mto_b_${idx}`)} onChange={v => set(`ma_mto_b_${idx}`, v)} size={10} />
                                            </div>
                                            {/* RIT */}
                                            <div className="flex-[3] flex box-border h-full">
                                                <div className="flex-1 border-r border-black box-border" style={centerStyle}>
                                                    <XBox checked={get(`ma_rit_nb_${idx}`)} onChange={v => set(`ma_rit_nb_${idx}`, v)} size={10} />
                                                </div>
                                                <div className="flex-1 border-r border-black box-border" style={centerStyle}>
                                                    <XBox checked={get(`ma_rit_w_${idx}`)} onChange={v => set(`ma_rit_w_${idx}`, v)} size={10} />
                                                </div>
                                                <div className="flex-1 box-border" style={centerStyle}>
                                                    <XBox checked={get(`ma_rit_t_${idx}`)} onChange={v => set(`ma_rit_t_${idx}`, v)} size={10} />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )))}
                </div>

                {/* REMARKS */}
                <div className="flex-1 border-2 border-black flex flex-col bg-white">
                    <div className="flex justify-between items-center bg-gray-100 border-b border-black px-1 h-6">
                        <span className="font-bold text-xs text-black">Remarks:</span>
                        <div className="flex items-center text-[8px] gap-1">
                            <span>Additional information attached</span>
                            <XBox checked={get('add_info')} onChange={v => set('add_info', v)} size={10} />
                        </div>
                    </div>
                    
                    <textarea 
                        value={get('remarks') || ''}
                        onChange={e => set('remarks', e.target.value)}
                        className="flex-1 w-full p-1 text-[10px] resize-none outline-none text-black bg-white"
                        style={{ maxHeight: '100%' }}
                    />

                    {/* Footer Inside Remarks */}
                    <div className="border-t-2 border-black p-1 bg-gray-50 text-[10px]">
                        <div className="flex items-center justify-between">
                             {/* Coin Toss */}
                             <div className="flex items-center gap-2">
                                <span className="font-bold">Winner of Coin Toss:</span>
                                <span className="text-[9px]">A or B</span>
                                
                                <span className="ml-2">Set 1</span>
                                <ABCircle value={get('coin_s1')} onChange={v => set('coin_s1', v)} size={14} />
                                
                                <span className="ml-1">Set 3</span>
                                <ABCircle value={get('coin_s3')} onChange={v => set('coin_s3', v)} size={14} />
                             </div>

                             {/* Improper Request */}
                             <div className="flex items-center gap-2">
                                <span className="font-bold">Improper request:</span>
                                <ABCircle value={get('improper_a')} onChange={v => set('improper_a', v)} size={14} />
                                <ABCircle value={get('improper_b')} onChange={v => set('improper_b', v)} size={14} />
                             </div>
                        </div>
                    </div>
                </div>

            </div>

        </div>
      </div>
    </div>
  );
}