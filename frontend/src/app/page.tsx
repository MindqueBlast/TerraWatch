"use client";

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { ControlPanel } from '../components/ControlPanel';
import { HowItWorks } from '../components/HowItWorks';

const MapWithNoSSR = dynamic(() => import('../components/Map'), { ssr: false });

export default function Home() {
  const [bbox, setBbox] = useState<number[] | null>(null);
  const [beforeDate, setBeforeDate] = useState<string>('2023-01-01');
  const [afterDate, setAfterDate] = useState<string>('2023-06-01');
  const [safeMode, setSafeMode] = useState<boolean>(true);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [tilesMeta, setTilesMeta] = useState<any[]>([]);
  const [completedTiles, setCompletedTiles] = useState<number[]>([]);
  const [resultStats, setResultStats] = useState<any>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && isLoading) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/result/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setCompletedTiles(data.completed_tiles);
            setResultStats(data.stats);
            if (data.status === "completed") {
              setIsLoading(false);
            }
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [jobId, isLoading]);

  const handleLoadPreset = (preset: any) => {
    setBbox(preset.bbox);
    setBeforeDate(preset.beforeDate);
    setAfterDate(preset.afterDate);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!bbox) return;
    
    if (new Date(afterDate) <= new Date(beforeDate)) {
      setError("The 'After Date' must be strictly later than the 'Before Date'.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setJobId(null);
    setTilesMeta([]);
    setCompletedTiles([]);
    setResultStats(null);

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bbox, before_date: beforeDate, after_date: afterDate, safe_mode: safeMode
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Analysis failed');
      }

      const data = await response.json();
      setJobId(data.job_id);
      setTilesMeta(data.tiles);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      setIsLoading(false);
    }
  };

  return (
    <main>
      <HowItWorks onLoadPreset={handleLoadPreset} />
      <div className="map-container">
        <MapWithNoSSR 
          bbox={bbox}
          onBboxChange={(newBbox) => {
            setBbox(newBbox);
            setError(null);
            setJobId(null);
            setTilesMeta([]);
            setCompletedTiles([]);
            setResultStats(null);
          }} 
          jobId={jobId}
          tilesMeta={tilesMeta}
          completedTiles={completedTiles}
          isLoading={isLoading}
        />
      </div>
      <ControlPanel
        beforeDate={beforeDate} setBeforeDate={setBeforeDate}
        afterDate={afterDate} setAfterDate={setAfterDate}
        safeMode={safeMode} setSafeMode={setSafeMode}
        onAnalyze={handleAnalyze}
        onLoadPreset={handleLoadPreset}
        isLoading={isLoading}
        stats={resultStats}
        error={error}
        hasBbox={!!bbox}
        bbox={bbox}
        totalTiles={tilesMeta.length}
        completedCount={completedTiles.length}
        jobId={jobId}
      />
    </main>
  );
}
