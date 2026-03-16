const { Transform } = require('node:stream');
const { sanitizeString } = require('./cleaner');
const { parseDate } = require('./normalizer');
const CleanRecord = require('../../models/CleanRecord');
const DLQRecord = require('../../models/DLQRecord');

const schemaMapper = {
  productName: sanitizeString,
  price: sanitizeString,
  date: parseDate
};

class DTSEngineStream extends Transform {
    constructor(datasetId) {
        super({ objectMode: true });
        this.datasetId = datasetId;
    }

    async _transform(chunk, encoding, callback) {
        const cleanedRow = {};

        Object.keys(chunk).forEach((key) => {
            const rawValue = chunk[key];
            const cleaningFunction = schemaMapper[key];
            cleanedRow[key] = cleaningFunction ? cleaningFunction(rawValue) : rawValue;
        });

        const testDoc = new CleanRecord(cleanedRow);
        const error = testDoc.validateSync();

        if (error) {
            const deadLetterRecord = {
                datasetId: this.datasetId,
                rawData: chunk,
                error: error.message
            };

            // Route unfixable data to the DLQ
            await DLQRecord.create(deadLetterRecord);
            console.log("Routing unfixable record to DLQ", deadLetterRecord);

            callback();
        } else {
            callback(null, cleanedRow);
        }
    }
}

module.exports = DTSEngineStream;