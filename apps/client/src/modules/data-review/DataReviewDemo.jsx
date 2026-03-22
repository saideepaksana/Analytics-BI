// import { useState } from 'react';
// import DataGrid from './components/DataGrid';
// import SchemaView from './components/SchemaView';
// import QuarantineUI from './components/QuarantineUI';

// // Mock data for demonstration
// const MOCK_COLUMNS = [
//   { key: 'id', label: 'ID', type: 'integer' },
//   { key: 'name', label: 'Product Name', type: 'string' },
//   { key: 'category', label: 'Category', type: 'string' },
//   { key: 'price', label: 'Price', type: 'decimal' },
//   { key: 'quantity', label: 'Quantity', type: 'integer' },
//   { key: 'created_at', label: 'Created At', type: 'date' },
//   { key: 'is_active', label: 'Active', type: 'boolean' },
// ];

// const MOCK_SCHEMA = [
//   { name: 'id', type: 'integer', role: 'dimension', nullable: false, primaryKey: true },
//   { name: 'name', type: 'string', role: 'attribute', nullable: false },
//   { name: 'category', type: 'string', role: 'dimension', nullable: true },
//   { name: 'price', type: 'decimal', role: 'measure', nullable: false },
//   { name: 'quantity', type: 'integer', role: 'measure', nullable: false },
//   { name: 'created_at', type: 'timestamp', role: 'dimension', nullable: true },
//   { name: 'is_active', type: 'boolean', role: 'attribute', nullable: false },
// ];

// const MOCK_DATA = [
//   { id: 1, name: 'Laptop Pro', category: 'Electronics', price: 1299.99, quantity: 50, created_at: '2024-01-15', is_active: true },
//   { id: 2, name: 'Wireless Mouse', category: 'Electronics', price: 29.99, quantity: 200, created_at: '2024-01-20', is_active: true },
//   { id: 3, name: 'Office Chair', category: 'Furniture', price: 349.99, quantity: 30, created_at: '2024-02-01', is_active: true },
//   { id: 4, name: 'Desk Lamp', category: 'Furniture', price: 49.99, quantity: 100, created_at: '2024-02-10', is_active: false },
//   { id: 5, name: 'USB-C Hub', category: 'Electronics', price: 59.99, quantity: 150, created_at: '2024-02-15', is_active: true },
//   { id: 6, name: 'Monitor 27"', category: 'Electronics', price: 399.99, quantity: 25, created_at: '2024-02-20', is_active: true },
//   { id: 7, name: 'Keyboard Mechanical', category: 'Electronics', price: 149.99, quantity: 75, created_at: '2024-03-01', is_active: true },
//   { id: 8, name: 'Standing Desk', category: 'Furniture', price: 599.99, quantity: 15, created_at: '2024-03-05', is_active: true },
//   { id: 9, name: 'Webcam HD', category: 'Electronics', price: 89.99, quantity: 60, created_at: '2024-03-10', is_active: false },
//   { id: 10, name: 'Notebook Set', category: 'Office Supplies', price: 12.99, quantity: 500, created_at: '2024-03-15', is_active: true },
//   { id: 11, name: 'Pen Collection', category: 'Office Supplies', price: 8.99, quantity: 1000, created_at: '2024-03-20', is_active: true },
//   { id: 12, name: 'Filing Cabinet', category: 'Furniture', price: 199.99, quantity: 20, created_at: '2024-03-25', is_active: true },
// ];

// const MOCK_QUARANTINED_ROWS = [
//   {
//     rowIndex: 13,
//     data: { id: 13, name: '', category: 'Electronics', price: -50, quantity: 10, created_at: '2024-04-01', is_active: true },
//     errors: [
//       { column: 'name', type: 'validation', severity: 'error', message: 'Name cannot be empty' },
//       { column: 'price', type: 'validation', severity: 'error', message: 'Price must be positive' },
//     ],
//   },
//   {
//     rowIndex: 14,
//     data: { id: 14, name: 'Test Product', category: null, price: 100, quantity: -5, created_at: 'invalid-date', is_active: true },
//     errors: [
//       { column: 'quantity', type: 'validation', severity: 'error', message: 'Quantity cannot be negative' },
//       { column: 'created_at', type: 'parse', severity: 'error', message: 'Invalid date format' },
//     ],
//   },
//   {
//     rowIndex: 15,
//     data: { id: null, name: 'Another Item', category: 'Misc', price: 25.5, quantity: 100, created_at: '2024-04-05', is_active: false },
//     errors: [
//       { column: 'id', type: 'validation', severity: 'warning', message: 'Primary key is missing' },
//     ],
//   },
// ];

// /**
//  * DataReviewDemo - Demo component with mock data for testing
//  * Use this to test components without backend connection
//  */
// const DataReviewDemo = () => {
//   const [activeTab, setActiveTab] = useState('preview');
//   const [schema, setSchema] = useState(MOCK_SCHEMA);
//   const [quarantinedRows, setQuarantinedRows] = useState(MOCK_QUARANTINED_ROWS);
//   const [schemaEditable, setSchemaEditable] = useState(true);

//   const handleRoleChange = (column, newRole, index) => {
//     setSchema((prev) =>
//       prev.map((col, i) => (i === index ? { ...col, role: newRole } : col))
//     );
//   };

//   const handleQuarantineDelete = (row, index) => {
//     setQuarantinedRows((prev) => prev.filter((_, i) => i !== index));
//   };

//   const handleQuarantineRestore = (row, index) => {
//     console.log('Restoring row:', row);
//     setQuarantinedRows((prev) => prev.filter((_, i) => i !== index));
//   };

//   const handleQuarantineExport = () => {
//     console.log('Exporting quarantined rows:', quarantinedRows);
//     alert('Export functionality - check console for data');
//   };

//   return (
//     <div className="data-review-demo">
//       <header className="demo-header">
//         <h1>Data Review Demo</h1>
//         <p>Testing components with mock data</p>
//         <label>
//           <input
//             type="checkbox"
//             checked={schemaEditable}
//             onChange={(e) => setSchemaEditable(e.target.checked)}
//           />
//           Schema Editable
//         </label>
//       </header>

//       <QuarantineUI
//         quarantinedRows={quarantinedRows}
//         columns={MOCK_COLUMNS}
//         onReview={(row) => console.log('Review:', row)}
//         onDelete={handleQuarantineDelete}
//         onRestore={handleQuarantineRestore}
//         onExport={handleQuarantineExport}
//         onDeleteAll={(indices) => {
//           setQuarantinedRows((prev) => prev.filter((_, i) => !indices.includes(i)));
//         }}
//       />

//       <nav className="demo-tabs">
//         <button
//           className={activeTab === 'preview' ? 'active' : ''}
//           onClick={() => setActiveTab('preview')}
//         >
//           Data Preview
//         </button>
//         <button
//           className={activeTab === 'schema' ? 'active' : ''}
//           onClick={() => setActiveTab('schema')}
//         >
//           Schema View
//         </button>
//       </nav>

//       <main className="demo-content">
//         {activeTab === 'preview' && (
//           <DataGrid
//             columns={MOCK_COLUMNS}
//             data={MOCK_DATA}
//             pageSize={5}
//             onRowClick={(row) => console.log('Row clicked:', row)}
//             onCellClick={(row, col) => console.log('Cell clicked:', col.key, row[col.key])}
//           />
//         )}

//         {activeTab === 'schema' && (
//           <SchemaView
//             schema={schema}
//             editable={schemaEditable}
//             onRoleChange={handleRoleChange}
//             onColumnClick={(col) => console.log('Column clicked:', col)}
//           />
//         )}
//       </main>
//     </div>
//   );
// };

// export default DataReviewDemo;
