/**
 * GOOGLE APPS SCRIPT BACKEND WITH DRAG-AND-DROP PHOTO UPLOAD + LIVE GOOGLE SHEET SYNC
 *
 * Why this is even better than a plain Google Form:
 * - Standard Google Forms cannot create a drag-and-drop File Upload via script, and blocks external anonymous uploads.
 * - This script creates the Google Sheet database AND acts as a Web App receiver for your website's built-in
 *   Drag-and-Drop Profile Form (`join.html`)!
 *
 * SETUP (1 minute):
 * 1. Go to https://script.google.com/home -> New project -> paste this file -> Save.
 * 2. Click "Run" (select `setupSheetAndForm`) -> Grant permissions.
 *    Check the Execution Log for your Google Sheet URL (and File -> Share -> Publish to web -> CSV).
 * 3. Click "Deploy" (top right) -> "New deployment" -> Select type: "Web app":
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 *    Click "Deploy" and copy the "Web app URL" (`https://script.google.com/macros/s/.../exec`).
 * 4. Paste that Web app URL into `formWebAppUrl` in `data.js`!
 */

const HEADERS = [
  'Timestamp', 'Full Name', 'Status in Lab', 'Current Position', 'Graduation Year',
  'Thesis Title', 'Research Interests', 'Short Biography', 'Public Email',
  'Google Scholar', 'ORCID', 'ResearchGate', 'Personal Website', 'Profile Photo'
];

function setupSheetAndForm() {
  const ss = SpreadsheetApp.create('Broadband Seismology Lab Website Responses');
  const sheet = ss.getActiveSheet();
  sheet.setName('Responses');
  sheet.appendRow(HEADERS);
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  Logger.log('====================================================');
  Logger.log('1. GOOGLE SHEET CREATED: ' + ss.getUrl());
  Logger.log('2. Now click Deploy -> New deployment -> Web app (Execute as: Me, Who has access: Anyone)');
  Logger.log('   and paste the Web app URL into data.js (formWebAppUrl)!');
  Logger.log('====================================================');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('Responses') || ss.getSheets()[0];

    const rows = sheet.getDataRange().getValues();
    let targetRow = -1;
    const norm = s => String(s || '').toLowerCase().replace(/prof\.|dr\.|[^a-z ]/g, '').trim();
    for (let i = 1; i < rows.length; i++) {
      if (norm(rows[i][1]) === norm(data.name)) {
        targetRow = i + 1;
        break;
      }
    }

    // Keep existing photo if user didn't drag-and-drop a new one on this edit
    let photoVal = data.photo || '';
    if (!photoVal && targetRow > 0) {
      photoVal = rows[targetRow - 1][13] || '';
    }

    const rowValues = [
      new Date().toISOString(),
      data.name || '',
      data.status || '',
      data.position || '',
      data.gradYear || '',
      data.thesis || '',
      data.interests || '',
      data.bio || '',
      data.email || '',
      data.scholar || '',
      data.orcid || '',
      data.researchgate || '',
      data.web || '',
      photoVal
    ];

    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
