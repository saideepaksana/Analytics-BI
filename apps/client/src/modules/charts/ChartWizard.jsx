import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader } from 'lucide-react';
import { listDatasets } from '../../services/datasets.service';
import { getDatasetMetadata } from '../../services/datasets.service';
import ChartTypeSelector from './ChartTypeSelector';
import FieldMapper from './FieldMapper';
import ChartCustomizer from './ChartCustomizer';
import ChartPreview from './ChartPreview';
import { buildChartOption } from './chartBuilder';
import { saveChart } from './chartStorage';

const STEPS = [
  { id: 'dataset', label: '1. Dataset' },
  { id: 'type', label: '2. Chart Type' },
  { id: 'fields', label: '3. Map Fields' },
  { id: 'customize', label: '4. Customize & Save' },
];

function ChartWizard({ onClose, onSaved, editingChart }) {
  const [step, setStep] = useState(0);
  const [datasets, setDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Wizard state
  const [selectedDatasetId, setSelectedDatasetId] = useState(editingChart?.datasetId || '');
  const [chartType, setChartType] = useState(editingChart?.chartType || '');
  const [dimensions, setDimensions] = useState(editingChart?.dimensions || []);
  const [measures, setMeasures] = useState(editingChart?.measures || []);
  const [customization, setCustomization] = useState(editingChart?.customization || {
    title: '',
    palette: 'vibrant',
    showLegend: true,
    legendPosition: 'top',
    showAxisLabels: true,
    showGridLines: true,
  });

  // Dataset data
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [chartName, setChartName] = useState(editingChart?.name || '');
  const [saving, setSaving] = useState(false);

  // Fetch datasets list
  useEffect(() => {
    (async () => {
      setLoadingDatasets(true);
      try {
        const data = await listDatasets();
        setDatasets(Array.isArray(data) ? data : []);
      } catch {
        setDatasets([]);
      } finally {
        setLoadingDatasets(false);
      }
    })();
  }, []);

  // Fetch dataset columns & rows when dataset is selected
  const fetchDatasetData = useCallback(async (datasetId) => {
    if (!datasetId) return;
    setLoadingData(true);
    try {
      const meta = await getDatasetMetadata(datasetId, { limit: 500, offset: 0 });
      const schema = meta.schema || [];
      const colNames = schema.map(s => s.name || s.columnName || s.column);
      setColumns(colNames.filter(Boolean));
      setRows(meta.rows || []);
    } catch {
      setColumns([]);
      setRows([]);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      fetchDatasetData(selectedDatasetId);
    }
  }, [selectedDatasetId, fetchDatasetData]);

  // Build live preview option
  const previewOption = buildChartOption({
    chartType,
    dimensions,
    measures,
    data: rows,
    customization,
  });

  // Step validation
  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedDatasetId;
      case 1: return !!chartType;
      case 2: return dimensions.length >= 1 && measures.length >= 1;
      case 3: return true;
      default: return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        ...(editingChart?.id ? { id: editingChart.id } : {}),
        name: chartName || `${chartType} chart`,
        datasetId: selectedDatasetId,
        chartType,
        dimensions,
        measures,
        customization,
        // Store data snapshot for dashboard rendering
        data: rows,
        columns,
      };
      const saved = await saveChart(config);
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  };

  const selectedDataset = datasets.find(d => d.datasetId === selectedDatasetId);

  return (
    <div className="chart-wizard">
      {/* Step pills */}
      <div className="wizard-steps cw-steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`step-pill ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
          >
            {i < step ? <Check size={14} style={{ marginRight: 4 }} /> : null}
            {s.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="cw-content">
        {/* Step 0: Dataset */}
        {step === 0 && (
          <div className="cw-step-body">
            <h3 className="cw-step-title">Select a Dataset</h3>
            <p className="cw-step-desc">Choose the dataset you want to visualize.</p>
            {loadingDatasets ? (
              <div className="cw-loading"><Loader size={20} className="cw-spin" /> Loading datasets…</div>
            ) : datasets.length === 0 ? (
              <div className="cw-empty-msg">No datasets available. Upload data in the Ingestion section first.</div>
            ) : (
              <div className="cw-dataset-list">
                {datasets.map(ds => (
                  <button
                    key={ds.datasetId}
                    type="button"
                    className={`cw-dataset-card ${selectedDatasetId === ds.datasetId ? 'active' : ''}`}
                    onClick={() => setSelectedDatasetId(ds.datasetId)}
                  >
                    <div className="cw-dataset-name">{ds.fileName || ds.datasetId}</div>
                    <div className="cw-dataset-meta">
                      {ds.rowCount ?? 0} rows • {ds.mode || 'unknown'} mode
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Chart Type */}
        {step === 1 && (
          <div className="cw-step-body">
            <h3 className="cw-step-title">Choose a Chart Type</h3>
            <p className="cw-step-desc">Select the type of visualization that best represents your data.</p>
            <ChartTypeSelector selected={chartType} onSelect={setChartType} />
          </div>
        )}

        {/* Step 2: Map Fields */}
        {step === 2 && (
          <div className="cw-step-body">
            <h3 className="cw-step-title">Map Your Data Fields</h3>
            <p className="cw-step-desc">
              Assign columns as Dimensions (categories) or Measures (values).
              {selectedDataset ? ` Using: ${selectedDataset.fileName || selectedDataset.datasetId}` : ''}
            </p>
            {loadingData ? (
              <div className="cw-loading"><Loader size={20} className="cw-spin" /> Loading columns…</div>
            ) : (
              <FieldMapper
                columns={columns}
                data={rows}
                dimensions={dimensions}
                measures={measures}
                onDimensionsChange={setDimensions}
                onMeasuresChange={setMeasures}
              />
            )}
          </div>
        )}

        {/* Step 3: Customize & Preview */}
        {step === 3 && (
          <div className="cw-step-body">
            <h3 className="cw-step-title">Customize & Preview</h3>
            <p className="cw-step-desc">Fine-tune the appearance and preview your chart before saving.</p>

            <div className="cw-customize-layout">
              <div className="cw-customize-panel">
                <div className="cust-section">
                  <label className="cust-label">Chart Name</label>
                  <input
                    type="text"
                    className="cust-input"
                    placeholder="Name for your saved chart…"
                    value={chartName}
                    onChange={e => setChartName(e.target.value)}
                  />
                </div>
                <ChartCustomizer
                  customization={customization}
                  onChange={setCustomization}
                />
              </div>
              <div className="cw-preview-panel">
                <div className="cw-preview-label">Live Preview</div>
                <div className="cw-preview-box">
                  <ChartPreview option={previewOption} style={{ height: '380px' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="wizard-actions cw-actions">
        <button type="button" className="ghost-btn" onClick={onClose}>
          Cancel
        </button>
        <div className="cw-actions-right">
          {step > 0 && (
            <button type="button" className="ghost-btn" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="primary-btn"
              disabled={!canProceed()}
              onClick={() => setStep(step + 1)}
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn cw-save-btn"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? <><Loader size={14} className="cw-spin" /> Saving…</> : <><Check size={14} /> Save Chart</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChartWizard;
