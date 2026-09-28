/**
 * Builds a minimal but valid single-page PDF containing the given text lines
 * (Helvetica, uncompressed content stream). Used to test real PDF extraction.
 */
function escapePdf(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makePdf(lines) {
  const content = [
    'BT',
    '/F1 11 Tf',
    '14 TL',
    '50 780 Td',
    ...lines.map((l) => `(${escapePdf(l)}) Tj T*`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const SAMPLE_RESUME_LINES = [
  'Jane Doe - Software Engineer',
  'Skills: JavaScript, React, Node.js, Express, MongoDB, Docker, Git',
  'Projects: DevConnect - a developer social network built with React, Node.js and MongoDB.',
  'Experience: Web Development Intern at Acme Corp (3 months), built REST APIs and unit tests.',
  'Education: B.Tech Computer Science, State University, 2025',
];

module.exports = { makePdf, SAMPLE_RESUME_LINES };
