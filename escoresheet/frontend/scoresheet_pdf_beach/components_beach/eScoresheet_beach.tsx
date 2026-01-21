import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  readOnly = false,
  ariaLabel
}: {
  value?: string;
  onChange?: (val: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  readOnly?: boolean;
  ariaLabel?: string;
}) => (
  <input
    value={value || ''}
    onChange={e => onChange && !readOnly && onChange(e.target.value)}
    className={`outline-none bg-transparent text-center font-mono text-black ${className} ${readOnly ? 'cursor-default' : ''}`}
    style={style}
    spellCheck={false}
    placeholder={placeholder}
    readOnly={readOnly}
    aria-label={ariaLabel || placeholder || 'Input field'}
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
  valA, valB, onChangeA, onChangeB, className = "", crossed = false
}: {
  valA?: string, valB?: string, onChangeA: (v: string) => void, onChangeB: (v: string) => void, className?: string, crossed?: boolean
}) => (
  <div className={`flex items-center justify-center w-full h-full relative ${className}`}>
    <Input value={valA} onChange={onChangeA} className="w-1/2 h-full text-[8px] text-center" />
    <span className="text-[8px] leading-none">:</span>
    <Input value={valB} onChange={onChangeB} className="w-1/2 h-full text-[8px] text-center" />
    {crossed && (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Full X: both backslash and forward slash */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 32 32" className="absolute left-0 top-0" style={{ zIndex: 4 }}>
            <line x1="2" y1="2" x2="30" y2="30" stroke="black" strokeWidth="1" />
            <line x1="2" y1="30" x2="30" y2="2" stroke="black" strokeWidth="1" />
          </svg>
        </div>
      </div>
    )}
  </div>
);

// Point Cell (1-44)
// States: null -> 'slash' -> 'circle' -> null
const PointCell = ({ num, value, onClick }: { num: number, value: string, onClick: () => void }) => (
  <div onClick={onClick} className="relative flex items-center justify-center h-full w-full cursor-pointer select-none group">
    {/* Hide number if no value (make it white/invisible) */}
    {value ? (
      <span className="z-10 text-[9px] text-black font-normal">{num}</span>
    ) : (
      <span className="z-10 text-[9px] text-white font-normal">{num}</span>
    )}

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
  const dataRef = useRef<Record<string, any>>({});
  const [dataInitialized, setDataInitialized] = useState(false);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);

  const set = (k: string, v: any) => {
    dataRef.current[k] = v; // Update ref synchronously
    setData(p => ({ ...p, [k]: v })); // Update state for re-render
  };
  const get = (k: string) => dataRef.current[k] || data[k]; // Read from ref first, fallback to state

  // Listen for refresh messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'REFRESH_SCORESHEET') {
        // Reload data from sessionStorage
        try {
          const dataStr = sessionStorage.getItem('scoresheetData');
          if (dataStr) {
            const newMatchData = JSON.parse(dataStr);
            // Reset initialization flag to allow re-initialization
            setDataInitialized(false);
            // Force re-render by updating matchData prop (we'll use a key or state)
            // Since we can't change props, we'll reload the page instead
            window.location.reload();
          }
        } catch (error) {
          console.error('Error refreshing scoresheet data:', error);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Initialize data from matchData
  useEffect(() => {

    // Initialize if matchData exists
    if (matchData && !dataInitialized) {
      // Reset dataRef
      dataRef.current = {};

      const { match, team_1Team, team_2Team, sets, events, team_1Players, team_2Players } = matchData;

      if (match) {
        // Match header info - use match setup fields
        if (match.eventName) set('competition', match.eventName);
        else if (match.league) set('competition', match.league);
        // Match number - use game_n (the actual field name in the database)
        if (match.game_n != null) set('match_no', String(match.game_n));
        // Don't fall back to externalId as it often contains 'test-match-default' or similar
        if (match.site) set('site', match.site);
        else if (match.city) set('site', match.city);
        if (match.beach) set('beach', match.beach);
        else if (match.hall) set('beach', match.hall);
        if (match.court) set('court', String(match.court));

        // Gender checkbox - check both matchGender and gender field names
        const genderValue = match.matchGender || match.gender;
        if (genderValue === 'men') {
          set('cat_men', true);
        } else if (genderValue === 'women') {
          set('cat_women', true);
        }

        // Phase and Round checkboxes - check both naming conventions
        const phaseValue = match.matchPhase || match.phase;
        if (phaseValue === 'main_draw' || phaseValue === 'main') {
          set('md', true);
        } else if (phaseValue === 'qualification') {
          set('qual', true);
        }

        // Round checkboxes - check both naming conventions
        const roundValue = match.matchRound || match.round;
        if (roundValue === 'pool_play' || roundValue === 'pool') {
          set('pp', true); // P.P.
        } else if (roundValue === 'winner_bracket' || roundValue === 'winner') {
          set('wb', true); // W.B.
        } else if (roundValue === 'class') {
          set('class', true); // Class.
        } else if (roundValue === 'semi_final' || roundValue === 'semifinals') {
          set('sf', true); // S-F
        } else if (roundValue === 'finals') {
          set('final', true); // Finals
        }

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

      // Teams - countries and names always set
      if (team_1Team) {
        const t1Country = team_1Team.country || match?.team_1Country || '';
        set('t1_country', t1Country);
        set('b_t1_country', t1Country);
        // Set team name immediately (don't wait for sets)
        const t1Name = team_1Team.name || '';
        set('t1_name', t1Name);
      }
      if (team_2Team) {
        const t2Country = team_2Team.country || match?.team_2Country || '';
        set('t2_country', t2Country);
        set('b_t2_country', t2Country);
        // Set team name immediately (don't wait for sets)
        const t2Name = team_2Team.name || '';
        set('t2_name', t2Name);
      }

      // Players (for TEAMS table)
      // TEAMS table always shows team_1 on left, team_2 on right (regardless of A/B)
      // A/B circles are filled separately based on coin toss

      // Check if coin toss has been confirmed
      const isCoinTossConfirmed = match?.coinTossConfirmed === true;

      // Determine which team is A and which is B for coin toss data lookup
      // Only set if coin toss is confirmed
      const teamAKey = isCoinTossConfirmed ? (match?.coinTossTeamA || 'team_1') : '';
      const teamBKey = isCoinTossConfirmed ? (match?.coinTossTeamB || (teamAKey === 'team_1' ? 'team_2' : 'team_1')) : '';

      // Medical Assistance Chart - Set A/B and countries only if coin toss confirmed
      if (isCoinTossConfirmed && teamAKey && teamBKey) {
        const teamACountry = teamAKey === 'team_1'
          ? (team_1Team?.country || match?.team_1Country || '')
          : (team_2Team?.country || match?.team_2Country || '');
        const teamBCountry = teamBKey === 'team_1'
          ? (team_1Team?.country || match?.team_1Country || '')
          : (team_2Team?.country || match?.team_2Country || '');

        // Team A (first row, index 1) - A above
        set('ma_side_1', 'A');
        set('ma_ctry_1', teamACountry);
        // Team B (second row, index 2) - B below
        set('ma_side_2', 'B');
        set('ma_ctry_2', teamBCountry);
      }

      // Get coin toss data to determine first serve and player numbers
      const coinTossData = match?.coinTossData;
      const teamAData = coinTossData?.players?.teamA;
      const teamBData = coinTossData?.players?.teamB;

      // Set A/B circles above TEAMS table based on coin toss (only if confirmed)
      if (isCoinTossConfirmed && teamAKey && teamBKey) {
        // b_t1_side: 'A' if team_1 is Team A, 'B' if team_1 is Team B
        set('b_t1_side', teamAKey === 'team_1' ? 'A' : 'B');
        // b_t2_side: 'A' if team_2 is Team A, 'B' if team_2 is Team B
        set('b_t2_side', teamAKey === 'team_2' ? 'A' : 'B');
      }

      // Team 1 players (left side of TEAMS table) - always team_1
      // Always try to populate, even if array is empty or missing
      if (team_1Players && Array.isArray(team_1Players)) {
        // Determine which coin toss data to use based on whether team_1 is A or B
        const coinTossData = match?.coinTossData;
        const isTeam1A = teamAKey === 'team_1';
        const team1CoinTossData = isTeam1A ? coinTossData?.players?.teamA : coinTossData?.players?.teamB;

        let p1No = '';
        let p2No = '';
        let p1IsCaptain = false;
        let p2IsCaptain = false;
        let p1FirstServe = false;
        let p2FirstServe = false;
        let p1FirstName = '';
        let p1LastName = '';
        let p2FirstName = '';
        let p2LastName = '';

        // Always use player objects for names (they should always have names)
        // Use coin toss data as fallback if player objects don't have names
        p1FirstName = team_1Players[0]?.firstName || team1CoinTossData?.player1?.firstName || '';
        p1LastName = team_1Players[0]?.lastName || team1CoinTossData?.player1?.lastName || '';
        p2FirstName = team_1Players[1]?.firstName || team1CoinTossData?.player2?.firstName || '';
        p2LastName = team_1Players[1]?.lastName || team1CoinTossData?.player2?.lastName || '';

        // Use coin toss data for numbers, captain, and first serve if available
        if (team1CoinTossData) {
          p1No = team1CoinTossData.player1?.number !== undefined && team1CoinTossData.player1?.number !== null
            ? String(team1CoinTossData.player1.number)
            : String(team_1Players[0]?.number || '');
          p2No = team1CoinTossData.player2?.number !== undefined && team1CoinTossData.player2?.number !== null
            ? String(team1CoinTossData.player2.number)
            : String(team_1Players[1]?.number || '');

          p1IsCaptain = team1CoinTossData.player1?.isCaptain || team_1Players[0]?.isCaptain || false;
          p2IsCaptain = team1CoinTossData.player2?.isCaptain || team_1Players[1]?.isCaptain || false;
          // First serve: check match.team1FirstServePlayer (player number who serves first for team 1)
          const team1FirstServePlayer = match?.team1FirstServePlayer;
          p1FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p1No;
          p2FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p2No;
        } else {
          // Fallback to player objects directly
          p1No = String(team_1Players[0]?.number || '');
          p2No = String(team_1Players[1]?.number || '');
          p1IsCaptain = team_1Players[0]?.isCaptain || false;
          p2IsCaptain = team_1Players[1]?.isCaptain || false;
          // First serve: check match.team1FirstServePlayer (player number who serves first for team 1)
          const team1FirstServePlayer = match?.team1FirstServePlayer;
          p1FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p1No;
          p2FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p2No;
        }

        // Format player number: circle if captain, asterisk on right if first serve
        // Only show captain/first serve markers if coin toss is confirmed
        let p1Display = p1No;
        let p2Display = p2No;
        if (isCoinTossConfirmed) {
          if (p1IsCaptain && p1FirstServe) {
            p1Display = `(${p1No})*`;
          } else if (p1IsCaptain) {
            p1Display = `(${p1No})`;
          } else if (p1FirstServe) {
            p1Display = `${p1No}*`;
          }

          if (p2IsCaptain && p2FirstServe) {
            p2Display = `(${p2No})*`;
          } else if (p2IsCaptain) {
            p2Display = `(${p2No})`;
          } else if (p2FirstServe) {
            p2Display = `${p2No}*`;
          }
        }

        set('b_t1_p1_no', p1Display);
        set('b_t1_p1_name', `${p1FirstName} ${p1LastName}`.trim());
        set('b_t1_p2_no', p2Display);
        set('b_t1_p2_name', `${p2FirstName} ${p2LastName}`.trim());
      } else if (isCoinTossConfirmed) {
        // If team_1Players array is missing or empty, try to use coin toss data (only if confirmed)
        const isTeam1A = teamAKey === 'team_1';
        const team1CoinTossData = isTeam1A ? coinTossData?.players?.teamA : coinTossData?.players?.teamB;
        if (team1CoinTossData) {
          const p1Name = `${team1CoinTossData.player1?.firstName || ''} ${team1CoinTossData.player1?.lastName || ''}`.trim();
          const p2Name = `${team1CoinTossData.player2?.firstName || ''} ${team1CoinTossData.player2?.lastName || ''}`.trim();
          const p1No = String(team1CoinTossData.player1?.number || '');
          const p2No = String(team1CoinTossData.player2?.number || '');
          const p1IsCaptain = team1CoinTossData.player1?.isCaptain || false;
          const p2IsCaptain = team1CoinTossData.player2?.isCaptain || false;
          // First serve: check match.team1FirstServePlayer (player number who serves first for team 1)
          const team1FirstServePlayer = match?.team1FirstServePlayer;
          const p1FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p1No;
          const p2FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p2No;

          let p1Display = p1No;
          if (p1IsCaptain && p1FirstServe) p1Display = `(${p1No})*`;
          else if (p1IsCaptain) p1Display = `(${p1No})`;
          else if (p1FirstServe) p1Display = `${p1No}*`;

          let p2Display = p2No;
          if (p2IsCaptain && p2FirstServe) p2Display = `(${p2No})*`;
          else if (p2IsCaptain) p2Display = `(${p2No})`;
          else if (p2FirstServe) p2Display = `${p2No}*`;

          set('b_t1_p1_no', p1Display);
          set('b_t1_p1_name', p1Name);
          set('b_t1_p2_no', p2Display);
          set('b_t1_p2_name', p2Name);
        }
      }

      // Team 2 players (right side of TEAMS table) - always team_2
      // Always try to populate, even if some data is missing
      if (team_2Players && Array.isArray(team_2Players)) {
        // Determine which coin toss data to use based on whether team_2 is A or B
        const isTeam2A = teamAKey === 'team_2';
        const team2CoinTossData = isTeam2A ? coinTossData?.players?.teamA : coinTossData?.players?.teamB;

        let p1No = '';
        let p2No = '';
        let p1IsCaptain = false;
        let p2IsCaptain = false;
        let p1FirstServe = false;
        let p2FirstServe = false;
        let p1FirstName = '';
        let p1LastName = '';
        let p2FirstName = '';
        let p2LastName = '';

        // Always use player objects for names (they should always have names)
        // Use coin toss data as fallback if player objects don't have names
        p1FirstName = team_2Players[0]?.firstName || team2CoinTossData?.player1?.firstName || '';
        p1LastName = team_2Players[0]?.lastName || team2CoinTossData?.player1?.lastName || '';
        p2FirstName = team_2Players[1]?.firstName || team2CoinTossData?.player2?.firstName || '';
        p2LastName = team_2Players[1]?.lastName || team2CoinTossData?.player2?.lastName || '';

        // Use coin toss data for numbers, captain, and first serve if available
        if (team2CoinTossData) {
          p1No = team2CoinTossData.player1?.number !== undefined && team2CoinTossData.player1?.number !== null
            ? String(team2CoinTossData.player1.number)
            : String(team_2Players[0]?.number || '');
          p2No = team2CoinTossData.player2?.number !== undefined && team2CoinTossData.player2?.number !== null
            ? String(team2CoinTossData.player2.number)
            : String(team_2Players[1]?.number || '');

          p1IsCaptain = team2CoinTossData.player1?.isCaptain || team_2Players[0]?.isCaptain || false;
          p2IsCaptain = team2CoinTossData.player2?.isCaptain || team_2Players[1]?.isCaptain || false;
          // First serve: check match.team2FirstServePlayer (player number who serves first for team 2)
          const team2FirstServePlayer = match?.team2FirstServePlayer;
          p1FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p1No;
          p2FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p2No;
        } else {
          // Fallback to player objects directly
          p1No = String(team_2Players[0]?.number || '');
          p2No = String(team_2Players[1]?.number || '');
          p1IsCaptain = team_2Players[0]?.isCaptain || false;
          p2IsCaptain = team_2Players[1]?.isCaptain || false;
          // First serve: check match.team2FirstServePlayer (player number who serves first for team 2)
          const team2FirstServePlayer = match?.team2FirstServePlayer;
          p1FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p1No;
          p2FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p2No;
        }

        // Format player number: circle if captain, asterisk on right if first serve
        // Only show captain/first serve markers if coin toss is confirmed
        let p1Display = p1No;
        let p2Display = p2No;
        if (isCoinTossConfirmed) {
          if (p1IsCaptain && p1FirstServe) {
            p1Display = `(${p1No})*`;
          } else if (p1IsCaptain) {
            p1Display = `(${p1No})`;
          } else if (p1FirstServe) {
            p1Display = `${p1No}*`;
          }

          if (p2IsCaptain && p2FirstServe) {
            p2Display = `(${p2No})*`;
          } else if (p2IsCaptain) {
            p2Display = `(${p2No})`;
          } else if (p2FirstServe) {
            p2Display = `${p2No}*`;
          }
        }

        set('b_t2_p1_no', p1Display);
        set('b_t2_p1_name', `${p1FirstName} ${p1LastName}`.trim());
        set('b_t2_p2_no', p2Display);
        set('b_t2_p2_name', `${p2FirstName} ${p2LastName}`.trim());
      } else if (isCoinTossConfirmed) {
        // If team_2Players array is missing or empty, try to use coin toss data (only if confirmed)
        const isTeam2A = teamAKey === 'team_2';
        const team2CoinTossData = isTeam2A ? coinTossData?.players?.teamA : coinTossData?.players?.teamB;
        if (team2CoinTossData) {
          const p1Name = `${team2CoinTossData.player1?.firstName || ''} ${team2CoinTossData.player1?.lastName || ''}`.trim();
          const p2Name = `${team2CoinTossData.player2?.firstName || ''} ${team2CoinTossData.player2?.lastName || ''}`.trim();
          const p1No = String(team2CoinTossData.player1?.number || '');
          const p2No = String(team2CoinTossData.player2?.number || '');
          const p1IsCaptain = team2CoinTossData.player1?.isCaptain || false;
          const p2IsCaptain = team2CoinTossData.player2?.isCaptain || false;
          // First serve: check match.team2FirstServePlayer (player number who serves first for team 2)
          const team2FirstServePlayer = match?.team2FirstServePlayer;
          const p1FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p1No;
          const p2FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p2No;

          let p1Display = p1No;
          if (p1IsCaptain && p1FirstServe) p1Display = `(${p1No})*`;
          else if (p1IsCaptain) p1Display = `(${p1No})`;
          else if (p1FirstServe) p1Display = `${p1No}*`;

          let p2Display = p2No;
          if (p2IsCaptain && p2FirstServe) p2Display = `(${p2No})*`;
          else if (p2IsCaptain) p2Display = `(${p2No})`;
          else if (p2FirstServe) p2Display = `${p2No}*`;

          set('b_t2_p1_no', p1Display);
          set('b_t2_p1_name', p1Name);
          set('b_t2_p2_no', p2Display);
          set('b_t2_p2_name', p2Name);
        }
      }

      // Sets data - process ALL sets (including current unfinished set)
      // Determine current set number first (needed in multiple places)
      let currentSetNum = 1;
      if (sets && Array.isArray(sets)) {
        // Sort sets by index
        const sortedSets = [...sets].sort((a: any, b: any) => (a.index || 0) - (b.index || 0));
        // Find current set (the one that is not finished, or the last set if all are finished)
        const currentSet = sortedSets.find((s: any) => !s.finished) || sortedSets[sortedSets.length - 1];
        currentSetNum = currentSet?.index || 1;

        sortedSets.forEach((setItem: any) => {
          const setIndex = setItem.index || 1;
          const setNum = setIndex;
          if (setNum > 3) return;

          const prefix = setNum === 1 ? 's1' : setNum === 2 ? 's2' : 's3';

          // Only process sets that have started (have a startTime or are finished)
          // This prevents filling data for sets that haven't been played yet
          // Exception: Set 1 should be initialized if coin toss is confirmed, even if not started
          const setDataForFirstServe = sets?.find((s: any) => s.index === setNum);
          const setHasStarted = setDataForFirstServe?.startTime || setDataForFirstServe?.finished;
          const shouldInitializeSet1 = setNum === 1 && isCoinTossConfirmed && !setHasStarted;

          if (!setHasStarted && !shouldInitializeSet1) {
            // Skip sets that haven't started yet (except set 1 if coin toss confirmed)
            return;
          }

          // Skip A/B processing if coin toss not confirmed (except for set 1 initialization)
          if (!isCoinTossConfirmed && !shouldInitializeSet1) {
            return;
          }

          // Determine which team serves first in this set (for team_up/team_down)
          const teamAKey = match?.coinTossTeamA || 'team_1';
          const teamBKey = match?.coinTossTeamB || 'team_2';

          // Determine which team serves first in this set from serviceOrder
          let firstServeTeam: string | null = null;
          if (setDataForFirstServe && setDataForFirstServe.serviceOrder) {
            // Find which team has a player with service order 1 (row I)
            const serviceOrder = setDataForFirstServe.serviceOrder;
            for (const [key, order] of Object.entries(serviceOrder)) {
              if (order === 1) {
                // Extract team from key (e.g., "team_1_player1" -> "team_1")
                const matchKey = key.match(/^(team_[12])_player/);
                if (matchKey) {
                  firstServeTeam = matchKey[1];
                  break;
                }
              }
            }
          }

          // Fallback: use match.firstServe or coin toss data
          if (!firstServeTeam) {
            if (setNum === 1) {
              firstServeTeam = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
            } else if (setNum === 2) {
              // Set 2: opposite of set 1
              const set1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
              firstServeTeam = set1FirstServe === teamAKey ? teamBKey : teamAKey;
            } else {
              // Set 3: use set3CoinTossWinner if available, otherwise alternate from set 2
              const coinTossData = match?.coinTossData;
              if (coinTossData?.set3CoinTossWinner) {
                firstServeTeam = coinTossData.set3CoinTossWinner;
              } else {
                const set1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                const set2FirstServe = set1FirstServe === teamAKey ? teamBKey : teamAKey;
                firstServeTeam = set2FirstServe === teamAKey ? teamBKey : teamAKey;
              }
            }
          }

          // Set team_up and team_down constants for this set
          // team_up = team that serves first (occupies upper part)
          // team_down = the other team (occupies lower part)
          const teamUp = firstServeTeam || teamAKey;
          const teamDown = teamUp === teamAKey ? teamBKey : teamAKey;

          set(`${prefix}_team_up`, teamUp);
          set(`${prefix}_team_down`, teamDown);

          // Set start/end times
          if (setItem.startTime) {
            const start = new Date(setItem.startTime);
            const hh = String(start.getHours()).padStart(2, '0');
            const mm = String(start.getMinutes()).padStart(2, '0');
            set(`${prefix}_start_hh`, hh);
            set(`${prefix}_start_mm`, mm);
          }
          if (setItem.endTime) {
            const end = new Date(setItem.endTime);
            set(`${prefix}_end_hh`, String(end.getHours()).padStart(2, '0'));
            set(`${prefix}_end_mm`, String(end.getMinutes()).padStart(2, '0'));
          }

          // Only set A/B and team labels for the CURRENT set
          if (setNum === currentSetNum) {
            // Set sides (A/B) - determine from who serves first in this set
            // The team that serves first goes ABOVE (rows I and III), the other team goes BELOW (rows II and IV)
            const teamAKey = match?.coinTossTeamA || 'team_1';
            const teamBKey = match?.coinTossTeamB || 'team_2';

            // Get the set data to access serviceOrder
            const setDataForSides = sets?.find((s: any) => s.index === setNum);

            // Determine which team serves first in this set from serviceOrder
            // Check serviceOrder to see which team has order 1 (row I)
            let firstServeTeam: string | null = null;
            if (setDataForSides && setDataForSides.serviceOrder) {
              // Find which team has a player with service order 1 (row I)
              const serviceOrder = setDataForSides.serviceOrder;
              for (const [key, order] of Object.entries(serviceOrder)) {
                if (order === 1) {
                  // Extract team from key (e.g., "team_1_player1" -> "team_1")
                  const matchKey = key.match(/^(team_[12])_player/);
                  if (matchKey) {
                    firstServeTeam = matchKey[1];
                    break;
                  }
                }
              }
            }

            // Fallback: use match.firstServe or coin toss data
            if (!firstServeTeam) {
              if (setNum === 1) {
                firstServeTeam = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
              } else if (setNum === 2) {
                const set1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                firstServeTeam = set1FirstServe === teamAKey ? teamBKey : teamAKey;
              } else {
                const coinTossData = match?.coinTossData;
                if (coinTossData?.set3CoinTossWinner) {
                  firstServeTeam = coinTossData.set3CoinTossWinner;
                } else {
                  const set1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                  const set2FirstServe = set1FirstServe === teamAKey ? teamBKey : teamAKey;
                  firstServeTeam = set2FirstServe === teamAKey ? teamBKey : teamAKey;
                }
              }
            }

            // Determine which team is above (serves first) and which is below
            const aboveTeamKey = firstServeTeam;
            const belowTeamKey = firstServeTeam === teamAKey ? teamBKey : teamAKey;

            // Determine A/B labels based on coin toss (teamAKey is always A, teamBKey is always B)
            const aboveIsA = aboveTeamKey === teamAKey;
            const belowIsA = belowTeamKey === teamAKey;

            // Set header A/B circles and team labels (only for current set)
            // Header always shows: t1 (left) = team_1, t2 (right) = team_2
            // A/B labels are based on coin toss (teamAKey is always A, teamBKey is always B)
            // The team serving first (above) goes in rows I and III, the other team (below) goes in rows II and IV
            // But in the header, we just show which team is A and which is B based on coin toss
            const team1IsA = teamAKey === 'team_1';
            const team2IsA = teamAKey === 'team_2';

            set('t1_side', team1IsA ? 'A' : 'B');
            set('t2_side', team2IsA ? 'A' : 'B');

            // Set team names
            if (team_1Team) {
              const t1Name = team_1Team.name || '';
              set('t1_name', t1Name);
            }
            if (team_2Team) {
              const t2Name = team_2Team.name || '';
              set('t2_name', t2Name);
            }

            // Set sides for this set: above team (serves first) gets rows I and III
            if (aboveTeamKey === 'team_1') {
              set(`${prefix}_t1_side`, aboveIsA ? 'A' : 'B');
              set(`${prefix}_t2_side`, belowIsA ? 'A' : 'B');
            } else {
              set(`${prefix}_t1_side`, belowIsA ? 'A' : 'B');
              set(`${prefix}_t2_side`, aboveIsA ? 'A' : 'B');
            }
          }
        });
      }

      // Results section - calculate from ALL sets (including current unfinished set)
      // Only fill A/B results if coin toss is confirmed
      if (sets && Array.isArray(sets) && isCoinTossConfirmed) {
        // Sort sets by index and process all (not just finished)
        const sortedSets = [...sets].sort((a: any, b: any) => (a.index || 0) - (b.index || 0));

        sortedSets.forEach((setItem: any) => {
          const setIndex = setItem.index || 1;
          const setNum = setIndex;
          if (setNum <= 3) {
            // Set scores - use current scores even if set not finished
            // IMPORTANT: Use the actual set data, not accumulated values
            const team_1Points = Number(setItem.team_1Points) || 0;
            const team_2Points = Number(setItem.team_2Points) || 0;

            // Determine which team is A and which is B
            const teamAKey = match?.coinTossTeamA || 'team_1';
            const teamBKey = match?.coinTossTeamB || 'team_2';

            const teamAPoints = teamAKey === 'team_1' ? team_1Points : team_2Points;
            const teamBPoints = teamBKey === 'team_1' ? team_1Points : team_2Points;

            set(`res_s${setNum}_p_a`, String(teamAPoints));
            set(`res_s${setNum}_p_b`, String(teamBPoints));

            // Set wins (1 if team won, 0 if lost or tied) - only if set is finished
            if (setItem.finished) {
              set(`res_s${setNum}_w_a`, teamAPoints > teamBPoints ? '1' : '0');
              set(`res_s${setNum}_w_b`, teamBPoints > teamAPoints ? '1' : '0');
            }

            // Set duration (calculate from start/end times)
            if (setItem.startTime && setItem.endTime) {
              const start = new Date(setItem.startTime);
              const end = new Date(setItem.endTime);
              const duration = Math.round((end.getTime() - start.getTime()) / 60000); // minutes
              set(`res_s${setNum}_dur`, String(duration));
            }
          }
        });

        // Total - calculate from all sets
        const teamAKey = match?.coinTossTeamA || 'team_1';
        const teamBKey = match?.coinTossTeamB || 'team_2';

        const totalTeamA = sortedSets.reduce((sum: number, s: any) => {
          const points = teamAKey === 'team_1' ? (Number(s.team_1Points) || 0) : (Number(s.team_2Points) || 0);
          return sum + points;
        }, 0);
        const totalTeamB = sortedSets.reduce((sum: number, s: any) => {
          const points = teamBKey === 'team_1' ? (Number(s.team_1Points) || 0) : (Number(s.team_2Points) || 0);
          return sum + points;
        }, 0);

        // Debug: Log total scores

        const finishedSets = sortedSets.filter((s: any) => s.finished);
        const totalTeamAWins = finishedSets.filter((s: any) => {
          const teamAPoints = teamAKey === 'team_1' ? (s.team_1Points || 0) : (s.team_2Points || 0);
          const teamBPoints = teamBKey === 'team_1' ? (s.team_1Points || 0) : (s.team_2Points || 0);
          return teamAPoints > teamBPoints;
        }).length;
        const totalTeamBWins = finishedSets.filter((s: any) => {
          const teamAPoints = teamAKey === 'team_1' ? (s.team_1Points || 0) : (s.team_2Points || 0);
          const teamBPoints = teamBKey === 'team_1' ? (s.team_1Points || 0) : (s.team_2Points || 0);
          return teamBPoints > teamAPoints;
        }).length;

        set('res_tot_p_a', String(totalTeamA));
        set('res_tot_p_b', String(totalTeamB));
        set('res_tot_w_a', String(totalTeamAWins));
        set('res_tot_w_b', String(totalTeamBWins));

        // Total duration (already calculated above in match duration)
        if (sortedSets.length > 0) {
          const resFirstSet = sortedSets[0];
          const resLastSet = sortedSets[sortedSets.length - 1];
          if (resFirstSet?.startTime && resLastSet?.endTime) {
            const resStart = new Date(resFirstSet.startTime);
            const resEnd = new Date(resLastSet.endTime);
            const resTotalMinutes = Math.round((resEnd.getTime() - resStart.getTime()) / 60000);
            set('res_tot_dur', String(resTotalMinutes));
          }
        }

        // Match duration and times
        if (sortedSets.length > 0) {
          const matchFirstSet = sortedSets[0];
          const matchLastSet = sortedSets[sortedSets.length - 1];

          if (matchFirstSet?.startTime) {
            const matchStart = new Date(matchFirstSet.startTime);
            set('match_start_h', String(matchStart.getHours()).padStart(2, '0'));
            set('match_start_m', String(matchStart.getMinutes()).padStart(2, '0'));

            if (matchLastSet?.endTime) {
              const matchEnd = new Date(matchLastSet.endTime);
              const totalMinutes = Math.round((matchEnd.getTime() - matchStart.getTime()) / 60000);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              set('match_dur_h', String(hours));
              set('match_dur_m', String(minutes));
              set('match_end_h', String(matchEnd.getHours()).padStart(2, '0'));
              set('match_end_m', String(matchEnd.getMinutes()).padStart(2, '0'));
            }
          }
        }

        // Winner - only if match is finished
        // Always show "2": X format (winner always has 2 wins)
        if (finishedSets.length >= 2 && finishedSets.some((s: any) => {
          const teamAPoints = teamAKey === 'team_1' ? (s.team_1Points || 0) : (s.team_2Points || 0);
          const teamBPoints = teamBKey === 'team_1' ? (s.team_1Points || 0) : (s.team_2Points || 0);
          return teamAPoints > teamBPoints;
        })) {
          if (totalTeamAWins > totalTeamBWins) {
            const winnerTeam = teamAKey === 'team_1' ? team_1Team : team_2Team;
            if (winnerTeam) {
              set('winner_name', winnerTeam.name || '');
              set('winner_country', winnerTeam.country || '');
            }
            set('win_score_winner', '2');
            set('win_score_other', String(totalTeamBWins));
          } else if (totalTeamBWins > totalTeamAWins) {
            const winnerTeam = teamBKey === 'team_1' ? team_1Team : team_2Team;
            if (winnerTeam) {
              set('winner_name', winnerTeam.name || '');
              set('winner_country', winnerTeam.country || '');
            }
            set('win_score_winner', '2');
            set('win_score_other', String(totalTeamAWins));
          }
        }
      }

      // Officials (from match.officials if available)
      // match.officials is an array of { role, firstName, lastName, country, position? }
      if (match?.officials && Array.isArray(match.officials)) {

        // Process line judges separately to handle positions correctly
        const lineJudges = match.officials
          .filter((o: any) => o.role === 'line judge')
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));


        // Process other officials first
        match.officials.forEach((official: any) => {
          const fullName = `${official.firstName || ''} ${official.lastName || ''}`.trim();
          const country = official.country || '';

          if (official.role === '1st referee') {
            set('ref1_name', fullName);
            set('ref1_country', country);
          } else if (official.role === '2nd referee') {
            set('ref2_name', fullName);
            set('ref2_country', country);
          } else if (official.role === 'scorer') {
            set('scorer_name', fullName);
            set('scorer_country', country);
          } else if (official.role === 'assistant scorer') {
            set('asst_scorer_name', fullName);
            set('asst_scorer_country', country);
          }
        });

        // Process line judges with correct position assignment
        lineJudges.forEach((judge: any, index: number) => {
          const fullName = `${judge.firstName || ''} ${judge.lastName || ''}`.trim();
          // Use position from data if available, otherwise use index + 1
          const position = judge.position !== undefined && judge.position !== null
            ? judge.position
            : index + 1;

          if (position >= 1 && position <= 4 && fullName) {
            set(`lj${position}`, fullName);
          }
        });
      } else {
      }

      // Coin toss data
      if (match?.coinTossData) {
        const coinTossData = match.coinTossData;
        // Determine which team is A and which is B
        const teamAKey = match.coinTossTeamA || 'team_1';
        const teamBKey = match.coinTossTeamB || (teamAKey === 'team_1' ? 'team_2' : 'team_1');

        // Set 1 coin toss winner
        // coinTossWinner can be teamAKey or teamBKey, or it might be stored as 'team1'/'team2' format
        if (coinTossData.coinTossWinner) {
          // Handle both 'team_1'/'team_2' and 'team1'/'team2' formats
          let winnerKey = coinTossData.coinTossWinner;
          if (winnerKey === 'team1') winnerKey = 'team_1';
          else if (winnerKey === 'team2') winnerKey = 'team_2';
          else if (winnerKey === 'home') winnerKey = 'team_1';
          
          // Determine if winner is Team A or Team B
          const set1Winner = (winnerKey === teamAKey) ? 'A' : 'B';
          set('coin_s1', set1Winner);
        } else if (match?.coinTossConfirmed && teamAKey) {
          // If coin toss is confirmed but coinTossWinner is not set, default to Team A (coin toss winner)
          set('coin_s1', 'A');
        }

        // Set 3 coin toss winner
        if (coinTossData.set3CoinTossWinner) {
          let set3WinnerKey = coinTossData.set3CoinTossWinner;
          if (set3WinnerKey === 'team1') set3WinnerKey = 'team_1';
          else if (set3WinnerKey === 'team2') set3WinnerKey = 'team_2';
          else if (set3WinnerKey === 'home') set3WinnerKey = 'team_1';
          
          // Determine if winner is Team A or Team B
          const set3Winner = (set3WinnerKey === teamAKey) ? 'A' : 'B';
          set('coin_s3', set3Winner);
        }

        // Service order and player numbers - will be filled per set based on serviceOrder
        // This is now handled in the set processing loop below
      }

      // Process events to fill points, timeouts, sanctions, court switches, medical assistance
      if (events && Array.isArray(events)) {
        // Group events by set
        const eventsBySet: Record<number, any[]> = {};
        events.forEach((event: any) => {
          const setIndex = event.setIndex || 1;
          if (!eventsBySet[setIndex]) {
            eventsBySet[setIndex] = [];
          }
          eventsBySet[setIndex].push(event);
        });


        // First pass: Track which teams received formal warnings and delay warnings in each set
        const formalWarningsBySet: Record<number, Set<string>> = {}; // setIndex -> Set of teamKeys
        const delayWarningsBySet: Record<number, Set<string>> = {}; // setIndex -> Set of teamKeys

        Object.keys(eventsBySet).forEach((setIdxStr) => {
          const setIndex = parseInt(setIdxStr);
          formalWarningsBySet[setIndex] = new Set();
          delayWarningsBySet[setIndex] = new Set();

          eventsBySet[setIndex].forEach((event: any) => {
            if (event.type === 'sanction') {
              const sanctionTeam = event.payload?.team;
              const sanctionType = event.payload?.type;

              if (sanctionType === 'warning') {
                formalWarningsBySet[setIndex].add(sanctionTeam);
              } else if (sanctionType === 'delay_warning') {
                delayWarningsBySet[setIndex].add(sanctionTeam);
              }
            }
          });
        });

        // Process each set - ensure we process sets 1, 2, and 3 even if they have no events
        const allSetIndices = new Set<number>();
        // Add sets from events
        Object.keys(eventsBySet).forEach((setIdxStr) => {
          allSetIndices.add(parseInt(setIdxStr));
        });
        // Add sets from sets array
        if (sets && Array.isArray(sets)) {
          sets.forEach((s: any) => {
            if (s.index && s.index <= 3) {
              allSetIndices.add(s.index);
            }
          });
        }
        // Ensure sets 1, 2, 3 are always included
        allSetIndices.add(1);
        allSetIndices.add(2);
        allSetIndices.add(3);

        // First, ensure labels are set for all sets from 1 to currentSetNum
        // This ensures labels appear for current set and all previous sets (currentSetNum - x where x >= 0)
        // Get team data from matchData (already loaded, no need to fetch from db)
        // Determine team A and B (same for all sets, based on coin toss)
        const coinTossTeamAKey = match?.coinTossTeamA || 'team_1';
        const coinTossTeamBKey = match?.coinTossTeamB || (coinTossTeamAKey === 'team_1' ? 'team_2' : 'team_1');

        // Get team countries and colors from already loaded team data
        const coinTossTeamACountry = coinTossTeamAKey === 'team_1'
          ? (team_1Team?.country || match?.team_1Country || '')
          : (team_2Team?.country || match?.team_2Country || '');
        const coinTossTeamBCountry = coinTossTeamBKey === 'team_1'
          ? (team_1Team?.country || match?.team_1Country || '')
          : (team_2Team?.country || match?.team_2Country || '');
        const coinTossTeamAColor = coinTossTeamAKey === 'team_1' ? (team_1Team?.color || '#89bdc3') : (team_2Team?.color || '#323134');
        const coinTossTeamBColor = coinTossTeamBKey === 'team_1' ? (team_1Team?.color || '#89bdc3') : (team_2Team?.color || '#323134');

        // Format: "Country" (no color name)
        const coinTossTeamALabel = coinTossTeamACountry || '';
        const coinTossTeamBLabel = coinTossTeamBCountry || '';

        // Store team colors for t1 and t2
        const coinTossT1Color = coinTossTeamAKey === 'team_1' ? coinTossTeamAColor : coinTossTeamBColor;
        const coinTossT2Color = coinTossTeamAKey === 'team_2' ? coinTossTeamAColor : coinTossTeamBColor;

        // Set labels for all sets from 1 to currentSetNum (only for sets that have started)
        // Exception: Set 1 should be initialized if coin toss is confirmed, even if not started
        for (let setNum = 1; setNum <= currentSetNum && setNum <= 3; setNum++) {
          const prefix = setNum === 1 ? 's1' : setNum === 2 ? 's2' : 's3';

          // Only set labels for sets that have actually started (have a startTime or are finished)
          // Exception: Set 1 if coin toss is confirmed
          const setData = sets?.find((s: any) => s.index === setNum);
          const setHasStarted = setData?.startTime || setData?.finished;
          const shouldInitializeSet1 = setNum === 1 && isCoinTossConfirmed && !setHasStarted;

          if (setHasStarted || shouldInitializeSet1) {
            // Store colors for this set
            set(`${prefix}_t1_team_color`, coinTossT1Color);
            set(`${prefix}_t2_team_color`, coinTossT2Color);

            // Set team circle/label for this set (current set and all previous sets)
            const t1IsA = coinTossTeamAKey === 'team_1';
            const t2IsA = coinTossTeamAKey === 'team_2';

            console.log(`[DEBUG Set ${setNum}] Setting team labels:`, {
              coinTossTeamAKey,
              coinTossTeamBKey,
              coinTossTeamALabel,
              coinTossTeamBLabel,
              t1IsA,
              t2IsA,
              t1Circle: t1IsA ? 'A' : 'B',
              t1Label: t1IsA ? coinTossTeamALabel : coinTossTeamBLabel,
              t2Circle: t2IsA ? 'A' : 'B',
              t2Label: t2IsA ? coinTossTeamALabel : coinTossTeamBLabel
            });

            set(`${prefix}_t1_team_circle`, t1IsA ? 'A' : 'B');
            set(`${prefix}_t1_team_label`, t1IsA ? coinTossTeamALabel : coinTossTeamBLabel);
            set(`${prefix}_t2_team_circle`, t2IsA ? 'A' : 'B');
            set(`${prefix}_t2_team_label`, t2IsA ? coinTossTeamALabel : coinTossTeamBLabel);
          }
        }

        Array.from(allSetIndices).sort().forEach((setIndex) => {
          const setNum = setIndex;
          if (setNum > 3) return;

          // Only process sets that have started (have a startTime or are finished)
          // This prevents filling data for sets that haven't been played yet (e.g., set 3 when only set 1 and 2 are played)
          // Exception: Set 1 should be initialized if coin toss is confirmed, even if not started
          const setDataForEvents = sets?.find((s: any) => s.index === setNum);
          const setHasStarted = setDataForEvents?.startTime || setDataForEvents?.finished;
          const shouldInitializeSet1 = setNum === 1 && isCoinTossConfirmed && !setHasStarted;

          if (!setHasStarted && !shouldInitializeSet1) {
            // Skip sets that haven't started yet (except set 1 if coin toss confirmed)
            return;
          }

          const prefix = setNum === 1 ? 's1' : setNum === 2 ? 's2' : 's3';
          const setEvents = (eventsBySet[setIndex] || []).sort((a: any, b: any) => {
            const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
            const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
            return aTime - bTime;
          });


          // Determine team A and B for this set
          // Use the same coin toss keys as in the initialization section to ensure consistency
          // Normalize team keys to 'team_1'/'team_2' format
          let teamAKey = match?.coinTossTeamA || 'team_1';
          if (teamAKey === 'team1') teamAKey = 'team_1';
          else if (teamAKey === 'team2') teamAKey = 'team_2';
          else if (teamAKey === 'home') teamAKey = 'team_1';
          
          let teamBKey = match?.coinTossTeamB || (teamAKey === 'team_1' ? 'team_2' : 'team_1');
          if (teamBKey === 'team1') teamBKey = 'team_1';
          else if (teamBKey === 'team2') teamBKey = 'team_2';
          else if (teamBKey === 'home') teamBKey = 'team_1';
          
          // Ensure teamBKey is the opposite of teamAKey
          if (!teamBKey || teamBKey === teamAKey) {
            teamBKey = teamAKey === 'team_1' ? 'team_2' : 'team_1';
          }

          // Get the set data to access serviceOrder (use setDataForEvents which was already found)
          const setData = setDataForEvents;

          // Track points for each team (team_up and team_down, not teamA/teamB)
          let teamUpPointCount = 0;
          let teamDownPointCount = 0;
          let teamUpTimeoutCount = 0;
          let teamDownTimeoutCount = 0;

          // Get coin toss data for player mapping
          const coinTossData = match?.coinTossData?.players;
          const teamAData = coinTossData?.teamA;
          const teamBData = coinTossData?.teamB;

          // Get team_up and team_down for this set to ensure correct row assignment
          // For set 1, if coin toss is confirmed but set hasn't started, determine from firstServe
          let teamUp = get(`${prefix}_team_up`);
          let teamDown = get(`${prefix}_team_down`);
          
          if (!teamUp || !teamDown) {
            // Determine first serve team for this set
            let firstServeTeam: string | null = null;
            if (setData?.serviceOrder) {
              const serviceOrder = setData.serviceOrder;
              for (const [key, order] of Object.entries(serviceOrder)) {
                if (order === 1) {
                  const matchKey = key.match(/^(team_[12])_player/);
                  if (matchKey) {
                    firstServeTeam = matchKey[1];
                    break;
                  }
                }
              }
            }
            
            // Helper function to normalize team keys
            const normalizeTeamKey = (key: string): string => {
              if (key === 'team1' || key === 'home') return 'team_1';
              if (key === 'team2') return 'team_2';
              return key; // Already in correct format or unknown
            };
            
            // Fallback: use match.firstServe or coin toss data
            if (!firstServeTeam) {
              if (setNum === 1) {
                const rawFirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                firstServeTeam = normalizeTeamKey(rawFirstServe);
              } else if (setNum === 2) {
                const rawSet1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                const set1FirstServe = normalizeTeamKey(rawSet1FirstServe);
                firstServeTeam = set1FirstServe === teamAKey ? teamBKey : teamAKey;
              } else {
                const coinTossDataForSet3 = match?.coinTossData;
                if (coinTossDataForSet3?.set3CoinTossWinner) {
                  firstServeTeam = normalizeTeamKey(coinTossDataForSet3.set3CoinTossWinner);
                } else {
                  const rawSet1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                  const set1FirstServe = normalizeTeamKey(rawSet1FirstServe);
                  const set2FirstServe = set1FirstServe === teamAKey ? teamBKey : teamAKey;
                  firstServeTeam = set2FirstServe === teamAKey ? teamBKey : teamAKey;
                }
              }
            } else {
              // Normalize firstServeTeam if it was found from serviceOrder
              firstServeTeam = normalizeTeamKey(firstServeTeam);
            }
            
            teamUp = firstServeTeam || teamAKey;
            teamDown = teamUp === teamAKey ? teamBKey : teamAKey;
            
            // Store for later use
            set(`${prefix}_team_up`, teamUp);
            set(`${prefix}_team_down`, teamDown);
          }

          // Get team data for team_up and team_down
          const teamUpData = teamUp === teamAKey ? teamAData : teamBData;
          const teamDownData = teamDown === teamAKey ? teamAData : teamBData;

          // Calculate serviceOrder from coin toss data if not present on set
          let serviceOrder = setData?.serviceOrder;
          if (!serviceOrder || Object.keys(serviceOrder).length === 0) {
            // Calculate serviceOrder from coin toss data
            // The team that serves first gets positions I (1) and III (3)
            // The team that receives first gets positions II (2) and IV (4)
            const servingTeamIsA = teamUp === teamAKey;
            const servingTeamData = servingTeamIsA ? teamAData : teamBData;
            const receivingTeamData = servingTeamIsA ? teamBData : teamAData;
            
            // Normalize team keys to 'team_1'/'team_2' format for serviceOrder keys
            // teamUp and teamDown should already be normalized, but ensure consistency
            const servingTeamKey = teamUp;
            const receivingTeamKey = teamDown;
            
            serviceOrder = {};
            
            // Serving team: player with firstServe gets position I (1), other gets III (3)
            if (servingTeamData?.player1?.firstServe) {
              serviceOrder[`${servingTeamKey}_player1`] = 1;
              serviceOrder[`${servingTeamKey}_player2`] = 3;
            } else if (servingTeamData?.player2?.firstServe) {
              serviceOrder[`${servingTeamKey}_player1`] = 3;
              serviceOrder[`${servingTeamKey}_player2`] = 1;
            } else {
              // Fallback: if firstServe not set, use player1 for position I
              serviceOrder[`${servingTeamKey}_player1`] = 1;
              serviceOrder[`${servingTeamKey}_player2`] = 3;
            }
            
            // Receiving team: player with firstServe gets position II (2), other gets IV (4)
            if (receivingTeamData?.player1?.firstServe) {
              serviceOrder[`${receivingTeamKey}_player1`] = 2;
              serviceOrder[`${receivingTeamKey}_player2`] = 4;
            } else if (receivingTeamData?.player2?.firstServe) {
              serviceOrder[`${receivingTeamKey}_player1`] = 4;
              serviceOrder[`${receivingTeamKey}_player2`] = 2;
            } else {
              // Fallback: if firstServe not set, use player1 for position II
              serviceOrder[`${receivingTeamKey}_player1`] = 2;
              serviceOrder[`${receivingTeamKey}_player2`] = 4;
            }
          }

          // Fill player rotation boxes (I, II, III, IV) based on serviceOrder for this set
          // team_up players should ALWAYS be in rows I and III, team_down players in rows II and IV
          // regardless of what serviceOrder says
          let playerNumbersSet = false;
          if (serviceOrder && Object.keys(serviceOrder).length > 0) {

            // Find which players belong to team_up and team_down from serviceOrder
            // We need to track players by their serviceOrder position (1=I, 2=II, 3=III, 4=IV)
            const playersByPosition: Record<number, { teamKey: string; playerNumber: string }> = {};

            Object.keys(serviceOrder).forEach((key: string) => {
              const matchKey = key.match(/^(team_[12])_player([12])$/);
              if (matchKey) {
                const teamKey = matchKey[1];
                const playerNum = matchKey[2];

                // Get player number from coin toss data
                let playerNumber = '';
                if (teamKey === teamAKey) {
                  if (playerNum === '1' && teamAData?.player1) {
                    playerNumber = String(teamAData.player1.number || '');
                  } else if (playerNum === '2' && teamAData?.player2) {
                    playerNumber = String(teamAData.player2.number || '');
                  }
                } else if (teamKey === teamBKey) {
                  if (playerNum === '1' && teamBData?.player1) {
                    playerNumber = String(teamBData.player1.number || '');
                  } else if (playerNum === '2' && teamBData?.player2) {
                    playerNumber = String(teamBData.player2.number || '');
                  }
                }

                console.log(`[DEBUG Set ${setNum}] Processing serviceOrder key:`, {
                  key,
                  teamKey,
                  playerNum,
                  playerNumber,
                  teamAKey,
                  teamBKey,
                  teamUp,
                  teamDown,
                  teamAData: { p1: teamAData?.player1?.number, p2: teamAData?.player2?.number },
                  teamBData: { p1: teamBData?.player1?.number, p2: teamBData?.player2?.number }
                });

                if (playerNumber) {
                  const position = serviceOrder[key] as number;
                  if (position >= 1 && position <= 4) {
                    playersByPosition[position] = { teamKey, playerNumber };
                    console.log(`[DEBUG Set ${setNum}] Mapped position ${position} (${position === 1 ? 'I' : position === 2 ? 'II' : position === 3 ? 'III' : 'IV'}) to player ${playerNumber} from team ${teamKey}`);
                  }
                } else {
                  console.warn(`[DEBUG Set ${setNum}] No player number found for key: ${key}`);
                }
              } else {
                console.warn(`[DEBUG Set ${setNum}] serviceOrder key doesn't match pattern: ${key}`);
              }
            });

            // Now assign players to rows based on serviceOrder positions
            // Position 1 = row I (r1), Position 2 = row II (r2), Position 3 = row III (r3), Position 4 = row IV (r4)
            // But we need to ensure team_up players go to rows I and III, team_down to rows II and IV
            const teamUpPlayerNumbers: string[] = [];
            const teamDownPlayerNumbers: string[] = [];

            // Collect players by team
            [1, 2, 3, 4].forEach(position => {
              const playerInfo = playersByPosition[position];
              if (playerInfo) {
                if (playerInfo.teamKey === teamUp) {
                  teamUpPlayerNumbers.push(playerInfo.playerNumber);
                } else if (playerInfo.teamKey === teamDown) {
                  teamDownPlayerNumbers.push(playerInfo.playerNumber);
                }
              }
            });

            console.log(`[DEBUG Set ${setNum}] serviceOrder player assignment:`, {
              serviceOrder,
              playersByPosition,
              teamUp,
              teamDown,
              teamUpPlayerNumbers,
              teamDownPlayerNumbers,
              teamAData: { p1: teamAData?.player1?.number, p2: teamAData?.player2?.number },
              teamBData: { p1: teamBData?.player1?.number, p2: teamBData?.player2?.number }
            });

            // Assign players to rows: team_up -> I (r1) and III (r3), team_down -> II (r2) and IV (r4)
            if (teamUpPlayerNumbers.length >= 1) {
              set(`${prefix}_r1_player`, teamUpPlayerNumbers[0]);
              playerNumbersSet = true;
              console.log(`[DEBUG Set ${setNum}] Set r1_player = ${teamUpPlayerNumbers[0]}`);
            }
            if (teamUpPlayerNumbers.length >= 2) {
              set(`${prefix}_r3_player`, teamUpPlayerNumbers[1]);
              playerNumbersSet = true;
              console.log(`[DEBUG Set ${setNum}] Set r3_player = ${teamUpPlayerNumbers[1]}`);
            }
            if (teamDownPlayerNumbers.length >= 1) {
              set(`${prefix}_r2_player`, teamDownPlayerNumbers[0]);
              playerNumbersSet = true;
              console.log(`[DEBUG Set ${setNum}] Set r2_player = ${teamDownPlayerNumbers[0]}`);
            }
            if (teamDownPlayerNumbers.length >= 2) {
              set(`${prefix}_r4_player`, teamDownPlayerNumbers[1]);
              playerNumbersSet = true;
              console.log(`[DEBUG Set ${setNum}] Set r4_player = ${teamDownPlayerNumbers[1]}`);
            }
          }
          
          // Fallback to coin toss data if serviceOrder not available or empty (for set 1)
          // team_up goes in rows I and III (ABOVE), team_down goes in rows II and IV (BELOW)
          if (!playerNumbersSet) {
            console.log(`[DEBUG Set ${setNum}] Using fallback - playerNumbersSet=false`, {
              teamUpData: { p1: teamUpData?.player1?.number, p2: teamUpData?.player2?.number },
              teamDownData: { p1: teamDownData?.player1?.number, p2: teamDownData?.player2?.number }
            });
            if (teamUpData) {
              const p1Num = String(teamUpData.player1?.number || '');
              const p2Num = String(teamUpData.player2?.number || '');
              if (p1Num) {
                set(`${prefix}_r1_player`, p1Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r1_player = ${p1Num}`);
              }
              if (p2Num) {
                set(`${prefix}_r3_player`, p2Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r3_player = ${p2Num}`);
              }
            }
            if (teamDownData) {
              const p1Num = String(teamDownData.player1?.number || '');
              const p2Num = String(teamDownData.player2?.number || '');
              if (p1Num) {
                set(`${prefix}_r2_player`, p1Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r2_player = ${p1Num}`);
              }
              if (p2Num) {
                set(`${prefix}_r4_player`, p2Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r4_player = ${p2Num}`);
              }
            }
          }

          // Map player numbers to row keys (r1=I, r2=II, r3=III, r4=IV) for event processing
          // Based on team_up/team_down, not teamA/teamB
          const playerToRow: Record<string, string> = {};
          if (teamUpData) {
            if (teamUpData.player1?.number) playerToRow[String(teamUpData.player1.number)] = 'r1'; // I
            if (teamUpData.player2?.number) playerToRow[String(teamUpData.player2.number)] = 'r3'; // III
          }
          if (teamDownData) {
            if (teamDownData.player1?.number) playerToRow[String(teamDownData.player1.number)] = 'r2'; // II
            if (teamDownData.player2?.number) playerToRow[String(teamDownData.player2.number)] = 'r4'; // IV
          }

          // Track service rotation: columns used for each player row (1-21)
          const serviceRotationColumn: Record<string, number> = { r1: 0, r2: 0, r3: 0, r4: 0 }; // Next column to use for each row

          // Map service order to row keys (global rotation: I=1, II=2, III=3, IV=4)
          const orderToRow: Record<number, string> = { 1: 'r1', 2: 'r2', 3: 'r3', 4: 'r4' };

          // Determine initial serving player from first rally_start event
          // Service rotation order is global: I (1) -> II (2) -> III (3) -> IV (4) -> I (1) -> ...
          let currentServiceOrder: number | null = null; // Will be set from first rally_start event

          // Find first rally_start to determine initial service order
          const firstRallyStart = setEvents.find((e: any) => e.type === 'rally_start');
          if (firstRallyStart && setData?.serviceOrder) {
            const servingTeamFromEvent = firstRallyStart.payload?.servingTeam;
            const servingPlayerNumber = firstRallyStart.payload?.servingPlayerNumber;
            const serviceOrder = setData.serviceOrder;
            const teamKey = servingTeamFromEvent === teamAKey ? teamAKey : teamBKey;

            // Determine which player this is (player1 or player2)
            let playerKey = '';
            if (teamKey === teamAKey) {
              if (teamAData?.player1?.number === servingPlayerNumber) {
                playerKey = `${teamKey}_player1`;
              } else if (teamAData?.player2?.number === servingPlayerNumber) {
                playerKey = `${teamKey}_player2`;
              }
            } else if (teamKey === teamBKey) {
              if (teamBData?.player1?.number === servingPlayerNumber) {
                playerKey = `${teamKey}_player1`;
              } else if (teamBData?.player2?.number === servingPlayerNumber) {
                playerKey = `${teamKey}_player2`;
              }
            }

            if (playerKey && serviceOrder[playerKey]) {
              currentServiceOrder = serviceOrder[playerKey];
            }
          }

          // Fallback: if no rally_start found, start with order 1
          if (currentServiceOrder === null) {
            currentServiceOrder = 1;
          }

          // Track delay/misconduct penalty points (these should be circled, not slashed)
          const delayPenaltyPoints: Set<number> = new Set();
          const misconductPenaltyPoints: Set<number> = new Set();

          // Track court switches to determine which team is on which side at any given point
          let courtSwitchCount = 0; // Number of court switches that have occurred before current event

          // Process events in chronological order to track scores at each event
          setEvents.forEach((event: any, eventIndex: number) => {
            // Track court switches - each switch flips which team is on left/right
            if (event.type === 'court_switch') {
              courtSwitchCount++;
            }

            // Determine which team is on left/right at this point in time
            // After an even number of switches, teams are in base position (A left, B right)
            // After an odd number of switches, teams are flipped (B left, A right)
            const isFlipped = courtSwitchCount % 2 === 1;
            const leftTeamKey = isFlipped ? teamBKey : teamAKey;
            const rightTeamKey = isFlipped ? teamAKey : teamBKey;

            // Calculate current score before this event
            // Track both teamA/teamB (for calculations) and team_up/team_down (for display)
            const pointsBefore = setEvents.slice(0, eventIndex).reduce((acc: any, e: any) => {
              if (e.type === 'point') {
                if (e.payload?.team === teamAKey) acc.teamA++;
                else if (e.payload?.team === teamBKey) acc.teamB++;
                // Also track team_up/team_down
                if (e.payload?.team === teamUp) acc.teamUp++;
                else if (e.payload?.team === teamDown) acc.teamDown++;
              }
              return acc;
            }, { teamA: 0, teamB: 0, teamUp: 0, teamDown: 0 });

            if (event.type === 'point') {
              const pointTeam = event.payload?.team;

              // Get the serving team from the previous rally_start event
              // Look backwards to find the most recent rally_start before this point
              let servingTeam: string | null = null;
              for (let i = eventIndex - 1; i >= 0; i--) {
                const prevEvent = setEvents[i];
                if (prevEvent.type === 'rally_start') {
                  servingTeam = prevEvent.payload?.servingTeam || null;
                  break;
                }
              }

              // Check if this point was scored due to the OTHER team getting penalized
              // Only check the fromPenalty flag - don't check recent events as it can cause false positives
              const isPointFromOtherTeamPenalty = event.payload?.fromPenalty === true;

              // Determine if the serving team lost the point (opponent scored)
              const servingTeamLostPoint = servingTeam && pointTeam !== servingTeam;

              // Track team totals - assign to team_up/team_down, not teamA/teamB
              // Determine which suffix to use (t1 or t2) based on team_up/team_down
              const teamUpSuffix = teamUp === 'team_1' ? 't1' : 't2';
              const teamDownSuffix = teamDown === 'team_1' ? 't1' : 't2';

              if (pointTeam === teamUp) {
                teamUpPointCount++;
                if (teamUpPointCount <= 44) {
                  // Use 'circle' if point was scored due to other team's penalty, 'slash' for regular points
                  if (isPointFromOtherTeamPenalty) {
                    set(`${prefix}_${teamUpSuffix}_pt_lg_${teamUpPointCount}`, 'circle');
                  } else {
                    set(`${prefix}_${teamUpSuffix}_pt_lg_${teamUpPointCount}`, 'slash');
                  }
                }
              } else if (pointTeam === teamDown) {
                teamDownPointCount++;
                if (teamDownPointCount <= 44) {
                  // Use 'circle' if point was scored due to other team's penalty, 'slash' for regular points
                  if (isPointFromOtherTeamPenalty) {
                    set(`${prefix}_${teamDownSuffix}_pt_lg_${teamDownPointCount}`, 'circle');
                  } else {
                    set(`${prefix}_${teamDownSuffix}_pt_lg_${teamDownPointCount}`, 'slash');
                  }
                }
              }

              // Service rotation tracking: when serving team loses point, record score and rotate
              // currentServiceOrder is already updated from rally_start events, so use it directly
              if (servingTeamLostPoint && servingTeam && setData?.serviceOrder && currentServiceOrder !== null) {
                const currentRowKey = orderToRow[currentServiceOrder];
                if (currentRowKey && serviceRotationColumn[currentRowKey] !== undefined) {
                  // Record the score of the team that lost service (at the time they lost it)
                  // Use team_up/team_down score, not teamA/teamB
                  const losingTeamScore = servingTeam === teamUp ? pointsBefore.teamUp : pointsBefore.teamDown;
                  const nextColumn = serviceRotationColumn[currentRowKey] + 1;

                  if (nextColumn <= 21) {
                    set(`${prefix}_${currentRowKey}_pt_${nextColumn}`, String(losingTeamScore));
                    serviceRotationColumn[currentRowKey] = nextColumn;
                  }

                  // Rotate to next player in service order (I -> II -> III -> IV -> I -> ...)
                  currentServiceOrder = (currentServiceOrder % 4) + 1;
                }
              }
            } else if (event.type === 'rally_start') {
              // Update current serving player from rally_start event
              // This is the authoritative source for who is serving
              const servingTeamFromEvent = event.payload?.servingTeam;
              const servingPlayerNumber = event.payload?.servingPlayerNumber;

              if (servingPlayerNumber && setData?.serviceOrder) {
                // Find which service order this player has
                const serviceOrder = setData.serviceOrder;
                const teamKey = servingTeamFromEvent === teamAKey ? teamAKey : teamBKey;

                // Determine which player this is (player1 or player2)
                let playerKey = '';
                if (teamKey === teamAKey) {
                  if (teamAData?.player1?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player1`;
                  } else if (teamAData?.player2?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player2`;
                  }
                } else if (teamKey === teamBKey) {
                  if (teamBData?.player1?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player1`;
                  } else if (teamBData?.player2?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player2`;
                  }
                }

                if (playerKey && serviceOrder[playerKey]) {
                  // Update currentServiceOrder to match the actual serving player
                  currentServiceOrder = serviceOrder[playerKey];
                }
              }
            } else if (event.type === 'timeout') {
              const timeoutTeam = event.payload?.team;
              // Record timeout with current score (left = requesting team, right = other team)
              // Use team_up/team_down suffixes, not teamA/teamB
              const teamUpSuffix = teamUp === 'team_1' ? 't1' : 't2';
              const teamDownSuffix = teamDown === 'team_1' ? 't1' : 't2';

              if (timeoutTeam === teamUp) {
                teamUpTimeoutCount++;
                // Left is requesting team (team_up) points, right is other team (team_down) points
                set(`${prefix}_${teamUpSuffix}_to_a`, String(pointsBefore.teamUp));
                set(`${prefix}_${teamUpSuffix}_to_b`, String(pointsBefore.teamDown));
              } else if (timeoutTeam === teamDown) {
                teamDownTimeoutCount++;
                // Left is requesting team (team_down) points, right is other team (team_up) points
                set(`${prefix}_${teamDownSuffix}_to_a`, String(pointsBefore.teamDown));
                set(`${prefix}_${teamDownSuffix}_to_b`, String(pointsBefore.teamUp));
              }
            } else if (event.type === 'court_switch') {
              // Court switch: A left, B right, in the existing court switch column
              // For sets 1-2: switches at 7, 14, 28, 35, etc. (every 7 points, but 21 is TTO)
              // Row 0: 7 points, Row 1: 14 points, Row 2: TTO (21), Row 3: 28 points, etc.

              // Calculate total points at the time of this switch
              const totalPoints = pointsBefore.teamA + pointsBefore.teamB;

              let rowIndex: number;

              if (setNum !== 3) {
                // Sets 1-2: switches every 7 points (7, 14, 21=TTO, 28, 35, 42, 49, etc.)
                // Row mapping: 7->0, 14->1, 21->2(TTO), 28->3, 35->4, 42->5, 49->6, etc.
                if (totalPoints === 7) {
                  rowIndex = 0;
                } else if (totalPoints === 14) {
                  rowIndex = 1;
                } else if (totalPoints >= 28) {
                  // After TTO: 28->3, 35->4, 42->5, 49->6, etc.
                  // Formula: (totalPoints / 7) - 1 (because we skip row 2 for TTO)
                  rowIndex = Math.floor(totalPoints / 7) - 1;
                } else {
                  // Shouldn't happen, but fallback
                  rowIndex = Math.floor(totalPoints / 7) - 1;
                }
              } else {
                // Set 3: switches every 5 points (5, 10, 15, 20, etc.)
                // No TTO, so use sequential rows starting from 0
                rowIndex = Math.floor(totalPoints / 5) - 1;
              }

              // Always A left, B right (use pointsBefore which already has teamA and teamB correctly)
              // pointsBefore.teamA is the score of the team that is Team A (from coin toss)
              // pointsBefore.teamB is the score of the team that is Team B (from coin toss)
              if (rowIndex >= 0 && rowIndex < 12 && rowIndex !== 2) { // Don't use row 2 for regular switches
                set(`${prefix}_cs_${rowIndex}_a`, String(pointsBefore.teamA));
                set(`${prefix}_cs_${rowIndex}_b`, String(pointsBefore.teamB));
              }
            } else if (event.type === 'technical_to') {
              // Technical Timeout (TTO) - goes in row 2 (index 2) for sets 1-2
              if (setNum !== 3) {
                // Always A left, B right
                set(`${prefix}_cs_2_a`, String(pointsBefore.teamA));
                set(`${prefix}_cs_2_b`, String(pointsBefore.teamB));
              }
            } else if (event.type === 'sanction') {
              const sanctionTeam = event.payload?.team;
              const sanctionType = event.payload?.type;
              const isDelay = sanctionType === 'delay_warning' || sanctionType === 'delay_penalty';
              const isMisconduct = sanctionType === 'penalty' || sanctionType === 'rude_conduct' || sanctionType === 'expulsion' || sanctionType === 'disqualification';
              const isFormalWarning = sanctionType === 'warning';

              // Determine which side the sanctioned team is on at this point (accounting for court switches)
              // leftTeamKey and rightTeamKey are already calculated above based on courtSwitchCount
              const isSanctionedTeamOnLeft = sanctionTeam === leftTeamKey;

              // t1 and t2 are FIXED team positions: t1 = team_1, t2 = team_2 (not left/right)
              // Determine which team control row to use based on the sanctioned team
              const isSanctionedTeam1 = sanctionTeam === 'team_1';
              const teamSuffix = isSanctionedTeam1 ? 't1' : 't2';

              // Get the actual team scores at this point (left team vs right team)
              const leftTeamScore = leftTeamKey === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;
              const rightTeamScore = rightTeamKey === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;

              // For delay sanctions, we need to determine which score goes in _a and which in _b
              // _a = penalized team's score, _b = other team's score
              // But we need to know which side the penalized team is on to get the correct score
              const penalizedTeamScore = isSanctionedTeamOnLeft ? leftTeamScore : rightTeamScore;
              const otherTeamScore = isSanctionedTeamOnLeft ? rightTeamScore : leftTeamScore;

              if (isDelay) {
                // Count delay penalties (not warnings) BEFORE this event for the SANCTIONED TEAM to determine which penalty box (p1, p2, p3)
                const delayPenaltyCount = setEvents.filter((e: any, idx: number) =>
                  idx < eventIndex && e.type === 'sanction' &&
                  e.payload?.team === sanctionTeam &&
                  e.payload?.type === 'delay_penalty'
                ).length;
                // Delay warning goes to ds_w, delay penalties go to ds_p1, ds_p2, ds_p3
                if (sanctionType === 'delay_warning') {
                  set(`${prefix}_${teamSuffix}_ds_w_a`, String(penalizedTeamScore));
                  set(`${prefix}_${teamSuffix}_ds_w_b`, String(otherTeamScore));
                } else if (sanctionType === 'delay_penalty') {
                  // This is the (delayPenaltyCount + 1)th penalty, so use that number
                  const penaltyNumber = delayPenaltyCount + 1;
                  // Only write to ONE box based on penalty number (1->p1, 2->p2, 3->p3)
                  if (penaltyNumber === 1) {
                    set(`${prefix}_${teamSuffix}_ds_p1_a`, String(penalizedTeamScore));
                    set(`${prefix}_${teamSuffix}_ds_p1_b`, String(otherTeamScore));
                  } else if (penaltyNumber === 2) {
                    set(`${prefix}_${teamSuffix}_ds_p2_a`, String(penalizedTeamScore));
                    set(`${prefix}_${teamSuffix}_ds_p2_b`, String(otherTeamScore));
                  } else if (penaltyNumber >= 3) {
                    set(`${prefix}_${teamSuffix}_ds_p3_a`, String(penalizedTeamScore));
                    set(`${prefix}_${teamSuffix}_ds_p3_b`, String(otherTeamScore));
                  }
                }
              }

              // For misconduct and formal warnings, we still need to determine which side the team is on for player row assignment
              if ((isMisconduct || isFormalWarning) && event.payload?.playerNumber) {
                if ((isMisconduct || isFormalWarning) && event.payload?.playerNumber) {
                  // Misconduct sanctions and formal warnings go in player rows (r1, r2, r3, r4)
                  // Find player row key based on player number and which team they're on
                  const playerNumber = event.payload.playerNumber;
                  const coinTossData = match?.coinTossData?.players;
                  let rowKey: string | null = null;

                  // Check if player is on left team (which could be A or B depending on court switches)
                  if (leftTeamKey === teamAKey && coinTossData?.teamA) {
                    if (coinTossData.teamA.player1?.number === playerNumber) {
                      rowKey = 'r1';
                    } else if (coinTossData.teamA.player2?.number === playerNumber) {
                      rowKey = 'r3';
                    }
                  } else if (leftTeamKey === teamBKey && coinTossData?.teamB) {
                    if (coinTossData.teamB.player1?.number === playerNumber) {
                      rowKey = 'r2';
                    } else if (coinTossData.teamB.player2?.number === playerNumber) {
                      rowKey = 'r4';
                    }
                  }

                  if (rowKey) {
                    const leftTeamScore = leftTeamKey === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;
                    const rightTeamScore = rightTeamKey === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;

                    if (isFormalWarning) {
                      // Formal warning: use fw_a and fw_b with scores
                      set(`${prefix}_${rowKey}_fw_a`, String(leftTeamScore));
                      set(`${prefix}_${rowKey}_fw_b`, String(rightTeamScore));

                      // Cross out the other player's formal warning box in the same set
                      const otherRowKey = (rowKey === 'r1' ? 'r3' : rowKey === 'r3' ? 'r1' : rowKey === 'r2' ? 'r4' : 'r2');
                      set(`${prefix}_${otherRowKey}_fw_crossed`, 'true');
                    } else {
                      // Count penalties (including rude_conduct) for this player in this set
                      const playerPenalties = setEvents.filter((e: any, idx: number) =>
                        idx <= eventIndex && e.type === 'sanction' &&
                        e.payload?.team === leftTeamKey &&
                        e.payload?.playerNumber === playerNumber &&
                        (e.payload?.type === 'penalty' || e.payload?.type === 'rude_conduct')
                      ).length;

                      // Map to player row fields: s1/s2 for penalties, s3 for expulsion, s4 for disqualification
                      if (sanctionType === 'penalty' || sanctionType === 'rude_conduct') {
                        if (playerPenalties === 1) {
                          set(`${prefix}_${rowKey}_s1_a`, String(leftTeamScore));
                          set(`${prefix}_${rowKey}_s1_b`, String(rightTeamScore));
                        } else if (playerPenalties === 2) {
                          set(`${prefix}_${rowKey}_s2_a`, String(leftTeamScore));
                          set(`${prefix}_${rowKey}_s2_b`, String(rightTeamScore));
                        }
                      } else if (sanctionType === 'expulsion') {
                        set(`${prefix}_${rowKey}_s3_a`, String(leftTeamScore));
                        set(`${prefix}_${rowKey}_s3_b`, String(rightTeamScore));
                      } else if (sanctionType === 'disqualification') {
                        set(`${prefix}_${rowKey}_s4_a`, String(leftTeamScore));
                        set(`${prefix}_${rowKey}_s4_b`, String(rightTeamScore));
                      }
                    }
                  }
                }
                if ((isMisconduct || isFormalWarning) && event.payload?.playerNumber) {
                  // Misconduct sanctions and formal warnings go in player rows (r1, r2, r3, r4)
                  // Find player row key based on player number and which team they're on
                  const playerNumber = event.payload.playerNumber;
                  const coinTossData = match?.coinTossData?.players;
                  let rowKey: string | null = null;

                  // Check if player is on right team (which could be A or B depending on court switches)
                  if (rightTeamKey === teamAKey && coinTossData?.teamA) {
                    if (coinTossData.teamA.player1?.number === playerNumber) {
                      rowKey = 'r1';
                    } else if (coinTossData.teamA.player2?.number === playerNumber) {
                      rowKey = 'r3';
                    }
                  } else if (rightTeamKey === teamBKey && coinTossData?.teamB) {
                    if (coinTossData.teamB.player1?.number === playerNumber) {
                      rowKey = 'r2';
                    } else if (coinTossData.teamB.player2?.number === playerNumber) {
                      rowKey = 'r4';
                    }
                  }

                  if (rowKey) {
                    const leftTeamScore = leftTeamKey === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;
                    const rightTeamScore = rightTeamKey === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;

                    if (isFormalWarning) {
                      // Formal warning: use fw_a and fw_b with scores
                      set(`${prefix}_${rowKey}_fw_a`, String(rightTeamScore));
                      set(`${prefix}_${rowKey}_fw_b`, String(leftTeamScore));

                      // Cross out the other player's formal warning box in the same set
                      const otherRowKey = (rowKey === 'r1' ? 'r3' : rowKey === 'r3' ? 'r1' : rowKey === 'r2' ? 'r4' : 'r2');
                      set(`${prefix}_${otherRowKey}_fw_crossed`, 'true');
                    } else {
                      // Count penalties (including rude_conduct) for this player in this set
                      const playerPenalties = setEvents.filter((e: any, idx: number) =>
                        idx <= eventIndex && e.type === 'sanction' &&
                        e.payload?.team === rightTeamKey &&
                        e.payload?.playerNumber === playerNumber &&
                        (e.payload?.type === 'penalty' || e.payload?.type === 'rude_conduct')
                      ).length;

                      // Map to player row fields: s1/s2 for penalties, s3 for expulsion, s4 for disqualification
                      if (sanctionType === 'penalty' || sanctionType === 'rude_conduct') {
                        if (playerPenalties === 1) {
                          set(`${prefix}_${rowKey}_s1_a`, String(rightTeamScore));
                          set(`${prefix}_${rowKey}_s1_b`, String(leftTeamScore));
                        } else if (playerPenalties === 2) {
                          set(`${prefix}_${rowKey}_s2_a`, String(rightTeamScore));
                          set(`${prefix}_${rowKey}_s2_b`, String(leftTeamScore));
                        }
                      } else if (sanctionType === 'expulsion') {
                        set(`${prefix}_${rowKey}_s3_a`, String(rightTeamScore));
                        set(`${prefix}_${rowKey}_s3_b`, String(leftTeamScore));
                      } else if (sanctionType === 'disqualification') {
                        set(`${prefix}_${rowKey}_s4_a`, String(rightTeamScore));
                        set(`${prefix}_${rowKey}_s4_b`, String(leftTeamScore));
                      }
                    }
                  }
                }
              }
            }
          });

          // After processing all events, if set is finished, circle final scores in service rotation boxes
          if (setData?.finished) {
            if (setNum === 1) {
              console.log(`[DEBUG] Set 1 - setData.finished: true, team_1Points: ${setData.team_1Points}, team_2Points: ${setData.team_2Points}`);
              console.log(`[DEBUG] Set 1 - teamUp: ${teamUp}, teamDown: ${teamDown}`);
            }

            // Get final scores using team_up/team_down
            const finalTeamUpPoints = teamUp === 'team_1' ? (setData.team_1Points || 0) : (setData.team_2Points || 0);
            const finalTeamDownPoints = teamDown === 'team_1' ? (setData.team_1Points || 0) : (setData.team_2Points || 0);

            if (setNum === 1) {
              console.log(`[DEBUG] Set 1 - finalTeamUpPoints: ${finalTeamUpPoints}, finalTeamDownPoints: ${finalTeamDownPoints}`);
            }

            // Find the last rally_start event to determine which team was serving when set ended
            const lastRallyStart = setEvents
              .filter((e: any) => e.type === 'rally_start')
              .sort((a: any, b: any) => {
                const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
                const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
                return bTime - aTime; // Most recent first
              })[0];

            if (setNum === 1) {
              console.log(`[DEBUG] Set 1 - lastRallyStart:`, lastRallyStart);
              console.log(`[DEBUG] Set 1 - lastRallyStart?.payload?.servingTeam:`, lastRallyStart?.payload?.servingTeam);
              console.log(`[DEBUG] Set 1 - setData?.serviceOrder:`, setData?.serviceOrder);
            }

            if (lastRallyStart && lastRallyStart.payload?.servingTeam && setData?.serviceOrder) {
              const servingTeamAtEnd = lastRallyStart.payload.servingTeam;
              // Check both servingPlayer and servingPlayerNumber (payload might use either)
              const servingPlayerNumber = lastRallyStart.payload.servingPlayerNumber || lastRallyStart.payload.servingPlayer;

              if (setNum === 1) {
                console.log(`[DEBUG] Set 1 - servingPlayerNumber from payload:`, servingPlayerNumber);
                console.log(`[DEBUG] Set 1 - teamUpData:`, teamUpData);
                console.log(`[DEBUG] Set 1 - teamDownData:`, teamDownData);
              }

              // Find which service order was serving when set ended
              let servingOrderAtEnd: number | null = null;
              let servingTeamRowKey: string | null = null;
              let receivingTeamRowKey: string | null = null;

              if (servingPlayerNumber && setData.serviceOrder) {
                const serviceOrder = setData.serviceOrder;
                // Use team_up/team_down data to find player
                const teamKey = servingTeamAtEnd;

                let playerKey = '';
                if (teamKey === teamUp) {
                  if (teamUpData?.player1?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player1`;
                    if (setNum === 1) {
                      console.log(`[DEBUG] Set 1 - Matched teamUp player1: number=${teamUpData.player1.number}, servingPlayerNumber=${servingPlayerNumber}`);
                    }
                  } else if (teamUpData?.player2?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player2`;
                    if (setNum === 1) {
                      console.log(`[DEBUG] Set 1 - Matched teamUp player2: number=${teamUpData.player2.number}, servingPlayerNumber=${servingPlayerNumber}`);
                    }
                  } else if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - No match for teamUp: player1.number=${teamUpData?.player1?.number}, player2.number=${teamUpData?.player2?.number}, servingPlayerNumber=${servingPlayerNumber}`);
                  }
                } else if (teamKey === teamDown) {
                  if (teamDownData?.player1?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player1`;
                    if (setNum === 1) {
                      console.log(`[DEBUG] Set 1 - Matched teamDown player1: number=${teamDownData.player1.number}, servingPlayerNumber=${servingPlayerNumber}`);
                    }
                  } else if (teamDownData?.player2?.number === servingPlayerNumber) {
                    playerKey = `${teamKey}_player2`;
                    if (setNum === 1) {
                      console.log(`[DEBUG] Set 1 - Matched teamDown player2: number=${teamDownData.player2.number}, servingPlayerNumber=${servingPlayerNumber}`);
                    }
                  } else if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - No match for teamDown: player1.number=${teamDownData?.player1?.number}, player2.number=${teamDownData?.player2?.number}, servingPlayerNumber=${servingPlayerNumber}`);
                  }
                }

                if (setNum === 1) {
                  console.log(`[DEBUG] Set 1 - playerKey: ${playerKey}, serviceOrder[playerKey]: ${playerKey ? serviceOrder[playerKey] : 'N/A'}`);
                }

                if (playerKey && serviceOrder[playerKey]) {
                  servingOrderAtEnd = serviceOrder[playerKey];
                  if (servingOrderAtEnd !== null && servingOrderAtEnd > 0) {
                    servingTeamRowKey = orderToRow[servingOrderAtEnd];
                    const receivingOrderAtEnd = (servingOrderAtEnd % 4) + 1; // Next in rotation
                    receivingTeamRowKey = orderToRow[receivingOrderAtEnd];
                  }
                }
              } else if (setNum === 1) {
                console.log(`[DEBUG] Set 1 - Missing servingPlayerNumber or serviceOrder: servingPlayerNumber=${servingPlayerNumber}, serviceOrder=${!!setData.serviceOrder}`);
              }

              if (setNum === 1) {
                console.log(`[DEBUG] Set 1 - servingOrderAtEnd: ${servingOrderAtEnd}, servingTeamRowKey: ${servingTeamRowKey}, receivingTeamRowKey: ${receivingTeamRowKey}`);
                console.log(`[DEBUG] Set 1 - servingTeamAtEnd: ${servingTeamAtEnd}, teamUp: ${teamUp}, teamDown: ${teamDown}`);
              }

              if (servingOrderAtEnd !== null && servingTeamRowKey && receivingTeamRowKey && servingOrderAtEnd > 0) {
                // Helper function to find the current serving column for a row
                // This finds the last column with a value and returns the next one (current serving column)
                const findCurrentServingColumn = (rowKey: string): number => {
                  let lastColumnWithValue = 0;
                  for (let col = 1; col <= 21; col++) {
                    const value = get(`${prefix}_${rowKey}_pt_${col}`);
                    if (value) {
                      lastColumnWithValue = col;
                    }
                  }
                  // Return the next column after the last one with a value (current serving column)
                  // If no value found, start at column 1
                  return lastColumnWithValue > 0 ? lastColumnWithValue + 1 : 1;
                };

                // Helper function to find the next rotation column for a row (for receiving team)
                const findNextRotationColumn = (rowKey: string): number => {
                  let lastColumnWithValue = 0;
                  for (let col = 1; col <= 21; col++) {
                    const value = get(`${prefix}_${rowKey}_pt_${col}`);
                    if (value) {
                      lastColumnWithValue = col;
                    }
                  }
                  // For receiving team, use the next column after the last one (their next rotation)
                  return lastColumnWithValue > 0 ? lastColumnWithValue + 1 : 1;
                };

                // For the serving team: circle final score in CURRENT rotation box (the one they're currently serving in)
                // For the receiving team: circle final score in NEXT rotation box (the one they would serve in next)
                if (servingTeamAtEnd === teamUp) {
                  if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Up was serving at end`);
                  }
                  // Team Up was serving - circle their final score in current rotation box
                  const finalScore = String(finalTeamUpPoints);
                  const columnToUse = findCurrentServingColumn(servingTeamRowKey);
                  if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Up serving: columnToUse=${columnToUse}, finalScore=${finalScore}`);
                  }
                  if (columnToUse > 0 && columnToUse <= 21) {
                    set(`${prefix}_${servingTeamRowKey}_pt_${columnToUse}`, finalScore);
                    set(`${prefix}_${servingTeamRowKey}_pt_${columnToUse}_circled`, 'true');
                    if (setNum === 1) {
                      console.log(`set_1 last point in service box circled for team up: ${servingTeamRowKey}_pt_${columnToUse} = ${finalScore} (circled)`);
                    }
                  } else if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Up: columnToUse (${columnToUse}) is not valid (must be > 0 and <= 21)`);
                  }

                  // Team Down was receiving - circle their final score in next rotation box
                  const finalScoreDown = String(finalTeamDownPoints);
                  const columnToUseReceiving = findNextRotationColumn(receivingTeamRowKey);
                  if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Down receiving: columnToUse=${columnToUseReceiving}, finalScoreDown=${finalScoreDown}`);
                  }
                  if (columnToUseReceiving > 0 && columnToUseReceiving <= 21) {
                    set(`${prefix}_${receivingTeamRowKey}_pt_${columnToUseReceiving}`, finalScoreDown);
                    set(`${prefix}_${receivingTeamRowKey}_pt_${columnToUseReceiving}_circled`, 'true');
                    if (setNum === 1) {
                      console.log(`set_1 last point in service box circled for team down: ${receivingTeamRowKey}_pt_${columnToUseReceiving} = ${finalScoreDown} (circled)`);
                    }
                  } else if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Down: columnToUseReceiving (${columnToUseReceiving}) is not valid (must be > 0 and <= 21)`);
                  }
                } else if (servingTeamAtEnd === teamDown) {
                  if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Down was serving at end`);
                  }
                  // Team Down was serving - circle their final score in current rotation box
                  const finalScore = String(finalTeamDownPoints);
                  const columnToUse = findCurrentServingColumn(servingTeamRowKey);
                  if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Down serving: columnToUse=${columnToUse}, finalScore=${finalScore}`);
                  }
                  if (columnToUse > 0 && columnToUse <= 21) {
                    set(`${prefix}_${servingTeamRowKey}_pt_${columnToUse}`, finalScore);
                    set(`${prefix}_${servingTeamRowKey}_pt_${columnToUse}_circled`, 'true');
                    if (setNum === 1) {
                      console.log(`set_1 last point in service box circled for team down: ${servingTeamRowKey}_pt_${columnToUse} = ${finalScore} (circled)`);
                    }
                  } else if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Down: columnToUse (${columnToUse}) is not valid (must be > 0 and <= 21)`);
                  }

                  // Team Up was receiving - circle their final score in next rotation box
                  const finalScoreUp = String(finalTeamUpPoints);
                  const columnToUseReceiving = findNextRotationColumn(receivingTeamRowKey);
                  if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Up receiving: columnToUse=${columnToUseReceiving}, finalScoreUp=${finalScoreUp}`);
                  }
                  if (columnToUseReceiving > 0 && columnToUseReceiving <= 21) {
                    set(`${prefix}_${receivingTeamRowKey}_pt_${columnToUseReceiving}`, finalScoreUp);
                    set(`${prefix}_${receivingTeamRowKey}_pt_${columnToUseReceiving}_circled`, 'true');
                    if (setNum === 1) {
                      console.log(`set_1 last point in service box circled for team up: ${receivingTeamRowKey}_pt_${columnToUseReceiving} = ${finalScoreUp} (circled)`);
                    }
                  } else if (setNum === 1) {
                    console.log(`[DEBUG] Set 1 - Team Up: columnToUseReceiving (${columnToUseReceiving}) is not valid (must be > 0 and <= 21)`);
                  }
                }
              } else if (setNum === 1) {
                console.log(`[DEBUG] Set 1 - Conditions not met for circling final scores: servingOrderAtEnd=${servingOrderAtEnd}, servingTeamRowKey=${servingTeamRowKey}, receivingTeamRowKey=${receivingTeamRowKey}`);
              }
            } else if (setNum === 1) {
              console.log(`[DEBUG] Set 1 - Missing lastRallyStart or serviceOrder: lastRallyStart=${!!lastRallyStart}, servingTeam=${!!lastRallyStart?.payload?.servingTeam}, serviceOrder=${!!setData?.serviceOrder}`);
            }
          }

          // Set team names and A/B in team circle/label for this set
          const teamAName = teamAKey === 'team_1' ? (team_1Team?.name || 'Team 1') : (team_2Team?.name || 'Team 2');
          const teamBName = teamBKey === 'team_1' ? (team_1Team?.name || 'Team 1') : (team_2Team?.name || 'Team 2');
          // Country can be in team object or match object
          const teamACountry = teamAKey === 'team_1'
            ? (team_1Team?.country || match?.team_1Country || '')
            : (team_2Team?.country || match?.team_2Country || '');
          const teamBCountry = teamBKey === 'team_1'
            ? (team_1Team?.country || match?.team_1Country || '')
            : (team_2Team?.country || match?.team_2Country || '');
          const teamAColor = teamAKey === 'team_1' ? (team_1Team?.color || '#89bdc3') : (team_2Team?.color || '#323134');
          const teamBColor = teamBKey === 'team_1' ? (team_1Team?.color || '#89bdc3') : (team_2Team?.color || '#323134');

          // Format: "Country" (no color name)
          const teamALabel = teamACountry || '';
          const teamBLabel = teamBCountry || '';

          // Store team colors for t1 and t2 (for all sets, not just current)
          // t1 = team_1 (left), t2 = team_2 (right)
          const t1Color = teamAKey === 'team_1' ? teamAColor : teamBColor;
          const t2Color = teamAKey === 'team_2' ? teamAColor : teamBColor;

          // Store colors for this set
          set(`${prefix}_t1_team_color`, t1Color);
          set(`${prefix}_t2_team_color`, t2Color);

          // Set team circle/label for ALL sets (not just current)
          // Set A/B based on which team is actually A or B from coin toss
          // team_1 is A if teamAKey === 'team_1', otherwise team_1 is B
          // team_2 is A if teamAKey === 'team_2', otherwise team_2 is B
          const t1IsA = teamAKey === 'team_1';
          const t2IsA = teamAKey === 'team_2';

          console.log(`[DEBUG Set ${setNum}] Event processing - Setting team labels:`, {
            teamAKey,
            teamBKey,
            teamALabel,
            teamBLabel,
            t1IsA,
            t2IsA,
            t1Circle: t1IsA ? 'A' : 'B',
            t1Label: t1IsA ? teamALabel : teamBLabel,
            t2Circle: t2IsA ? 'A' : 'B',
            t2Label: t2IsA ? teamALabel : teamBLabel,
            team_1Team: { country: team_1Team?.country, name: team_1Team?.name },
            team_2Team: { country: team_2Team?.country, name: team_2Team?.name }
          });

          // Only update if values are different to avoid unnecessary overwrites
          const currentT1Circle = get(`${prefix}_t1_team_circle`);
          const currentT1Label = get(`${prefix}_t1_team_label`);
          const currentT2Circle = get(`${prefix}_t2_team_circle`);
          const currentT2Label = get(`${prefix}_t2_team_label`);
          
          const newT1Circle = t1IsA ? 'A' : 'B';
          const newT1Label = t1IsA ? teamALabel : teamBLabel;
          const newT2Circle = t2IsA ? 'A' : 'B';
          const newT2Label = t2IsA ? teamALabel : teamBLabel;
          
          if (currentT1Circle !== newT1Circle) {
            set(`${prefix}_t1_team_circle`, newT1Circle);
          }
          if (currentT1Label !== newT1Label) {
            set(`${prefix}_t1_team_label`, newT1Label);
          }
          if (currentT2Circle !== newT2Circle) {
            set(`${prefix}_t2_team_circle`, newT2Circle);
          }
          if (currentT2Label !== newT2Label) {
            set(`${prefix}_t2_team_label`, newT2Label);
          }

          // Set timeout counts in RESULTS table
          // Use team_up/team_down suffixes, not teamA/teamB
          if (setNum <= 3) {
            const teamUpSuffix = teamUp === 'team_1' ? 'a' : 'b';
            const teamDownSuffix = teamDown === 'team_1' ? 'a' : 'b';
            set(`res_s${setNum}_to_${teamUpSuffix}`, String(teamUpTimeoutCount));
            set(`res_s${setNum}_to_${teamDownSuffix}`, String(teamDownTimeoutCount));
          }

          // Cross out formal warning and delay warning boxes based on previous sets
          // Check if team got formal warning in any previous set
          for (let prevSetIndex = 1; prevSetIndex < setNum; prevSetIndex++) {
            const prevSetPrefix = prevSetIndex === 1 ? 's1' : prevSetIndex === 2 ? 's2' : 's3';
            const prevTeamAKey = match?.coinTossTeamA || 'team_1';
            const prevTeamBKey = match?.coinTossTeamB || 'team_2';

            // Check if Team A got formal warning in previous set
            if (formalWarningsBySet[prevSetIndex]?.has(prevTeamAKey)) {
              // Cross out both Team A players' formal warning boxes in current set
              set(`${prefix}_r1_fw_crossed`, 'true');
              set(`${prefix}_r3_fw_crossed`, 'true');
            }

            // Check if Team B got formal warning in previous set
            if (formalWarningsBySet[prevSetIndex]?.has(prevTeamBKey)) {
              // Cross out both Team B players' formal warning boxes in current set
              set(`${prefix}_r2_fw_crossed`, 'true');
              set(`${prefix}_r4_fw_crossed`, 'true');
            }

            // Check if Team A got delay warning in previous set
            if (delayWarningsBySet[prevSetIndex]?.has(prevTeamAKey)) {
              // Cross out Team A's delay warning box in current set
              set(`${prefix}_t1_ds_w_crossed`, 'true');
            }

            // Check if Team B got delay warning in previous set
            if (delayWarningsBySet[prevSetIndex]?.has(prevTeamBKey)) {
              // Cross out Team B's delay warning box in current set
              set(`${prefix}_t2_ds_w_crossed`, 'true');
            }
          }
        });

        // Calculate total timeouts
        const totalTeamATimeouts = Object.keys(eventsBySet).reduce((sum, setIdxStr) => {
          const setIndex = parseInt(setIdxStr);
          const setEvents = eventsBySet[setIndex] || [];
          const teamAKey = match?.coinTossTeamA || 'team_1';
          return sum + setEvents.filter((e: any) => e.type === 'timeout' && e.payload?.team === teamAKey).length;
        }, 0);
        const totalTeamBTimeouts = Object.keys(eventsBySet).reduce((sum, setIdxStr) => {
          const setIndex = parseInt(setIdxStr);
          const setEvents = eventsBySet[setIndex] || [];
          const teamBKey = match?.coinTossTeamB || 'team_2';
          return sum + setEvents.filter((e: any) => e.type === 'timeout' && e.payload?.team === teamBKey).length;
        }, 0);
        set('res_tot_to_a', String(totalTeamATimeouts));
        set('res_tot_to_b', String(totalTeamBTimeouts));

        // Process improper requests
        const improperRequests = events.filter((e: any) =>
          e.type === 'sanction' && e.payload?.type === 'improper_request'
        );
        const teamAImproper = improperRequests.filter((e: any) =>
          e.payload?.team === (match?.coinTossTeamA || 'team_1')
        ).length > 0;
        const teamBImproper = improperRequests.filter((e: any) =>
          e.payload?.team === (match?.coinTossTeamB || 'team_2')
        ).length > 0;
        if (teamAImproper) set('improper_a', 'A');
        if (teamBImproper) set('improper_b', 'B');

        // Process sanctions
        const sanctions = events.filter((e: any) => e.type === 'sanction');
        sanctions.forEach((sanction: any) => {
          const setIndex = sanction.setIndex || 1;
          if (setIndex > 3) return;

          const prefix = setIndex === 1 ? 's1' : setIndex === 2 ? 's2' : 's3';
          const teamKey = sanction.payload?.team;
          const playerNumber = sanction.payload?.playerNumber;
          const sanctionType = sanction.payload?.type;
          const teamSuffix = teamKey === (match?.coinTossTeamA || 'team_1') ? 't1' : 't2';

          if (!playerNumber) return; // Skip team sanctions for now

          // Find player row key (r1=I, r2=II, r3=III, r4=IV)
          let rowKey: string | null = null;
          const coinTossData = match?.coinTossData?.players;
          if (teamKey === (match?.coinTossTeamA || 'team_1')) {
            // Team A players: r1=I, r3=III
            if (coinTossData?.teamA) {
              if (coinTossData.teamA.player1?.number === playerNumber) {
                rowKey = 'r1';
              } else if (coinTossData.teamA.player2?.number === playerNumber) {
                rowKey = 'r3';
              }
            }
          } else {
            // Team B players: r2=II, r4=IV
            if (coinTossData?.teamB) {
              if (coinTossData.teamB.player1?.number === playerNumber) {
                rowKey = 'r2';
              } else if (coinTossData.teamB.player2?.number === playerNumber) {
                rowKey = 'r4';
              }
            }
          }

          if (!rowKey) return;

          // Map sanction types to scoresheet fields
          // Note: Score values are already set in the event processing loop above
          // This section is no longer needed as all sanctions (including formal warnings) have scores set in the event loop
        });

        // Process medical assistance (MTO/RIT)
        // Medical Assistance Chart structure:
        // - Team 1: idx 0 (player 1), idx 1 (player 2)
        // - Team 2: idx 2 (player 1), idx 3 (player 2)
        // idx = (team - 1) * 2 + (player - 1)
        // But the chart shows Team A in row 1 and Team B in row 2
        // So we need to map team_1/team_2 to A/B correctly

        const teamAKey = match?.coinTossTeamA || 'team_1';
        const teamBKey = match?.coinTossTeamB || (teamAKey === 'team_1' ? 'team_2' : 'team_1');

        // Track MTO/RIT per player (across all sets, per player)
        const playerMedicalData: Record<string, { mto_blood: boolean, rit_type: string | null, rit_used: boolean }> = {};

        // Initialize all players
        if (team_1Players && team_1Players.length >= 2) {
          team_1Players.forEach((p: any, idx: number) => {
            const playerKey = `team_1_player${idx + 1}_${p.number}`;
            playerMedicalData[playerKey] = { mto_blood: false, rit_type: null, rit_used: false };
          });
        }
        if (team_2Players && team_2Players.length >= 2) {
          team_2Players.forEach((p: any, idx: number) => {
            const playerKey = `team_2_player${idx + 1}_${p.number}`;
            playerMedicalData[playerKey] = { mto_blood: false, rit_type: null, rit_used: false };
          });
        }

        // Process MTO/RIT events
        const mtoRitEvents = events.filter((e: any) => e.type === 'mto_rit');
        mtoRitEvents.forEach((event: any) => {
          const teamKey = event.payload?.team;
          const playerNumber = event.payload?.playerNumber;
          const type = event.payload?.type; // 'mto_blood', 'rit_no_blood', 'rit_weather', 'rit_toilet'

          if (!teamKey || !playerNumber) return;

          // Find which player this is (player1 or player2) for the team
          let playerIndex = -1;
          if (teamKey === 'team_1' && team_1Players) {
            const playerIdx = team_1Players.findIndex((p: any) => p.number === playerNumber);
            if (playerIdx >= 0) playerIndex = playerIdx;
          } else if (teamKey === 'team_2' && team_2Players) {
            const playerIdx = team_2Players.findIndex((p: any) => p.number === playerNumber);
            if (playerIdx >= 0) playerIndex = playerIdx;
          }

          if (playerIndex < 0) return;

          const playerKey = `${teamKey}_player${playerIndex + 1}_${playerNumber}`;

          if (type === 'mto_blood') {
            playerMedicalData[playerKey].mto_blood = true;
          } else if (type === 'rit_no_blood' || type === 'rit_weather' || type === 'rit_toilet') {
            // RIT can only be used once per player per match
            playerMedicalData[playerKey].rit_used = true;
            playerMedicalData[playerKey].rit_type = type;
          }
        });

        // Fill medical assistance chart
        // Medical Assistance Chart: Row 1 is Team A, Row 2 is Team B
        // But the chart structure is: idx 0,1 = team_1 players, idx 2,3 = team_2 players
        // So we need to set ma_side_1 and ma_side_2 based on which team is A/B
        
        // Team 1, Player 1: idx 0
        if (team_1Players && team_1Players.length >= 1) {
          const p1 = team_1Players[0];
          const p1Key = `team_1_player1_${p1.number}`;
          const p1Data = playerMedicalData[p1Key] || { mto_blood: false, rit_type: null, rit_used: false };
          // ma_side_1: 'A' if team_1 is Team A, 'B' if team_1 is Team B
          set('ma_side_1', teamAKey === 'team_1' ? 'A' : 'B');
          set('ma_ctry_1', team_1Team?.country || match?.team_1Country || '');
          set('ma_mto_b_0', p1Data.mto_blood ? true : false);
          if (p1Data.rit_used) {
            if (p1Data.rit_type === 'rit_no_blood') {
              set('ma_rit_nb_0', true);
              set('ma_rit_w_0_crossed', true);
              set('ma_rit_t_0_crossed', true);
            } else if (p1Data.rit_type === 'rit_weather') {
              set('ma_rit_w_0', true);
              set('ma_rit_nb_0_crossed', true);
              set('ma_rit_t_0_crossed', true);
            } else if (p1Data.rit_type === 'rit_toilet') {
              set('ma_rit_t_0', true);
              set('ma_rit_nb_0_crossed', true);
              set('ma_rit_w_0_crossed', true);
            }
          }
        }

        // Team 1, Player 2: idx 1
        if (team_1Players && team_1Players.length >= 2) {
          const p2 = team_1Players[1];
          const p2Key = `team_1_player2_${p2.number}`;
          const p2Data = playerMedicalData[p2Key] || { mto_blood: false, rit_type: null, rit_used: false };
          set('ma_mto_b_1', p2Data.mto_blood ? true : false);
          if (p2Data.rit_used) {
            if (p2Data.rit_type === 'rit_no_blood') {
              set('ma_rit_nb_1', true);
              set('ma_rit_w_1_crossed', true);
              set('ma_rit_t_1_crossed', true);
            } else if (p2Data.rit_type === 'rit_weather') {
              set('ma_rit_w_1', true);
              set('ma_rit_nb_1_crossed', true);
              set('ma_rit_t_1_crossed', true);
            } else if (p2Data.rit_type === 'rit_toilet') {
              set('ma_rit_t_1', true);
              set('ma_rit_nb_1_crossed', true);
              set('ma_rit_w_1_crossed', true);
            }
          }
        }

        // Team 2, Player 1: idx 2
        if (team_2Players && team_2Players.length >= 1) {
          const p1 = team_2Players[0];
          const p1Key = `team_2_player1_${p1.number}`;
          const p1Data = playerMedicalData[p1Key] || { mto_blood: false, rit_type: null, rit_used: false };
          // ma_side_2: 'A' if team_2 is Team A, 'B' if team_2 is Team B
          set('ma_side_2', teamAKey === 'team_2' ? 'A' : 'B');
          set('ma_ctry_2', team_2Team?.country || match?.team_2Country || '');
          set('ma_mto_b_2', p1Data.mto_blood ? true : false);
          if (p1Data.rit_used) {
            if (p1Data.rit_type === 'rit_no_blood') {
              set('ma_rit_nb_2', true);
              set('ma_rit_w_2_crossed', true);
              set('ma_rit_t_2_crossed', true);
            } else if (p1Data.rit_type === 'rit_weather') {
              set('ma_rit_w_2', true);
              set('ma_rit_nb_2_crossed', true);
              set('ma_rit_t_2_crossed', true);
            } else if (p1Data.rit_type === 'rit_toilet') {
              set('ma_rit_t_2', true);
              set('ma_rit_nb_2_crossed', true);
              set('ma_rit_w_2_crossed', true);
            }
          }
        }

        // Team 2, Player 2: idx 3
        if (team_2Players && team_2Players.length >= 2) {
          const p2 = team_2Players[1];
          const p2Key = `team_2_player2_${p2.number}`;
          const p2Data = playerMedicalData[p2Key] || { mto_blood: false, rit_type: null, rit_used: false };
          set('ma_mto_b_3', p2Data.mto_blood ? true : false);
          if (p2Data.rit_used) {
            if (p2Data.rit_type === 'rit_no_blood') {
              set('ma_rit_nb_3', true);
              set('ma_rit_w_3_crossed', true);
              set('ma_rit_t_3_crossed', true);
            } else if (p2Data.rit_type === 'rit_weather') {
              set('ma_rit_w_3', true);
              set('ma_rit_nb_3_crossed', true);
              set('ma_rit_t_3_crossed', true);
            } else if (p2Data.rit_type === 'rit_toilet') {
              set('ma_rit_t_3', true);
              set('ma_rit_nb_3_crossed', true);
              set('ma_rit_w_3_crossed', true);
            }
          }
        }
      }

      // Process BMP (Ball Mark Protocol) events
      const bmpEvents: any[] = [];
      events.forEach((event: any) => {
        if (event.type === 'challenge_request' || event.type === 'challenge_outcome' ||
          event.type === 'referee_bmp_request' || event.type === 'referee_bmp_outcome' ||
          event.type === 'bmp') {
          bmpEvents.push(event);
        }
      });

      // Sort BMP events by timestamp
      bmpEvents.sort((a, b) => {
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
        return aTime - bTime;
      });

      // Populate BMP header
      if (match) {
        set('bmp_event', match.eventName || '');
        if (match.scheduledAt) {
          const date = new Date(match.scheduledAt);
          set('bmp_date', date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }));
        }
        set('bmp_match_no', String(match.game_n || ''));
        // Convert phase to capitalize (replace underscores with spaces and capitalize)
        const phaseStr = match.matchPhase || '';
        const formattedPhase = phaseStr
          .replace(/_/g, ' ')
          .split(' ')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        set('bmp_phase', formattedPhase);
        set('bmp_gender', match.matchGender === 'men' ? 'Men' : match.matchGender === 'women' ? 'Women' : '');

        // Only set team A/B names if coin toss is confirmed
        if (match.coinTossConfirmed) {
          const teamAKey = match.coinTossTeamA || 'team_1';
          const teamBKey = match.coinTossTeamB || 'team_2';
          const teamAName = teamAKey === 'team_1' ? (team_1Team?.name || '') : (team_2Team?.name || '');
          const teamBName = teamBKey === 'team_1' ? (team_1Team?.name || '') : (team_2Team?.name || '');
          set('bmp_team_a', teamAName);
          set('bmp_team_b', teamBName);
        }
      }

      // Process BMP events and fill rows
      // Group related events (request + outcome) together
      let bmpRowIndex = 0;
      const processedBMPs: Set<number> = new Set();

      bmpEvents.forEach((event: any, idx: number) => {
        if (processedBMPs.has(idx)) return;

        if (bmpRowIndex >= 16) return; // Max 16 rows

        const setIndex = event.setIndex || 1;
        const eventTime = event.ts ? (typeof event.ts === 'number' ? new Date(event.ts) : new Date(event.ts)) : new Date();
        const hours = String(eventTime.getHours()).padStart(2, '0');
        const minutes = String(eventTime.getMinutes()).padStart(2, '0');
        const seconds = String(eventTime.getSeconds()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;

        // Find the set to get scores at time of BMP
        const setData = sets?.find((s: any) => s.index === setIndex);
        let scoreAtRequest = { team_1: 0, team_2: 0 };
        let servingTeamBefore = '';
        let requestBy = '';
        let outcome = '';
        let servingTeamAfter = '';
        let scoreAfterDecision = { team_1: 0, team_2: 0 };
        let timeResumed = '';
        let duration = '';

        if (event.type === 'challenge_request') {
          // Team-initiated challenge
          const teamKey = event.payload?.team;
          const teamLabel = teamKey === teamAKey ? 'A' : teamKey === teamBKey ? 'B' : '';
          requestBy = teamLabel;

          // Get score at time of request
          scoreAtRequest = event.payload?.score || { team_1: setData?.team_1Points || 0, team_2: setData?.team_2Points || 0 };

          // Determine serving team before challenge using scoreboard logic:
          // 1. Get the last rally_start event before this challenge
          // 2. Check score changes: if A increased → A serving, if B increased → B serving, if no increase (replay) → same as last server
          const previousEvents = events
            .filter((e: any) =>
              e.setIndex === setIndex &&
              e.ts
            )
            .sort((a: any, b: any) => {
              const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
              const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
              return bTime - aTime; // Most recent first
            });

          // Find last rally_start before challenge
          const lastRallyStart = previousEvents.find((e: any) => {
            if (e.type !== 'rally_start') return false;
            const eTime = typeof e.ts === 'number' ? new Date(e.ts) : new Date(e.ts);
            return eTime.getTime() < eventTime.getTime();
          });

          if (lastRallyStart && lastRallyStart.payload?.servingTeam) {
            const lastServingTeam = lastRallyStart.payload.servingTeam;
            const rallyTime = typeof lastRallyStart.ts === 'number' ? new Date(lastRallyStart.ts) : new Date(lastRallyStart.ts);

            // Find last point event after this rally_start and before the challenge
            const lastPointAfterRally = previousEvents.find((e: any) => {
              if (e.type !== 'point') return false;
              const eTime = typeof e.ts === 'number' ? new Date(e.ts) : new Date(e.ts);
              return eTime.getTime() > rallyTime.getTime() && eTime.getTime() < eventTime.getTime();
            });

            if (lastPointAfterRally && lastPointAfterRally.payload?.team) {
              // Team that scored the last point is now serving
              const scoringTeam = lastPointAfterRally.payload.team;
              servingTeamBefore = scoringTeam === teamAKey ? 'A' : scoringTeam === teamBKey ? 'B' : '';
            } else {
              // No point scored (replay scenario) - serving team unchanged from rally_start
              servingTeamBefore = lastServingTeam === teamAKey ? 'A' : lastServingTeam === teamBKey ? 'B' : '';
            }
          }

          // Find corresponding outcome
          const outcomeEvent = bmpEvents.find((e: any, i: number) =>
            i > idx &&
            e.type === 'challenge_outcome' &&
            e.setIndex === setIndex &&
            e.payload?.team === teamKey
          );

          if (outcomeEvent) {
            processedBMPs.add(bmpEvents.indexOf(outcomeEvent));
            const result = outcomeEvent.payload?.result || '';
            if (result === 'successful') outcome = 'SUC';
            else if (result === 'unsuccessful') outcome = 'UNSUC';
            else if (result === 'judgment_impossible') outcome = 'MUNAV';
            else if (result === 'cancelled') outcome = 'MUNAV';

            scoreAfterDecision = outcomeEvent.payload?.newScore || scoreAtRequest;

            // Determine serving team after BMP outcome
            // Check for rally_start event after the outcome to see if service changed
            const outcomeTime = outcomeEvent.ts ? (typeof outcomeEvent.ts === 'number' ? new Date(outcomeEvent.ts) : new Date(outcomeEvent.ts)) : new Date();
            const nextRallyStart = events.find((e: any) =>
              e.type === 'rally_start' &&
              e.setIndex === setIndex &&
              e.ts &&
              (typeof e.ts === 'number' ? new Date(e.ts) : new Date(e.ts)).getTime() > outcomeTime.getTime()
            );

            if (nextRallyStart && nextRallyStart.payload?.servingTeam) {
              // Service team from next rally_start event
              servingTeamAfter = nextRallyStart.payload.servingTeam === teamAKey ? 'A' : nextRallyStart.payload.servingTeam === teamBKey ? 'B' : servingTeamBefore;
            } else {
              // If no rally_start found, service usually doesn't change (same as before)
              servingTeamAfter = servingTeamBefore;
            }

            const resumedHours = String(outcomeTime.getHours()).padStart(2, '0');
            const resumedMinutes = String(outcomeTime.getMinutes()).padStart(2, '0');
            const resumedSeconds = String(outcomeTime.getSeconds()).padStart(2, '0');
            timeResumed = `${resumedHours}:${resumedMinutes}:${resumedSeconds}`;

            const durationMs = outcomeTime.getTime() - eventTime.getTime();
            const durationSec = Math.round(durationMs / 1000);
            duration = `${durationSec}s`;
          }
        } else if (event.type === 'referee_bmp_request') {
          // Referee-initiated BMP
          requestBy = 'Ref';

          scoreAtRequest = event.payload?.score || { team_1: setData?.team_1Points || 0, team_2: setData?.team_2Points || 0 };
          servingTeamBefore = event.payload?.servingTeam === teamAKey ? 'A' : event.payload?.servingTeam === teamBKey ? 'B' : '';

          // Find corresponding outcome
          const outcomeEvent = bmpEvents.find((e: any, i: number) =>
            i > idx &&
            (e.type === 'referee_bmp_outcome' || e.type === 'bmp') &&
            e.setIndex === setIndex
          );

          if (outcomeEvent) {
            processedBMPs.add(bmpEvents.indexOf(outcomeEvent));
            const result = outcomeEvent.payload?.result || '';
            // For referee-requested BMPs, map to A/B instead of IN/OUT
            if (result === 'left') outcome = 'A';
            else if (result === 'right') outcome = 'B';
            else outcome = ''; // Empty if no clear result

            scoreAfterDecision = outcomeEvent.payload?.newScore || scoreAtRequest;

            // Determine serving team after BMP outcome
            // Check for rally_start event after the outcome to see if service changed
            const outcomeTime = outcomeEvent.ts ? (typeof outcomeEvent.ts === 'number' ? new Date(outcomeEvent.ts) : new Date(outcomeEvent.ts)) : new Date();
            const nextRallyStart = events.find((e: any) =>
              e.type === 'rally_start' &&
              e.setIndex === setIndex &&
              e.ts &&
              (typeof e.ts === 'number' ? new Date(e.ts) : new Date(e.ts)).getTime() > outcomeTime.getTime()
            );

            if (nextRallyStart && nextRallyStart.payload?.servingTeam) {
              // Service team from next rally_start event
              servingTeamAfter = nextRallyStart.payload.servingTeam === teamAKey ? 'A' : nextRallyStart.payload.servingTeam === teamBKey ? 'B' : servingTeamBefore;
            } else {
              // If no rally_start found, service usually doesn't change (same as before)
              servingTeamAfter = servingTeamBefore;
            }

            const resumedHours = String(outcomeTime.getHours()).padStart(2, '0');
            const resumedMinutes = String(outcomeTime.getMinutes()).padStart(2, '0');
            const resumedSeconds = String(outcomeTime.getSeconds()).padStart(2, '0');
            timeResumed = `${resumedHours}:${resumedMinutes}:${resumedSeconds}`;

            const durationMs = outcomeTime.getTime() - eventTime.getTime();
            const durationSec = Math.round(durationMs / 1000);
            duration = `${durationSec}s`;
          }
        } else if (event.type === 'challenge_outcome' || event.type === 'referee_bmp_outcome' || event.type === 'bmp') {
          // Skip if this is an outcome without a corresponding request (shouldn't happen, but handle gracefully)
          return;
        }

        // Fill BMP row
        set(`bmp_${bmpRowIndex}_start`, timeStr);
        set(`bmp_${bmpRowIndex}_set`, String(setIndex));
        set(`bmp_${bmpRowIndex}_score_a`, String(scoreAtRequest.team_1));
        set(`bmp_${bmpRowIndex}_score_b`, String(scoreAtRequest.team_2));
        // Ensure serving team values are set (A or B, not empty)
        set(`bmp_${bmpRowIndex}_serving_before`, servingTeamBefore || '');
        set(`bmp_${bmpRowIndex}_request`, requestBy);
        set(`bmp_${bmpRowIndex}_outcome`, outcome);
        set(`bmp_${bmpRowIndex}_serving_after`, servingTeamAfter || servingTeamBefore || '');
        set(`bmp_${bmpRowIndex}_score2_a`, String(scoreAfterDecision.team_1));
        set(`bmp_${bmpRowIndex}_score2_b`, String(scoreAfterDecision.team_2));
        set(`bmp_${bmpRowIndex}_resumed`, timeResumed);
        set(`bmp_${bmpRowIndex}_duration`, duration);

        bmpRowIndex++;
      });

      // Process MTO/RIT events for remarks section
      const mtoRitRemarks: string[] = [];
      const mtoRitEventsForRemarks = events.filter((e: any) => e.type === 'mto_rit' || e.type === 'mto_rit_recovery');

      // Group MTO/RIT events with their recovery events
      const mtoRitGroups: Map<number, { start: any, recovery?: any }> = new Map();
      let eventCounter = 1;

      mtoRitEventsForRemarks.forEach((event: any) => {
        if (event.type === 'mto_rit') {
          // Find corresponding recovery event
          const recoveryEvent = events.find((e: any) =>
            e.type === 'mto_rit_recovery' &&
            e.setIndex === event.setIndex &&
            e.payload?.team === event.payload?.team &&
            e.payload?.playerNumber === event.payload?.playerNumber &&
            e.payload?.type === event.payload?.type
          );

          mtoRitGroups.set(eventCounter, { start: event, recovery: recoveryEvent });
          eventCounter++;
        }
      });

      // Format MTO/RIT events for remarks
      mtoRitGroups.forEach((group, index) => {
        const { start, recovery } = group;
        if (!start) return;

        const teamKey = start.payload?.team;
        const playerNumber = start.payload?.playerNumber;
        const type = start.payload?.type; // 'mto_blood', 'rit_no_blood', 'rit_weather', 'rit_toilet'
        const setIndex = start.setIndex || 1;
        const setNumber = setIndex === 1 ? '1st' : setIndex === 2 ? '2nd' : '3rd';

        // Determine team labels (A or B)
        const teamAKey = match?.coinTossTeamA || 'team_1';
        const teamBKey = match?.coinTossTeamB || 'team_2';
        const isTeamA = teamKey === teamAKey;
        const teamLabel = isTeamA ? 'A' : 'B';
        const otherTeamLabel = isTeamA ? 'B' : 'A';

        // Get scores at time of interruption
        const teamAPoints = start.payload?.team_1Points || 0;
        const teamBPoints = start.payload?.team_2Points || 0;
        const scoreAtInterruption = isTeamA
          ? `${teamAPoints}:${teamBPoints}`
          : `${teamBPoints}:${teamAPoints}`;

        // Determine serving team at time of interruption
        // Find last rally_start before this MTO/RIT
        const eventTime = start.ts ? (typeof start.ts === 'number' ? new Date(start.ts) : new Date(start.ts)) : new Date();
        const previousEvents = events
          .filter((e: any) =>
            e.setIndex === setIndex &&
            e.ts
          )
          .sort((a: any, b: any) => {
            const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
            const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
            return bTime - aTime; // Most recent first
          });

        const lastRallyStart = previousEvents.find((e: any) => {
          if (e.type !== 'rally_start') return false;
          const eTime = typeof e.ts === 'number' ? new Date(e.ts) : new Date(e.ts);
          return eTime.getTime() < eventTime.getTime();
        });

        let servingTeamLabel = '';
        if (lastRallyStart && lastRallyStart.payload?.servingTeam) {
          const servingTeam = lastRallyStart.payload.servingTeam;
          servingTeamLabel = servingTeam === teamAKey ? 'team A' : 'team B';
        }

        // Format start time
        const startHours = String(eventTime.getHours()).padStart(2, '0');
        const startMinutes = String(eventTime.getMinutes()).padStart(2, '0');
        const startSeconds = String(eventTime.getSeconds()).padStart(2, '0');
        const startTimeStr = `${startHours}:${startMinutes}:${startSeconds}`;

        // Determine interruption type and reason
        let interruptionType = '';
        let reason = '';
        if (type === 'mto_blood') {
          interruptionType = 'Medical Time Out';
        } else if (type === 'rit_no_blood') {
          interruptionType = 'Recovery Interruption';
          reason = '(Illness—No Blood)';
        } else if (type === 'rit_weather') {
          interruptionType = 'Recovery Interruption';
          reason = '(Illness—Severe Weather)';
        } else if (type === 'rit_toilet') {
          interruptionType = 'Recovery Interruption';
          reason = '(Illness—Toilet)';
        }

        // Format recovery time and duration if available
        let resumedTimeStr = '';
        let durationStr = '';
        if (recovery) {
          const recoveryTime = recovery.ts ? (typeof recovery.ts === 'number' ? new Date(recovery.ts) : new Date(recovery.ts)) : new Date();
          const resumedHours = String(recoveryTime.getHours()).padStart(2, '0');
          const resumedMinutes = String(recoveryTime.getMinutes()).padStart(2, '0');
          const resumedSeconds = String(recoveryTime.getSeconds()).padStart(2, '0');
          resumedTimeStr = `${resumedHours}:${resumedMinutes}:${resumedSeconds}`;

          const duration = recovery.payload?.duration || 0; // in seconds
          const durHours = Math.floor(duration / 3600);
          const durMinutes = Math.floor((duration % 3600) / 60);
          const durSeconds = duration % 60;
          durationStr = `${String(durHours).padStart(2, '0')}:${String(durMinutes).padStart(2, '0')}:${String(durSeconds).padStart(2, '0')}`;
        }

        // Build remark line with labels, capitalization, and commas
        // Format: * Start Time: HH:MM:SS, Set: Xth set, Score: XX:XX, Serving Team: team X serving, Player: #X team X, Type: "Interruption Type" (Reason), End Time: HH:MM:SS, Duration: HH:MM:SS
        let remarkLine = `* Start Time: ${startTimeStr}, ${setNumber.charAt(0).toUpperCase() + setNumber.slice(1)} Set, Score: ${scoreAtInterruption}, ${servingTeamLabel.charAt(0).toUpperCase() + servingTeamLabel.slice(1)} Serving, Player: #${playerNumber} Team ${teamLabel.toUpperCase()}, "${interruptionType}"`;
        if (reason) {
          remarkLine += ` ${reason}`;
        }
        if (resumedTimeStr) {
          remarkLine += `, End Time: ${resumedTimeStr}, Duration: ${durationStr}`;
        }

        mtoRitRemarks.push(remarkLine);
      });

      // Combine existing remarks with MTO/RIT remarks
      let remarksText = '';
      if (match?.remarks) {
        remarksText = match.remarks;
      }
      if (mtoRitRemarks.length > 0) {
        if (remarksText) {
          remarksText += '\n\n';
        }
        remarksText += mtoRitRemarks.join('\n');
      }

      if (remarksText) {
        set('remarks', remarksText);
      }

      setDataInitialized(true);
    } else if (!matchData) {
      // Try to load from sessionStorage as fallback
      try {
        const dataStr = sessionStorage.getItem('scoresheetData');
        if (dataStr) {
          const fallbackData = JSON.parse(dataStr);
          // Retry initialization with fallback data
          if (fallbackData && fallbackData.match) {
            // This will be handled by the next render cycle
          }
        }
      } catch (e) {
        // Error loading fallback data
      }
    }
  }, [matchData, dataInitialized, data]);


  // Disabled auto-PDF generation - just render HTML for now
  // useEffect(() => {
  //   if (!dataInitialized) return;
  //   
  //   // Wait for pages to be ready and React to finish rendering
  //   const checkAndGenerate = () => {
  //     if (page1Ref.current && page2Ref.current) {
  //       setTimeout(async () => {
  //         try {
  //           await handleSavePDF();
  //         } catch (error) {
  //           console.error('Error auto-generating PDF:', error);
  //         }
  //       }, 2000);
  //     } else {
  //       // Check again after a short delay
  //       setTimeout(checkAndGenerate, 500);
  //     }
  //   };
  //   
  //   const timer = setTimeout(checkAndGenerate, 500);
  //   return () => clearTimeout(timer);
  // }, [dataInitialized, handleSavePDF]);


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
            Service<br />Order
          </div>
          <div className={`${W_COL2} border-r border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
            Player<br />No.
          </div>
          <div className={`${W_COL3} border-r border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
            Formal<br />Warn.
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
            Service<br />Order
          </div>
          <div className={`${W_COL2} border-r border-black p-0.5 text-[5px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
            Player<br />No.
          </div>
          <div className={`${W_COL3} border-r border-black p-0.5 text-[5px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
            Formal<br />Warn.
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
          crossed={get(`${setPrefix}_${rowKeySuffix}_fw_crossed`) === 'true' || get(`${setPrefix}_${rowKeySuffix}_fw_crossed`) === true}
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
        {Array.from({ length: 21 }).map((_, i) => {
          const value = get(`${setPrefix}_${rowKeySuffix}_pt_${i + 1}`);
          const isCircled = get(`${setPrefix}_${rowKeySuffix}_pt_${i + 1}_circled`) === 'true';
          return (
            <div key={i} className="flex-1 border-r border-black relative group last:border-r-0">
              <span className="absolute top-[1px] right-[1px] text-[5px] leading-none select-none text-gray-500">{i + 1}</span>
              <div className="relative w-full h-full">
                <Input
                  value={value}
                  onChange={v => set(`${setPrefix}_${rowKeySuffix}_pt_${i + 1}`, v)}
                  className="w-full h-full text-[10px] group-hover:bg-blue-50"
                />
                {/* Circle indicator for final score */}
                {isCircled && value && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-[80%] aspect-square rounded-full border-2 border-black"></div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Helper function to calculate contrasting text color (white or black)
  const getContrastColor = (hexColor: string): string => {
    if (!hexColor || hexColor === 'image.png') return '#000000';

    // Remove # if present
    const hex = hexColor.replace('#', '');

    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate relative luminance (perceived brightness)
    // Using formula from WCAG: https://www.w3.org/WAI/GL/wiki/Relative_luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return black for light colors, white for dark colors
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  };

  // Helper to check if a set has started (has startTime) or is current/finished
  const hasSetStarted = (setNum: number): boolean => {
    const prefix = setNum === 1 ? 's1' : setNum === 2 ? 's2' : 's3';
    const startTime = get(`${prefix}_start_hh`);
    // If startTime exists, the set has started
    return startTime !== undefined && startTime !== null && startTime !== '';
  };

  // 4. Team Control Row
  const renderTeamControlRow = (setPrefix: string, teamSuffix: string, inverted = false, setNum: number) => {

    // Time Out - height should match DelayHeaderBox + DelaySubHeaderBox (2 * H_HEADER_ROW = h-10)
    const TimeOutLabelBox = (
      <div className={`h-10 text-[5px] text-center leading-tight bg-gray-50 font-bold border-t border-black ${W_COL1}`} style={centerStyleCol}>
        Time<br />Out
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
            crossed={get(`${setPrefix}_${teamSuffix}_ds_w_crossed`) === 'true' || get(`${setPrefix}_${teamSuffix}_ds_w_crossed`) === true}
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
    // Get team color for background (only if set has started)
    const setHasStarted = hasSetStarted(setNum);
    const teamColor = get(`${setPrefix}_${teamSuffix}_team_color`) || '#FFFFFF';
    const textColor = getContrastColor(teamColor);
    // Convert hex to rgba with transparency (0.3 opacity)
    const hexToRgba = (hex: string, alpha: number): string => {
      if (!hex || hex === 'image.png') return `rgba(255, 255, 255, ${alpha})`;
      const hexClean = hex.replace('#', '');
      const r = parseInt(hexClean.substring(0, 2), 16);
      const g = parseInt(hexClean.substring(2, 4), 16);
      const b = parseInt(hexClean.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    // Only apply background color if set has started
    const backgroundColor = setHasStarted ? hexToRgba(teamColor, 0.3) : 'transparent';
    const textColorStyle = setHasStarted ? textColor : '#000000';

    const PointsRow = (
      <div className={`h-8 flex items-center bg-white flex-1 `}>
        <div className="w-32 flex flex-col ml-1">

          {/* A or B + Team Name Input Box */}
          <div
            className={`h-8 flex items-center border border-black`}
            style={{ backgroundColor: backgroundColor }}
          >
            <div className="flex flex-col p-0.5 ml-1">
              <ABCircle
                value={get(`${setPrefix}_${teamSuffix}_team_circle`)}
                onChange={v => set(`${setPrefix}_${teamSuffix}_team_circle`, v)}
                size={18}
              />
            </div>
            <div className="flex-1 h-full flex items-center justify-center">
              <span
                className="text-[15px] text-left font-bold"
                style={{ color: textColorStyle }}
              >
                {get(`${setPrefix}_${teamSuffix}_team_label`) || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Points 1-44 Grid - Centered vertically */}
        <div className="flex-1 flex items-center">
          {Array.from({ length: 44 }).map((_, i) => (
            <div key={i} className="flex-1 flex items-center justify-center relative">
              <PointCell
                num={i + 1}
                value={get(`${setPrefix}_${teamSuffix}_pt_lg_${i + 1}`)}
                onClick={() => {
                  const k = `${setPrefix}_${teamSuffix}_pt_lg_${i + 1}`;
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
            {TimeOutInputBox}
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

    // Get team_up and team_down for this set
    const teamUp = get(`${prefix}_team_up`) || 'team_1';
    const teamDown = get(`${prefix}_team_down`) || 'team_2';

    // Determine which team suffix (t1 or t2) corresponds to team_up and team_down
    const teamUpSuffix = teamUp === 'team_1' ? 't1' : 't2';
    const teamDownSuffix = teamDown === 'team_1' ? 't1' : 't2';

    return (
      <div className="border-2 border-black flex mt-1 mb-1 text-black bg-white" style={{ fontSize: '0.7rem' }}>
        {/* MAIN SCORING AREA */}
        <div className="flex-1 flex flex-col">

          {/* SET HEADER */}
          {renderHeaderRow(setNum, prefix)}

          {/* TEAM UP (Top) Service Order - rows I and III */}
          <div className="border-r border-black border-r">
            {renderPlayerRow(prefix, 'I', 'r1')}
            {renderPlayerRow(prefix, 'III', 'r3')}
          </div>
          {/* GAP (Whitespace) */}
          <div className="h-0.5 w-full bg-white border-b border-white border-r"></div>

          {/* TEAM UP CONTROL (With Top Border) */}
          <div className="border-t border-black border-r">
            {renderTeamControlRow(prefix, teamUpSuffix, false, setNum)}
          </div>

          {/* GAP + SEPARATOR LINE */}
          <div className="h-0.5 w-full bg-white"></div>
          <div className="h-[2px] w-full bg-black"></div>
          <div className="h-0.5 w-full bg-white"></div>

          {/* TEAM DOWN CONTROL (With Top Border) */}
          <div className="border-t border-black border-r">
            {renderTeamControlRow(prefix, teamDownSuffix, true, setNum)}
          </div>

          {/* GAP (Whitespace) */}
          <div className="h-0.5 w-full bg-white"></div>

          {/* TEAM DOWN (Bottom) Service Order (With Top Border) - rows II and IV */}
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
          <div className="h-4 border-black border-b text-[8px] text-center font-bold bg-gray-100 text-black" style={centerStyle}>
            A : B
          </div>
          {/* Court Switch Inputs */}
          {Array.from({ length: 12 }).map((_, i) => {
            const valA = get(`${prefix}_cs_${i}_a`);
            const valB = get(`${prefix}_cs_${i}_b`);
            const isEmpty = !valA && !valB;

            // Use only bottom border to avoid overlapping (except for TTO which needs all borders)
            // For non-TTO boxes, use bottom border only (no top border to prevent doubling)
            const borderClasses = i === 2
              ? 'border-t-0 border-l-0 border-r-0 border-b border-black' // TTO: all borders black
              : 'border-l-0 border-r-0 border-t-0 border-b border-black'; // All non-TTO: only bottom border black

            return (
              <div
                key={i}
                className={`flex-1 flex items-center justify-center relative ${borderClasses}`}
              >
                {/* TTO with Box for Set 1 & 2 - Row 2 (index 2) */}
                {i === 2 && setNum !== 3 && (
                  <div className="absolute top-0 right-0 px-[1px] bg-white text-[5px] font-bold z-10 leading-none" style={{ right: '0px', top: '0px' }}>TTO</div>
                )}
                <Input value={valA} onChange={v => set(`${prefix}_cs_${i}_a`, v)} className="w-5 h-full text-[9px]" />
                <span className={`text-[8px] ${isEmpty ? 'text-white' : 'text-black'}`}>:</span>
                <Input value={valB} onChange={v => set(`${prefix}_cs_${i}_b`, v)} className="w-5 h-full text-[9px]" />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto text-black">
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
        <div className="bg-blue-900 text-white px-2 py-0.5 flex justify-between items-center">
          <span className="text-[9px]">Beach volley eScoresheet Openvolley</span>
        </div>

        {/* METADATA ROWS */}
        <div className="border border-black mb-2">
          {/* Row 1 */}
          <div className="flex items-center px-1 py-1 border-b border-black h-5">
            <span className="text-[9px] w-28 text-black">Name of Competition:</span>
            <Input value={get('competition')} onChange={v => set('competition', v)} className="flex-1 text-left px-1 text-sm font-bold text-black" />
            <span className="text-[7px] text-black">v1.0 11/2025</span>
          </div>

          {/* Row 2 */}
          <div className="flex items-center text-[9px] h-5 divide-x divide-black text-black border-black">
            <div className="flex items-center px-2 gap-1">
              <span>Match No.:</span>
              <Input value={get('match_no')} onChange={v => set('match_no', v)} className="w-5" />
            </div>
            <div className="flex items-center px-2 gap-1 flex-1">
              <span>Site:</span>
              <Input value={get('site')} onChange={v => set('site', v)} className="flex-1" />
            </div>
            <div className="flex items-center px-2 gap-1 flex-1">
              <span>Beach:</span>
              <Input value={get('beach')} onChange={v => set('beach', v)} className="flex-1" />
            </div>
            <div className="flex items-center px-2 gap-1">
              <span>Court:</span>
              <Input value={get('court')} onChange={v => set('court', v)} className="w-8" />
            </div>
            <div className="flex items-center px-2 gap-1">
              <span>Date:</span>
              <Input value={get('date_d')} onChange={v => set('date_d', v)} className="w-3 text-center" placeholder="DD" />
              <span>/</span>
              <Input value={get('date_m')} onChange={v => set('date_m', v)} className="w-3 text-center" placeholder="MM" />
              <span>/</span>
              <Input value={get('date_y')} onChange={v => set('date_y', v)} className="w-3 text-center" placeholder="YY" />
            </div>
            <div className="flex items-center px-2 gap-0.5">
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
        <div className="flex border border-black mb-0.5 p-0.5 items-center gap-5 text-black">
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
        <div className="flex-1 flex flex-col gap-0.5" style={{ minHeight: 0 }}>
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
            {/* Height calculation: country/side ~20px + header 16px + player1 20px + player2 20px + signature 30px + padding = ~106px */}
            <div className="border-2 border-black flex h-[106px]">
              <div className="w-8 font-bold text-sm border-r border-black bg-gray-50 text-black relative overflow-hidden">
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
                  <Input value={get('b_t1_country')} onChange={v => set('b_t1_country', v)} className="w-10 border-black text-xs font-bold text-center" />
                  <ABCircle value={get('b_t1_side')} onChange={v => set('b_t1_side', v)} size={16} className="ml-2" />
                </div>
                <div className="flex text-[9px] h-4 border-black">
                  <div className="w-6 border border-b-0 border-black text-center">No.</div>
                  <div className="flex-1 pl-1 border border-b-0 border-l-0 border-black">Player's Name</div>
                </div>
                {/* Player 1 */}
                <div className="flex text-[9px] h-5">
                  <div className="w-6 border border-black" style={centerStyle}><Input value={get('b_t1_p1_no')} onChange={v => set('b_t1_p1_no', v)} className="w-full text-center" /></div>
                  <div className="flex-1 border border-l-0 border-black"><Input value={get('b_t1_p1_name')} onChange={v => set('b_t1_p1_name', v)} className="w-full px-1" style={{ textAlign: 'left' }} /></div>
                </div>
                {/* Player 2 */}
                <div className="flex text-[9px] h-5">
                  <div className="w-6 border border-t-0 border-black" style={centerStyle}><Input value={get('b_t1_p2_no')} onChange={v => set('b_t1_p2_no', v)} className="w-full text-center" /></div>
                  <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t1_p2_name')} onChange={v => set('b_t1_p2_name', v)} className="w-full px-1" style={{ textAlign: 'left' }} /></div>
                </div>
                <div className="text-[4px]" style={{ height: '30px' }}>Captain's pre-match signature:</div>
                {/* Signature image for Team 1 */}
                {matchData?.match?.team_1CaptainSignature && (
                  <div className="flex-1 border-white">
                    <img src={matchData.match.team_1CaptainSignature} alt="Team 1 Captain Signature" style={{ width: '40%', height: '40%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              {/* Team B Col */}
              <div className="flex-1 p-0.5 flex flex-col">
                <div className="flex items-center mb-0.5 justify-left ml-2">
                  <ABCircle value={get('b_t2_side')} onChange={v => set('b_t2_side', v)} size={16} />

                  <Input value={get('b_t2_country')} onChange={v => set('b_t2_country', v)} className="w-10 border-black text-xs font-bold ml-1 text-center" />
                </div>
                <div className="flex text-[9px] h-4 border-b border-black">
                  <div className="w-6 border border-b-0 border-black text-center">No.</div>
                  <div className="flex-1 pl-1 border border-b-0 border-l-0 border-black">Player's Name</div>
                </div>
                {/* Player 1 */}
                <div className="flex text-[9px] h-5">
                  <div className="w-6 border border-t-0 border-black" style={centerStyle}><Input value={get('b_t2_p1_no')} onChange={v => set('b_t2_p1_no', v)} className="w-full text-center" /></div>
                  <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t2_p1_name')} onChange={v => set('b_t2_p1_name', v)} className="w-full px-1" style={{ textAlign: 'left' }} /></div>
                </div>
                {/* Player 2 */}
                <div className="flex text-[9px] h-5">
                  <div className="w-6 border border-t-0 border-black" style={centerStyle}><Input value={get('b_t2_p2_no')} onChange={v => set('b_t2_p2_no', v)} className="w-full text-center" /></div>
                  <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t2_p2_name')} onChange={v => set('b_t2_p2_name', v)} className="w-full px-1" style={{ textAlign: 'left' }} /></div>
                </div>
                <div className="text-[4px]" style={{ height: '30px' }}>Captain's pre-match signature:</div>
                {/* Signature image for Team 2 */}
                {matchData?.match?.team_2CaptainSignature && (
                  <div className="flex-1 border-white">
                    <img
                      src={matchData.match.team_2CaptainSignature}
                      alt="Team 2 Captain Signature"
                      style={{ width: '40%', height: '40%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>
            </div>

            {/* RESULTS TABLE */}
            <div className="border-2 border-black flex">
              <div className="w-8 font-bold text-sm border-r border-black bg-gray-400 text-black relative overflow-hidden" style={{ minHeight: '100px' }}>
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
                  <div className="flex items-center gap-1 px-2 text-black p-1">
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
                    2 :
                    <Input value={get('win_score_other')} onChange={v => set('win_score_other', v)} className="w-6" />
                  </div>
                </div>
              </div>
            </div>

            {/* APPROVAL TABLE */}
            {/* Height calculation: header 12px + 4 referees 64px + 2 line judges 32px + signatures 30px = 138px */}
            <div className="border-2 border-black flex h-[150px] overflow-hidden">
              <div className="w-8 font-bold text-xs border-r border-black bg-white text-black relative">
                <span style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-90deg)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.08em'
                }}>APPROVAL</span>
              </div>
              <table className="flex-1 border-collapse text-[8px] h-full" style={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: '70px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '40px' }} />
                  <col style={{ width: 'auto' }} />
                </colgroup>
                {/* Header */}
                <thead>
                  <tr className="bg-gray-100 text-black font-bold text-center h-3">
                    <td className="border-r border-b border-black px-1 py-0">Officials</td>
                    <td className="border-r border-b border-black px-1 py-0">Name</td>
                    <td className="border-r border-b border-black px-1 py-0">Country</td>
                    <td className="border-b border-black px-1 py-0">Signature</td>
                  </tr>
                </thead>
                <tbody>
                  {/* Referees - reduced height to h-4 (16px) */}
                  {[
                    { l: '1st Referee', k: 'ref1' },
                    { l: '2nd Referee', k: 'ref2' },
                    { l: 'Scorer', k: 'scorer' },
                    { l: 'Asst. Scorer', k: 'asst_scorer' }
                  ].map(r => (
                    <tr key={r.k} className="h-4">
                      <td className="border-r border-b border-black px-1 font-bold text-left">{r.l}</td>
                      <td className="border-r border-b border-black p-0"><Input value={get(`${r.k}_name`)} onChange={v => set(`${r.k}_name`, v)} className="w-full h-full px-1" style={{ textAlign: 'left' }} /></td>
                      <td className="border-r border-b border-black p-0"><Input value={get(`${r.k}_country`)} onChange={v => set(`${r.k}_country`, v)} className="w-full h-full text-center" /></td>
                      <td className="border-b border-black bg-gray-50"></td>
                    </tr>
                  ))}
                  {/* Line Judges - reduced height to h-4 (16px) */}
                  <tr className="h-4">
                    <td rowSpan={2} className="border-r border-b border-black px-1 font-bold text-left align-middle">Line<br />Judges</td>
                    <td colSpan={3} className="border-b border-black p-0">
                      <div className="flex h-4">
                        <div className="flex-1 flex border-r border-black h-full">
                          <span className="w-4 border-r border-black font-bold h-full" style={centerStyle}>1</span>
                          <Input value={get('lj1')} onChange={v => set('lj1', v)} className="flex-1 px-1 h-full" style={{ textAlign: 'left' }} />
                        </div>
                        <div className="flex-1 flex h-full">
                          <span className="w-4 border-r border-black font-bold h-full" style={centerStyle}>2</span>
                          <Input value={get('lj2')} onChange={v => set('lj2', v)} className="flex-1 px-1 h-full" style={{ textAlign: 'left' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr className="h-4">
                    <td colSpan={3} className="border-b border-black p-0">
                      <div className="flex h-4">
                        <div className="flex-1 flex border-r border-black h-full">
                          <span className="w-4 border-r border-black font-bold h-full" style={centerStyle}>3</span>
                          <Input value={get('lj3')} onChange={v => set('lj3', v)} className="flex-1 px-1 h-full" style={{ textAlign: 'left' }} />
                        </div>
                        <div className="flex-1 flex h-full">
                          <span className="w-4 border-r border-black font-bold h-full" style={centerStyle}>4</span>
                          <Input value={get('lj4')} onChange={v => set('lj4', v)} className="flex-1 px-1 h-full" style={{ textAlign: 'left' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Post-match Signatures - fixed height */}
                  <tr style={{ height: '30px', display: 'table-row', overflow: 'hidden' }}>
                    <td colSpan={2} className="border-r border-black p-0 align-top" style={{ height: '30px', overflow: 'hidden', paddingLeft: '2px' }}>
                      <span className="text-[4px]">Captain's post-match signature</span>
                    </td>
                    <td colSpan={2} className="p-0 align-top" style={{ height: '30px', overflow: 'hidden', paddingLeft: '2px' }}>
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
                  {/* Team (A/B + Country), vertically centered across Player 1 & 2 */}
                  <div className="w-24 border-r border-t border-black flex items-center justify-center text-black px-1 box-border" style={{ flexDirection: "column", justifyContent: "center", gap: '2px' }}>
                    <div className="flex items-center justify-center h-full">
                      <ABCircle value={get(`ma_side_${team}`)} onChange={v => set(`ma_side_${team}`, v)} size={14} className="mr-1" />
                      <span className="text-[15px] font-bold">{get(`ma_ctry_${team}`) || ''}</span>
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
                          <div className="flex-[3] flex box-border h-full relative">
                            <div className="flex-1 border-r border-black box-border relative" style={centerStyle}>
                              {get(`ma_rit_nb_${idx}_crossed`) ? (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="w-full h-[1px] bg-black"></div>
                                </div>
                              ) : (
                                <XBox checked={get(`ma_rit_nb_${idx}`)} onChange={v => set(`ma_rit_nb_${idx}`, v)} size={10} />
                              )}
                            </div>
                            <div className="flex-1 border-r border-black box-border relative" style={centerStyle}>
                              {get(`ma_rit_w_${idx}_crossed`) ? (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="w-full h-[1px] bg-black"></div>
                                </div>
                              ) : (
                                <XBox checked={get(`ma_rit_w_${idx}`)} onChange={v => set(`ma_rit_w_${idx}`, v)} size={10} />
                              )}
                            </div>
                            <div className="flex-1 box-border relative" style={centerStyle}>
                              {get(`ma_rit_t_${idx}_crossed`) ? (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="w-full h-[1px] bg-black"></div>
                                </div>
                              ) : (
                                <XBox checked={get(`ma_rit_t_${idx}`)} onChange={v => set(`ma_rit_t_${idx}`, v)} size={10} />
                              )}
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

      {/* Gap between page 2 and page 3 */}
      <div style={{ height: '20mm', width: '100%' }}></div>

      {/* ================= PAGE 3 - BMP SHEET ================= */}
      <div
        ref={page3Ref}
        id="page-3"
        className="page-boundary page-3 flex flex-col bg-white mx-auto"
        style={{
          width: '297mm',
          height: '210mm',
          padding: '6mm',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontFamily: 'Arial, sans-serif'
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
              <Input value={get('bmp_event')} onChange={v => set('bmp_event', v)} className="flex-1 text-left text-[10px]" />
            </div>
            <div className="flex items-center px-2 py-1 w-36">
              <span className="font-bold mr-2 text-[10px]">DATE:</span>
              <Input value={get('bmp_date')} onChange={v => set('bmp_date', v)} className="flex-1 text-center text-[10px]" />
            </div>
          </div>

          <div className="flex text-[10px]">
            <div className="flex items-center px-2 py-1 border-r border-black">
              <span className="font-bold mr-1">MATCH NO:</span>
              <Input value={get('bmp_match_no')} onChange={v => set('bmp_match_no', v)} className="w-12 text-center text-[10px]" />
            </div>
            <div className="flex items-center px-2 py-1 border-r border-black">
              <span className="font-bold mr-1">PHASE:</span>
              <Input value={get('bmp_phase')} onChange={v => set('bmp_phase', v)} className="w-16 text-center text-[10px]" />
            </div>
            <div className="flex items-center px-2 py-1 border-r border-black">
              <span className="font-bold mr-1">GENDER:</span>
              <Input value={get('bmp_gender')} onChange={v => set('bmp_gender', v)} className="w-10 text-center text-[10px]" />
            </div>
            <div className="flex items-center px-2 py-1 border-r border-black flex-1">
              <span className="font-bold mr-1">TEAM A:</span>
              <Input value={get('bmp_team_a')} onChange={v => set('bmp_team_a', v)} className="flex-1 text-center text-[10px]" />
            </div>
            <div className="flex items-center px-2 py-1 flex-1">
              <span className="font-bold mr-1">TEAM B:</span>
              <Input value={get('bmp_team_b')} onChange={v => set('bmp_team_b', v)} className="flex-1 text-center text-[10px]" />
            </div>
          </div>
        </div>

        {/* SECTION TITLE */}
        <div className="bg-gray-100 border-2 border-black px-2 py-1 text-center font-bold text-[10px]">
          During the match
        </div>

        {/* BMP TABLE - Takes remaining space */}
        <div className="border-2 border-t-0 border-black flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {/* Header - 10 equal columns */}
          <div className="flex bg-gray-50 border-b-2 border-black text-[8px] font-bold" style={{ flexShrink: 0 }}>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Start<br />time</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              Set
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Score at time<br />of BMP request</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Team<br />serving</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Request by<br />(A / B / Ref)</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">BMP request<br />Outcome</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Team<br />serving</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Score after<br />decision</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
              <div className="text-center leading-tight">Time match<br />resumed</div>
            </div>
            <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="py-2">
              Duration
            </div>
          </div>

          {/* Rows - 16 rows */}
          <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
            {Array.from({ length: 16 }).map((_, i) => {
              const cellStyle = { width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' };
              const outcomeValue = get(`bmp_${i}_outcome`);
              const requestBy = get(`bmp_${i}_request`);
              const isRefRequest = requestBy?.toLowerCase()?.includes('ref');

              // Outcome selector values
              // Team-requested BMPs: SUC, UNSUC, MUNAV
              // Referee-requested BMPs: A, B
              const teamOutcomes = ['', 'UNSUC', 'SUC', 'MUNAV'];
              const refOutcomes = ['', 'A', 'B'];
              const outcomes = isRefRequest ? refOutcomes : teamOutcomes;

              return (
                <div key={i} className={`flex text-[9px] flex-1 min-h-0 ${i < 15 ? 'border-b border-black' : ''}`}>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_start`)} onChange={v => set(`bmp_${i}_start`, v)} className="w-full h-full text-[9px]" />
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_set`)} onChange={v => set(`bmp_${i}_set`, v)} className="w-full h-full text-[9px]" />
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_score_a`)} onChange={v => set(`bmp_${i}_score_a`, v)} className="w-8 text-[9px] text-center" />
                    <span className="mx-0.5 text-[9px]">:</span>
                    <Input value={get(`bmp_${i}_score_b`)} onChange={v => set(`bmp_${i}_score_b`, v)} className="w-8 text-[9px] text-center" />
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_serving_before`)} onChange={v => set(`bmp_${i}_serving_before`, v)} className="w-full h-full text-[9px] text-center" />
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_request`)} onChange={v => set(`bmp_${i}_request`, v)} className="w-full h-full text-[9px]" />
                  </div>
                  <div style={cellStyle} className="border-r border-black px-1">
                    <div
                      onClick={() => {
                        const currentIndex = outcomes.indexOf(outcomeValue || '');
                        const nextIndex = (currentIndex + 1) % outcomes.length;
                        set(`bmp_${i}_outcome`, outcomes[nextIndex]);
                      }}
                      className="border border-black flex items-center justify-center cursor-pointer bg-white hover:bg-gray-50 select-none text-black font-mono text-[9px] w-full h-5 px-0.5"
                    >
                      {outcomeValue || '-'}
                    </div>
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_serving_after`)} onChange={v => set(`bmp_${i}_serving_after`, v)} className="w-full h-full text-[9px] text-center" />
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_score2_a`)} onChange={v => set(`bmp_${i}_score2_a`, v)} className="w-8 text-[9px] text-center" />
                    <span className="mx-0.5 text-[9px]">:</span>
                    <Input value={get(`bmp_${i}_score2_b`)} onChange={v => set(`bmp_${i}_score2_b`, v)} className="w-8 text-[9px] text-center" />
                  </div>
                  <div style={cellStyle} className="border-r border-black">
                    <Input value={get(`bmp_${i}_resumed`)} onChange={v => set(`bmp_${i}_resumed`, v)} className="w-full h-full text-[9px]" />
                  </div>
                  <div style={cellStyle}>
                    <Input value={get(`bmp_${i}_duration`)} onChange={v => set(`bmp_${i}_duration`, v)} className="w-full h-full text-[9px]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SIGNATURES */}
        <div className="flex gap-4 mt-2" style={{ flexShrink: 0 }}>
          <div className="flex-1 border-2 border-black">
            <div className="bg-gray-100 border-b border-black px-2 py-1 font-bold text-[9px]">Scorer's signature</div>
            <div className="h-8 p-1">
              <Input value={get('bmp_scorer_sig')} onChange={v => set('bmp_scorer_sig', v)} className="w-full h-full text-left text-[10px]" />
            </div>
          </div>
          <div className="flex-1 border-2 border-black">
            <div className="bg-gray-100 border-b border-black px-2 py-1 font-bold text-[9px]">First Referee's signature</div>
            <div className="h-8 p-1">
              <Input value={get('bmp_ref_sig')} onChange={v => set('bmp_ref_sig', v)} className="w-full h-full text-left text-[10px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}