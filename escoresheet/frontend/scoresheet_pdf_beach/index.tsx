import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Helper function to send errors to parent window
const sendErrorToParent = (error: Error | string, details?: string) => {
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'SCORESHEET_ERROR',
        error: typeof error === 'string' ? error : error.message,
        details: details || (error instanceof Error ? error.stack : ''),
        stack: error instanceof Error ? error.stack : undefined
      }, '*');
    }
  } catch (e) {
    console.error('Failed to send error to parent:', e);
  }
};

// Global error handler
window.addEventListener('error', (event) => {
  sendErrorToParent(event.error || new Error(event.message), event.filename + ':' + event.lineno);
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  sendErrorToParent(error);
});

// Load match data from sessionStorage
const loadMatchData = () => {
  try {
    const dataStr = sessionStorage.getItem('scoresheetData');
    
    if (!dataStr) {
      // No data available - show empty scoresheet
      console.warn('[Scoresheet Load] No scoresheet data in sessionStorage');
      return null;
    }
    
    const data = JSON.parse(dataStr);
    console.debug('[Scoresheet Load] Loaded data:', {
      hasData: !!data,
      match: data?.match ? {
        id: data.match.id,
        coinTossTeamA: data.match.coinTossTeamA,
        coinTossTeamB: data.match.coinTossTeamB,
        coinTossData: data.match.coinTossData,
        team1Country: data.match.team1Country,
        team2Country: data.match.team2Country,
        team_1Country: data.match.team_1Country,
        team_2Country: data.match.team_2Country
      } : null,
      team1Team: data?.team_1Team ? {
        name: data.team_1Team.name,
        country: data.team_1Team.country
      } : null,
      team2Team: data?.team_2Team ? {
        name: data.team_2Team.name,
        country: data.team_2Team.country
      } : null,
      team1Players: (data?.team1Players || data?.team_1Players)?.map(p => ({
        number: p.number,
        firstName: p.firstName,
        lastName: p.lastName,
        isCaptain: p.isCaptain
      })) || [],
      team2Players: (data?.team2Players || data?.team_2Players)?.map(p => ({
        number: p.number,
        firstName: p.firstName,
        lastName: p.lastName,
        isCaptain: p.isCaptain
      })) || [],
      team1TeamData: data?.team1Team || data?.team_1Team,
      team2TeamData: data?.team2Team || data?.team_2Team,
      setsCount: data?.sets?.length || 0,
      eventsCount: data?.events?.length || 0,
      fullData: data // Include full data for deep inspection
    });
    
    // Don't remove sessionStorage immediately - let the component use it first
    // It will be cleaned up after PDF generation
    
    // Return data (including test matches for now to allow debugging)
    return data;
  } catch (error) {
    console.error('[Scoresheet Load] Error loading scoresheet data:', error);
    sendErrorToParent(error instanceof Error ? error : new Error(String(error)));
    return null; // Return null on error - show empty scoresheet
  }
};

const matchData = loadMatchData();

const rootElement = document.getElementById('root');
if (!rootElement) {
  const error = new Error("Could not find root element to mount to");
  sendErrorToParent(error);
  throw error;
}

const root = ReactDOM.createRoot(rootElement);

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Scoresheet Error Boundary caught:', error, errorInfo);
    // Fix: Ensure the errorInfo.componentStack is a string and not null/undefined
    sendErrorToParent(error, errorInfo.componentStack ?? undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh',
          flexDirection: 'column',
          gap: '20px',
          fontFamily: "'Inter', sans-serif",
          padding: '20px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
            Scoresheet Error
          </div>
          <div style={{ color: '#666', textAlign: 'center', maxWidth: '600px' }}>
            {this.state.error?.message || 'An error occurred while rendering the scoresheet'}
          </div>
          {this.state.error?.stack && (
            <details style={{ 
              width: '100%', 
              maxWidth: '800px',
              background: '#1e293b',
              padding: '12px',
              borderRadius: '6px',
              color: '#cbd5e1',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button 
            onClick={() => window.close()}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Close Window
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

try {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App matchData={matchData} />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Error rendering scoresheet:', error);
  sendErrorToParent(error instanceof Error ? error : new Error(String(error)));
  root.render(
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      flexDirection: 'column',
      gap: '20px',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
        Rendering Error
      </div>
      <div style={{ color: '#666' }}>
        {error instanceof Error ? error.message : String(error)}
      </div>
      <button 
        onClick={() => window.close()}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        Close Window
      </button>
    </div>
  );
}

