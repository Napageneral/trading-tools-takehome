import sqlite3
from contextlib import contextmanager

DATABASE_URL = "timeseries.db"

def get_connection():
    """Get a SQLite connection with appropriate settings."""
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initialize the database with required tables."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create data_points table if it doesn't exist
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS data_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp_ns INTEGER NOT NULL,
            value INTEGER NOT NULL
        )
        ''')
        
        # Create index on timestamp for faster queries
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_timestamp_ns ON data_points(timestamp_ns)
        ''')
        
        conn.commit() 