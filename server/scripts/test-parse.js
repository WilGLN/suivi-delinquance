const fs = require("fs");
const path = require("path");
const { extractPdfData } = require("../parsePdf.js");

const pdfPath = path.join(__dirname, "../../PDS_exemples/06_Saint_Alban_juin2024.pdf");
const buf = fs.readFileSync(pdfPath);

extractPdfData(buf)
  .then((data) => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
