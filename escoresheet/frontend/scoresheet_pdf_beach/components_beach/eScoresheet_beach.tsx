import React, { useState, useRef, useEffect, useCallback } from 'react';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

// Register locale for country code conversion
countries.registerLocale(enLocale);

// ISO3 to ISO2 conversion for flag lookup
const iso3ToIso2 = (iso3: string): string | null => {
  if (!iso3) return null;
  const iso2 = countries.alpha3ToAlpha2(iso3.toUpperCase().trim());
  return iso2 ? iso2.toLowerCase() : null;
};

// Eagerly import all 4x3 flag SVGs from flag-icons
// @ts-ignore - import.meta.glob is a Vite-specific API
const flagSvgs: Record<string, { default: string }> = import.meta.glob(
  '../../node_modules/flag-icons/flags/4x3/*.svg',
  { eager: true }
);

// Get flag URL by ISO2 code
const getFlagUrl = (iso2: string): string | null => {
  const key = `../../node_modules/flag-icons/flags/4x3/${iso2}.svg`;
  return flagSvgs[key]?.default || null;
};

// FlagImage component - renders a country flag as an <img> tag
const FlagImage = ({ countryCode, size = 14 }: { countryCode?: string; size?: number }) => {
  const iso2 = iso3ToIso2(countryCode || '');
  if (!iso2) return null;
  const url = getFlagUrl(iso2);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={countryCode || ''}
      crossOrigin="anonymous"
      style={{
        width: `${Math.round(size * 4 / 3)}px`,
        height: `${size}px`,
        objectFit: 'cover',
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: '1px',
        border: '1px solid rgba(0,0,0,0.2)',
        flexShrink: 0
      }}
    />
  );
};

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
        <div className="h-[88%] aspect-square rounded-full border border-black"></div>
      </div>
    )}
  </div>
);

// Capitalize each word in a string (e.g. "van der berg" -> "Van Der Berg")
const capitalizeWords = (str: string) =>
  str.replace(/\b\w/g, c => c.toUpperCase());

// Format player name as "LASTNAME Firstname" for scoresheet TEAMS table
const formatPlayerName = (firstName: string, lastName: string) => {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  if (!ln && !fn) return '';
  if (!ln) return capitalizeWords(fn);
  if (!fn) return capitalizeWords(ln);
  return `${capitalizeWords(ln)} ${capitalizeWords(fn)}`;
};

export default function OpenbeachScoresheet({ matchData: initialMatchData }: { matchData?: any }) {
  const [data, setData] = useState<Record<string, any>>({});
  const dataRef = useRef<Record<string, any>>({});
  const [currentMatchData, setCurrentMatchData] = useState<any>(initialMatchData);
  const [dataVersion, setDataVersion] = useState(0); // Increment to trigger re-initialization
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
      console.log('[eScoresheet] Received message:', event.data?.type);
      if (event.data?.type === 'REFRESH_SCORESHEET') {
        console.log('[eScoresheet] REFRESH_SCORESHEET received!');
        // Get data directly from message (sessionStorage is per-window, not shared)
        try {
          const newMatchData = event.data?.data;
          console.log('[eScoresheet] Received data, events count:', newMatchData?.events?.length);
          if (newMatchData) {
            // Reset data and update matchData to trigger re-initialization
            dataRef.current = {};
            setData({});
            setCurrentMatchData(newMatchData);
            setDataVersion(v => v + 1); // Trigger re-initialization
            console.log('[eScoresheet] State updated, should re-render');
          }
        } catch (error) {
          console.error('Error refreshing scoresheet data:', error);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    console.log('[eScoresheet] Message listener registered');
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Initialize data from currentMatchData (updates on refresh)
  useEffect(() => {
    console.log('[eScoresheet] useEffect triggered, dataVersion:', dataVersion, 'hasMatchData:', !!currentMatchData);

    // Initialize if currentMatchData exists
    if (currentMatchData) {
      // Handle both team1Players/team2Players and team_1Players/team_2Players formats
      const team1Players = currentMatchData.team1Players || currentMatchData.team_1Players || [];
      const team2Players = currentMatchData.team2Players || currentMatchData.team_2Players || [];
      const team1Team = currentMatchData.team1Team || currentMatchData.team_1Team;
      const team2Team = currentMatchData.team2Team || currentMatchData.team_2Team;
      const { match, sets, events } = currentMatchData;

      console.log('[Scoresheet Component] Received matchData:', {
        hasMatch: !!match,
        hasTeam1Team: !!team1Team,
        hasTeam2Team: !!team2Team,
        team1PlayersCount: team1Players?.length || 0,
        team2PlayersCount: team2Players?.length || 0,
        setsCount: sets?.length || 0,
        eventsCount: events?.length || 0,
        matchDataKeys: Object.keys(currentMatchData || {}),
        dataVersion,
        match: match ? {
          id: match.id,
          coinTossTeamA: match.coinTossTeamA,
          coinTossTeamB: match.coinTossTeamB,
          coinTossData: match.coinTossData,
          team1Country: match.team1Country,
          team2Country: match.team2Country,
          team_1Country: match.team_1Country,
          team_2Country: match.team_2Country
        } : null,
        team1Team: team1Team ? {
          name: team1Team.name,
          country: team1Team.country
        } : null,
        team2Team: team2Team ? {
          name: team2Team.name,
          country: team2Team.country
        } : null,
        team1Players: team1Players?.map(p => ({
          number: p.number,
          firstName: p.firstName,
          lastName: p.lastName,
          isCaptain: p.isCaptain
        })) || [],
        team2Players: team2Players?.map(p => ({
          number: p.number,
          firstName: p.firstName,
          lastName: p.lastName,
          isCaptain: p.isCaptain
        })) || [],
        rawMatchData: currentMatchData, // Include full raw data for inspection
        signatures: {
          team1CaptainSignature: match?.team1CaptainSignature ? `present (${match.team1CaptainSignature.substring(0, 50)}...)` : 'MISSING',
          team2CaptainSignature: match?.team2CaptainSignature ? `present (${match.team2CaptainSignature.substring(0, 50)}...)` : 'MISSING',
          team1CoachSignature: match?.team1CoachSignature ? 'present' : 'MISSING',
          team2CoachSignature: match?.team2CoachSignature ? 'present' : 'MISSING',
          team1PostGameCaptainSignature: match?.team1PostGameCaptainSignature ? 'present' : 'MISSING',
          team2PostGameCaptainSignature: match?.team2PostGameCaptainSignature ? 'present' : 'MISSING',
        }
      });

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

        // Gender checkbox - check matchGender, gender, and match_type_2 field names
        const genderValue = match.matchGender || match.gender || match.match_type_2;
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
      if (team1Team) {
        const t1Country = team1Team.country || match?.team1Country || '';
        set('t1_country', t1Country);
        set('b_t1_country', t1Country);
        // Set team name immediately (don't wait for sets)
        const t1Name = team1Team.name || '';
        set('t1_name', t1Name);
      }
      if (team2Team) {
        const t2Country = team2Team.country || match?.team2Country || '';
        set('t2_country', t2Country);
        set('b_t2_country', t2Country);
        // Set team name immediately (don't wait for sets)
        const t2Name = team2Team.name || '';
        set('t2_name', t2Name);
      }

      // Players (for TEAMS table)
      // TEAMS table always shows team1 on left, team2 on right (regardless of A/B)
      // A/B circles are filled separately based on coin toss

      // Check if coin toss has been confirmed
      const isCoinTossConfirmed = match?.coinTossConfirmed === true;

      // Determine which team is A and which is B for coin toss data lookup
      // Only set if coin toss is confirmed
      const teamAKey = isCoinTossConfirmed ? (match?.coinTossTeamA || 'team1') : '';
      const teamBKey = isCoinTossConfirmed ? (match?.coinTossTeamB || (teamAKey === 'team1' ? 'team2' : 'team1')) : '';

      // Medical Assistance Chart - Set A/B and countries only if coin toss confirmed
      if (isCoinTossConfirmed && teamAKey && teamBKey) {
        const teamACountry = teamAKey === 'team1'
          ? (team1Team?.country || match?.team1Country || '')
          : (team2Team?.country || match?.team2Country || '');
        const teamBCountry = teamBKey === 'team1'
          ? (team1Team?.country || match?.team1Country || '')
          : (team2Team?.country || match?.team2Country || '');

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
        // b_t1_side: 'A' if team1 is Team A, 'B' if team1 is Team B
        set('b_t1_side', teamAKey === 'team1' ? 'A' : 'B');
        // b_t2_side: 'A' if team2 is Team A, 'B' if team2 is Team B
        set('b_t2_side', teamAKey === 'team2' ? 'A' : 'B');
      }

      // Team 1 players (left side of TEAMS table) - always team1
      // Always try to populate, even if array is empty or missing
      if (team1Players && Array.isArray(team1Players)) {
        // Determine which coin toss data to use based on whether team1 is A or B
        const coinTossData = match?.coinTossData;
        const isTeam1A = teamAKey === 'team1';
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
        p1FirstName = team1Players[0]?.firstName || team1CoinTossData?.player1?.firstName || '';
        p1LastName = team1Players[0]?.lastName || team1CoinTossData?.player1?.lastName || '';
        p2FirstName = team1Players[1]?.firstName || team1CoinTossData?.player2?.firstName || '';
        p2LastName = team1Players[1]?.lastName || team1CoinTossData?.player2?.lastName || '';

        // Use coin toss data for numbers, captain, and first serve if available
        if (team1CoinTossData) {
          p1No = team1CoinTossData.player1?.number !== undefined && team1CoinTossData.player1?.number !== null
            ? String(team1CoinTossData.player1.number)
            : String(team1Players[0]?.number || '');
          p2No = team1CoinTossData.player2?.number !== undefined && team1CoinTossData.player2?.number !== null
            ? String(team1CoinTossData.player2.number)
            : String(team1Players[1]?.number || '');

          p1IsCaptain = team1CoinTossData.player1?.isCaptain || team1Players[0]?.isCaptain || false;
          p2IsCaptain = team1CoinTossData.player2?.isCaptain || team1Players[1]?.isCaptain || false;
          // First serve: check match.team1FirstServePlayer (player number who serves first for team 1)
          const team1FirstServePlayer = match?.team1FirstServePlayer;
          p1FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p1No;
          p2FirstServe = team1FirstServePlayer !== null && team1FirstServePlayer !== undefined && String(team1FirstServePlayer) === p2No;
        } else {
          // Fallback to player objects directly
          p1No = String(team1Players[0]?.number || '');
          p2No = String(team1Players[1]?.number || '');
          p1IsCaptain = team1Players[0]?.isCaptain || false;
          p2IsCaptain = team1Players[1]?.isCaptain || false;
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
        set('b_t1_p1_name', formatPlayerName(p1FirstName, p1LastName));
        set('b_t1_p2_no', p2Display);
        set('b_t1_p2_name', formatPlayerName(p2FirstName, p2LastName));
      } else if (isCoinTossConfirmed) {
        // If team1Players array is missing or empty, try to use coin toss data (only if confirmed)
        const isTeam1A = teamAKey === 'team1';
        const team1CoinTossData = isTeam1A ? coinTossData?.players?.teamA : coinTossData?.players?.teamB;
        if (team1CoinTossData) {
          const p1Name = formatPlayerName(team1CoinTossData.player1?.firstName || '', team1CoinTossData.player1?.lastName || '');
          const p2Name = formatPlayerName(team1CoinTossData.player2?.firstName || '', team1CoinTossData.player2?.lastName || '');
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

      // Team 2 players (right side of TEAMS table) - always team2
      // Always try to populate, even if some data is missing
      if (team2Players && Array.isArray(team2Players)) {
        // Determine which coin toss data to use based on whether team2 is A or B
        const isTeam2A = teamAKey === 'team2';
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
        p1FirstName = team2Players[0]?.firstName || team2CoinTossData?.player1?.firstName || '';
        p1LastName = team2Players[0]?.lastName || team2CoinTossData?.player1?.lastName || '';
        p2FirstName = team2Players[1]?.firstName || team2CoinTossData?.player2?.firstName || '';
        p2LastName = team2Players[1]?.lastName || team2CoinTossData?.player2?.lastName || '';

        // Use coin toss data for numbers, captain, and first serve if available
        if (team2CoinTossData) {
          p1No = team2CoinTossData.player1?.number !== undefined && team2CoinTossData.player1?.number !== null
            ? String(team2CoinTossData.player1.number)
            : String(team2Players[0]?.number || '');
          p2No = team2CoinTossData.player2?.number !== undefined && team2CoinTossData.player2?.number !== null
            ? String(team2CoinTossData.player2.number)
            : String(team2Players[1]?.number || '');

          p1IsCaptain = team2CoinTossData.player1?.isCaptain || team2Players[0]?.isCaptain || false;
          p2IsCaptain = team2CoinTossData.player2?.isCaptain || team2Players[1]?.isCaptain || false;
          // First serve: check match.team2FirstServePlayer (player number who serves first for team 2)
          const team2FirstServePlayer = match?.team2FirstServePlayer;
          p1FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p1No;
          p2FirstServe = team2FirstServePlayer !== null && team2FirstServePlayer !== undefined && String(team2FirstServePlayer) === p2No;
        } else {
          // Fallback to player objects directly
          p1No = String(team2Players[0]?.number || '');
          p2No = String(team2Players[1]?.number || '');
          p1IsCaptain = team2Players[0]?.isCaptain || false;
          p2IsCaptain = team2Players[1]?.isCaptain || false;
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
        set('b_t2_p1_name', formatPlayerName(p1FirstName, p1LastName));
        set('b_t2_p2_no', p2Display);
        set('b_t2_p2_name', formatPlayerName(p2FirstName, p2LastName));
      } else if (isCoinTossConfirmed) {
        // If team2Players array is missing or empty, try to use coin toss data (only if confirmed)
        const isTeam2A = teamAKey === 'team2';
        const team2CoinTossData = isTeam2A ? coinTossData?.players?.teamA : coinTossData?.players?.teamB;
        if (team2CoinTossData) {
          const p1Name = formatPlayerName(team2CoinTossData.player1?.firstName || '', team2CoinTossData.player1?.lastName || '');
          const p2Name = formatPlayerName(team2CoinTossData.player2?.firstName || '', team2CoinTossData.player2?.lastName || '');
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

      // Coach names - populate if hasCoach is enabled
      if (match?.hasCoach) {
        set('b_t1_coach_name', match?.team1CoachName || '');
        set('b_t2_coach_name', match?.team2CoachName || '');
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
          // Exception: Current set should be initialized even if startTime not yet recorded
          const setDataForFirstServe = sets?.find((s: any) => s.index === setNum);
          const setHasStarted = setDataForFirstServe?.startTime || setDataForFirstServe?.finished;
          const isCurrentSet = setNum === currentSetNum;
          const shouldInitializeCurrentSet = isCurrentSet && isCoinTossConfirmed && !setHasStarted;

          if (!setHasStarted && !shouldInitializeCurrentSet) {
            // Skip sets that haven't started yet (except current set if coin toss confirmed)
            return;
          }

          // Skip A/B processing if coin toss not confirmed (except for current set initialization)
          if (!isCoinTossConfirmed && !shouldInitializeCurrentSet) {
            return;
          }

          // Determine which team serves first in this set (for team_up/team_down)
          const teamAKey = match?.coinTossTeamA || 'team1';
          const teamBKey = match?.coinTossTeamB || 'team2';

          // Determine which team serves first in this set
          let firstServeTeam: string | null = null;

          // Primary source: first rally_start event tells us who actually served first
          if (events && Array.isArray(events)) {
            const firstRallyStart = events.find((e: any) =>
              e.type === 'rally_start' && (e.setIndex || 1) === setNum
            );
            if (firstRallyStart?.payload?.servingTeam) {
              firstServeTeam = firstRallyStart.payload.servingTeam;
            }
          }

          // Secondary source: setData.serviceOrder (if stored on the set)
          if (!firstServeTeam && setDataForFirstServe && setDataForFirstServe.serviceOrder) {
            const serviceOrder = setDataForFirstServe.serviceOrder;
            for (const [key, order] of Object.entries(serviceOrder)) {
              if (order === 1) {
                const matchKey = key.match(/^(team[12])_player/);
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
              if (match?.set2FirstServe) {
                firstServeTeam = match.set2FirstServe;
              } else {
                const set1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                firstServeTeam = set1FirstServe === teamAKey ? teamBKey : teamAKey;
              }
            } else {
              if (match?.set3FirstServe) {
                firstServeTeam = match.set3FirstServe === 'A' ? teamAKey : teamBKey;
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
            const teamAKey = match?.coinTossTeamA || 'team1';
            const teamBKey = match?.coinTossTeamB || 'team2';

            // Use the already-computed teamUp for this set (derived from rally_start events above)
            const firstServeTeam = teamUp;

            // Determine which team is above (serves first) and which is below
            const aboveTeamKey = firstServeTeam;
            const belowTeamKey = firstServeTeam === teamAKey ? teamBKey : teamAKey;

            // Determine A/B labels based on coin toss (teamAKey is always A, teamBKey is always B)
            const aboveIsA = aboveTeamKey === teamAKey;
            const belowIsA = belowTeamKey === teamAKey;

            // Set header A/B circles and team labels (only for current set)
            // Header always shows: t1 (left) = team1, t2 (right) = team2
            // A/B labels are based on coin toss (teamAKey is always A, teamBKey is always B)
            // The team serving first (above) goes in rows I and III, the other team (below) goes in rows II and IV
            // But in the header, we just show which team is A and which is B based on coin toss
            const team1IsA = teamAKey === 'team1';
            const team2IsA = teamAKey === 'team2';

            set('t1_side', team1IsA ? 'A' : 'B');
            set('t2_side', team2IsA ? 'A' : 'B');

            // Set team names
            if (team1Team) {
              const t1Name = team1Team.name || '';
              set('t1_name', t1Name);
            }
            if (team2Team) {
              const t2Name = team2Team.name || '';
              set('t2_name', t2Name);
            }

            // Set sides for this set: above team (serves first) gets rows I and III
            if (aboveTeamKey === 'team1') {
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
            // IMPORTANT: Use team1Points (team1) and team2Points from actual set data
            const team1Points = Number(setItem.team1Points) || 0;
            const team2Points = Number(setItem.team2Points) || 0;

            // Determine which team is A and which is B
            const teamAKey = match?.coinTossTeamA || 'team1';
            const teamBKey = match?.coinTossTeamB || 'team2';

            const teamAPoints = teamAKey === 'team1' ? team1Points : team2Points;
            const teamBPoints = teamBKey === 'team1' ? team1Points : team2Points;

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
        const teamAKey = match?.coinTossTeamA || 'team1';
        const teamBKey = match?.coinTossTeamB || 'team2';

        const totalTeamA = sortedSets.reduce((sum: number, s: any) => {
          const points = teamAKey === 'team1' ? (Number(s.team1Points) || 0) : (Number(s.team2Points) || 0);
          return sum + points;
        }, 0);
        const totalTeamB = sortedSets.reduce((sum: number, s: any) => {
          const points = teamBKey === 'team1' ? (Number(s.team1Points) || 0) : (Number(s.team2Points) || 0);
          return sum + points;
        }, 0);

        // Debug: Log total scores

        const finishedSets = sortedSets.filter((s: any) => s.finished);
        const totalTeamAWins = finishedSets.filter((s: any) => {
          const teamAPoints = teamAKey === 'team1' ? (s.team1Points || 0) : (s.team2Points || 0);
          const teamBPoints = teamBKey === 'team1' ? (s.team1Points || 0) : (s.team2Points || 0);
          return teamAPoints > teamBPoints;
        }).length;
        const totalTeamBWins = finishedSets.filter((s: any) => {
          const teamAPoints = teamAKey === 'team1' ? (s.team1Points || 0) : (s.team2Points || 0);
          const teamBPoints = teamBKey === 'team1' ? (s.team1Points || 0) : (s.team2Points || 0);
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
          const teamAPoints = teamAKey === 'team1' ? (s.team1Points || 0) : (s.team2Points || 0);
          const teamBPoints = teamBKey === 'team1' ? (s.team1Points || 0) : (s.team2Points || 0);
          return teamAPoints > teamBPoints;
        })) {
          if (totalTeamAWins > totalTeamBWins) {
            const winnerTeam = teamAKey === 'team1' ? team1Team : team2Team;
            if (winnerTeam) {
              set('winner_name', winnerTeam.name || '');
              set('winner_country', winnerTeam.country || '');
            }
            set('win_score_winner', '2');
            set('win_score_other', String(totalTeamBWins));
          } else if (totalTeamBWins > totalTeamAWins) {
            const winnerTeam = teamBKey === 'team1' ? team1Team : team2Team;
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
        // buildOfficialsArray saves roles as 'line judge 1', 'line judge 2', etc.
        const lineJudges = match.officials
          .filter((o: any) => o.role && o.role.startsWith('line judge'))
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));


        // Process other officials first (Last Name First Name order for scoresheet)
        match.officials.forEach((official: any) => {
          const firstName = official.firstName || official.first_name || '';
          const lastName = official.lastName || official.last_name || '';
          const fullName = lastName && firstName ? `${lastName} ${firstName}` : (lastName || firstName);
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
        // buildOfficialsArray stores line judges with 'name' field (not firstName/lastName)
        lineJudges.forEach((judge: any, index: number) => {
          const fullName = judge.name || `${judge.firstName || ''} ${judge.lastName || ''}`.trim();
          // Extract position from role string (e.g. 'line judge 1' -> 1)
          const roleNum = judge.role ? parseInt(judge.role.replace(/\D/g, '')) : NaN;
          const position = judge.position != null
            ? judge.position
            : !isNaN(roleNum) ? roleNum : index + 1;

          if (position >= 1 && position <= 4 && fullName) {
            set(`lj${position}`, fullName);
          }
        });
      } else {
      }

      // Coin toss winner - use coinTossData if available, otherwise use match properties
      // Set 1 coin toss winner - By definition, Team A is the coin toss winner
      if (coinTossData?.coinTossWinner) {
        // Handle both 'team1'/'team2' formats
        let winnerKey = coinTossData.coinTossWinner;
        if (winnerKey === 'team1') winnerKey = 'team1';
        else if (winnerKey === 'team2') winnerKey = 'team2';
        else if (winnerKey === 'team1') winnerKey = 'team1';

        // Determine if winner is Team A or Team B
        const set1Winner = (winnerKey === teamAKey) ? 'A' : 'B';
        set('coin_s1', set1Winner);
      } else if (isCoinTossConfirmed && teamAKey) {
        // If coin toss is confirmed, Team A is the winner (by definition)
        set('coin_s1', 'A');
      }

      // Set 3 coin toss winner - check both coinTossData and direct match field
      const set3CoinTossWinnerRaw = coinTossData?.set3CoinTossWinner || match?.set3CoinTossWinner;
      if (set3CoinTossWinnerRaw) {
        let set3WinnerKey = set3CoinTossWinnerRaw;
        // Normalize: could be 'team1'/'team2' or 'A'/'B'
        if (set3WinnerKey === 'A') set3WinnerKey = teamAKey;
        else if (set3WinnerKey === 'B') set3WinnerKey = teamBKey;

        // Determine if winner is Team A or Team B
        const set3Winner = (set3WinnerKey === teamAKey) ? 'A' : 'B';
        set('coin_s3', set3Winner);
      }

      // Service order and player numbers - will be filled per set based on serviceOrder
      // This is now handled in the set processing loop below

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
        const coinTossTeamAKey = match?.coinTossTeamA || 'team1';
        const coinTossTeamBKey = match?.coinTossTeamB || (coinTossTeamAKey === 'team1' ? 'team2' : 'team1');

        // Get team countries and colors from already loaded team data
        const coinTossTeamACountry = coinTossTeamAKey === 'team1'
          ? (team1Team?.country || match?.team1Country || '')
          : (team2Team?.country || match?.team2Country || '');
        const coinTossTeamBCountry = coinTossTeamBKey === 'team1'
          ? (team1Team?.country || match?.team1Country || '')
          : (team2Team?.country || match?.team2Country || '');
        const coinTossTeamAColor = coinTossTeamAKey === 'team1' ? (team1Team?.color || '#89bdc3') : (team2Team?.color || '#323134');
        const coinTossTeamBColor = coinTossTeamBKey === 'team1' ? (team1Team?.color || '#89bdc3') : (team2Team?.color || '#323134');

        // Format: country code, or team name if both teams share the same country
        const sameCountryInit = coinTossTeamACountry && coinTossTeamBCountry
          && coinTossTeamACountry.toUpperCase().trim() === coinTossTeamBCountry.toUpperCase().trim();
        const coinTossTeamALabel = sameCountryInit
          ? ((coinTossTeamAKey === 'team1' ? team1Team?.name : team2Team?.name) || coinTossTeamACountry || '')
          : (coinTossTeamACountry || '');
        const coinTossTeamBLabel = sameCountryInit
          ? ((coinTossTeamBKey === 'team1' ? team1Team?.name : team2Team?.name) || coinTossTeamBCountry || '')
          : (coinTossTeamBCountry || '');

        // Store team colors for t1 and t2
        const coinTossT1Color = coinTossTeamAKey === 'team1' ? coinTossTeamAColor : coinTossTeamBColor;
        const coinTossT2Color = coinTossTeamAKey === 'team2' ? coinTossTeamAColor : coinTossTeamBColor;

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
            const t1IsA = coinTossTeamAKey === 'team1';
            const t2IsA = coinTossTeamAKey === 'team2';

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
          // Normalize team keys to 'team1'/'team2' format
          let teamAKey = match?.coinTossTeamA || 'team1';
          if (teamAKey === 'team1') teamAKey = 'team1';
          else if (teamAKey === 'team2') teamAKey = 'team2';
          else if (teamAKey === 'team1') teamAKey = 'team1';
          
          let teamBKey = match?.coinTossTeamB || (teamAKey === 'team1' ? 'team2' : 'team1');
          if (teamBKey === 'team1') teamBKey = 'team1';
          else if (teamBKey === 'team2') teamBKey = 'team2';
          else if (teamBKey === 'team1') teamBKey = 'team1';
          
          // Ensure teamBKey is the opposite of teamAKey
          if (!teamBKey || teamBKey === teamAKey) {
            teamBKey = teamAKey === 'team1' ? 'team2' : 'team1';
          }

          // Get the set data to access serviceOrder (use setDataForEvents which was already found)
          const setData = setDataForEvents;

          // Track points for each team (team_up and team_down, not teamA/teamB)
          let teamUpPointCount = 0;
          let teamDownPointCount = 0;
          let teamUpTimeoutCount = 0;
          let teamDownTimeoutCount = 0;

          // Get player data from matchData (team1Players/team2Players arrays)
          // These are the primary source of player information
          const team1PlayersArray = team1Players || [];
          const team2PlayersArray = team2Players || [];
          
          // Derive per-set first serve player numbers from rally_start events
          // This is the authoritative source — match-level team1FirstServe/team2FirstServe
          // may have been overwritten by between-sets service order changes
          let team1FirstServe: any = undefined;
          let team2FirstServe: any = undefined;

          const firstRallyStartForSet = setEvents.find((e: any) => e.type === 'rally_start');
          if (firstRallyStartForSet) {
            const servingTeamFromEvent = firstRallyStartForSet.payload?.servingTeam;
            const servingPlayerNumber = firstRallyStartForSet.payload?.servingPlayerNumber;

            // First rally_start tells us who serves first for the serving team
            if (servingTeamFromEvent === 'team1') {
              team1FirstServe = servingPlayerNumber;
            } else if (servingTeamFromEvent === 'team2') {
              team2FirstServe = servingPlayerNumber;
            }

            // For the receiving team, find the FIRST rally_start where they serve
            const receivingTeamKey = servingTeamFromEvent === 'team1' ? 'team2' : 'team1';
            const firstReceiverServe = setEvents.find((e: any) =>
              e.type === 'rally_start' && e.payload?.servingTeam === receivingTeamKey
            );
            if (firstReceiverServe) {
              if (receivingTeamKey === 'team1') {
                team1FirstServe = firstReceiverServe.payload?.servingPlayerNumber;
              } else {
                team2FirstServe = firstReceiverServe.payload?.servingPlayerNumber;
              }
            }
          }

          // Fallback to match-level data only if no rally_start events exist for this set
          if (team1FirstServe === undefined) {
            team1FirstServe = match?.team1FirstServe || match?.coinTossData?.team1FirstServe;
          }
          if (team2FirstServe === undefined) {
            team2FirstServe = match?.team2FirstServe || match?.coinTossData?.team2FirstServe;
          }
          
          // Helper to extract number from formatted strings like "(1)*" or "1*" or "1"
          const extractNumber = (value: string | undefined): string | undefined => {
            if (!value) return undefined;
            // Remove parentheses, asterisks, and extract just the number
            const match = value.toString().match(/(\d+)/);
            return match ? match[1] : undefined;
          };
          
          // Helper to check if a player has firstServe
          const hasFirstServe = (playerNumber: any, teamKey: string): boolean => {
            if (teamKey === 'team1') {
              return team1FirstServe !== undefined && String(playerNumber) === String(team1FirstServe);
            } else {
              return team2FirstServe !== undefined && String(playerNumber) === String(team2FirstServe);
            }
          };
          
          // Build teamAData and teamBData from player arrays
          // teamAKey tells us which team (team1 or team2) is Team A
          let teamAData: any = null;
          let teamBData: any = null;
          
          if (teamAKey === 'team1') {
            // Team A is team1
            teamAData = {
              player1: team1PlayersArray[0] ? { 
                number: team1PlayersArray[0].number,
                firstName: team1PlayersArray[0].firstName,
                lastName: team1PlayersArray[0].lastName,
                firstServe: hasFirstServe(team1PlayersArray[0].number, 'team1')
              } : undefined,
              player2: team1PlayersArray[1] ? { 
                number: team1PlayersArray[1].number,
                firstName: team1PlayersArray[1].firstName,
                lastName: team1PlayersArray[1].lastName,
                firstServe: hasFirstServe(team1PlayersArray[1].number, 'team1')
              } : undefined
            };
            // Team B is team2
            teamBData = {
              player1: team2PlayersArray[0] ? { 
                number: team2PlayersArray[0].number,
                firstName: team2PlayersArray[0].firstName,
                lastName: team2PlayersArray[0].lastName,
                firstServe: hasFirstServe(team2PlayersArray[0].number, 'team2')
              } : undefined,
              player2: team2PlayersArray[1] ? { 
                number: team2PlayersArray[1].number,
                firstName: team2PlayersArray[1].firstName,
                lastName: team2PlayersArray[1].lastName,
                firstServe: hasFirstServe(team2PlayersArray[1].number, 'team2')
              } : undefined
            };
          } else {
            // Team A is team2
            teamAData = {
              player1: team2PlayersArray[0] ? { 
                number: team2PlayersArray[0].number,
                firstName: team2PlayersArray[0].firstName,
                lastName: team2PlayersArray[0].lastName,
                firstServe: hasFirstServe(team2PlayersArray[0].number, 'team2')
              } : undefined,
              player2: team2PlayersArray[1] ? { 
                number: team2PlayersArray[1].number,
                firstName: team2PlayersArray[1].firstName,
                lastName: team2PlayersArray[1].lastName,
                firstServe: hasFirstServe(team2PlayersArray[1].number, 'team2')
              } : undefined
            };
            // Team B is team1
            teamBData = {
              player1: team1PlayersArray[0] ? { 
                number: team1PlayersArray[0].number,
                firstName: team1PlayersArray[0].firstName,
                lastName: team1PlayersArray[0].lastName,
                firstServe: hasFirstServe(team1PlayersArray[0].number, 'team1')
              } : undefined,
              player2: team1PlayersArray[1] ? { 
                number: team1PlayersArray[1].number,
                firstName: team1PlayersArray[1].firstName,
                lastName: team1PlayersArray[1].lastName,
                firstServe: hasFirstServe(team1PlayersArray[1].number, 'team1')
              } : undefined
            };
          }
          
          // Fallback: try coin toss data if player arrays are empty
          if ((!teamAData?.player1 && !teamAData?.player2) || (!teamBData?.player1 && !teamBData?.player2)) {
            console.log(`[DEBUG Set ${setNum}] Trying coin toss data fallback`);
            const coinTossData = match?.coinTossData?.players;
            console.log(`[DEBUG Set ${setNum}] Coin toss data available:`, {
              hasCoinTossData: !!coinTossData,
              coinTossDataKeys: coinTossData ? Object.keys(coinTossData) : [],
              coinTossData
            });
            if (coinTossData?.teamA && (!teamAData?.player1 || !teamAData?.player2)) {
              teamAData = coinTossData.teamA;
              console.log(`[DEBUG Set ${setNum}] Using coinTossData.teamA for teamAData`);
            }
            if (coinTossData?.teamB && (!teamBData?.player1 || !teamBData?.player2)) {
              teamBData = coinTossData.teamB;
              console.log(`[DEBUG Set ${setNum}] Using coinTossData.teamB for teamBData`);
            }
            // Try team1/team2 format
            if (coinTossData?.team1 && (!teamAData?.player1 || !teamAData?.player2) && teamAKey === 'team1') {
              teamAData = coinTossData.team1;
              console.log(`[DEBUG Set ${setNum}] Using coinTossData.team1 for teamAData`);
            }
            if (coinTossData?.team2 && (!teamBData?.player1 || !teamBData?.player2) && teamBKey === 'team2') {
              teamBData = coinTossData.team2;
              console.log(`[DEBUG Set ${setNum}] Using coinTossData.team2 for teamBData`);
            }
          }
          
          // Additional fallback: get player numbers from TEAMS table fields (b_t1_p1_no, b_t1_p2_no, etc.)
          // Always check TEAMS table values (for debugging)
          const teamsTableRaw = {
            t1p1: get('b_t1_p1_no'),
            t1p2: get('b_t1_p2_no'),
            t2p1: get('b_t2_p1_no'),
            t2p2: get('b_t2_p2_no')
          };
          
          // Check if we need to extract from TEAMS table
          const needsTeamAData = !teamAData?.player1?.number || !teamAData?.player2?.number;
          const needsTeamBData = !teamBData?.player1?.number || !teamBData?.player2?.number;
          
          console.log(`[DEBUG Set ${setNum}] Checking TEAMS table fallback:`, {
            needsTeamAData,
            needsTeamBData,
            teamAData,
            teamBData,
            teamsTableRaw,
            extractedNumbers: {
              t1p1: extractNumber(teamsTableRaw.t1p1),
              t1p2: extractNumber(teamsTableRaw.t1p2),
              t2p1: extractNumber(teamsTableRaw.t2p1),
              t2p2: extractNumber(teamsTableRaw.t2p2)
            }
          });
          
          if (needsTeamAData || needsTeamBData) {
            // Get from TEAMS table fields
            const t1p1No = extractNumber(teamsTableRaw.t1p1);
            const t1p2No = extractNumber(teamsTableRaw.t1p2);
            const t2p1No = extractNumber(teamsTableRaw.t2p1);
            const t2p2No = extractNumber(teamsTableRaw.t2p2);
            
            console.log(`[DEBUG Set ${setNum}] Extracting player numbers from TEAMS table:`, {
              t1p1No,
              t1p2No,
              t2p1No,
              t2p2No,
              teamAKey,
              teamBKey,
              currentTeamAData: teamAData,
              currentTeamBData: teamBData
            });
            
            if (teamAKey === 'team1') {
              // Team A is team1
              if (!teamAData?.player1?.number && t1p1No) {
                teamAData = teamAData || {};
                teamAData.player1 = teamAData.player1 || {};
                teamAData.player1.number = t1p1No;
                console.log(`[DEBUG Set ${setNum}] Set teamAData.player1.number = ${t1p1No} from TEAMS table`);
              }
              if (!teamAData?.player2?.number && t1p2No) {
                teamAData = teamAData || {};
                teamAData.player2 = teamAData.player2 || {};
                teamAData.player2.number = t1p2No;
                console.log(`[DEBUG Set ${setNum}] Set teamAData.player2.number = ${t1p2No} from TEAMS table`);
              }
              // Team B is team2
              if (!teamBData?.player1?.number && t2p1No) {
                teamBData = teamBData || {};
                teamBData.player1 = teamBData.player1 || {};
                teamBData.player1.number = t2p1No;
                console.log(`[DEBUG Set ${setNum}] Set teamBData.player1.number = ${t2p1No} from TEAMS table`);
              }
              if (!teamBData?.player2?.number && t2p2No) {
                teamBData = teamBData || {};
                teamBData.player2 = teamBData.player2 || {};
                teamBData.player2.number = t2p2No;
                console.log(`[DEBUG Set ${setNum}] Set teamBData.player2.number = ${t2p2No} from TEAMS table`);
              }
            } else {
              // Team A is team2
              if (!teamAData?.player1?.number && t2p1No) {
                teamAData = teamAData || {};
                teamAData.player1 = teamAData.player1 || {};
                teamAData.player1.number = t2p1No;
                console.log(`[DEBUG Set ${setNum}] Set teamAData.player1.number = ${t2p1No} from TEAMS table`);
              }
              if (!teamAData?.player2?.number && t2p2No) {
                teamAData = teamAData || {};
                teamAData.player2 = teamAData.player2 || {};
                teamAData.player2.number = t2p2No;
                console.log(`[DEBUG Set ${setNum}] Set teamAData.player2.number = ${t2p2No} from TEAMS table`);
              }
              // Team B is team1
              if (!teamBData?.player1?.number && t1p1No) {
                teamBData = teamBData || {};
                teamBData.player1 = teamBData.player1 || {};
                teamBData.player1.number = t1p1No;
                console.log(`[DEBUG Set ${setNum}] Set teamBData.player1.number = ${t1p1No} from TEAMS table`);
              }
              if (!teamBData?.player2?.number && t1p2No) {
                teamBData = teamBData || {};
                teamBData.player2 = teamBData.player2 || {};
                teamBData.player2.number = t1p2No;
                console.log(`[DEBUG Set ${setNum}] Set teamBData.player2.number = ${t1p2No} from TEAMS table`);
              }
            }
            
            console.log(`[DEBUG Set ${setNum}] After TEAMS table extraction:`, {
              teamAData,
              teamBData
            });
          }
          
          console.log(`[DEBUG Set ${setNum}] Player data:`, {
            teamAKey,
            teamBKey,
            teamAData,
            teamBData,
            team1PlayersArray: team1PlayersArray.map(p => ({ number: p.number, firstName: p.firstName, lastName: p.lastName })),
            team2PlayersArray: team2PlayersArray.map(p => ({ number: p.number, firstName: p.firstName, lastName: p.lastName })),
            team1PlayersRaw: team1Players,
            team2PlayersRaw: team2Players,
            teamsTableData: {
              t1p1: get('b_t1_p1_no'),
              t1p2: get('b_t1_p2_no'),
              t2p1: get('b_t2_p1_no'),
              t2p2: get('b_t2_p2_no')
            },
            extractedNumbers: {
              t1p1: extractNumber(get('b_t1_p1_no')),
              t1p2: extractNumber(get('b_t1_p2_no')),
              t2p1: extractNumber(get('b_t2_p1_no')),
              t2p2: extractNumber(get('b_t2_p2_no'))
            }
          });

          // Get team_up and team_down for this set to ensure correct row assignment
          // For set 1, if coin toss is confirmed but set hasn't started, determine from firstServe
          let teamUp = get(`${prefix}_team_up`);
          let teamDown = get(`${prefix}_team_down`);
          
          if (!teamUp || !teamDown) {
            // Determine first serve team for this set
            let firstServeTeam: string | null = null;

            // Helper function to normalize team keys
            const normalizeTeamKey = (key: string): string => {
              if (key === 'team1' || key === '') return 'team1';
              if (key === 'team2') return 'team2';
              return key; // Already in correct format or unknown
            };

            // Primary source: first rally_start event tells us who actually served first
            if (firstRallyStartForSet?.payload?.servingTeam) {
              firstServeTeam = normalizeTeamKey(firstRallyStartForSet.payload.servingTeam);
            }

            // Secondary source: setData.serviceOrder (if stored on the set)
            if (!firstServeTeam && setData?.serviceOrder) {
              const serviceOrder = setData.serviceOrder;
              for (const [key, order] of Object.entries(serviceOrder)) {
                if (order === 1) {
                  const matchKey = key.match(/^(team[12])_player/);
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
                const rawFirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                firstServeTeam = normalizeTeamKey(rawFirstServe);
              } else if (setNum === 2) {
                // Check match.set2FirstServe first, then alternate from set 1
                if (match?.set2FirstServe) {
                  firstServeTeam = normalizeTeamKey(match.set2FirstServe);
                } else {
                  const rawSet1FirstServe = match?.firstServe || match?.coinTossData?.firstServe || teamAKey;
                  const set1FirstServe = normalizeTeamKey(rawSet1FirstServe);
                  firstServeTeam = set1FirstServe === teamAKey ? teamBKey : teamAKey;
                }
              } else {
                // Set 3
                if (match?.set3FirstServe) {
                  // set3FirstServe is stored as 'A' or 'B'
                  firstServeTeam = match.set3FirstServe === 'A' ? teamAKey : teamBKey;
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
              }
            } else {
              // Normalize firstServeTeam if it was found from events or serviceOrder
              firstServeTeam = normalizeTeamKey(firstServeTeam);
            }
            
            teamUp = firstServeTeam || teamAKey;
            teamDown = teamUp === teamAKey ? teamBKey : teamAKey;
            
            // Store for later use
            set(`${prefix}_team_up`, teamUp);
            set(`${prefix}_team_down`, teamDown);
          }

          // Get team data for team_up and team_down (teamUp/teamDown are already in 'team1'/'team2' format)
          const teamUpData = teamUp === teamAKey ? teamAData : teamBData;
          const teamDownData = teamDown === teamAKey ? teamAData : teamBData;
          
          console.log(`[DEBUG Set ${setNum}] Team data lookup:`, {
            teamUp,
            teamDown,
            teamAKey,
            teamBKey,
            teamUpData,
            teamDownData
          });

          // Calculate serviceOrder from coin toss data if not present on set
          let serviceOrder = setData?.serviceOrder;
          if (!serviceOrder || Object.keys(serviceOrder).length === 0) {
            // Calculate serviceOrder from coin toss data
            // The team that serves first gets positions I (1) and III (3)
            // The team that receives first gets positions II (2) and IV (4)
            const servingTeamIsA = teamUp === teamAKey;
            const servingTeamData = servingTeamIsA ? teamAData : teamBData;
            const receivingTeamData = servingTeamIsA ? teamBData : teamAData;
            
            // Normalize team keys to 'team1'/'team2' format for serviceOrder keys
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
              // ERROR: firstServe not set on serving team — coin toss data not carried correctly
              console.error(`[PDF] serviceOrder fallback: firstServe missing for serving team ${servingTeamKey}. servingTeamData:`, servingTeamData);
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
              // ERROR: firstServe not set on receiving team — coin toss data not carried correctly
              console.error(`[PDF] serviceOrder fallback: firstServe missing for receiving team ${receivingTeamKey}. receivingTeamData:`, receivingTeamData);
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
              // Match 'team1'/'team2' format
              const matchKey = key.match(/^(team[12])_player([12])$/);
              let teamKey: string | null = null;
              let playerNum: string | null = null;
              
              if (matchKey) {
                teamKey = matchKey[1]; // Already in 'team1'/'team2' format
                playerNum = matchKey[2];
              }
              
              if (teamKey && playerNum) {

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
                  console.warn(`[DEBUG Set ${setNum}] No player number found for key: ${key}, teamKey: ${teamKey}, playerNum: ${playerNum}`);
                }
              } else {
                console.warn(`[DEBUG Set ${setNum}] serviceOrder key doesn't match pattern: ${key}`);
              }
            });

            // Assign players to rows directly based on their service position
            // Position 1 (I) → r1, Position 2 (II) → r2, Position 3 (III) → r3, Position 4 (IV) → r4
            const positionToRow: Record<number, string> = { 1: 'r1', 2: 'r2', 3: 'r3', 4: 'r4' };

            console.log(`[DEBUG Set ${setNum}] serviceOrder player assignment:`, {
              serviceOrder,
              playersByPosition,
              teamUp,
              teamDown,
              teamAData: { p1: teamAData?.player1?.number, p2: teamAData?.player2?.number },
              teamBData: { p1: teamBData?.player1?.number, p2: teamBData?.player2?.number }
            });

            [1, 2, 3, 4].forEach(position => {
              const playerInfo = playersByPosition[position];
              if (playerInfo) {
                const rowKey = positionToRow[position];
                set(`${prefix}_${rowKey}_player`, playerInfo.playerNumber);
                playerNumbersSet = true;
                console.log(`[DEBUG Set ${setNum}] Set ${rowKey}_player = ${playerInfo.playerNumber} (position ${position}, team ${playerInfo.teamKey})`);
              }
            });
          }
          
          // Fallback to coin toss data if serviceOrder not available or empty (for set 1)
          // Also check if any player numbers are missing and fill them
          // team_up goes in rows I and III (ABOVE), team_down goes in rows II and IV (BELOW)
          const currentR1 = get(`${prefix}_r1_player`);
          const currentR2 = get(`${prefix}_r2_player`);
          const currentR3 = get(`${prefix}_r3_player`);
          const currentR4 = get(`${prefix}_r4_player`);
          
          const needsFallback = !playerNumbersSet || !currentR1 || !currentR2 || !currentR3 || !currentR4;
          
          if (needsFallback) {
            console.log(`[DEBUG Set ${setNum}] Using fallback - playerNumbersSet=${playerNumbersSet}, missing players:`, {
              r1: !currentR1,
              r2: !currentR2,
              r3: !currentR3,
              r4: !currentR4,
              teamUpData: { p1: teamUpData?.player1?.number, p2: teamUpData?.player2?.number },
              teamDownData: { p1: teamDownData?.player1?.number, p2: teamDownData?.player2?.number }
            });
            
            // Fill missing team_up players (rows I and III)
            if (teamUpData) {
              const p1Num = String(teamUpData.player1?.number || '');
              const p2Num = String(teamUpData.player2?.number || '');
              if (p1Num && !currentR1) {
                set(`${prefix}_r1_player`, p1Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r1_player = ${p1Num}`);
              }
              if (p2Num && !currentR3) {
                set(`${prefix}_r3_player`, p2Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r3_player = ${p2Num}`);
              }
            }
            
            // Fill missing team_down players (rows II and IV)
            if (teamDownData) {
              const p1Num = String(teamDownData.player1?.number || '');
              const p2Num = String(teamDownData.player2?.number || '');
              if (p1Num && !currentR2) {
                set(`${prefix}_r2_player`, p1Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r2_player = ${p1Num}`);
              }
              if (p2Num && !currentR4) {
                set(`${prefix}_r4_player`, p2Num);
                console.log(`[DEBUG Set ${setNum}] Fallback: Set r4_player = ${p2Num}`);
              }
            }
          }

          // Map player numbers to row keys based on their serviceOrder position
          // Each player's row is determined by their service position, not by player1/player2 designation
          const playerToRow: Record<string, string> = {};
          if (serviceOrder && Object.keys(serviceOrder).length > 0) {
            const posToRow: Record<number, string> = { 1: 'r1', 2: 'r2', 3: 'r3', 4: 'r4' };
            Object.entries(serviceOrder).forEach(([key, position]) => {
              const matchKey = key.match(/^(team[12])_player([12])$/);
              if (matchKey) {
                const teamKey = matchKey[1];
                const playerNum = matchKey[2];
                let playerNumber = '';
                if (teamKey === teamAKey) {
                  playerNumber = String(playerNum === '1' ? (teamAData?.player1?.number || '') : (teamAData?.player2?.number || ''));
                } else if (teamKey === teamBKey) {
                  playerNumber = String(playerNum === '1' ? (teamBData?.player1?.number || '') : (teamBData?.player2?.number || ''));
                }
                if (playerNumber && posToRow[position as number]) {
                  playerToRow[playerNumber] = posToRow[position as number];
                }
              }
            });
          }
          // Fallback if playerToRow is incomplete
          if (Object.keys(playerToRow).length < 4) {
            if (teamUpData) {
              if (teamUpData.player1?.number && !playerToRow[String(teamUpData.player1.number)]) playerToRow[String(teamUpData.player1.number)] = 'r1';
              if (teamUpData.player2?.number && !playerToRow[String(teamUpData.player2.number)]) playerToRow[String(teamUpData.player2.number)] = 'r3';
            }
            if (teamDownData) {
              if (teamDownData.player1?.number && !playerToRow[String(teamDownData.player1.number)]) playerToRow[String(teamDownData.player1.number)] = 'r2';
              if (teamDownData.player2?.number && !playerToRow[String(teamDownData.player2.number)]) playerToRow[String(teamDownData.player2.number)] = 'r4';
            }
          }

          // Track service rotation: columns used for each player row (1-21)
          const serviceRotationColumn: Record<string, number> = { r1: 0, r2: 0, r3: 0, r4: 0 }; // Next column to use for each row

          // Build orderToRow mapping: service position maps directly to row
          // Position I (1) → r1, Position II (2) → r2, Position III (3) → r3, Position IV (4) → r4
          // This is fixed regardless of which player occupies each position
          const orderToRow: Record<number, string> = {
            1: 'r1',
            2: 'r2',
            3: 'r3',
            4: 'r4'
          };

          // Determine initial serving player from first rally_start event
          // Service rotation order is global: I (1) -> II (2) -> III (3) -> IV (4) -> I (1) -> ...
          let currentServiceOrder: number | null = null; // Will be set from first rally_start event

          // Find first rally_start to determine initial service order
          const firstRallyStart = setEvents.find((e: any) => e.type === 'rally_start');
          if (firstRallyStart && serviceOrder && Object.keys(serviceOrder).length > 0) {
            const servingTeamFromEvent = firstRallyStart.payload?.servingTeam;
            const servingPlayerNumber = firstRallyStart.payload?.servingPlayerNumber;
            const teamKey = servingTeamFromEvent === teamAKey ? teamAKey : teamBKey;
            const servingNumStr = String(servingPlayerNumber);

            // Determine which player this is (player1 or player2) - use String() to avoid type mismatch
            let playerKey = '';
            if (teamKey === teamAKey) {
              if (String(teamAData?.player1?.number) === servingNumStr) {
                playerKey = `${teamKey}_player1`;
              } else if (String(teamAData?.player2?.number) === servingNumStr) {
                playerKey = `${teamKey}_player2`;
              }
            } else if (teamKey === teamBKey) {
              if (String(teamBData?.player1?.number) === servingNumStr) {
                playerKey = `${teamKey}_player1`;
              } else if (String(teamBData?.player2?.number) === servingNumStr) {
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

          // Tick the first server's service box at the start of the set
          if (currentServiceOrder !== null && serviceOrder && Object.keys(serviceOrder).length > 0) {
            const firstRowKey = orderToRow[currentServiceOrder];
            if (firstRowKey && serviceRotationColumn[firstRowKey] !== undefined) {
              const tickCol = serviceRotationColumn[firstRowKey] + 1;
              if (tickCol > 0 && tickCol <= 21) {
                set(`${prefix}_${firstRowKey}_pt_${tickCol}_ticked`, 'true');
                console.log(`[PDF-TICK] Initial server: ${prefix}_${firstRowKey}_pt_${tickCol}_ticked = true`);
              }
            }
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
            const eventsBeforeThis = setEvents.slice(0, eventIndex);
            const pointsBefore = eventsBeforeThis.reduce((acc: any, e: any, eIdx: number) => {
              if (e.type === 'point') {
                // Handle BMP reversal: subtract from reversed team
                let reversed = e.payload?.reversedTeam;
                // Legacy BMP points: infer reversedTeam from nearby challenge_outcome
                if (e.payload?.fromBMP && !reversed) {
                  for (let bi = eIdx - 1; bi >= 0; bi--) {
                    const prevEvt = eventsBeforeThis[bi];
                    if (prevEvt.type === 'challenge_outcome' && prevEvt.payload?.result === 'successful') {
                      reversed = e.payload?.team === 'team1' ? 'team2' : 'team1';
                      break;
                    }
                    if (prevEvt.type === 'point' && !prevEvt.payload?.fromBMP) break;
                  }
                }
                if (reversed) {
                  if (reversed === teamAKey) acc.teamA = Math.max(0, acc.teamA - 1);
                  else if (reversed === teamBKey) acc.teamB = Math.max(0, acc.teamB - 1);
                  if (reversed === teamUp) acc.teamUp = Math.max(0, acc.teamUp - 1);
                  else if (reversed === teamDown) acc.teamDown = Math.max(0, acc.teamDown - 1);
                }
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
              const isFromBMP = event.payload?.fromBMP === true;
              // reversedTeam is set on new BMP events; for legacy events, infer from nearby challenge_outcome
              let reversedTeam = event.payload?.reversedTeam;
              if (isFromBMP && !reversedTeam) {
                // Legacy BMP point: look backwards for a successful challenge_outcome to infer reversal
                for (let bi = eventIndex - 1; bi >= 0; bi--) {
                  const prevEvt = setEvents[bi];
                  if (prevEvt.type === 'challenge_outcome' && prevEvt.payload?.result === 'successful') {
                    // The opponent of the BMP point team had their point reversed
                    reversedTeam = pointTeam === 'team1' ? 'team2' : 'team1';
                    break;
                  }
                  // Stop searching if we hit a regular point (the challenge_outcome should be right before)
                  if (prevEvt.type === 'point' && !prevEvt.payload?.fromBMP) break;
                }
              }

              // DEBUG ALL POINTS
              console.log(`[PDF-PT] === POINT #${eventIndex} === seq=${event.seq}, team=${pointTeam}, fromBMP=${isFromBMP}, reversedTeam=${reversedTeam}`);
              console.log(`[PDF-PT] pointsBefore: teamUp(${teamUp})=${pointsBefore.teamUp}, teamDown(${teamDown})=${pointsBefore.teamDown}`);
              console.log(`[PDF-PT] slashCounts BEFORE: teamUp=${teamUpPointCount}, teamDown=${teamDownPointCount}`);
              if (isFromBMP) {
                console.log(`[PDF-PT] BMP payload=`, JSON.stringify(event.payload));
              }

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
              const teamUpSuffix = teamUp === 'team1' ? 't1' : 't2';
              const teamDownSuffix = teamDown === 'team1' ? 't1' : 't2';

              // For successful team BMP: reverse the opponent's point first (remove their last slash)
              if (isFromBMP && reversedTeam) {
                console.log(`[PDF-BMP] REVERSING point for ${reversedTeam}`);
                console.log(`[PDF-BMP] Before reversal: teamUpPointCount=${teamUpPointCount}, teamDownPointCount=${teamDownPointCount}`);
                if (reversedTeam === teamUp) {
                  if (teamUpPointCount > 0 && teamUpPointCount <= 44) {
                    console.log(`[PDF-BMP] Clearing slash: ${prefix}_${teamUpSuffix}_pt_lg_${teamUpPointCount}`);
                    set(`${prefix}_${teamUpSuffix}_pt_lg_${teamUpPointCount}`, '');
                  }
                  teamUpPointCount = Math.max(0, teamUpPointCount - 1);
                } else if (reversedTeam === teamDown) {
                  if (teamDownPointCount > 0 && teamDownPointCount <= 44) {
                    console.log(`[PDF-BMP] Clearing slash: ${prefix}_${teamDownSuffix}_pt_lg_${teamDownPointCount}`);
                    set(`${prefix}_${teamDownSuffix}_pt_lg_${teamDownPointCount}`, '');
                  }
                  teamDownPointCount = Math.max(0, teamDownPointCount - 1);
                }
                console.log(`[PDF-BMP] After reversal: teamUpPointCount=${teamUpPointCount}, teamDownPointCount=${teamDownPointCount}`);

                // Check if the reversed (disputed) point caused a service rotation
                // by looking at the previous point event to see if the server lost that point
                // If so, undo the rotation entry
                const prevPointEvent = setEvents.slice(0, eventIndex).reverse().find(
                  (e: any) => e.type === 'point' && !e.payload?.fromBMP
                );
                console.log(`[PDF-BMP] UNDO ROTATION CHECK: prevPointEvent team=${prevPointEvent?.payload?.team}, currentServiceOrder=${currentServiceOrder}`);
                if (prevPointEvent && serviceOrder && Object.keys(serviceOrder).length > 0 && currentServiceOrder !== null) {
                  // Find the serving team at the time of the disputed point
                  let disputedServingTeam: string | null = null;
                  for (let si = setEvents.indexOf(prevPointEvent) - 1; si >= 0; si--) {
                    if (setEvents[si].type === 'rally_start') {
                      disputedServingTeam = setEvents[si].payload?.servingTeam || null;
                      break;
                    }
                  }
                  console.log(`[PDF-BMP] UNDO ROTATION: disputedServingTeam=${disputedServingTeam}, prevPointTeam=${prevPointEvent.payload?.team}, serverLostDisputed=${disputedServingTeam && prevPointEvent.payload?.team !== disputedServingTeam}`);
                  // If the server lost the disputed point (which caused rotation), undo it
                  if (disputedServingTeam && prevPointEvent.payload?.team !== disputedServingTeam) {
                    const prevServiceOrder = ((currentServiceOrder - 2 + 4) % 4) + 1;
                    const prevRowKey = orderToRow[prevServiceOrder];
                    console.log(`[PDF-BMP] UNDO ROTATION: UNDOING! prevServiceOrder=${prevServiceOrder}, prevRowKey=${prevRowKey}, col=${serviceRotationColumn[prevRowKey]}`);
                    if (prevRowKey && serviceRotationColumn[prevRowKey] !== undefined && serviceRotationColumn[prevRowKey] > 0) {
                      const lastCol = serviceRotationColumn[prevRowKey];
                      set(`${prefix}_${prevRowKey}_pt_${lastCol}`, '');
                      serviceRotationColumn[prevRowKey]--;
                      currentServiceOrder = prevServiceOrder;
                    }
                  } else {
                    console.log(`[PDF-BMP] UNDO ROTATION: No undo needed (server won the disputed point)`);
                  }
                }
              }

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

              // DEBUG - after adding the point slash
              console.log(`[PDF-PT] slashCounts AFTER: teamUp=${teamUpPointCount}, teamDown=${teamDownPointCount}`);
              console.log(`[PDF-PT] servingTeam=${servingTeam}, servingTeamLostPoint=${servingTeamLostPoint}, currentServiceOrder=${currentServiceOrder}`);

              // Service rotation tracking: when serving team loses point, record score and rotate
              // currentServiceOrder is already updated from rally_start events, so use it directly
              // For BMP points: only record rotation if it's a successful challenge (reversedTeam exists)
              // because that means the serve genuinely changed. Skip for referee BMP or unsuccessful.
              // For penalty/forfait points: skip rotation as they happen between rallies (no actual service change)
              const isFromForfait = event.payload?.fromForfait === true;
              const shouldTrackRotation = isFromBMP ? !!reversedTeam : (!isPointFromOtherTeamPenalty && !isFromForfait);
              if (shouldTrackRotation && servingTeamLostPoint && servingTeam && serviceOrder && Object.keys(serviceOrder).length > 0 && currentServiceOrder !== null) {
                const currentRowKey = orderToRow[currentServiceOrder];
                if (currentRowKey && serviceRotationColumn[currentRowKey] !== undefined) {
                  // Record the score of the team that lost service (at the time they lost it)
                  // Use team_up/team_down score, not teamA/teamB
                  // For successful BMP: pointsBefore still includes the reversed point, so subtract 1
                  let losingTeamScore = servingTeam === teamUp ? pointsBefore.teamUp : pointsBefore.teamDown;
                  if (isFromBMP && reversedTeam && reversedTeam === servingTeam) {
                    console.log(`[PDF-BMP] SERVICE ROTATION: adjusting losingTeamScore from ${losingTeamScore} to ${Math.max(0, losingTeamScore - 1)} (reversedTeam=${reversedTeam} === servingTeam=${servingTeam})`);
                    losingTeamScore = Math.max(0, losingTeamScore - 1);
                  }
                  const nextColumn = serviceRotationColumn[currentRowKey] + 1;

                  console.log(`[PDF-PT] SERVICE ROTATION: writing losingTeamScore=${losingTeamScore} to ${prefix}_${currentRowKey}_pt_${nextColumn}, currentServiceOrder=${currentServiceOrder}`);

                  if (nextColumn <= 21) {
                    set(`${prefix}_${currentRowKey}_pt_${nextColumn}`, String(losingTeamScore));
                    serviceRotationColumn[currentRowKey] = nextColumn;
                  }

                  // Rotate to next player in service order (I -> II -> III -> IV -> I -> ...)
                  currentServiceOrder = (currentServiceOrder % 4) + 1;

                  // Tick the next server's service box immediately after rotation
                  const nextRowKey = orderToRow[currentServiceOrder];
                  if (nextRowKey && serviceRotationColumn[nextRowKey] !== undefined) {
                    const tickCol = serviceRotationColumn[nextRowKey] + 1;
                    if (tickCol > 0 && tickCol <= 21 && !get(`${prefix}_${nextRowKey}_pt_${tickCol}_ticked`)) {
                      set(`${prefix}_${nextRowKey}_pt_${tickCol}_ticked`, 'true');
                      console.log(`[PDF-TICK] After rotation: ${prefix}_${nextRowKey}_pt_${tickCol}_ticked = true`);
                    }
                  }
                }
              }
            } else if (event.type === 'rally_start') {
              // Update current serving player from rally_start event
              // This is the authoritative source for who is serving
              const servingTeamFromEvent = event.payload?.servingTeam;
              const servingPlayerNumber = event.payload?.servingPlayerNumber;

              if (servingPlayerNumber && serviceOrder && Object.keys(serviceOrder).length > 0) {
                // Find which service order this player has - use String() to avoid type mismatch
                const teamKey = servingTeamFromEvent === teamAKey ? teamAKey : teamBKey;
                const servingNumStr = String(servingPlayerNumber);

                let playerKey = '';
                if (teamKey === teamAKey) {
                  if (String(teamAData?.player1?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player1`;
                  } else if (String(teamAData?.player2?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player2`;
                  }
                } else if (teamKey === teamBKey) {
                  if (String(teamBData?.player1?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player1`;
                  } else if (String(teamBData?.player2?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player2`;
                  }
                }

                if (playerKey && serviceOrder[playerKey]) {
                  // Update currentServiceOrder to match the actual serving player
                  currentServiceOrder = serviceOrder[playerKey];
                }
              }

              // Mark tick on the service box where the score will be written when server loses
              // Only tick once per service turn (skip if already ticked)
              if (currentServiceOrder !== null) {
                const currentRowKey = orderToRow[currentServiceOrder];
                if (currentRowKey && serviceRotationColumn[currentRowKey] !== undefined) {
                  const tickColumn = serviceRotationColumn[currentRowKey] + 1;
                  console.log(`[PDF-TICK] rally_start: currentServiceOrder=${currentServiceOrder}, rowKey=${currentRowKey}, tickColumn=${tickColumn}, servingTeam=${servingTeamFromEvent}, servingPlayer=${servingPlayerNumber}, alreadyTicked=${get(`${prefix}_${currentRowKey}_pt_${tickColumn}_ticked`)}`);
                  if (tickColumn > 0 && tickColumn <= 21 && !get(`${prefix}_${currentRowKey}_pt_${tickColumn}_ticked`)) {
                    set(`${prefix}_${currentRowKey}_pt_${tickColumn}_ticked`, 'true');
                    console.log(`[PDF-TICK] SET tick: ${prefix}_${currentRowKey}_pt_${tickColumn}_ticked = true`);
                  }
                }
              } else {
                console.log(`[PDF-TICK] rally_start: currentServiceOrder is NULL, cannot tick`);
              }
            } else if (event.type === 'timeout') {
              const timeoutTeam = event.payload?.team;
              // Record timeout with current score (left = requesting team, right = other team)
              // Use team_up/team_down suffixes, not teamA/teamB
              const teamUpSuffix = teamUp === 'team1' ? 't1' : 't2';
              const teamDownSuffix = teamDown === 'team1' ? 't1' : 't2';

              console.log(`[DEBUG] Set ${setNum} - TIMEOUT event:`, {
                timeoutTeam,
                teamUp,
                teamDown,
                teamUpSuffix,
                teamDownSuffix,
                teamAKey,
                teamBKey,
                pointsBefore: { teamUp: pointsBefore.teamUp, teamDown: pointsBefore.teamDown, teamA: pointsBefore.teamA, teamB: pointsBefore.teamB },
                eventPayload: event.payload
              });

              if (timeoutTeam === teamUp) {
                teamUpTimeoutCount++;
                // Left is requesting team (team_up) points, right is other team (team_down) points
                set(`${prefix}_${teamUpSuffix}_to_a`, String(pointsBefore.teamUp));
                set(`${prefix}_${teamUpSuffix}_to_b`, String(pointsBefore.teamDown));
                console.log(`[DEBUG] Set ${setNum} - TO assigned to teamUp (${teamUp}): ${teamUpSuffix}_to = ${pointsBefore.teamUp}:${pointsBefore.teamDown}`);
              } else if (timeoutTeam === teamDown) {
                teamDownTimeoutCount++;
                // Left is requesting team (team_down) points, right is other team (team_up) points
                set(`${prefix}_${teamDownSuffix}_to_a`, String(pointsBefore.teamDown));
                set(`${prefix}_${teamDownSuffix}_to_b`, String(pointsBefore.teamUp));
                console.log(`[DEBUG] Set ${setNum} - TO assigned to teamDown (${teamDown}): ${teamDownSuffix}_to = ${pointsBefore.teamDown}:${pointsBefore.teamUp}`);
              } else {
                console.log(`[DEBUG] Set ${setNum} - TO team "${timeoutTeam}" did NOT match teamUp="${teamUp}" or teamDown="${teamDown}"`);
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

              console.log(`[PDF-CS] COURT SWITCH: setNum=${setNum}, totalPoints=${totalPoints}, rowIndex=${rowIndex}, teamA=${pointsBefore.teamA}, teamB=${pointsBefore.teamB}`);
              console.log(`[PDF-CS] Writing to: ${prefix}_cs_${rowIndex}_a = ${pointsBefore.teamA}, ${prefix}_cs_${rowIndex}_b = ${pointsBefore.teamB}`);

              // Always A left, B right (use pointsBefore which already has teamA and teamB correctly)
              // pointsBefore.teamA is the score of the team that is Team A (from coin toss)
              // pointsBefore.teamB is the score of the team that is Team B (from coin toss)
              // For sets 1-2: skip row 2 (reserved for TTO). For set 3: no TTO, use all rows.
              const skipRow2 = setNum !== 3;
              if (rowIndex >= 0 && rowIndex < 12 && (!skipRow2 || rowIndex !== 2)) {
                set(`${prefix}_cs_${rowIndex}_a`, String(pointsBefore.teamA));
                set(`${prefix}_cs_${rowIndex}_b`, String(pointsBefore.teamB));
              } else {
                console.log(`[PDF-CS] SKIPPED! rowIndex=${rowIndex} out of range or is row 2 (skipRow2=${skipRow2})`);
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

              // t1 and t2 are FIXED team positions: t1 = team1, t2 = team2 (not left/right)
              // Determine which team control row to use based on the sanctioned team
              const isSanctionedTeam1 = sanctionTeam === 'team1';
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

              // Coach sanctions (role: 'coach', no playerNumber)
              if ((isMisconduct || isFormalWarning) && event.payload?.role === 'coach' && match?.hasCoach) {
                const isSanctionedTeamUp = sanctionTeam === teamUp;
                const rowKey = isSanctionedTeamUp ? 'rc_up' : 'rc_down';

                if (isFormalWarning) {
                  set(`${prefix}_${rowKey}_fw_a`, String(penalizedTeamScore));
                  set(`${prefix}_${rowKey}_fw_b`, String(otherTeamScore));
                } else {
                  // Count penalties for coach in this set
                  const coachPenalties = setEvents.filter((e: any, idx: number) =>
                    idx <= eventIndex && e.type === 'sanction' &&
                    e.payload?.team === sanctionTeam &&
                    e.payload?.role === 'coach' &&
                    (e.payload?.type === 'penalty' || e.payload?.type === 'rude_conduct')
                  ).length;

                  if (sanctionType === 'penalty' || sanctionType === 'rude_conduct') {
                    if (coachPenalties === 1) {
                      set(`${prefix}_${rowKey}_s1_a`, String(penalizedTeamScore));
                      set(`${prefix}_${rowKey}_s1_b`, String(otherTeamScore));
                    } else if (coachPenalties === 2) {
                      set(`${prefix}_${rowKey}_s2_a`, String(penalizedTeamScore));
                      set(`${prefix}_${rowKey}_s2_b`, String(otherTeamScore));
                    }
                  } else if (sanctionType === 'expulsion') {
                    set(`${prefix}_${rowKey}_s3_a`, String(penalizedTeamScore));
                    set(`${prefix}_${rowKey}_s3_b`, String(otherTeamScore));
                  } else if (sanctionType === 'disqualification') {
                    set(`${prefix}_${rowKey}_s4_a`, String(penalizedTeamScore));
                    set(`${prefix}_${rowKey}_s4_b`, String(otherTeamScore));
                  }
                }
              }

              // For misconduct and formal warnings, we need to determine the player row based on team identity
              // Rows are assigned by team position: teamUp -> r1 (player1), r3 (player2); teamDown -> r2 (player1), r4 (player2)
              if ((isMisconduct || isFormalWarning) && event.payload?.playerNumber) {
                const playerNumber = event.payload.playerNumber;
                let rowKey: string | null = null;

                // Determine which team the sanction is for (sanctionTeam is 'team1' or 'team2')
                // Use teamAData/teamBData which are already populated with player numbers
                const isSanctionForTeamA = sanctionTeam === teamAKey;
                const sanctionedTeamData = isSanctionForTeamA ? teamAData : teamBData;
                const isSanctionedTeamUp = sanctionTeam === teamUp;

                // Find which player on the sanctioned team matches the playerNumber
                // Player numbers might be strings or numbers, so compare as strings
                const playerNumStr = String(playerNumber);
                const isPlayer1 = String(sanctionedTeamData?.player1?.number) === playerNumStr;
                const isPlayer2 = String(sanctionedTeamData?.player2?.number) === playerNumStr;

                if (isPlayer1 || isPlayer2) {
                  // Use playerToRow (built from serviceOrder) for correct row assignment
                  rowKey = playerToRow[playerNumStr] || null;
                  // Fallback to hardcoded mapping if playerToRow doesn't have this player
                  if (!rowKey) {
                    if (isSanctionedTeamUp) {
                      rowKey = isPlayer1 ? 'r1' : 'r3';
                    } else {
                      rowKey = isPlayer1 ? 'r2' : 'r4';
                    }
                  }
                }

                if (rowKey) {
                  // Get scores: _a = penalized team's score, _b = other team's score
                  const penalizedTeamScore = sanctionTeam === teamAKey ? pointsBefore.teamA : pointsBefore.teamB;
                  const otherTeamScore = sanctionTeam === teamAKey ? pointsBefore.teamB : pointsBefore.teamA;

                  if (isFormalWarning) {
                    // Formal warning: use fw_a and fw_b with scores
                    set(`${prefix}_${rowKey}_fw_a`, String(penalizedTeamScore));
                    set(`${prefix}_${rowKey}_fw_b`, String(otherTeamScore));

                    // Cross out the other player's formal warning box in the same team
                    const otherRowKey = (rowKey === 'r1' ? 'r3' : rowKey === 'r3' ? 'r1' : rowKey === 'r2' ? 'r4' : 'r2');
                    set(`${prefix}_${otherRowKey}_fw_crossed`, 'true');
                  } else {
                    // Count penalties (including rude_conduct) for this player in this set
                    const playerPenalties = setEvents.filter((e: any, idx: number) =>
                      idx <= eventIndex && e.type === 'sanction' &&
                      e.payload?.team === sanctionTeam &&
                      e.payload?.playerNumber === playerNumber &&
                      (e.payload?.type === 'penalty' || e.payload?.type === 'rude_conduct')
                    ).length;

                    // Map to player row fields: s1/s2 for penalties, s3 for expulsion, s4 for disqualification
                    if (sanctionType === 'penalty' || sanctionType === 'rude_conduct') {
                      if (playerPenalties === 1) {
                        set(`${prefix}_${rowKey}_s1_a`, String(penalizedTeamScore));
                        set(`${prefix}_${rowKey}_s1_b`, String(otherTeamScore));
                      } else if (playerPenalties === 2) {
                        set(`${prefix}_${rowKey}_s2_a`, String(penalizedTeamScore));
                        set(`${prefix}_${rowKey}_s2_b`, String(otherTeamScore));
                      }
                    } else if (sanctionType === 'expulsion') {
                      set(`${prefix}_${rowKey}_s3_a`, String(penalizedTeamScore));
                      set(`${prefix}_${rowKey}_s3_b`, String(otherTeamScore));
                    } else if (sanctionType === 'disqualification') {
                      set(`${prefix}_${rowKey}_s4_a`, String(penalizedTeamScore));
                      set(`${prefix}_${rowKey}_s4_b`, String(otherTeamScore));
                    }
                  }
                }
              }
            }
          });

          // After processing all events, if set is NOT finished, place a tick on the current server's next box
          // This handles the case where the PDF is generated mid-game before the next rally_start
          if (!setData?.finished && currentServiceOrder !== null) {
            const currentRowKey = orderToRow[currentServiceOrder];
            if (currentRowKey && serviceRotationColumn[currentRowKey] !== undefined) {
              const tickColumn = serviceRotationColumn[currentRowKey] + 1;
              console.log(`[PDF-TICK] END OF EVENTS (set not finished): currentServiceOrder=${currentServiceOrder}, rowKey=${currentRowKey}, tickColumn=${tickColumn}, alreadyTicked=${get(`${prefix}_${currentRowKey}_pt_${tickColumn}_ticked`)}`);
              if (tickColumn > 0 && tickColumn <= 21 && !get(`${prefix}_${currentRowKey}_pt_${tickColumn}_ticked`)) {
                set(`${prefix}_${currentRowKey}_pt_${tickColumn}_ticked`, 'true');
                console.log(`[PDF-TICK] SET tick (end of events): ${prefix}_${currentRowKey}_pt_${tickColumn}_ticked = true`);
              }
            }
          }

          // After processing all events, if set is finished, circle final scores in service rotation boxes
          if (setData?.finished) {
            console.log(`[DEBUG] Set ${setNum} - setData.finished: true, team1Points: ${setData.team1Points}, team2Points: ${setData.team2Points}, teamUp: ${teamUp}, teamDown: ${teamDown}`);

            // Get final scores using team_up/team_down (team1Points = team1)
            const finalTeamUpPoints = teamUp === 'team1' ? (setData.team1Points || 0) : (setData.team2Points || 0);
            const finalTeamDownPoints = teamDown === 'team1' ? (setData.team1Points || 0) : (setData.team2Points || 0);

            console.log(`[DEBUG] Set ${setNum} - finalTeamUpPoints: ${finalTeamUpPoints}, finalTeamDownPoints: ${finalTeamDownPoints}`);

            // Find the last rally_start event to determine which team was serving when set ended
            const lastRallyStart = setEvents
              .filter((e: any) => e.type === 'rally_start')
              .sort((a: any, b: any) => {
                const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
                const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
                return bTime - aTime; // Most recent first
              })[0];

            console.log(`[DEBUG] Set ${setNum} - lastRallyStart servingTeam:`, lastRallyStart?.payload?.servingTeam, 'serviceOrder:', serviceOrder);

            if (lastRallyStart && lastRallyStart.payload?.servingTeam && serviceOrder && Object.keys(serviceOrder).length > 0) {
              const servingTeamAtEnd = lastRallyStart.payload.servingTeam;
              // Check both servingPlayer and servingPlayerNumber (payload might use either)
              const servingPlayerNumber = lastRallyStart.payload.servingPlayerNumber || lastRallyStart.payload.servingPlayer;

              // Find which service order was serving when set ended
              let servingOrderAtEnd: number | null = null;
              let servingTeamRowKey: string | null = null;
              let receivingTeamRowKey: string | null = null;

              if (servingPlayerNumber && serviceOrder && Object.keys(serviceOrder).length > 0) {
                // Use team_up/team_down data to find player (use String() to avoid type mismatch)
                const teamKey = servingTeamAtEnd;
                const servingNumStr = String(servingPlayerNumber);

                let playerKey = '';
                if (teamKey === teamUp) {
                  if (String(teamUpData?.player1?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player1`;
                  } else if (String(teamUpData?.player2?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player2`;
                  } else {
                    console.log(`[DEBUG] Set ${setNum} - No match for teamUp: player1.number=${teamUpData?.player1?.number} (${typeof teamUpData?.player1?.number}), player2.number=${teamUpData?.player2?.number} (${typeof teamUpData?.player2?.number}), servingPlayerNumber=${servingPlayerNumber} (${typeof servingPlayerNumber})`);
                  }
                } else if (teamKey === teamDown) {
                  if (String(teamDownData?.player1?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player1`;
                  } else if (String(teamDownData?.player2?.number) === servingNumStr) {
                    playerKey = `${teamKey}_player2`;
                  } else {
                    console.log(`[DEBUG] Set ${setNum} - No match for teamDown: player1.number=${teamDownData?.player1?.number} (${typeof teamDownData?.player1?.number}), player2.number=${teamDownData?.player2?.number} (${typeof teamDownData?.player2?.number}), servingPlayerNumber=${servingPlayerNumber} (${typeof servingPlayerNumber})`);
                  }
                }

                console.log(`[DEBUG] Set ${setNum} - Circle final: playerKey=${playerKey}, serviceOrder[playerKey]=${playerKey ? serviceOrder[playerKey] : 'N/A'}, servingTeamAtEnd=${servingTeamAtEnd}, teamUp=${teamUp}, teamDown=${teamDown}`);

                if (playerKey && serviceOrder[playerKey]) {
                  servingOrderAtEnd = serviceOrder[playerKey];
                  if (servingOrderAtEnd !== null && servingOrderAtEnd > 0) {
                    servingTeamRowKey = orderToRow[servingOrderAtEnd];
                    const receivingOrderAtEnd = (servingOrderAtEnd % 4) + 1; // Next in rotation
                    receivingTeamRowKey = orderToRow[receivingOrderAtEnd];
                  }
                }
              } else {
                console.log(`[DEBUG] Set ${setNum} - Missing servingPlayerNumber or serviceOrder: servingPlayerNumber=${servingPlayerNumber}`);
              }

              console.log(`[DEBUG] Set ${setNum} - servingOrderAtEnd: ${servingOrderAtEnd}, servingTeamRowKey: ${servingTeamRowKey}, receivingTeamRowKey: ${receivingTeamRowKey}`);

              if (servingOrderAtEnd !== null && servingTeamRowKey && receivingTeamRowKey && servingOrderAtEnd > 0) {
                // Determine scores for serving and receiving teams
                const isServingTeamUp = servingTeamAtEnd === teamUp;
                const servingFinalScore = String(isServingTeamUp ? finalTeamUpPoints : finalTeamDownPoints);
                const receivingFinalScore = String(isServingTeamUp ? finalTeamDownPoints : finalTeamUpPoints);

                // Determine who won the set - did the serving team win or lose the last point?
                const servingTeamWonSet = (isServingTeamUp && finalTeamUpPoints > finalTeamDownPoints) ||
                                           (!isServingTeamUp && finalTeamDownPoints > finalTeamUpPoints);

                // Each team has two rows: teamUp uses r1/r3, teamDown uses r2/r4
                // Determine which rows belong to the winner/loser based on who won
                const winnerIsUp = (servingTeamWonSet && isServingTeamUp) || (!servingTeamWonSet && !isServingTeamUp);
                const winnerRows = winnerIsUp ? ['r1', 'r3'] : ['r2', 'r4'];
                const loserRows = winnerIsUp ? ['r2', 'r4'] : ['r1', 'r3'];

                // Find the winning team's row with the latest entry
                const winnerLastRow = winnerRows.reduce((best, row) => {
                  const col = serviceRotationColumn[row] || 0;
                  return col > (serviceRotationColumn[best] || 0) ? row : best;
                }, winnerRows[0]);
                const winnerLastCol = serviceRotationColumn[winnerLastRow] || 0;

                // Find the losing team's row with the latest entry
                const loserLastRow = loserRows.reduce((best, row) => {
                  const col = serviceRotationColumn[row] || 0;
                  return col > (serviceRotationColumn[best] || 0) ? row : best;
                }, loserRows[0]);
                const loserLastCol = serviceRotationColumn[loserLastRow] || 0;

                console.log(`[DEBUG] Set ${setNum} - Circling: servingTeamWonSet=${servingTeamWonSet}, winnerRow=${winnerLastRow}(lastCol=${winnerLastCol}), loserRow=${loserLastRow}(lastCol=${loserLastCol})`);

                // Unified helper: find-or-write a final score and circle it.
                // Searches backwards through the given rows for an existing cell with the score value.
                // If found (from point processing or dataRef persistence), just circles it.
                // If not found, writes and circles in the next column of fallbackRow.
                const circleScore = (rows: string[], fallbackRow: string, fallbackLastCol: number, score: string, label: string) => {
                  // Search backwards through all candidate rows for existing score
                  for (const row of rows) {
                    const maxCol = serviceRotationColumn[row] || 0;
                    for (let c = maxCol; c >= 1; c--) {
                      if (get(`${prefix}_${row}_pt_${c}`) === score) {
                        console.log(`[DEBUG] Set ${setNum} - ${label}: Found ${score} at ${row}_pt_${c}, circling`);
                        set(`${prefix}_${row}_pt_${c}_circled`, 'true');
                        return;
                      }
                    }
                  }
                  // Not found — write in next column
                  const col = fallbackLastCol + 1;
                  console.log(`[DEBUG] Set ${setNum} - ${label}: Writing ${score} at ${fallbackRow}_pt_${col}`);
                  if (col > 0 && col <= 21) {
                    set(`${prefix}_${fallbackRow}_pt_${col}`, score);
                    set(`${prefix}_${fallbackRow}_pt_${col}_circled`, 'true');
                  }
                };

                const winnerScore = servingTeamWonSet ? servingFinalScore : receivingFinalScore;
                const loserScore = servingTeamWonSet ? receivingFinalScore : servingFinalScore;

                // Use the actual serving/receiving row as fallback for placing final scores
                // When serving team WON: winner's score goes in serving row, loser's in receiving row
                // When serving team LOST: loser's score goes in serving row, winner's in receiving row
                const winnerFallbackRow = servingTeamWonSet ? servingTeamRowKey : receivingTeamRowKey;
                const winnerFallbackCol = serviceRotationColumn[winnerFallbackRow] || 0;
                const loserFallbackRow = servingTeamWonSet ? receivingTeamRowKey : servingTeamRowKey;
                const loserFallbackCol = serviceRotationColumn[loserFallbackRow] || 0;

                circleScore(winnerRows, winnerFallbackRow, winnerFallbackCol, winnerScore, 'Winner');
                circleScore(loserRows, loserFallbackRow, loserFallbackCol, loserScore, 'Loser');
              } else {
                console.log(`[DEBUG] Set ${setNum} - Conditions not met for circling: servingOrderAtEnd=${servingOrderAtEnd}, servingTeamRowKey=${servingTeamRowKey}, receivingTeamRowKey=${receivingTeamRowKey}`);
              }
            } else {
              console.log(`[DEBUG] Set ${setNum} - Missing lastRallyStart or serviceOrder: lastRallyStart=${!!lastRallyStart}, servingTeam=${!!lastRallyStart?.payload?.servingTeam}, serviceOrder=${!!(serviceOrder && Object.keys(serviceOrder).length > 0)}`);
            }
          }

          // Set team names and A/B in team circle/label for this set
          const teamAName = teamAKey === 'team1' ? (team1Team?.name || 'Team 1') : (team2Team?.name || 'Team 2');
          const teamBName = teamBKey === 'team1' ? (team1Team?.name || 'Team 1') : (team2Team?.name || 'Team 2');
          // Country can be in team object or match object
          const teamACountry = teamAKey === 'team1'
            ? (team1Team?.country || match?.team1Country || '')
            : (team2Team?.country || match?.team2Country || '');
          const teamBCountry = teamBKey === 'team1'
            ? (team1Team?.country || match?.team1Country || '')
            : (team2Team?.country || match?.team2Country || '');
          const teamAColor = teamAKey === 'team1' ? (team1Team?.color || '#89bdc3') : (team2Team?.color || '#323134');
          const teamBColor = teamBKey === 'team1' ? (team1Team?.color || '#89bdc3') : (team2Team?.color || '#323134');

          // Format: country code, or team name if both teams share the same country
          const sameCountryEvt = teamACountry && teamBCountry
            && teamACountry.toUpperCase().trim() === teamBCountry.toUpperCase().trim();
          const teamALabel = sameCountryEvt ? (teamAName || teamACountry || '') : (teamACountry || '');
          const teamBLabel = sameCountryEvt ? (teamBName || teamBCountry || '') : (teamBCountry || '');

          // Store team colors for t1 and t2 (for all sets, not just current)
          // t1 = team1 (left), t2 = team2 (right)
          const t1Color = teamAKey === 'team1' ? teamAColor : teamBColor;
          const t2Color = teamAKey === 'team2' ? teamAColor : teamBColor;

          // Store colors for this set
          set(`${prefix}_t1_team_color`, t1Color);
          set(`${prefix}_t2_team_color`, t2Color);

          // Set team circle/label for ALL sets (not just current)
          // Set A/B based on which team is actually A or B from coin toss
          // team1 is A if teamAKey === 'team1', otherwise team1 is B
          // team2 is A if teamAKey === 'team2', otherwise team2 is B
          const t1IsA = teamAKey === 'team1';
          const t2IsA = teamAKey === 'team2';

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
            team1Team: { country: team1Team?.country, name: team1Team?.name },
            team2Team: { country: team2Team?.country, name: team2Team?.name }
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
            const teamUpSuffix = teamUp === 'team1' ? 'a' : 'b';
            const teamDownSuffix = teamDown === 'team1' ? 'a' : 'b';
            set(`res_s${setNum}_to_${teamUpSuffix}`, String(teamUpTimeoutCount));
            set(`res_s${setNum}_to_${teamDownSuffix}`, String(teamDownTimeoutCount));
          }

          // Cross out formal warning and delay warning boxes based on previous sets
          // Check if team got formal warning in any previous set
          for (let prevSetIndex = 1; prevSetIndex < setNum; prevSetIndex++) {
            const prevSetPrefix = prevSetIndex === 1 ? 's1' : prevSetIndex === 2 ? 's2' : 's3';
            const prevTeamAKey = match?.coinTossTeamA || 'team1';
            const prevTeamBKey = match?.coinTossTeamB || 'team2';

            // Check if Team A got formal warning in previous set
            if (formalWarningsBySet[prevSetIndex]?.has(prevTeamAKey)) {
              // Cross out both Team A players' formal warning boxes in current set
              set(`${prefix}_r1_fw_crossed`, 'true');
              set(`${prefix}_r3_fw_crossed`, 'true');
              // Cross out coach row formal warning too (Team A is teamUp -> rc_up, teamDown -> rc_down)
              if (match?.hasCoach) {
                const teamAIsUp = prevTeamAKey === teamUp;
                set(`${prefix}_${teamAIsUp ? 'rc_up' : 'rc_down'}_fw_crossed`, 'true');
              }
            }

            // Check if Team B got formal warning in previous set
            if (formalWarningsBySet[prevSetIndex]?.has(prevTeamBKey)) {
              // Cross out both Team B players' formal warning boxes in current set
              set(`${prefix}_r2_fw_crossed`, 'true');
              set(`${prefix}_r4_fw_crossed`, 'true');
              // Cross out coach row formal warning too
              if (match?.hasCoach) {
                const teamBIsUp = prevTeamBKey === teamUp;
                set(`${prefix}_${teamBIsUp ? 'rc_up' : 'rc_down'}_fw_crossed`, 'true');
              }
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
          const teamAKey = match?.coinTossTeamA || 'team1';
          return sum + setEvents.filter((e: any) => e.type === 'timeout' && e.payload?.team === teamAKey).length;
        }, 0);
        const totalTeamBTimeouts = Object.keys(eventsBySet).reduce((sum, setIdxStr) => {
          const setIndex = parseInt(setIdxStr);
          const setEvents = eventsBySet[setIndex] || [];
          const teamBKey = match?.coinTossTeamB || 'team2';
          return sum + setEvents.filter((e: any) => e.type === 'timeout' && e.payload?.team === teamBKey).length;
        }, 0);
        set('res_tot_to_a', String(totalTeamATimeouts));
        set('res_tot_to_b', String(totalTeamBTimeouts));

        // Process improper requests
        const improperRequests = events.filter((e: any) =>
          e.type === 'sanction' && e.payload?.type === 'improper_request'
        );
        const teamAImproper = improperRequests.filter((e: any) =>
          e.payload?.team === (match?.coinTossTeamA || 'team1')
        ).length > 0;
        const teamBImproper = improperRequests.filter((e: any) =>
          e.payload?.team === (match?.coinTossTeamB || 'team2')
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
          const teamSuffix = teamKey === (match?.coinTossTeamA || 'team1') ? 't1' : 't2';

          if (!playerNumber) return; // Skip team sanctions for now

          // Find player row key (r1=I, r2=II, r3=III, r4=IV)
          let rowKey: string | null = null;
          const coinTossData = match?.coinTossData?.players;
          if (teamKey === (match?.coinTossTeamA || 'team1')) {
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
        // So we need to map team1/team2 to A/B correctly

        const teamAKey = match?.coinTossTeamA || 'team1';
        const teamBKey = match?.coinTossTeamB || (teamAKey === 'team1' ? 'team2' : 'team1');

        // Track MTO/RIT per player (across all sets, per player)
        const playerMedicalData: Record<string, { mto_blood: boolean, rit_type: string | null, rit_used: boolean }> = {};

        // Initialize all players
        if (team1Players && team1Players.length >= 2) {
          team1Players.forEach((p: any, idx: number) => {
            const playerKey = `team1_player${idx + 1}_${p.number}`;
            playerMedicalData[playerKey] = { mto_blood: false, rit_type: null, rit_used: false };
          });
        }
        if (team2Players && team2Players.length >= 2) {
          team2Players.forEach((p: any, idx: number) => {
            const playerKey = `team2_player${idx + 1}_${p.number}`;
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
          if (teamKey === 'team1' && team1Players) {
            const playerIdx = team1Players.findIndex((p: any) => p.number === playerNumber);
            if (playerIdx >= 0) playerIndex = playerIdx;
          } else if (teamKey === 'team2' && team2Players) {
            const playerIdx = team2Players.findIndex((p: any) => p.number === playerNumber);
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
        // But the chart structure is: idx 0,1 = team1 players, idx 2,3 = team2 players
        // So we need to set ma_side_1 and ma_side_2 based on which team is A/B
        
        // Team 1, Player 1: idx 0
        if (team1Players && team1Players.length >= 1) {
          const p1 = team1Players[0];
          const p1Key = `team1_player1_${p1.number}`;
          const p1Data = playerMedicalData[p1Key] || { mto_blood: false, rit_type: null, rit_used: false };
          // ma_side_1: 'A' if team1 is Team A, 'B' if team1 is Team B
          set('ma_side_1', teamAKey === 'team1' ? 'A' : 'B');
          set('ma_ctry_1', team1Team?.country || match?.team1Country || '');
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
        if (team1Players && team1Players.length >= 2) {
          const p2 = team1Players[1];
          const p2Key = `team1_player2_${p2.number}`;
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
        if (team2Players && team2Players.length >= 1) {
          const p1 = team2Players[0];
          const p1Key = `team2_player1_${p1.number}`;
          const p1Data = playerMedicalData[p1Key] || { mto_blood: false, rit_type: null, rit_used: false };
          // ma_side_2: 'A' if team2 is Team A, 'B' if team2 is Team B
          set('ma_side_2', teamAKey === 'team2' ? 'A' : 'B');
          set('ma_ctry_2', team2Team?.country || match?.team2Country || '');
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
        if (team2Players && team2Players.length >= 2) {
          const p2 = team2Players[1];
          const p2Key = `team2_player2_${p2.number}`;
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
        if (event.type === 'challenge' || event.type === 'challenge_outcome' ||
          event.type === 'referee_bmp_request' || event.type === 'referee_bmp_outcome' ||
          event.type === 'bmp') {
          bmpEvents.push(event);
        }
      });
      console.log('[BMP] Found BMP events:', bmpEvents.length, bmpEvents.map((e: any) => ({ type: e.type, seq: e.seq, setIndex: e.setIndex, team: e.payload?.team })));

      // Sort BMP events by timestamp, with seq as tiebreaker to keep request before outcome
      bmpEvents.sort((a, b) => {
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return (a.seq || 0) - (b.seq || 0);
      });

      // Populate BMP header
      if (match) {
        // Event/Competition name - use same fallback logic as main scoresheet
        set('bmp_event', match.eventName || match.league || '');
        if (match.scheduledAt) {
          const date = new Date(match.scheduledAt);
          set('bmp_date', date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }));
        }
        set('bmp_match_no', String(match.game_n || ''));
        // Convert phase to capitalize (replace underscores with spaces and capitalize)
        // Use fallback to match.phase like main scoresheet
        const phaseStr = match.matchPhase || match.phase || '';
        const formattedPhase = phaseStr
          .replace(/_/g, ' ')
          .split(' ')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        set('bmp_phase', formattedPhase);
        // Use fallback to match.gender like main scoresheet
        const genderValue = match.matchGender || match.gender;
        set('bmp_gender', genderValue === 'men' ? 'Men' : genderValue === 'women' ? 'Women' : '');

        // Only set team A/B names if coin toss is confirmed
        if (match.coinTossConfirmed) {
          const teamAKey = match.coinTossTeamA || 'team1';
          const teamBKey = match.coinTossTeamB || 'team2';
          const teamAName = teamAKey === 'team1' ? (team1Team?.name || '') : (team2Team?.name || '');
          const teamBName = teamBKey === 'team1' ? (team1Team?.name || '') : (team2Team?.name || '');
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

        const setIndex = event.setIndex || 1;
        const eventTime = event.ts ? (typeof event.ts === 'number' ? new Date(event.ts) : new Date(event.ts)) : new Date();
        const hours = String(eventTime.getHours()).padStart(2, '0');
        const minutes = String(eventTime.getMinutes()).padStart(2, '0');
        const seconds = String(eventTime.getSeconds()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;

        // Find the set to get scores at time of BMP
        const setData = sets?.find((s: any) => s.index === setIndex);
        let scoreAtRequest = { team1: 0, team2: 0 };
        let servingTeamBefore = '';
        let requestBy = '';
        let outcome = '';
        let servingTeamAfter = '';
        let scoreAfterDecision = { team1: 0, team2: 0 };
        let timeResumed = '';
        let duration = '';

        if (event.type === 'challenge') {
          // Team-initiated challenge
          const teamKey = event.payload?.team;
          const teamLabel = teamKey === teamAKey ? 'A' : teamKey === teamBKey ? 'B' : '';
          requestBy = teamLabel;

          // Get score at time of request
          scoreAtRequest = event.payload?.score || { team1: setData?.team1Points || 0, team2: setData?.team2Points || 0 };

          // Get serving team from the event payload (stored when BMP was requested)
          const servingTeamKey = event.payload?.servingTeam;
          servingTeamBefore = servingTeamKey === teamAKey ? 'A' : servingTeamKey === teamBKey ? 'B' : '';

          // Find corresponding outcome by matching sequence (outcome seq is decimal like 7.1 for request seq 7)
          const requestSeq = event.seq;
          const outcomeEvent = bmpEvents.find((e: any, i: number) =>
            i > idx &&
            e.type === 'challenge_outcome' &&
            e.setIndex === setIndex &&
            e.payload?.team === teamKey &&
            (requestSeq === undefined || Math.floor(e.seq) === Math.floor(requestSeq))
          );

          // Skip if no outcome (canceled BMP)
          if (!outcomeEvent) {
            return;
          }

          processedBMPs.add(bmpEvents.indexOf(outcomeEvent));
          const result = outcomeEvent.payload?.result || '';
          if (result === 'successful') outcome = 'SUC';
          else if (result === 'unsuccessful') outcome = 'UNSUC';
          else if (result === 'judgment_impossible') outcome = 'MUNAV';
          else if (result === 'cancelled') outcome = 'MUNAV';

          scoreAfterDecision = outcomeEvent.payload?.newScore || scoreAtRequest;

          // Determine serving team after BMP outcome
          // For successful team BMP: requesting team wins the point → gets serve
          // For unsuccessful/unavailable: serve doesn't change
          const outcomeTime = outcomeEvent.ts ? (typeof outcomeEvent.ts === 'number' ? new Date(outcomeEvent.ts) : new Date(outcomeEvent.ts)) : new Date();
          if (result === 'successful') {
            // Requesting team won the challenge → they get the point → they get serve
            servingTeamAfter = teamLabel; // 'A' or 'B'
          } else {
            // Unsuccessful or unavailable: no score change, serve stays the same
            servingTeamAfter = servingTeamBefore;
          }

          const resumedHours = String(outcomeTime.getHours()).padStart(2, '0');
          const resumedMinutes = String(outcomeTime.getMinutes()).padStart(2, '0');
          const resumedSeconds = String(outcomeTime.getSeconds()).padStart(2, '0');
          timeResumed = `${resumedHours}:${resumedMinutes}:${resumedSeconds}`;

          const durationMs = outcomeTime.getTime() - eventTime.getTime();
          const durationSec = Math.round(durationMs / 1000);
          const durationMin = Math.floor(durationSec / 60);
          const durationSecRemainder = durationSec % 60;
          duration = `${durationMin}:${String(durationSecRemainder).padStart(2, '0')}`;
        } else if (event.type === 'referee_bmp_request') {
          // Referee-initiated BMP
          requestBy = 'Ref';

          scoreAtRequest = event.payload?.score || { team1: setData?.team1Points || 0, team2: setData?.team2Points || 0 };
          servingTeamBefore = event.payload?.servingTeam === teamAKey ? 'A' : event.payload?.servingTeam === teamBKey ? 'B' : '';

          // Find corresponding outcome by matching sequence (outcome seq is decimal like 7.1 for request seq 7)
          const requestSeq = event.seq;
          const outcomeEvent = bmpEvents.find((e: any, i: number) =>
            i > idx &&
            (e.type === 'referee_bmp_outcome' || e.type === 'bmp') &&
            e.setIndex === setIndex &&
            (requestSeq === undefined || Math.floor(e.seq) === Math.floor(requestSeq))
          );

          // Skip if no outcome (canceled BMP)
          if (!outcomeEvent) {
            return;
          }

          processedBMPs.add(bmpEvents.indexOf(outcomeEvent));
          const result = outcomeEvent.payload?.result || '';
          // For referee-requested BMPs, show IN or OUT
          if (result === 'in') outcome = 'IN';
          else if (result === 'out') outcome = 'OUT';
          else outcome = ''; // Empty if no clear result

          scoreAfterDecision = outcomeEvent.payload?.newScore || scoreAtRequest;

          // Determine serving team after referee BMP outcome
          // For referee BMP with point awarded (IN/OUT): the team that gets the point gets serve
          // For unavailable/no point: serve stays the same
          const outcomeTime = outcomeEvent.ts ? (typeof outcomeEvent.ts === 'number' ? new Date(outcomeEvent.ts) : new Date(outcomeEvent.ts)) : new Date();
          if (outcomeEvent.payload?.pointAwarded && outcomeEvent.payload?.pointToTeam) {
            const pointToTeamKey = outcomeEvent.payload.pointToTeam;
            servingTeamAfter = pointToTeamKey === teamAKey ? 'A' : pointToTeamKey === teamBKey ? 'B' : servingTeamBefore;
          } else {
            // No point awarded: serve stays the same
            servingTeamAfter = servingTeamBefore;
          }

          const resumedHours = String(outcomeTime.getHours()).padStart(2, '0');
          const resumedMinutes = String(outcomeTime.getMinutes()).padStart(2, '0');
          const resumedSeconds = String(outcomeTime.getSeconds()).padStart(2, '0');
          timeResumed = `${resumedHours}:${resumedMinutes}:${resumedSeconds}`;

          const durationMs = outcomeTime.getTime() - eventTime.getTime();
          const durationSec = Math.round(durationMs / 1000);
          const durationMin = Math.floor(durationSec / 60);
          const durationSecRemainder = durationSec % 60;
          duration = `${durationMin}:${String(durationSecRemainder).padStart(2, '0')}`;
        } else if (event.type === 'challenge_outcome' || event.type === 'referee_bmp_outcome' || event.type === 'bmp') {
          // Skip if this is an outcome without a corresponding request (shouldn't happen, but handle gracefully)
          return;
        }

        // Fill BMP row
        // Map team1/team2 scores to A/B based on teamAKey
        const scoreARequest = teamAKey === 'team1' ? scoreAtRequest.team1 : scoreAtRequest.team2;
        const scoreBRequest = teamAKey === 'team1' ? scoreAtRequest.team2 : scoreAtRequest.team1;
        const scoreAAfter = teamAKey === 'team1' ? scoreAfterDecision.team1 : scoreAfterDecision.team2;
        const scoreBAfter = teamAKey === 'team1' ? scoreAfterDecision.team2 : scoreAfterDecision.team1;

        set(`bmp_${bmpRowIndex}_start`, timeStr);
        set(`bmp_${bmpRowIndex}_set`, String(setIndex));
        set(`bmp_${bmpRowIndex}_score_a`, String(scoreARequest));
        set(`bmp_${bmpRowIndex}_score_b`, String(scoreBRequest));
        // Ensure serving team values are set (A or B, not empty)
        set(`bmp_${bmpRowIndex}_serving_before`, servingTeamBefore || '');
        set(`bmp_${bmpRowIndex}_request`, requestBy);
        set(`bmp_${bmpRowIndex}_outcome`, outcome);
        set(`bmp_${bmpRowIndex}_serving_after`, servingTeamAfter || servingTeamBefore || '');
        set(`bmp_${bmpRowIndex}_score2_a`, String(scoreAAfter));
        set(`bmp_${bmpRowIndex}_score2_b`, String(scoreBAfter));
        set(`bmp_${bmpRowIndex}_resumed`, timeResumed);
        set(`bmp_${bmpRowIndex}_duration`, duration);

        console.log(`[BMP] Row ${bmpRowIndex}:`, { requestBy, outcome, scoreARequest, scoreBRequest, scoreAAfter, scoreBAfter, servingTeamBefore, servingTeamAfter });
        bmpRowIndex++;
      });

      console.log('[BMP] Total BMP rows populated:', bmpRowIndex);
      // Store total BMP count for pagination
      set('bmp_total_count', bmpRowIndex);

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
        const teamAKey = match?.coinTossTeamA || 'team1';
        const teamBKey = match?.coinTossTeamB || 'team2';
        const isTeamA = teamKey === teamAKey;
        const teamLabel = isTeamA ? 'A' : 'B';
        const otherTeamLabel = isTeamA ? 'B' : 'A';

        // Get scores at time of interruption
        const teamAPoints = start.payload?.team1Points || 0;
        const teamBPoints = start.payload?.team2Points || 0;
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

      // Process forfait events for remarks (only actual forfeits, not expulsion/disqualification
      // which are already recorded in the sanctions table Exp./Disq. columns)
      const forfaitRemarks: string[] = [];
      const forfaitEvents = events.filter((e: any) =>
        e.type === 'forfait' &&
        e.payload?.reason !== 'expulsion' &&
        e.payload?.reason !== 'disqualification'
      );
      const forfaitTeamAKey = match?.coinTossTeamA || 'team1';

      forfaitEvents.forEach((event: any) => {
        const forfaitTeam = event.payload?.team;
        const setIndex = event.setIndex || event.payload?.setIndex || 1;
        const setNumber = setIndex === 1 ? '1st' : setIndex === 2 ? '2nd' : '3rd';
        const teamLabel = forfaitTeam === forfaitTeamAKey ? 'A' : 'B';

        forfaitRemarks.push(`* ${setNumber.charAt(0).toUpperCase() + setNumber.slice(1)} Set — Team ${teamLabel}: Forfeit`);
      });

      // Combine existing remarks with MTO/RIT and forfait remarks
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
      if (forfaitRemarks.length > 0) {
        if (remarksText) {
          remarksText += '\n\n';
        }
        remarksText += forfaitRemarks.join('\n');
      }

      if (remarksText) {
        set('remarks', remarksText);
      }

    } else if (!currentMatchData) {
      // Try to load from sessionStorage as fallback
      try {
        const dataStr = sessionStorage.getItem('scoresheetData');
        if (dataStr) {
          const fallbackData = JSON.parse(dataStr);
          // Retry initialization with fallback data
          if (fallbackData && fallbackData.match) {
            setCurrentMatchData(fallbackData);
          }
        }
      } catch (e) {
        // Error loading fallback data
      }
    }
  }, [currentMatchData, dataVersion]);


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

  // Inline styles for centering
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
          <div className={`${W_COL1} border-r border-b border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
            Service<br />Order
          </div>
          <div className={`${W_COL2} border-r border-b border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
            Player<br />No.
          </div>
          <div className={`${W_COL3} border-r border-b border-black p-0.5 text-[6px] text-center leading-tight bg-gray-50 font-bold`} style={centerStyleCol}>
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
              <div className={`${W_COL4} border-r border-b border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Pen.</div>
              <div className={`${W_COL5} border-r border-b border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Pen.</div>
              <div className={`${W_COL6} border-r border-b border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Exp.</div>
              <div className={`${W_COL7} border-r border-b border-black text-[6px] text-center bg-gray-50 font-bold`} style={centerStyle}>Disq.</div>
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
      <div className="flex border-t border-black text-black">
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

  // 3a. Coach Row (no 21-point grid, only sanction columns)
  const renderCoachRow = (setPrefix: string, rowKeySuffix: string) => (
    <div className="flex h-5 border-b border-black text-black">
      {/* Label */}
      <div className={`${W_COL1} border-r border-black font-bold text-xs bg-gray-50`} style={centerStyle}>
        C
      </div>
      {/* Player No (empty for coach) */}
      <div className={`${W_COL2} border-r border-black p-0.5`} style={centerStyle}>
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

      {/* Empty space where 21-point grid would be */}
      <div className="flex-1 bg-white"></div>
    </div>
  );

  // 3b. Player Row
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
          const isTicked = get(`${setPrefix}_${rowKeySuffix}_pt_${i + 1}_ticked`) === 'true';
          return (
            <div key={i} className="flex-1 border-r border-black relative group last:border-r-0">
              {/* Box number with tick/slash overlay when serving */}
              <span className="absolute top-[1px] right-[1px] text-[5px] leading-none select-none text-gray-500">{i + 1}</span>
              {isTicked && (
                <div className="absolute top-[0px] right-[0px] w-[7px] h-[7px] pointer-events-none z-10">
                  <div className="absolute top-[3px] right-[1px] w-[5px] h-[0.5px] bg-black -rotate-45 transform origin-center"></div>
                </div>
              )}
              <div className="relative w-full h-full">
                <Input
                  value={value}
                  onChange={v => set(`${setPrefix}_${rowKeySuffix}_pt_${i + 1}`, v)}
                  className="w-full h-full text-[10px] group-hover:bg-blue-50"
                />
                {/* Circle indicator for final score */}
                {isCircled && value && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-[90%] aspect-square rounded-full border border-black"></div>
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
      <div className={`h-10 text-[5px] text-center leading-tight bg-gray-50 font-bold border-black ${W_COL1}`} style={centerStyleCol}>
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
            <div className="flex-1 h-full flex items-center justify-center gap-1">
              {get(`${setPrefix}_${teamSuffix}_team_circle`) && <FlagImage countryCode={get(teamSuffix === 't1' ? 't1_country' : 't2_country')} size={14} />}
              <span
                className={`text-left font-bold ${(get(`${setPrefix}_${teamSuffix}_team_label`) || '').length > 5 ? 'text-[10px]' : 'text-[15px]'}`}
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
            <div className="border-t border-black">{TimeOutLabelBox}</div>
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
    const teamUp = get(`${prefix}_team_up`) || 'team1';
    const teamDown = get(`${prefix}_team_down`) || 'team2';

    // Determine which team suffix (t1 or t2) corresponds to team_up and team_down
    const teamUpSuffix = teamUp === 'team1' ? 't1' : 't2';
    const teamDownSuffix = teamDown === 'team1' ? 't1' : 't2';

    return (
      <div className="border-2 border-black flex mt-1 mb-1 text-black bg-white" style={{ fontSize: '0.7rem' }}>
        {/* MAIN SCORING AREA */}
        <div className="flex-1 flex flex-col">

          {/* SET HEADER */}
          {renderHeaderRow(setNum, prefix)}

          {/* TEAM UP (Top) Service Order - rows I and III (+ C for coach) */}
          <div className="border-r border-black">
            {renderPlayerRow(prefix, 'I', 'r1')}
            {renderPlayerRow(prefix, 'III', 'r3')}
            {currentMatchData?.match?.hasCoach && renderCoachRow(prefix, 'rc_up')}
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

          {/* TEAM DOWN (Bottom) Service Order (With Top Border) - rows II and IV (+ C for coach) */}
          <div className="border-t border-black border-r">
            {renderPlayerRow(prefix, 'II', 'r2')}
            {renderPlayerRow(prefix, 'IV', 'r4')}
            {currentMatchData?.match?.hasCoach && renderCoachRow(prefix, 'rc_down')}
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

  // Auto-refresh every 3 seconds by requesting fresh data from parent window
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'REQUEST_SCORESHEET_REFRESH' }, '*');
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Manual refresh handler
  const handleManualRefresh = () => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'REQUEST_SCORESHEET_REFRESH' }, '*');
    }
  };

  return (
    <div className="mx-auto text-black">
      {/* Floating refresh button - hidden when printing */}
      <button
        onClick={handleManualRefresh}
        className="fixed top-2 right-2 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg print:hidden cursor-pointer"
        title="Refresh scoresheet"
        style={{ fontSize: '18px' }}
      >
        &#x21bb;
      </button>
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
          <span className="text-[9px]">openBeach eScoresheet</span>
        </div>

        {/* METADATA ROWS */}
        <div className="border border-black mb-2">
          {/* Row 1 */}
          <div className="flex items-center px-1 py-1 border-b border-black h-5">
            <span className="text-[9px] w-28 text-black">Name of Competition:</span>
            <Input value={get('competition')} onChange={v => set('competition', v)} className="flex-1 text-left px-1 text-sm font-bold text-black" />

          </div>

          {/* Row 2 */}
          <div className="flex items-center text-[9px] h-5 divide-x divide-black text-black border-t border-black">
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
            {/* Height: 106px without coach, ~148px with coach (extra row + signature) */}
            <div className={`border-2 border-black flex ${currentMatchData?.match?.hasCoach ? 'h-[148px]' : 'h-[114px]'}`}>
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
                <div className="flex text-[9px] h-4 border-b border-black">
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
                {/* Coach row - only when hasCoach */}
                {currentMatchData?.match?.hasCoach && (
                  <div className="flex text-[9px] h-5">
                    <div className="w-6 border border-t-0 border-black" style={centerStyle}><span className="text-[8px] font-bold">C</span></div>
                    <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t1_coach_name')} onChange={v => set('b_t1_coach_name', v)} className="w-full px-1" style={{ textAlign: 'left' }} /></div>
                  </div>
                )}
                <div className="text-[4px]" style={{ height: '8px', lineHeight: '8px' }}>Captain's pre-match signature:</div>
                {/* Signature image for Team 1 Captain */}
                <div className="flex-1" style={{ minHeight: currentMatchData?.match?.hasCoach ? '12px' : '20px', overflow: 'hidden' }}>
                  {currentMatchData?.match?.team1CaptainSignature && (
                    <img
                      src={currentMatchData.match.team1CaptainSignature}
                      alt=""
                      crossOrigin="anonymous"
                      style={{ width: '100%', maxWidth: '120px', height: '100%', maxHeight: currentMatchData?.match?.hasCoach ? '12px' : '20px', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>
                {/* Coach signature - only when hasCoach */}
                {currentMatchData?.match?.hasCoach && (
                  <>
                    <div className="text-[4px]" style={{ height: '8px', lineHeight: '8px' }}>Coach's pre-match signature:</div>
                    <div className="flex-1" style={{ minHeight: '12px', overflow: 'hidden' }}>
                      {currentMatchData?.match?.team1CoachSignature && (
                        <img
                          src={currentMatchData.match.team1CoachSignature}
                          alt=""
                          crossOrigin="anonymous"
                          style={{ width: '100%', maxWidth: '120px', height: '100%', maxHeight: '12px', objectFit: 'contain' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                    </div>
                  </>
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
                {/* Coach row - only when hasCoach */}
                {currentMatchData?.match?.hasCoach && (
                  <div className="flex text-[9px] h-5">
                    <div className="w-6 border border-t-0 border-black" style={centerStyle}><span className="text-[8px] font-bold">C</span></div>
                    <div className="flex-1 border border-l-0 border-t-0 border-black"><Input value={get('b_t2_coach_name')} onChange={v => set('b_t2_coach_name', v)} className="w-full px-1" style={{ textAlign: 'left' }} /></div>
                  </div>
                )}
                <div className="text-[4px]" style={{ height: '8px', lineHeight: '8px' }}>Captain's pre-match signature:</div>
                {/* Signature image for Team 2 Captain */}
                <div className="flex-1" style={{ minHeight: currentMatchData?.match?.hasCoach ? '12px' : '20px', overflow: 'hidden' }}>
                  {currentMatchData?.match?.team2CaptainSignature && (
                    <img
                      src={currentMatchData.match.team2CaptainSignature}
                      alt=""
                      crossOrigin="anonymous"
                      style={{ width: '100%', maxWidth: '120px', height: '100%', maxHeight: currentMatchData?.match?.hasCoach ? '12px' : '20px', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>
                {/* Coach signature - only when hasCoach */}
                {currentMatchData?.match?.hasCoach && (
                  <>
                    <div className="text-[4px]" style={{ height: '8px', lineHeight: '8px' }}>Coach's pre-match signature:</div>
                    <div className="flex-1" style={{ minHeight: '12px', overflow: 'hidden' }}>
                      {currentMatchData?.match?.team2CoachSignature && (
                        <img
                          src={currentMatchData.match.team2CoachSignature}
                          alt=""
                          crossOrigin="anonymous"
                          style={{ width: '100%', maxWidth: '120px', height: '100%', maxHeight: '12px', objectFit: 'contain' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                    </div>
                  </>
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
                <div className="flex h-6 px-1 items-center bg-gray-400 text-xs leading-none">
                  <span className="font-bold mr-2 shrink-0">Winning team</span>
                  <Input value={get('winner_name')} onChange={v => set('winner_name', v)} className="flex-1 text-left font-bold text-xs" style={{ padding: 0, height: '100%' }} />
                  <Input value={get('winner_country')} onChange={v => set('winner_country', v)} className="w-12 text-center font-bold text-[10px] ml-2" style={{ padding: 0, height: '100%' }} />
                  <div className="ml-4 font-bold text-sm flex items-center shrink-0 gap-0.5">
                    <span>2</span>
                    <span>:</span>
                    <Input value={get('win_score_other')} onChange={v => set('win_score_other', v)} className="w-4 text-sm" style={{ padding: 0 }} />
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
              <table className="flex-1 border-separate text-[8px] h-full" style={{ borderSpacing: 0, tableLayout: 'fixed', width: '100%' }}>
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
                      {currentMatchData?.match?.team1PostGameCaptainSignature && (
                        <div style={{ maxHeight: '22px', overflow: 'hidden' }}>
                          <img
                            src={currentMatchData.match.team1PostGameCaptainSignature}
                            alt=""
                            crossOrigin="anonymous"
                            style={{ width: '100%', maxWidth: '120px', height: 'auto', maxHeight: '22px', objectFit: 'contain' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </td>
                    <td colSpan={2} className="p-0 align-top" style={{ height: '30px', overflow: 'hidden', paddingLeft: '2px' }}>
                      <span className="text-[4px]">Captain's post-match signature</span>
                      {currentMatchData?.match?.team2PostGameCaptainSignature && (
                        <div style={{ maxHeight: '22px', overflow: 'hidden' }}>
                          <img
                            src={currentMatchData.match.team2PostGameCaptainSignature}
                            alt=""
                            crossOrigin="anonymous"
                            style={{ width: '100%', maxWidth: '120px', height: 'auto', maxHeight: '22px', objectFit: 'contain' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
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
                <div key={team} className={`flex items-stretch box-border border-t border-black`}>
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
                  <div className="flex items-center gap-1">
                    <span className="font-bold">Winner of Coin Toss:</span>
                    <span>A or B</span>
                    <span className="ml-2">Set 1</span>
                    <ABCircle value={get('coin_s1')} onChange={v => set('coin_s1', v)} size={16} />
                    <span className="ml-2">Set 3</span>
                    <ABCircle value={get('coin_s3')} onChange={v => set('coin_s3', v)} size={16} />
                  </div>

                  {/* Improper Request */}
                  <div className="flex items-center gap-1">
                    <span className="font-bold">Improper request:</span>
                    <ABCircle value={get('improper_a')} onChange={v => set('improper_a', v)} size={16} />
                    <ABCircle value={get('improper_b')} onChange={v => set('improper_b', v)} size={16} />
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ================= BMP SHEET PAGES (Page 3+) ================= */}
      {(() => {
        const totalBMPs = Number(get('bmp_total_count')) || 0;
        const bmpPagesNeeded = Math.max(1, Math.ceil(totalBMPs / 16));

        return Array.from({ length: bmpPagesNeeded }).map((_, pageIndex) => {
          const startRow = pageIndex * 16;
          const isLastPage = pageIndex === bmpPagesNeeded - 1;

          return (
            <React.Fragment key={`bmp-page-${pageIndex}`}>
              {/* Gap between pages - hidden in print */}
              <div className="page-gap" style={{ height: '20mm', width: '100%' }}></div>

              <div
                ref={pageIndex === 0 ? page3Ref : undefined}
                id={`page-${3 + pageIndex}`}
                className={`page-boundary page-${3 + pageIndex} flex flex-col bg-white mx-auto`}
                style={{
                  width: '277mm',
                  height: '190mm',
                  padding: '2mm',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                {/* TITLE */}
                <div className="text-center mb-2">
                  <h1 className="text-lg font-bold text-black">Ball Mark Protocol Remark Form{bmpPagesNeeded > 1 ? ` (${pageIndex + 1}/${bmpPagesNeeded})` : ''}</h1>
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
                      <div className="text-center leading-tight">Team serving<br />(at time of request)</div>
                    </div>
                    <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
                      <div className="text-center leading-tight">Request by<br />(A / B / Ref)</div>
                    </div>
                    <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
                      <div className="text-center leading-tight">BMP request<br />Outcome</div>
                    </div>
                    <div style={{ width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="border-r border-black py-2">
                      <div className="text-center leading-tight">Team serving<br />(after decision)</div>
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

                  {/* Rows - 16 rows per page */}
                  <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
                    {Array.from({ length: 16 }).map((_, rowIndex) => {
                      const i = startRow + rowIndex;
                      const cellStyle = { width: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center' };
                      const outcomeValue = get(`bmp_${i}_outcome`);
                      const requestBy = get(`bmp_${i}_request`);
                      const isRefRequest = requestBy?.toLowerCase()?.includes('ref');

                      // Outcome selector values
                      // Team-requested BMPs: SUC, UNSUC, MUNAV
                      // Referee-requested BMPs: IN, OUT
                      const teamOutcomes = ['', 'UNSUC', 'SUC', 'MUNAV'];
                      const refOutcomes = ['', 'IN', 'OUT'];
                      const outcomes = isRefRequest ? refOutcomes : teamOutcomes;

                      return (
                        <div key={i} className={`flex text-[9px] flex-1 min-h-0 ${rowIndex < 15 ? 'border-b border-black' : ''}`}>
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

                {/* SIGNATURES - only on last page */}
                {isLastPage && (
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
                )}
              </div>
            </React.Fragment>
          );
        });
      })()}
    </div>
  );
}