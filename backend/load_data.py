import csv
import time
from database import get_db, init_db
from granularity import GRANULARITIES

def preprocess_aggregated_data():
    """Preprocess raw data into aggregated tables for each supported granularity (except tick-level)."""
    with get_db() as conn:
        cursor = conn.cursor()
        for symbol, gran in GRANULARITIES.items():
            if symbol == "1t":
                continue
            table_name = f"data_points_{symbol}"

            # Drop the table if it exists
            cursor.execute(f"DROP TABLE IF EXISTS {table_name}")

            # Create new aggregated table
            cursor.execute(f"CREATE TABLE {table_name} (timestamp_ns INTEGER, value REAL)")

            # Aggregate data: bucket timestamp using gran.ns_size and compute average value
            # Note: This query calculates bucket as (timestamp_ns / ns_size) * ns_size
            query = f"INSERT INTO {table_name} SELECT (timestamp_ns / {gran.ns_size}) * {gran.ns_size} as bucket, AVG(value) as avg_value FROM data_points GROUP BY bucket ORDER BY bucket"
            cursor.execute(query)

            # Create an index on the aggregated table for fast queries
            cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_timestamp ON {table_name} (timestamp_ns)")

        conn.commit()

def load_data_from_csv(csv_file_path, batch_size=100000):
    """
    Load data from a CSV file into the database.
    
    Args:
        csv_file_path: Path to the CSV file
        batch_size: Number of records to insert in a single batch
    """
    print(f"Loading data from {csv_file_path}...")
    start_time = time.time()
    
    # Initialize the database
    init_db()
    
    total_rows = 0
    batch = []
    
    with open(csv_file_path, 'r') as file:
        # Skip header
        header = file.readline()
        if not header.startswith("Timestamp,Value"):
            print("Warning: CSV file does not have the expected header. Continuing anyway.")
            # Reset file pointer to beginning
            file.seek(0)
        
        # Process data in batches
        with get_db() as conn:
            cursor = conn.cursor()
            
            for line in file:
                parts = line.strip().split(',')
                if len(parts) < 2:
                    continue
                
                try:
                    timestamp_ns = int(parts[0])
                    value = int(parts[1])
                    batch.append((timestamp_ns, value))
                    total_rows += 1
                    
                    if len(batch) >= batch_size:
                        cursor.executemany(
                            "INSERT INTO data_points (timestamp_ns, value) VALUES (?, ?)",
                            batch
                        )
                        conn.commit()
                        print(f"Inserted {total_rows} rows so far...")
                        batch = []
                except (ValueError, IndexError) as e:
                    print(f"Error processing line: {line.strip()}. Error: {e}")
                    continue
            
            # Insert any remaining records
            if batch:
                cursor.executemany(
                    "INSERT INTO data_points (timestamp_ns, value) VALUES (?, ?)",
                    batch
                )
                conn.commit()
    
    end_time = time.time()
    duration = end_time - start_time
    print(f"Data loading completed. Inserted {total_rows} rows in {duration:.2f} seconds.")
    
    # Get some stats about the data
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM data_points")
        count = cursor.fetchone()[0]
        
        cursor.execute("SELECT MIN(timestamp_ns), MAX(timestamp_ns) FROM data_points")
        min_ts, max_ts = cursor.fetchone()
        
        print(f"Total records in database: {count}")
        print(f"Timestamp range: {min_ts} to {max_ts}")

    # Preprocess aggregated tables for rapid querying at different granularities
    print("Preprocessing aggregated data tables for supported granularities...")
    preprocess_aggregated_data()
    print("Aggregated data tables created.")

if __name__ == "__main__":
    load_data_from_csv("../data.csv") 