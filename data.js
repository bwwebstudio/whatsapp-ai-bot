const xlsx = require('xlsx');
const fs = require('fs');

/**
 * Reads the Excel file and converts it into a structured text format
 * so that the AI can understand the context.
 */
function getExcelDataAsString(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return "No data found. Excel file does not exist.";
        }
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert sheet to JSON array
        const data = xlsx.utils.sheet_to_json(sheet);
        
        if (data.length === 0) {
            return "Excel sheet is empty.";
        }

        // Convert JSON array to a readable text format
        let textData = "Here is the data from the database:\n\n";
        data.forEach((row, index) => {
            textData += `Record ${index + 1}:\n`;
            for (const key in row) {
                textData += `- ${key}: ${row[key]}\n`;
            }
            textData += '\n';
        });

        return textData;
    } catch (error) {
        console.error("Error reading Excel file:", error);
        return "Error reading data.";
    }
}

module.exports = { getExcelDataAsString };
