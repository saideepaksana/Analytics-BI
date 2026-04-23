const getVisualExportAvailabilityError = () => {
    try {
        require.resolve("puppeteer");
        return null;
    } catch (error) {
        return 'Visual export is unavailable because the "puppeteer" package is not installed. Run "npm install -w apps/server puppeteer" to enable PDF and PNG exports.';
    }
};

module.exports = {
    getVisualExportAvailabilityError,
};
