import React, { useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface DataPoint {
  timestamp_ns: number;
  value: number;
}

interface DataTableProps {
  data: DataPoint[];
  height?: number;
}

const DataTable: React.FC<DataTableProps> = ({ data, height = 400 }) => {
  // Column definitions
  const columnDefs = useMemo(() => [
    {
      field: 'timestamp_ns',
      headerName: 'Timestamp (ns)',
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      valueFormatter: (params: any) => {
        // Format timestamp for better readability
        const date = new Date(params.value / 1_000_000); // Convert ns to ms
        return date.toISOString();
      }
    },
    {
      field: 'value',
      headerName: 'Value',
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1
    }
  ], []);

  // Default column settings
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  // Grid ready handler
  const onGridReady = useCallback((params: any) => {
    params.api.sizeColumnsToFit();
  }, []);

  return (
    <div className="ag-theme-alpine w-full" style={{ height }}>
      <AgGridReact
        rowData={data}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        animateRows={true}
        onGridReady={onGridReady}
        rowSelection="multiple"
        pagination={true}
        paginationPageSize={100}
      />
    </div>
  );
};

export default DataTable; 