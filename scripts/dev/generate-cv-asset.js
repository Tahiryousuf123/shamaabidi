const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, '../public/cv/Dr_Shama_Abidi_Academic_CV.pdf');
const buf = fs.readFileSync(pdfPath);
const b64 = buf.toString('base64');

const tsContent = `export const CV_FILE_NAME = 'Dr_Shama_Abidi_Academic_CV.pdf';
export const CV_BASE64 = ${JSON.stringify(b64)};

export function getCvAttachment(overrideBase64?: string, overrideFileName?: string) {
  if (overrideBase64) {
    return {
      filename: overrideFileName || CV_FILE_NAME,
      content: Buffer.from(overrideBase64, 'base64'),
      contentType: 'application/pdf',
    };
  }
  return {
    filename: CV_FILE_NAME,
    content: Buffer.from(CV_BASE64, 'base64'),
    contentType: 'application/pdf',
  };
}
`;

fs.writeFileSync(path.join(__dirname, '../lib/cv-asset.ts'), tsContent, 'utf8');
console.log('Successfully generated lib/cv-asset.ts! File size:', fs.statSync(path.join(__dirname, '../lib/cv-asset.ts')).size);
