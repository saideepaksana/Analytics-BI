/**
 * exportUtils.js
 * 
 * Shared utility functions for flattening records and handling export metadata.
 */

/**
 * Recursively flattens a nested object into dot-notation keys.
 * Arrays are converted to JSON strings to avoid column explosion.
 * e.g. { user: { id: 1, tags: ["a","b"] } } -> { "user.id": 1, "user.tags": '["a","b"]' }
 * @param {object} obj  - the object to flatten
 * @param {string} prefix - internal prefix accumulated during recursion
 * @returns {object} - single-depth flat object
 */
function flattenObject(obj, prefix = "") {
  return Object.keys(obj || {}).reduce((acc, k) => {
    const pre = prefix.length ? prefix + "." : "";
    const val = obj[k];
    if (Array.isArray(val)) {
      acc[pre + k] = JSON.stringify(val);
    } else if (val !== null && typeof val === "object" && val.constructor === Object) {
      Object.assign(acc, flattenObject(val, pre + k));
    } else {
      acc[pre + k] = val;
    }
    return acc;
  }, {});
}

/**
 * Returns an ordered list of unique column keys.
 * Respects a Metadata schema when available.
 */
function getFields(sampleRecords, meta) {
  if (meta?.schema?.length) {
    return meta.schema.map((c) => c.name);
  }
  const keySet = new Set();
  sampleRecords.forEach((rec) => Object.keys(rec).forEach((k) => keySet.add(k)));
  return Array.from(keySet);
}

module.exports = {
  flattenObject,
  getFields,
};
