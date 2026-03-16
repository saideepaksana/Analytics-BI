const _ = require("lodash");

const sanitizeString = (value) => {
    if (_.isNil(value) || value === '') {
        return null;
    }

    const stringValue = String(value).replace(/"/g, '').trim();
    return _.capitalize(stringValue);
};

module.exports = { sanitizeString };