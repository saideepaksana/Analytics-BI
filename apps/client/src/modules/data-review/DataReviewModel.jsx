import React from "react";
import DataGrid from "./components/DataGrid";
import SchemaView from "./components/SchemaView";
import QuarantineUI from "./components/QuarantineUI";

function DataReviewModal({ metadata, isOpen, onClose }) {

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      {/* Modal */}
      <div className="bg-white w-[90%] max-w-5xl rounded-lg shadow-lg">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">

          <h2 className="text-xl font-semibold">
            Review Uploaded Data
          </h2>

          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-lg"
          >
            ✕
          </button>

        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

          <QuarantineUI rows={metadata.quarantinedRows} />

          <SchemaView schema={metadata.schema} />

          <DataGrid data={metadata.preview} />

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t">

          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md"
          >
            Cancel
          </button>

          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Continue
          </button>

        </div>

      </div>
    </div>
  );
}

export default DataReviewModal;