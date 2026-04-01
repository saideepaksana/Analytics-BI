const Chart = require('../../models/Chart');

// Get all charts
exports.getCharts = async (req, res) => {
  try {
    const charts = await Chart.find().sort({ createdAt: -1 });
    // Convert _id to id for frontend compatibility
    const mapped = charts.map(c => {
      const obj = c.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      return obj;
    });
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch charts' });
  }
};

// Get single chart
exports.getChartById = async (req, res) => {
  try {
    const chart = await Chart.findById(req.params.id);
    if (!chart) return res.status(404).json({ error: 'Chart not found' });
    
    const obj = chart.toObject();
    obj.id = obj._id.toString();
    delete obj._id;

    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart' });
  }
};

// Create chart
exports.createChart = async (req, res) => {
  try {
    // ensure no ID collision
    const { id, _id, ...chartData } = req.body;
    const newChart = await Chart.create(chartData);
    
    const obj = newChart.toObject();
    obj.id = obj._id.toString();
    delete obj._id;

    res.status(201).json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create chart', details: error.message });
  }
};

// Update chart
exports.updateChart = async (req, res) => {
  try {
    const { id, _id, ...updateData } = req.body;
    const updated = await Chart.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    if (!updated) return res.status(404).json({ error: 'Chart not found' });

    const obj = updated.toObject();
    obj.id = obj._id.toString();
    delete obj._id;

    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update chart', details: error.message });
  }
};

// Delete chart
exports.deleteChart = async (req, res) => {
  try {
    const deleted = await Chart.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Chart not found' });
    res.status(200).json({ message: 'Chart deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chart', details: error.message });
  }
};
