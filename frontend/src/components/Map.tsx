"use client";

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, FeatureGroup, ImageOverlay, Rectangle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetinaUrl,
  iconUrl: iconUrl,
  shadowUrl: shadowUrl,
});

interface MapProps {
  bbox: number[] | null;
  onBboxChange: (bbox: number[] | null) => void;
  jobId: string | null;
  tilesMeta: any[];
  completedTiles: number[];
  isLoading: boolean;
}

function MapUpdater({ bbox, featureGroupRef }: any) {
  const map = useMap();
  
  useEffect(() => {
    if (bbox && featureGroupRef.current) {
      const bounds = L.latLngBounds(
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]]
      );
      
      const layers = featureGroupRef.current.getLayers();
      let alreadyExists = false;
      if (layers.length > 0) {
        const existingBounds = layers[0].getBounds();
        if (existingBounds.equals(bounds, 0.001)) {
          alreadyExists = true;
        }
      }
      
      if (!alreadyExists) {
        featureGroupRef.current.clearLayers();
        const rect = L.rectangle(bounds, { color: '#58a6ff', weight: 2 });
        featureGroupRef.current.addLayer(rect);
        map.flyToBounds(bounds, { duration: 1.5, padding: [50, 50] });
      }
    } else if (!bbox && featureGroupRef.current) {
      featureGroupRef.current.clearLayers();
    }
  }, [bbox, map, featureGroupRef]);
  
  return null;
}

function DrawControl({ onBboxChange, featureGroupRef, isLoading }: any) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    
    const drawnItems = featureGroupRef.current;
    if (!drawnItems) return;
    
    if (isLoading) {
      if ((map as any).drawControl) {
        map.removeControl((map as any).drawControl);
        (map as any).drawControl = null;
      }
      return;
    }
    
    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polyline: false,
        polygon: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: {
          shapeOptions: { color: '#58a6ff', weight: 2 }
        }
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });

    (map as any).drawControl = drawControl;
    map.addControl(drawControl);

    const onDrawCreated = (e: any) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);
      
      const bounds = layer.getBounds();
      const newBbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      onBboxChange(newBbox);
    };

    const onDrawEdited = (e: any) => {
      e.layers.eachLayer((layer: any) => {
        const bounds = layer.getBounds();
        const newBbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        onBboxChange(newBbox);
      });
    };

    const onDrawDeleted = () => {
      onBboxChange(null);
    };

    map.on(L.Draw.Event.CREATED, onDrawCreated);
    map.on(L.Draw.Event.EDITED, onDrawEdited);
    map.on(L.Draw.Event.DELETED, onDrawDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, onDrawCreated);
      map.off(L.Draw.Event.EDITED, onDrawEdited);
      map.off(L.Draw.Event.DELETED, onDrawDeleted);
      if ((map as any).drawControl) {
        map.removeControl((map as any).drawControl);
      }
    };
  }, [map, onBboxChange, featureGroupRef, isLoading]);

  return null;
}

export default function Map({ bbox, onBboxChange, jobId, tilesMeta, completedTiles, isLoading }: MapProps) {
  const featureGroupRef = useRef<any>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  return (
    <MapContainer 
      center={[39.8283, -98.5795]} 
      zoom={4} 
      style={{ height: '100%', width: '100%', zIndex: 0 }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        maxZoom={20}
      />
      
      <FeatureGroup ref={featureGroupRef}>
        <DrawControl onBboxChange={onBboxChange} featureGroupRef={featureGroupRef} isLoading={isLoading} />
      </FeatureGroup>

      <MapUpdater bbox={bbox} featureGroupRef={featureGroupRef} />

      {tilesMeta.map((tile: any) => {
        const isCompleted = completedTiles.includes(tile.index);
        const bounds: L.LatLngBoundsExpression = [
          [tile.bbox[1], tile.bbox[0]],
          [tile.bbox[3], tile.bbox[2]]
        ];
        
        if (isCompleted && jobId) {
          return (
            <ImageOverlay
              key={`img-${tile.index}`}
              url={`${API_URL}/tile/${jobId}/${tile.index}`}
              bounds={bounds}
              opacity={0.85}
              className="fade-in-tile"
            />
          );
        } else {
          return (
            <Rectangle
              key={`rect-${tile.index}`}
              bounds={bounds}
              pathOptions={{ color: 'rgba(255,255,255,0.4)', weight: 1, fillOpacity: 0.05, dashArray: '4' }}
            />
          );
        }
      })}
    </MapContainer>
  );
}
