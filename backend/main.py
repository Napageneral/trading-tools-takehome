import csv
import io
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import sqlite3
import json
import asyncio

from database import get_db, init_db
from schemas import DataPoint, DataPointResponse, TimeRangeRequest

# Initialize the database
init_db()

app = FastAPI(title="Timeseries API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Predefined granularities in nanoseconds
GRANULARITIES_NS = {
    "1s": 1_000_000_000,
    "1m": 60_000_000_000,
    "1h": 3600_000_000_000,
    "1d": 86400_000_000_000
}

@app.get("/")
async def root():
    """Root endpoint to check if the API is running."""
    return {"message": "Timeseries API is running"}

@app.post("/upload")
async def upload_data(file: UploadFile = File(...)):
    """
    Upload a CSV file with columns: Timestamp,Value
    The file can be large, so we use chunk-based ingestion.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    batch_size = 100_000
    batch = []
    total_processed = 0
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Read file line by line
        content = await file.read()
        lines = content.decode('utf-8').splitlines()
        
        # Skip header
        if lines and "Timestamp,Value" in lines[0]:
            lines = lines[1:]
        
        for line in lines:
            parts = line.strip().split(',')
            if len(parts) < 2:
                continue
                
            try:
                ts = int(parts[0])
                val = int(parts[1])
                batch.append((ts, val))
                total_processed += 1
                
                if len(batch) >= batch_size:
                    cursor.executemany(
                        "INSERT INTO data_points (timestamp_ns, value) VALUES (?, ?)",
                        batch
                    )
                    conn.commit()
                    batch = []
            except (ValueError, IndexError):
                continue
        
        # Insert any remaining records
        if batch:
            cursor.executemany(
                "INSERT INTO data_points (timestamp_ns, value) VALUES (?, ?)",
                batch
            )
            conn.commit()
    
    return {"status": "success", "message": f"File uploaded and processed. {total_processed} records inserted."}

@app.get("/data")
async def get_data(
    start_ns: int,
    end_ns: int,
    granularity: Optional[str] = Query(None, description="e.g. '1s','1m','1h','1d'")
):
    """
    Fetch data from start_ns to end_ns.
    If a granularity is provided, downsample the data to that interval.
    """
    if granularity and granularity not in GRANULARITIES_NS:
        raise HTTPException(status_code=400, detail=f"Invalid granularity. Valid options are: {', '.join(GRANULARITIES_NS.keys())}")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # If no downsampling needed, return raw data
        if not granularity:
            cursor.execute(
                "SELECT timestamp_ns, value FROM data_points WHERE timestamp_ns >= ? AND timestamp_ns <= ? ORDER BY timestamp_ns",
                (start_ns, end_ns)
            )
            
            # Convert to list of dictionaries
            result = [{"timestamp_ns": row[0], "value": row[1]} for row in cursor.fetchall()]
            return {"data": result}
        
        # For downsampling, we'll use SQL to group by time buckets
        gran_ns = GRANULARITIES_NS[granularity]
        
        # Using integer division to create buckets
        cursor.execute("""
            SELECT (timestamp_ns / ?) * ? as bucket_start, AVG(value) as avg_value
            FROM data_points
            WHERE timestamp_ns >= ? AND timestamp_ns <= ?
            GROUP BY bucket_start
            ORDER BY bucket_start
        """, (gran_ns, gran_ns, start_ns, end_ns))
        
        # Convert to list of dictionaries
        result = [{"timestamp_ns": int(row[0]), "value": int(row[1])} for row in cursor.fetchall()]
        return {"data": result}

@app.get("/stream")
async def stream_data(start_ns: int, end_ns: int):
    """
    Stream data to the client with chunked responses (Server-Sent Events).
    """
    async def event_generator():
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Use a reasonable chunk size
            chunk_size = 50000
            offset = 0
            
            while True:
                cursor.execute(
                    "SELECT timestamp_ns, value FROM data_points WHERE timestamp_ns >= ? AND timestamp_ns <= ? ORDER BY timestamp_ns LIMIT ? OFFSET ?",
                    (start_ns, end_ns, chunk_size, offset)
                )
                
                chunk = cursor.fetchall()
                if not chunk:
                    break
                
                for row in chunk:
                    yield f"data: {row[0]},{row[1]}\n\n"
                
                offset += chunk_size
                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.01)
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for streaming data.
    Client can request time ranges and receive data in chunks.
    """
    await websocket.accept()
    
    try:
        while True:
            # Wait for a request from the client
            data = await websocket.receive_json()
            
            # Extract parameters
            start_ns = data.get("start_ns", 0)
            end_ns = data.get("end_ns", 0)
            granularity = data.get("granularity")
            
            with get_db() as conn:
                cursor = conn.cursor()
                
                # Handle downsampling if requested
                if granularity and granularity in GRANULARITIES_NS:
                    gran_ns = GRANULARITIES_NS[granularity]
                    
                    cursor.execute("""
                        SELECT (timestamp_ns / ?) * ? as bucket_start, AVG(value) as avg_value
                        FROM data_points
                        WHERE timestamp_ns >= ? AND timestamp_ns <= ?
                        GROUP BY bucket_start
                        ORDER BY bucket_start
                    """, (gran_ns, gran_ns, start_ns, end_ns))
                else:
                    # No downsampling, get raw data
                    cursor.execute(
                        "SELECT timestamp_ns, value FROM data_points WHERE timestamp_ns >= ? AND timestamp_ns <= ? ORDER BY timestamp_ns",
                        (start_ns, end_ns)
                    )
                
                # Send data in chunks to avoid giant messages
                chunk_size = 5000
                results = cursor.fetchall()
                
                for i in range(0, len(results), chunk_size):
                    chunk = results[i:i+chunk_size]
                    # Convert to list of dictionaries
                    msg_chunk = [{"timestamp_ns": row[0], "value": row[1]} for row in chunk]
                    await websocket.send_json(msg_chunk)
                
                # Send an empty chunk to signal the end of data
                await websocket.send_json([])
    
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

@app.get("/stats")
async def get_stats():
    """
    Get basic statistics about the dataset.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get count, min/max timestamps, and min/max values
        cursor.execute("""
            SELECT 
                COUNT(*) as count,
                MIN(timestamp_ns) as min_timestamp,
                MAX(timestamp_ns) as max_timestamp,
                MIN(value) as min_value,
                MAX(value) as max_value
            FROM data_points
        """)
        
        result = cursor.fetchone()
        
        if result:
            return {
                "count": result[0],
                "min_timestamp_ns": result[1],
                "max_timestamp_ns": result[2],
                "min_value": result[3],
                "max_value": result[4]
            }
        
        return {"count": 0} 