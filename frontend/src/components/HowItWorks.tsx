"use client";

import { useState } from 'react';
import { HelpCircle, X, Map, Layers, Zap, Info } from 'lucide-react';

import { PRESETS } from './ControlPanel';

export function HowItWorks({ onLoadPreset }: any) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="how-it-works-toggle"
        title="How It Works"
      >
        <HelpCircle size={22} />
      </button>

      {isOpen && (
        <div className="how-it-works-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div className="how-it-works-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Welcome to TerraWatch</h2>
              <button onClick={() => setIsOpen(false)} className="close-btn">
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="info-section">
                <div className="info-icon"><Map size={20} /></div>
                <div className="info-text">
                  <h3>1. Select a Region</h3>
                  <p>Draw a bounding box anywhere in the world to analyze how the environment has changed.</p>
                </div>
              </div>

              <div className="info-section">
                <div className="info-icon"><Layers size={20} /></div>
                <div className="info-text">
                  <h3>2. Powerful Tile Analytics</h3>
                  <p>TerraWatch automatically splits massive geographic regions into smaller tiles, downloading real Sentinel-2 satellite data and caching it for high-speed exploration.</p>
                </div>
              </div>

              <div className="info-section" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px', marginTop: '8px' }}>
                <div className="info-text" style={{ width: '100%' }}>
                  <h3 style={{ marginBottom: '16px', color: '#58a6ff' }}>Not sure where to start? Try an example:</h3>
                  <div className="preset-chips" style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      className="preset-chip" 
                      onClick={() => { onLoadPreset(PRESETS.amazon); setIsOpen(false); }}
                      style={{ padding: '10px 16px', fontSize: '13px' }}
                    >
                      Amazon Deforestation
                    </button>
                    <button 
                      className="preset-chip" 
                      onClick={() => { onLoadPreset(PRESETS.california); setIsOpen(false); }}
                      style={{ padding: '10px 16px', fontSize: '13px' }}
                    >
                      California Wildfires
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
