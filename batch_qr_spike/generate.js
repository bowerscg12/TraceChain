const QRCode = require("qrcode");
const fs = require("fs");

const identifiers = [
  "BATCH-001",
  "BATCH-002",
  "BATCH-003",
  "BATCH-004",
  "BATCH-005"
];

async function generate() {
  if (!fs.existsSync("output")) {
    fs.mkdirSync("output");
  }

  for (const id of identifiers) {
    const url = `https://tracechain.example/batch/${id}`;
    await QRCode.toFile(`output/${id}.png`, url, {
      errorCorrectionLevel: "H",
      width: 300
    });
    console.log(`Created QR code for ${id}: ${url}`);
  }
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});