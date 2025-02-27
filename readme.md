# Timeseries Visualization

An interactive visualization tool for large timeseries data, capable of handling up to 1 billion data points.

## Features

- **Interactive Chart**: Pan and zoom through the data with a responsive chart
- **Data Table**: View the raw data in a sortable, filterable table
- **WebSocket Streaming**: Stream data to the UI for real-time updates
- **Downsampling**: Reduce data density with configurable granularity levels
- **File Upload**: Upload your own CSV data files
- **Ring Buffer**: Efficient in-memory data handling for smooth performance

## Tech Stack

### Backend
- **FastAPI**: High-performance Python web framework
- **SQLite**: Lightweight database for data storage
- **WebSockets**: For real-time data streaming
- **Raw SQL**: Direct database queries for optimal performance

### Frontend
- **Next.js**: React framework for building the UI
- **Tailwind CSS**: Utility-first CSS framework
- **Lightweight Charts**: Fast, lightweight charting library
- **AG Grid**: Advanced data table component

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd timeseries-visualization
   ```

2. Set up the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Set up the frontend:
   ```bash
   cd frontend
   npm install
   ```

### Loading Data

The project comes with a script to load the existing data.csv file into the database:

```bash
cd backend
python load_data.py
```

### Running the Application

1. Start the backend server:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open your browser and navigate to http://localhost:3000

## Usage

1. **View Data**: The initial view shows statistics about the loaded dataset
2. **Set Time Range**: Enter start and end timestamps (in nanoseconds)
3. **Select Granularity**: Choose a downsampling level if needed
4. **Fetch Data**: Click the "Fetch Data" button to load and visualize the data
5. **Interact**: Pan and zoom in the chart to explore different time ranges
6. **Upload**: Use the file upload feature to visualize your own CSV data

## Scaling to 1 Billion Points

For extremely large datasets (approaching 1 billion points):

1. Use appropriate downsampling granularity
2. Consider partitioning the database by time ranges
3. Implement more sophisticated caching strategies
4. Use a more robust database system (PostgreSQL, TimescaleDB, etc.)

## License

MIT

## Acknowledgments

- This project was created as a take-home test for visualizing timeseries data
- Thanks to the creators of the libraries and frameworks used in this project