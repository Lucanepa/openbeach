import React from 'react';
import OpenbeachScoresheet from './components_beach/eScoresheet_beach';

export default function App({ matchData }: { matchData?: any }) {
  return (
    <div className="flex justify-center p-4">
      <div className="overflow-auto">
        <OpenbeachScoresheet matchData={matchData} />
      </div>
    </div>
  );
}

