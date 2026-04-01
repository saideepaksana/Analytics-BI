const Dashboard = require('../../models/Dashboard');

exports.getDashboards = async (req, res) => {
  try {
    const dashboards = await Dashboard.find().sort({ createdAt: -1 });
    const mapped = dashboards.map(d => {
      const obj = d.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      return obj;
    });
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
};

exports.getDashboardById = async (req, res) => {
  try {
    const dashboard = await Dashboard.findById(req.params.id);
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });
    
    const obj = dashboard.toObject();
    obj.id = obj._id.toString();
    delete obj._id;

    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
};

exports.createDashboard = async (req, res) => {
  try {
    const { id, _id, ...dashData } = req.body;
    const newDash = await Dashboard.create(dashData);
    
    const obj = newDash.toObject();
    obj.id = obj._id.toString();
    delete obj._id;

    res.status(201).json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create dashboard', details: error.message });
  }
};

exports.updateDashboard = async (req, res) => {
  try {
    const { id, _id, ...updateData } = req.body;
    const updated = await Dashboard.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    if (!updated) return res.status(404).json({ error: 'Dashboard not found' });

    const obj = updated.toObject();
    obj.id = obj._id.toString();
    delete obj._id;

    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update dashboard', details: error.message });
  }
};

exports.deleteDashboard = async (req, res) => {
  try {
    const deleted = await Dashboard.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Dashboard not found' });
    res.status(200).json({ message: 'Dashboard deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete dashboard', details: error.message });
  }
};
