import io
import os
import csv
import base64
import numpy as np
import xarray as xr
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pystac_client
import planetary_computer
from odc.stac import load
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image
from datetime import datetime, timedelta
import diskcache as dc
import asyncio
import uuid
from typing import Dict, Any, List
from scipy.ndimage import median_filter

app = FastAPI()

# Read CORS from ENV
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
TILE_SIZE_DEG = 0.05
MAX_CONCURRENT_WORKERS = 4
SAFE_RESOLUTION_DEG = 0.0005 # ~55m
HIGH_RES_DEG = 0.0001 # ~11m
NDVI_THRESHOLD = 0.05

class AnalyzeRequest(BaseModel):
    bbox: list[float]  # [min_lon, min_lat, max_lon, max_lat]
    before_date: str   # YYYY-MM-DD
    after_date: str    # YYYY-MM-DD
    safe_mode: bool = True

catalog = pystac_client.Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1",
    modifier=planetary_computer.sign_inplace,
)

cache = dc.Cache("terrawatch_cache")
tile_queue = asyncio.Queue()

# --- Helpers ---
def get_best_item(bbox, date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    dt_end = dt + timedelta(days=30)
    time_range = f"{dt.strftime('%Y-%m-%d')}/{dt_end.strftime('%Y-%m-%d')}"
    
    # 1. Check STAC Metadata cache to skip redundant API queries
    bbox_rounded = [round(c, 3) for c in bbox]
    stac_cache_key = f"stac_{bbox_rounded}_{time_range}"
    if stac_cache_key in cache:
        item_dict = cache[stac_cache_key]
        if item_dict is None:
            return None
        return pystac_client.Item.from_dict(item_dict)

    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=time_range,
    )
    items = list(search.items())
    if not items:
        cache[stac_cache_key] = None
        return None
        
    items.sort(key=lambda x: x.properties.get("eo:cloud_cover", 100))
    best_item = items[0]
    
    # Save to cache
    cache[stac_cache_key] = best_item.to_dict()
    return best_item

def split_bbox_into_tiles(bbox: list[float], tile_size: float) -> list[dict]:
    min_lon, min_lat, max_lon, max_lat = bbox
    tiles = []
    index = 0
    curr_lon = min_lon
    while curr_lon < max_lon:
        curr_lat = min_lat
        next_lon = min(curr_lon + tile_size, max_lon)
        while curr_lat < max_lat:
            next_lat = min(curr_lat + tile_size, max_lat)
            tiles.append({
                "index": index,
                "bbox": [curr_lon, curr_lat, next_lon, next_lat]
            })
            index += 1
            curr_lat += tile_size
        curr_lon += tile_size
    return tiles

def process_tile_task(tile_bbox, before_date, after_date, safe_mode):
    res_deg = SAFE_RESOLUTION_DEG if safe_mode else HIGH_RES_DEG
    
    item_before = get_best_item(tile_bbox, before_date)
    item_after = get_best_item(tile_bbox, after_date)
    
    if not item_before or not item_after:
         return {"error": "No imagery found for this tile."}
    
    try:
        ds_before = load([item_before], bbox=tile_bbox, bands=["red", "nir"], resolution=res_deg, crs="EPSG:4326").compute()
        ds_after = load([item_after], geobox=ds_before.odc.geobox, bands=["red", "nir"]).compute()
    except Exception as e:
        return {"error": f"Failed to load data: {str(e)}"}
        
    before = ds_before.squeeze()
    after = ds_after.squeeze()
    
    def calc_ndvi(ds):
        nir = ds.nir.astype(float)
        red = ds.red.astype(float)
        ndvi = (nir - red) / (nir + red + 1e-8)
        return ndvi
        
    ndvi_before = calc_ndvi(before)
    ndvi_after = calc_ndvi(after)
    diff = (ndvi_after - ndvi_before).values
    
    # Noise Reduction & Filtering
    nan_mask = np.isnan(diff)
    diff[nan_mask] = 0.0
    
    # Hard thresholding
    diff[np.abs(diff) < NDVI_THRESHOLD] = 0.0
    
    # Median filter to remove isolated speckles (clouds/shadows)
    diff = median_filter(diff, size=3)
    
    diff[nan_mask] = np.nan
    
    colors = [(1, 0, 0, 1.0), (1, 0, 0, 0.6), (0, 0, 0, 0), (0, 1, 0, 0.6), (0, 1, 0, 1.0)]
    cmap = LinearSegmentedColormap.from_list("diff_cmap", colors, N=256)
    
    norm_diff = np.clip((diff + 0.5) / 1.0, 0, 1)
    rgba = cmap(norm_diff)
    
    mask = (np.abs(diff) < NDVI_THRESHOLD) | np.isnan(diff)
    rgba[mask, 3] = 0.0
    
    img = Image.fromarray((rgba * 255).astype(np.uint8))
    
    min_lon, min_lat, max_lon, max_lat = tile_bbox
    avg_lat = np.radians((min_lat + max_lat) / 2.0)
    area_sq_km = ((max_lon - min_lon) * 111.0 * np.cos(avg_lat)) * ((max_lat - min_lat) * 111.0)
    
    total_pixels = int(np.sum(~np.isnan(diff)))
    loss_pixels = int(np.sum(diff <= -NDVI_THRESHOLD))
    gain_pixels = int(np.sum(diff >= NDVI_THRESHOLD))
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()
    
    return {
        "status": "success",
        "png_bytes": png_bytes,
        "stats": {
            "total_pixels": total_pixels,
            "loss_pixels": loss_pixels,
            "gain_pixels": gain_pixels,
            "area_sq_km": area_sq_km
        }
    }

async def worker():
    while True:
        task = await tile_queue.get()
        job_id = task["job_id"]
        tile_index = task["tile_index"]
        tile_bbox = task["tile_bbox"]
        req = task["req"]
        
        job = cache.get(job_id)
        if not job:
            tile_queue.task_done()
            continue
            
        bbox_rounded = [round(c, 3) for c in tile_bbox]
        cache_key = f"tile_{bbox_rounded}_{req.before_date}_{req.after_date}_{req.safe_mode}"
        
        try:
            if cache_key in cache:
                print(f"Cache hit for tile {tile_index}")
                result = cache[cache_key]
            else:
                print(f"Processing tile {tile_index} via STAC")
                result = await asyncio.to_thread(process_tile_task, tile_bbox, req.before_date, req.after_date, req.safe_mode)
                if result.get("status") == "success":
                    cache[cache_key] = result
            
            # Must refetch job in case it was updated by another worker
            job = cache.get(job_id)
            if not job:
                continue

            if result.get("status") == "success":
                job["completed_tiles"].append(tile_index)
                
                st = result["stats"]
                job["stats"]["total_pixels"] += st["total_pixels"]
                job["stats"]["loss_pixels"] += st["loss_pixels"]
                job["stats"]["gain_pixels"] += st["gain_pixels"]
                job["stats"]["total_area_km2"] += st["area_sq_km"]
                
                job["tile_keys"][tile_index] = cache_key
            else:
                job["failed_tiles"].append(tile_index)
                
            # Update cache
            if len(job["completed_tiles"]) + len(job["failed_tiles"]) == job["total_tiles"]:
                job["status"] = "completed"
            
            cache.set(job_id, job)
                
        except Exception as e:
            # Need to lock/refetch
            job = cache.get(job_id)
            if job:
                job["failed_tiles"].append(tile_index)
                cache.set(job_id, job)
            print(f"Worker error on tile {tile_index}: {e}")
            
        finally:
            tile_queue.task_done()

@app.on_event("startup")
async def startup_event():
    for _ in range(MAX_CONCURRENT_WORKERS):
        asyncio.create_task(worker())
    
    # Re-queue incomplete jobs on startup to ensure robustness
    # For a true production system, you'd iterate over `cache` for incomplete jobs
    pass

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    dt_before = datetime.strptime(req.before_date, "%Y-%m-%d")
    dt_after = datetime.strptime(req.after_date, "%Y-%m-%d")
    if dt_after <= dt_before:
        raise HTTPException(status_code=400, detail="The 'After Date' must be strictly later than the 'Before Date'.")
        
    tiles = split_bbox_into_tiles(req.bbox, TILE_SIZE_DEG)
    if not tiles:
        raise HTTPException(status_code=400, detail="Invalid bounding box.")
        
    job_id = f"job_{str(uuid.uuid4())}"
    
    job_state = {
        "id": job_id,
        "status": "processing",
        "total_tiles": len(tiles),
        "completed_tiles": [],
        "failed_tiles": [],
        "tile_keys": {},
        "tiles_meta": tiles,
        "stats": {
            "total_pixels": 0,
            "loss_pixels": 0,
            "gain_pixels": 0,
            "total_area_km2": 0.0
        }
    }
    cache.set(job_id, job_state)
    
    for t in tiles:
        await tile_queue.put({
            "job_id": job_id,
            "tile_index": t["index"],
            "tile_bbox": t["bbox"],
            "req": req
        })
        
    return {
        "job_id": job_id,
        "total_tiles": len(tiles),
        "tiles": tiles
    }

@app.get("/result/{job_id}")
async def get_result(job_id: str):
    job = cache.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    s = job["stats"]
    pct_loss = (s["loss_pixels"] / s["total_pixels"] * 100) if s["total_pixels"] > 0 else 0
    pct_gain = (s["gain_pixels"] / s["total_pixels"] * 100) if s["total_pixels"] > 0 else 0
    area_affected = (s["loss_pixels"] + s["gain_pixels"]) / s["total_pixels"] * s["total_area_km2"] if s["total_pixels"] > 0 else 0
    
    return {
        "job_id": job_id,
        "status": job["status"],
        "total_tiles": job["total_tiles"],
        "completed_tiles": job["completed_tiles"],
        "failed_tiles": job["failed_tiles"],
        "stats": {
            "percent_loss": round(pct_loss, 1),
            "percent_gain": round(pct_gain, 1),
            "area_affected_km2": round(area_affected, 2),
            "total_area_km2": round(s["total_area_km2"], 2)
        }
    }

@app.get("/tile/{job_id}/{tile_index}")
async def get_tile_image(job_id: str, tile_index: int):
    job = cache.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    cache_key = job["tile_keys"].get(tile_index)
    if not cache_key:
        raise HTTPException(status_code=404, detail="Tile not ready or not found.")
        
    result = cache.get(cache_key)
    if not result or "png_bytes" not in result:
        raise HTTPException(status_code=404, detail="Tile image missing from cache.")
        
    return Response(content=result["png_bytes"], media_type="image/png")

@app.get("/export/{job_id}")
async def export_job(job_id: str):
    job = cache.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job is not completed yet.")
        
    def iter_csv():
        yield "tile_index,min_lon,min_lat,max_lon,max_lat,loss_pixels,gain_pixels,area_sq_km\n"
        for t in job["tiles_meta"]:
            idx = t["index"]
            cache_key = job["tile_keys"].get(idx)
            if cache_key:
                res = cache.get(cache_key)
                if res and "stats" in res:
                    st = res["stats"]
                    yield f'{idx},{t["bbox"][0]},{t["bbox"][1]},{t["bbox"][2]},{t["bbox"][3]},{st["loss_pixels"]},{st["gain_pixels"]},{st["area_sq_km"]}\n'
    
    return StreamingResponse(iter_csv(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=terrawatch_{job_id}.csv"})
