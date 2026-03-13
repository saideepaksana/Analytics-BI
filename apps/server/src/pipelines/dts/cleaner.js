import _ from "lodash";

export const sanitizeString = (value) => {
    if (_.isNil(value) || value === '') {
        return null; 
    }

    const stringValue = String(value).replace(/"/g,'').trim();
    return _.capitalize(stringValue);
}