"use client";

import { Activity, AlertTriangle, Info, Loader2, Download, MapPin, Calendar, CheckCircle, Search, Layers } from "lucide-react";

export const PRESETS = {
  amazon: {
    name: "Amazon Deforestation",
    bbox: [-63.2, -9.1, -62.8, -8.7],
    beforeDate: "2019-07-01",
    afterDate: "2023-07-01"
  },
  california: {
    name: "California Wildfire",
    bbox: [-121.5, 39.5, -121.1, 39.9],
    beforeDate: "2020-07-01",
    afterDate: "2021-10-01"
  },
  aral: {
    name: "Aral Sea Shrinkage",
    bbox: [59.0, 44.5, 60.5, 45.5],
    beforeDate: "2018-08-01",
    afterDate: "2023-08-01"
  }
};

interface ControlPanelProps {
  beforeDate: string;
  setBeforeDate: (date: string) => void;
  afterDate: string;
  setAfterDate: (date: string) => void;
  safeMode: boolean;
  setSafeMode: (safe: boolean) => void;
  onAnalyze: () => void;
  onLoadPreset: (preset: any) => void;
  isLoading: boolean;
  stats: any;
  error: string | null;
  hasBbox: boolean;
  bbox: number[] | null;
  totalTiles: number;
  completedCount: number;
  jobId: string | null;
}

export function ControlPanel({
  beforeDate, setBeforeDate,
  afterDate, setAfterDate,
  safeMode, setSafeMode,
  onAnalyze,
  onLoadPreset,
  isLoading,
  stats,
  error,
  hasBbox,
  bbox,
  totalTiles,
  completedCount,
  jobId
}: ControlPanelProps) {

  const today = new Date();
  const maxDate = today.toISOString().split('T')[0];
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  
  let approxTiles = 0;
  if (bbox && !isLoading && totalTiles === 0) {
    const w = bbox[2] - bbox[0];
    const h = bbox[3] - bbox[1];
    approxTiles = Math.ceil(w / 0.05) * Math.ceil(h / 0.05);
  }

  const isCompleted = stats && totalTiles > 0 && completedCount === totalTiles && !isLoading;

  return (
    <div className="control-panel glass-panel">
      <div className="panel-header">
        <h1>TerraWatch</h1>
        <p>Earth Intelligence Dashboard</p>
      </div>

      <div className="workflow-steps">
        {/* Step 1: Region */}
        <div className="step-container">
          <div className="step-header">
            <div className={`step-icon ${hasBbox ? 'active' : ''}`}><MapPin size={16} /></div>
            <h3>1. Region Selection</h3>
          </div>
          <div className="step-body">
            {!hasBbox ? (
              <p className="instruction-text">Draw a rectangle on the map, or try an example:</p>
            ) : (
              <p className="success-text">Region successfully selected.</p>
            )}
            
            <div className="preset-chips">
              <button onClick={() => onLoadPreset(PRESETS.amazon)} disabled={isLoading} className="preset-chip">Amazon Rainforest</button>
              <button onClick={() => onLoadPreset(PRESETS.california)} disabled={isLoading} className="preset-chip">California Wildfire</button>
              <button onClick={() => onLoadPreset(PRESETS.aral)} disabled={isLoading} className="preset-chip">Aral Sea</button>
            </div>
          </div>
        </div>

        {/* Step 2: Timeframe */}
        <div className="step-container">
          <div className="step-header">
            <div className="step-icon active"><Calendar size={16} /></div>
            <h3>2. Timeframe</h3>
          </div>
          <div className="step-body date-inputs-row">
            <input 
              type="date" value={beforeDate} max={afterDate || maxDate}
              onChange={(e) => setBeforeDate(e.target.value)} disabled={isLoading}
              className="date-input"
            />
            <span className="date-separator">vs</span>
            <input 
              type="date" value={afterDate} min={beforeDate} max={maxDate}
              onChange={(e) => setAfterDate(e.target.value)} disabled={isLoading}
              className="date-input"
            />
          </div>
        </div>

        {/* Step 3: Analysis */}
        <div className="step-container" style={{ borderBottom: 'none' }}>
          <div className="step-header">
            <div className={`step-icon ${hasBbox ? 'active' : ''}`}><CheckCircle size={16} /></div>
            <h3>3. Processing</h3>
          </div>
          <div className="step-body">
            <div className="options-row">
              <label className="toggle-label" title="Lowers resolution to drastically improve speed and memory">
                <input 
                  type="checkbox" checked={safeMode}
                  onChange={(e) => setSafeMode(e.target.checked)} disabled={isLoading}
                />
                Fast Processing Mode
              </label>
            </div>
            
            <button 
              className={`analyze-btn ${hasBbox ? 'ready' : ''}`} 
              onClick={onAnalyze}
              disabled={isLoading || !hasBbox}
            >
              {isLoading ? (
                <>
                  <Loader2 className="spinner" size={18} />
                  {totalTiles > 0 ? `Processing ${completedCount} / ${totalTiles} tiles` : 'Initializing...'}
                </>
              ) : (
                <>
                  <Search size={18} />
                  Analyze Change
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {approxTiles > 20 && !isLoading && !stats && !error && (
        <div className="alert-box warning">
          <Info size={16} style={{ flexShrink: 0 }} />
          <span>Large region: will process ~{approxTiles} tiles.</span>
        </div>
      )}

      {error && (
        <div className="alert-box error">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {stats && (
        <div className="results-panel fade-in-tile">
          <div className="results-header">
            <Layers size={16} />
            {isLoading ? "Live Data Stream" : "Analysis Complete"}
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Vegetation Loss</div>
              <div className="stat-value loss">{stats.percent_loss}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Vegetation Gain</div>
              <div className="stat-value gain">{stats.percent_gain}%</div>
            </div>
            <div className="stat-card full-width">
              <div className="stat-label">Total Area Affected</div>
              <div className="stat-value neutral">{stats.area_affected_km2} <span className="unit">km²</span></div>
            </div>
          </div>

          {isCompleted && jobId && (
            <a href={`${API_URL}/export/${jobId}`} className="export-btn" download>
              <Download size={16} /> Download CSV Report
            </a>
          )}
        </div>
      )}
    </div>
  );
}
