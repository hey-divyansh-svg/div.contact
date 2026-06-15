import { Contact, ContactCategory } from '../types';

/**
 * Utility functions for exporting and importing contacts using CSV
 */

export function exportContactsToCSV(contacts: Contact[]): void {
  const headers = [
    'Full Name',
    'Mobile Number',
    'Email Address',
    'Company Name',
    'Address',
    'Notes',
    'Category',
    'Is Favorite',
    'Tags',
    'Created At'
  ];

  const escapeField = (val: string | boolean | undefined) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = contacts.map(c => [
    escapeField(c.fullName),
    escapeField(c.mobileNumber),
    escapeField(c.emailAddress),
    escapeField(c.companyName),
    escapeField(c.address),
    escapeField(c.notes),
    escapeField(c.category),
    escapeField(c.isFavorite),
    escapeField(c.tags.join(',')),
    escapeField(c.createdAt)
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `contacts_export_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseCSVToJSON(csvText: string): any[] {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const list: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split handling commas within quotes
    const fields: string[] = [];
    let insideQuote = false;
    let currentField = '';

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        fields.push(currentField.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

    if (fields.length > 0) {
      const record: any = {};
      headers.forEach((h, index) => {
        const value = fields[index] || '';
        // Map common headers to schema fields
        if (h.toLowerCase() === 'full name' || h.toLowerCase() === 'fullname' || h.toLowerCase() === 'name') {
          record.fullName = value;
        } else if (h.toLowerCase() === 'mobile number' || h.toLowerCase() === 'phone' || h.toLowerCase() === 'telephone') {
          record.mobileNumber = value;
        } else if (h.toLowerCase() === 'email address' || h.toLowerCase() === 'email') {
          record.emailAddress = value;
        } else if (h.toLowerCase() === 'company' || h.toLowerCase() === 'company name') {
          record.companyName = value;
        } else if (h.toLowerCase() === 'address') {
          record.address = value;
        } else if (h.toLowerCase() === 'notes' || h.toLowerCase() === 'note') {
          record.notes = value;
        } else if (h.toLowerCase() === 'category') {
          record.category = value;
        } else if (h.toLowerCase() === 'is favorite' || h.toLowerCase() === 'favorite') {
          record.isFavorite = value.toLowerCase() === 'true' || value === '1';
        } else if (h.toLowerCase() === 'tags' || h.toLowerCase() === 'tag') {
          record.tags = value ? value.split(',').map(t => t.trim()) : [];
        }
      });
      list.push(record);
    }
  }

  return list;
}

export function exportToPDF(contacts: Contact[]): void {
  // Rather than installing huge, slow, buggy client-side pdf engines, we trigger
  // a clean print layout preview styled elegantly, or compile a beautiful styled HTML window
  // to save as PDF. This is perfectly reliable, extremely high quality, and 100% standard!
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Contact List Document</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; }
        h1 { font-size: 24px; font-weight: 700; margin-bottom: 5px; color: #0f172a; }
        .subtitle { font-size: 14px; color: #64748b; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; background: #f8fafc; padding: 12px 16px; border-bottom: 2px solid #e2e8f0; color: #475569; }
        td { font-size: 14px; padding: 12px 16px; border-bottom: 1px solid #edf2f7; color: #334155; }
        .badge { display: inline-block; padding: 4px 8px; font-size: 11px; font-weight: 500; border-radius: 4px; background: #e2e8f0; }
        .Work { background: #dbeafe; color: #1e40af; }
        .Family { background: #fce7f3; color: #9d174d; }
        .Friends { background: #dcfce7; color: #15803d; }
        .Business { background: #fef9c3; color: #854d0e; }
        .Other { background: #f1f5f9; color: #475569; }
        .fav { color: #f59e0b; font-weight: bold; }
        @media print {
          body { padding: 0; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
        <div>
          <h1>Contact Manager Directory</h1>
          <div class="subtitle">Generated on ${new Date().toLocaleDateString(undefined, { dateStyle: 'full' })} • Total of ${contacts.length} Contacts</div>
        </div>
        <button onclick="window.print()" style="padding: 10px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 14px;">Print / Save as PDF</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Mobile Number</th>
            <th>Email</th>
            <th>Company</th>
            <th>Category</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          ${contacts.map(c => `
            <tr>
              <td style="font-weight: 600;">${c.fullName} ${c.isFavorite ? '<span class="fav">★</span>' : ''}</td>
              <td style="font-family: monospace;">${c.mobileNumber}</td>
              <td>${c.emailAddress || '-'}</td>
              <td>${c.companyName || '-'}</td>
              <td><span class="badge ${c.category}">${c.category}</span></td>
              <td><span style="font-size: 12px; color: #64748b;">${c.tags.join(', ') || '-'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
