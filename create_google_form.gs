/**
 * ONE-CLICK GOOGLE FORM GENERATOR FOR BROADBAND SEISMOLOGY LAB IITKGP
 *
 * HOW TO RUN (Takes 30 seconds):
 * 1. Go to https://script.google.com/home and click "New project".
 * 2. Delete any code in the editor and paste this entire file.
 * 3. Click "Save" (floppy disk icon) and click "Run" (play button at top).
 * 4. Grant permission when Google asks.
 * 5. Look at the "Execution log" at the bottom — it will print:
 *    - Your live Google Form URL (to share with lab members)
 *    - Your Google Form Editor URL
 *    - Your linked Google Sheet URL (where responses arrive)
 */
function createBroadbandSeismologyLabForm() {
  const form = FormApp.create('Broadband Seismology Lab (IIT Kharagpur) — Website Profile Form');
  form.setDescription(
    'Please fill out this form to create or update your profile on the Broadband Seismology Lab website (https://broadband-seismology-lab-iitkgp.github.io/).\n\n' +
    'You can edit your response anytime in the future using the "Edit your response" link after submitting, or by re-submitting with the same Full Name.'
  );
  // Make the form updatable by respondents & collect email
  form.setAllowResponseEdits(true);
  form.setCollectEmail(true);
  form.setConfirmationMessage('Thank you! Your profile details have been recorded for the Broadband Seismology Lab website. Save the "Edit your response" link above if you wish to update your details later.');

  // 1. Full Name
  form.addTextItem()
    .setTitle('Full Name')
    .setHelpText('Enter your name as it appears on the lab website (e.g., Shirish Bose, Debasis D. Mohanty, Maitreyi).')
    .setRequired(true);

  // 2. Role / Status
  const statusItem = form.addMultipleChoiceItem();
  statusItem.setTitle('Status in Lab')
    .setChoices([
      statusItem.createChoice('Current PhD Scholar'),
      statusItem.createChoice('Current MS / MTech / Integrated MTech Student'),
      statusItem.createChoice('Postdoctoral Fellow / Research Associate'),
      statusItem.createChoice('PhD Alumni (Graduated)'),
      statusItem.createChoice('MS Alumni (Graduated)'),
      statusItem.createChoice('Principal Investigator (Faculty)')
    ])
    .setRequired(true);

  // 3. Current Position & Organization
  form.addTextItem()
    .setTitle('Current Position & Affiliation')
    .setHelpText('For current students: e.g., "PhD Scholar (Prime Minister\'s Research Fellow), Dept. of Geology & Geophysics, IIT Kharagpur".\nFor Alumni: your current designation & institute/company, e.g., "Assistant Professor, Dept. of Applied Geophysics, IIT (ISM) Dhanbad" or "Senior Scientist, CSIR-NGRI Hyderabad".')
    .setRequired(true);

  // 4. Graduation Year (for Alumni)
  form.addTextItem()
    .setTitle('Graduation Year (for Alumni only)')
    .setHelpText('e.g., 2024 (leave blank if currently enrolled)');

  // 5. Thesis Title (for Alumni or senior PhD)
  form.addParagraphTextItem()
    .setTitle('PhD / MS Thesis Title')
    .setHelpText('Enter your thesis title (for Alumni or current scholars who have finalized their topic).');

  // 6. Research Area & Interests
  form.addTextItem()
    .setTitle('Research Interests / Keywords')
    .setHelpText('Comma-separated keywords (3 to 6 topics), e.g.: Seismology, Seismic Wave Attenuation, Receiver Functions, Shear-Wave Splitting, Himalayan Seismotectonics')
    .setRequired(true);

  // 7. Short Biography
  form.addParagraphTextItem()
    .setTitle('Short Biography / Research Overview')
    .setHelpText('2–5 sentences describing your research focus, academic background, and regions/methods of interest.');

  // 8. Public Contact Email
  form.addTextItem()
    .setTitle('Public Email Address (for your profile page)')
    .setHelpText('The email address you want visitors/collaborators to see on your lab profile page.');

  // 9. Google Scholar Profile URL
  form.addTextItem()
    .setTitle('Google Scholar Profile Link')
    .setHelpText('Paste your full Google Scholar profile URL, e.g.: https://scholar.google.com/citations?user=TPNNtLYAAAAJ&hl=en (Used to automatically sync your publications, Citations, h-index, and i10-index!)');

  // 10. ORCID iD URL
  form.addTextItem()
    .setTitle('ORCID Link or ID')
    .setHelpText('e.g.: https://orcid.org/0009-0008-2475-0363');

  // 11. ResearchGate Profile URL
  form.addTextItem()
    .setTitle('ResearchGate Profile Link')
    .setHelpText('e.g.: https://www.researchgate.net/profile/Shirish-Bose-2');

  // 12. Personal Website / LinkedIn URL
  form.addTextItem()
    .setTitle('Personal Website or LinkedIn Link (Optional)')
    .setHelpText('e.g.: https://sites.google.com/view/... or https://www.linkedin.com/in/...');

  // 13. Profile Photo Link
  form.addTextItem()
    .setTitle('Profile Photo (Google Drive Link or Direct Image URL)')
    .setHelpText('Upload your passport/profile photo to Google Drive, set sharing to "Anyone with the link can view", and paste the link here! (Note: Google Forms can also add a direct File Upload question in the Form editor if you restrict the form to signed-in Google accounts).');

  // Create & link response spreadsheet
  const ss = SpreadsheetApp.create('Broadband Seismology Lab Website Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('====================================================');
  Logger.log('SUCCESS! Your Google Form and Response Sheet are ready:');
  Logger.log('1. SHARE THIS FORM LINK WITH LAB MEMBERS: ' + form.getPublishedUrl());
  Logger.log('2. EDIT FORM HERE: ' + form.getEditUrl());
  Logger.log('3. RESPONSES GOOGLE SHEET: ' + ss.getUrl());
  Logger.log('====================================================');
}
