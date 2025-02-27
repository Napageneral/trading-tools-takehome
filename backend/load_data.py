import csv
import time
from database import get_db, init_db

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

if __name__ == "__main__":
    load_data_from_csv("../data.csv") 