# TerraWatch: Environmental Change Viewer

<!-- Deployment trigger to force Vercel rebuild -->

TerraWatch is a scalable, production-ready geospatial analytics platform designed to detect and visualize environmental changes using real satellite data. By comparing historical and current satellite imagery, the system highlights areas of vegetation loss (deforestation, droughts, natural disasters) and vegetation gain (regrowth, seasonal changes).

## Key Features

- **Interactive Map Selection:** Draw any bounding box on a global interactive map.
- **Real-Time Satellite Data:** Integrates with Microsoft Planetary Computer to pull Sentinel-2 L2A optical satellite imagery.
- **Real NDVI Change Detection:** Computes the Normalized Difference Vegetation Index (NDVI) to accurately detect living vegetation.
- **Tile-Based Scalability:** Automatically divides massive regions into 5x5 km tiles to prevent server overload and memory limits.
- **Multi-Layer Caching:** Never process the same tile twice. Aggressive disk caching bypasses API limits and recomputation for instant results.
- **Progressive Streaming UI:** Renders tiles to the frontend incrementally without freezing the UI thread.
- **Data Export:** Export detailed CSV statistics mapping vegetation loss/gain for every analyzed tile.

## Architecture Summary

- **Frontend:** Next.js (React), Leaflet (`react-leaflet`), CSS Glassmorphism UI
- **Backend:** Python FastAPI, `pystac-client`, `odc-stac`, `xarray`, `scipy`
- **Processing:** Asynchronous worker queue pattern utilizing an in-memory `asyncio.Queue`
- **State Management:** Stateless job processing backed by `diskcache`, making the backend safe for cloud restarts.

## Performance Design

TerraWatch operates like a lightweight Google Earth Engine. To prevent lag on large regions, the architecture includes:
1. **Tile-Based Scaling:** Massive queries are broken down into granular units. The backend never attempts to load a massive geographic array into memory at once.
2. **Noise Reduction:** A `0.15` NDVI threshold combined with SciPy median filtering eliminates false positives caused by isolated cloud shadows or sensor noise.
3. **Frontend Debouncing & Transitions:** Tile components fade in progressively using CSS animations to keep the main thread smooth.
4. **Concurrency Control:** Background workers are strictly limited (e.g., 4 concurrent tasks) to ensure CPU stability regardless of how many users click "Analyze".

### 3. Production Hosting Notes
- **Backend:** Ensure your hosting provider has sufficient disk space for the `diskcache` directory to retain performance benefits over time. You do not need a Redis instance; the diskcache uses SQLite natively.
- **CORS:** Ensure your backend environment variables correctly whitelist your frontend production domain.
- **Statelessness:** The backend is stateless. Feel free to scale it to multiple instances.
