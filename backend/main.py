import csv
import io
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import sqlite3
import json
import asyncio
import time

from database import get_db, init_db
from schemas import DataPoint, DataPointResponse, TimeRangeRequest
from granularity import GRANULARITIES, DEFAULT_GRANULARITY, Granularity

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

# Function to pick appropriate granularity based on time range
def pick_granularity(visible_range_ns: int) -> str:
    """
    Determine the appropriate granularity based on the visible time range.
    
    Args:
        visible_range_ns: The visible time range in nanoseconds
        
    Returns:
        str: The appropriate granularity symbol ('1t', '1s', '1m', etc.)
    """
    if visible_range_ns > 10 * 86400_000_000_000:  # > 10 days
        return "1d"
    elif visible_range_ns > 86400_000_000_000:     # > 1 day
        return "1h"
    elif visible_range_ns > 3600_000_000_000:      # > 1 hour
        return "1m"
    elif visible_range_ns > 60_000_000_000:        # > 1 minute
        return "1s"
    else:
        return "1t"

# Function to get data with proper downsampling based on granularity
def get_downsampled_data(conn, start_ns: int, end_ns: int, gran: Granularity):
    """
    Get downsampled data based on the granularity
    
    Args:
        conn: Database connection
        start_ns: Start timestamp in nanoseconds
        end_ns: End timestamp in nanoseconds
        gran: Granularity object
        
    Returns:
        list: List of data points
    """
    cursor = conn.cursor()
    
    # For downsampling, we'll use SQL to group by time buckets
    gran_ns = gran.ns_size
    
    # Using integer division to create buckets
    cursor.execute("""
        SELECT (timestamp_ns / ?) * ? as bucket_start, AVG(value) as avg_value
        FROM data_points
        WHERE timestamp_ns >= ? AND timestamp_ns <= ?
        GROUP BY bucket_start
        ORDER BY bucket_start
    """, (gran_ns, gran_ns, start_ns, end_ns))
    
    # Convert to list of dictionaries
    result = [{"timestamp_ns": int(row[0]), "value": float(row[1])} for row in cursor.fetchall()]
    return result

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
    granularity: Optional[str] = Query(None, description="e.g. '1t','1s','1m','1h','1d','1w','1M','1y'")
):
    """
    Fetch data from start_ns to end_ns.
    If a granularity is provided, downsample the data to that interval.
    If no granularity is provided, one will be automatically selected based on the time range.
    """
    # Calculate the visible range
    visible_range_ns = end_ns - start_ns
    
    # If no granularity provided, pick one based on the time range
    if not granularity:
        granularity = pick_granularity(visible_range_ns)
    
    if granularity not in GRANULARITIES:
        raise HTTPException(status_code=400, detail=f"Invalid granularity. Valid options are: {', '.join(GRANULARITIES.keys())}")
    
    gran = GRANULARITIES[granularity]
    
    with get_db() as conn:
        result = get_downsampled_data(conn, start_ns, end_ns, gran)
        return {"data": result, "granularity": granularity}

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

# Store active WebSocket connections and their state
active_connections = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for streaming data.
    Client can request time ranges and receive data in chunks.
    Also supports actions like pan_left, pan_right, set_granularity, etc.
    """
    await websocket.accept()
    
    # Generate a unique connection ID
    conn_id = id(websocket)
    
    # Initialize connection state
    conn_state = {
        "granularity": DEFAULT_GRANULARITY,
        "start_ns": 0,
        "end_ns": 0,
        "last_fetch_time": time.time()
    }
    
    # Store the connection
    active_connections[conn_id] = conn_state
    
    try:
        while True:
            # Wait for a request from the client
            data = await websocket.receive_json()
            
            # Extract the action
            action = data.get("action", "load")
            
            if action == "load":
                # Extract parameters
                start_ns = data.get("start_ns", 0)
                end_ns = data.get("end_ns", 0)
                granularity_symbol = data.get("granularity")
                
                # Update connection state
                conn_state["start_ns"] = start_ns
                conn_state["end_ns"] = end_ns
                conn_state["last_fetch_time"] = time.time()
                
                # If no granularity provided, pick one based on the time range
                if not granularity_symbol:
                    visible_range_ns = end_ns - start_ns
                    granularity_symbol = pick_granularity(visible_range_ns)
                
                # Validate granularity
                if granularity_symbol not in GRANULARITIES:
                    await websocket.send_json({
                        "error": f"Invalid granularity. Valid options are: {', '.join(GRANULARITIES.keys())}"
                    })
                    continue
                
                gran = GRANULARITIES[granularity_symbol]
                conn_state["granularity"] = gran
                
                with get_db() as conn:
                    # Get downsampled data
                    results = get_downsampled_data(conn, start_ns, end_ns, gran)
                    
                    # Send data in chunks to avoid giant messages
                    chunk_size = 5000
                    
                    for i in range(0, len(results), chunk_size):
                        chunk = results[i:i+chunk_size]
                        await websocket.send_json(chunk)
                    
                    # Send an empty chunk to signal the end of data
                    await websocket.send_json([])
                    
                    # Send the granularity that was used
                    await websocket.send_json({"granularity": gran.symbol})
            
            elif action == "set_granularity":
                granularity_symbol = data.get("symbol")
                
                # Validate granularity
                if granularity_symbol not in GRANULARITIES:
                    await websocket.send_json({
                        "error": f"Invalid granularity. Valid options are: {', '.join(GRANULARITIES.keys())}"
                    })
                    continue
                
                gran = GRANULARITIES[granularity_symbol]
                conn_state["granularity"] = gran
                
                # Use existing time range to fetch data with new granularity
                start_ns = conn_state["start_ns"]
                end_ns = conn_state["end_ns"]
                
                with get_db() as conn:
                    # Get downsampled data
                    results = get_downsampled_data(conn, start_ns, end_ns, gran)
                    
                    # Send data in chunks to avoid giant messages
                    chunk_size = 5000
                    
                    for i in range(0, len(results), chunk_size):
                        chunk = results[i:i+chunk_size]
                        await websocket.send_json(chunk)
                    
                    # Send an empty chunk to signal the end of data
                    await websocket.send_json([])
                    
                    # Send the granularity that was used
                    await websocket.send_json({"granularity": gran.symbol})
            
            elif action == "move_up_gran":
                # Move to coarser granularity if available
                current_gran = conn_state["granularity"]
                if current_gran.up:
                    gran = current_gran.up
                    conn_state["granularity"] = gran
                    
                    # Use existing time range to fetch data with new granularity
                    start_ns = conn_state["start_ns"]
                    end_ns = conn_state["end_ns"]
                    
                    with get_db() as conn:
                        # Get downsampled data
                        results = get_downsampled_data(conn, start_ns, end_ns, gran)
                        
                        # Send data in chunks to avoid giant messages
                        chunk_size = 5000
                        
                        for i in range(0, len(results), chunk_size):
                            chunk = results[i:i+chunk_size]
                            await websocket.send_json(chunk)
                        
                        # Send an empty chunk to signal the end of data
                        await websocket.send_json([])
                        
                        # Send the granularity that was used
                        await websocket.send_json({"granularity": gran.symbol})
                else:
                    await websocket.send_json({"error": "Already at coarsest granularity"})
            
            elif action == "move_down_gran":
                # Move to finer granularity if available
                current_gran = conn_state["granularity"]
                if current_gran.down:
                    gran = current_gran.down
                    conn_state["granularity"] = gran
                    
                    # Use existing time range to fetch data with new granularity
                    start_ns = conn_state["start_ns"]
                    end_ns = conn_state["end_ns"]
                    
                    with get_db() as conn:
                        # Get downsampled data
                        results = get_downsampled_data(conn, start_ns, end_ns, gran)
                        
                        # Send data in chunks to avoid giant messages
                        chunk_size = 5000
                        
                        for i in range(0, len(results), chunk_size):
                            chunk = results[i:i+chunk_size]
                            await websocket.send_json(chunk)
                        
                        # Send an empty chunk to signal the end of data
                        await websocket.send_json([])
                        
                        # Send the granularity that was used
                        await websocket.send_json({"granularity": gran.symbol})
                else:
                    await websocket.send_json({"error": "Already at finest granularity"})
            
            elif action == "pan_left" or action == "pan_right":
                # Get amount to pan (in nanoseconds)
                amount_ns = data.get("amount_ns", 0)
                if amount_ns <= 0:
                    await websocket.send_json({"error": "Invalid pan amount"})
                    continue
                
                # Calculate new time range
                start_ns = conn_state["start_ns"]
                end_ns = conn_state["end_ns"]
                
                if action == "pan_left":
                    # Pan left (backwards in time)
                    new_start_ns = start_ns - amount_ns
                    new_end_ns = end_ns - amount_ns
                else:  # pan_right
                    # Pan right (forwards in time)
                    new_start_ns = start_ns + amount_ns
                    new_end_ns = end_ns + amount_ns
                
                # Update connection state
                conn_state["start_ns"] = new_start_ns
                conn_state["end_ns"] = new_end_ns
                conn_state["last_fetch_time"] = time.time()
                
                gran = conn_state["granularity"]
                
                with get_db() as conn:
                    # Get downsampled data
                    results = get_downsampled_data(conn, new_start_ns, new_end_ns, gran)
                    
                    # Send data in chunks to avoid giant messages
                    chunk_size = 5000
                    
                    for i in range(0, len(results), chunk_size):
                        chunk = results[i:i+chunk_size]
                        await websocket.send_json(chunk)
                    
                    # Send an empty chunk to signal the end of data
                    await websocket.send_json([])
                    
                    # Send the granularity that was used
                    await websocket.send_json({"granularity": gran.symbol})
            
            else:
                await websocket.send_json({"error": f"Unknown action: {action}"})
    
    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {conn_id}")
        # Clean up connection state
        if conn_id in active_connections:
            del active_connections[conn_id]
    except Exception as e:
        print(f"WebSocket error: {e}")
        # Clean up connection state
        if conn_id in active_connections:
            del active_connections[conn_id]

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