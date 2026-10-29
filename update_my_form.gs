/**
 * ============================================================================
 * 1-CLICK UPGRADE SCRIPT FOR YOUR EXISTING GOOGLE FORM (SINGLE-PAGE CLEAN VERSION)
 * ============================================================================
 * Open your Google Sheet -> Extensions -> Apps Script -> Paste this -> Save & Run.
 */
function upgradeMyExistingForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var formUrl = ss ? ss.getFormUrl() : null;
  if (!formUrl) {
    throw new Error("Please run this from Extensions -> Apps Script inside the Google Sheet linked to your Form.");
  }
  var form = FormApp.openByUrl(formUrl);

  form.setTitle("Broadband Seismology Lab (IIT Kharagpur) — Researcher Profile Form");
  form.setDescription(
    "Submit or update your profile for the Broadband Seismology Lab website.\n" +
    "Fill in your Full Name and any fields you wish to add or update."
  );

  // Preserve the existing File Upload question ("Upload Profile Image") and remove all other items
  var items = form.getItems();
  var fileUploadItem = null;
  for (var i = items.length - 1; i >= 0; i--) {
    var it = items[i];
    if (it.getType() === FormApp.ItemType.FILE_UPLOAD || /upload|image|photo/i.test(it.getTitle())) {
      fileUploadItem = it;
      fileUploadItem.setTitle("Upload Profile Image");
      fileUploadItem.setHelpText("Upload a clear portrait photograph (JPG or PNG).");
    } else {
      form.deleteItem(it);
    }
  }

  // 1. Full Name (without title or examples)
  form.addTextItem()
    .setTitle("Full Name")
    .setHelpText("Enter your full name without title (do not include Dr. or Prof.).")
    .setRequired(true);

  // 2. Two Email Addresses: Institutional & Personal
  form.addTextItem()
    .setTitle("Institutional Email Address")
    .setHelpText("Your institute or official work email address.");

  form.addTextItem()
    .setTitle("Personal Email Address")
    .setHelpText("Your personal email address.");

  // 3. PhD Thesis Title & Brief Overview
  form.addParagraphTextItem()
    .setTitle("PhD Thesis Title and Overview")
    .setHelpText("Title of your PhD / MS thesis.");

  form.addParagraphTextItem()
    .setTitle("Brief Overview")
    .setHelpText("A short 2–4 sentence biography describing your research background and focus.");

  // 4. Research Domains & Seismology Topics (Simple, general topics + Other separated by ";")
  var domainItem = form.addCheckboxItem();
  domainItem.setTitle("Research Domains & Topics")
    .setHelpText("Select your research domains. In 'Other', if adding multiple topics, separate them with ';'.")
    .setChoiceValues([
      "Seismic Attenuation",
      "Seismic Tomography",
      "Receiver Function Analysis",
      "Seismic Anisotropy",
      "Ambient Noise Seismology",
      "Surface Wave Dispersion",
      "Full-Waveform Inversion",
      "Crustal & Lithospheric Structure",
      "Seismotectonics",
      "Earthquake Source Processes",
      "Seismic Hazard & Ground Motion",
      "Induced & Triggered Seismicity",
      "Machine Learning in Seismology",
      "Earthquake Early Warning"
    ])
    .showOtherOption(true);

  // 5. Current Affiliation
  form.addTextItem()
    .setTitle("Current Affiliation")
    .setHelpText("Your current designation, department, and institution/organization.");

  // 6. Previous Affiliation (if any) — single box with From–To year and ";" / new line for multiple affiliations
  form.addParagraphTextItem()
    .setTitle("Previous Affiliation (if any)")
    .setHelpText("Format: Position / Degree, Institution (Year From – Year To). To add multiple previous affiliations, separate them with ';' or put each on a new line.");

  // 7. Academic Profile Links
  form.addTextItem()
    .setTitle("Google Scholar Profile Link")
    .setHelpText("Full Google Scholar URL or your 12-character Scholar ID.");

  form.addTextItem()
    .setTitle("ORCID ID")
    .setHelpText("Your 16-digit ORCID iD or link.");

  form.addTextItem()
    .setTitle("ResearchGate Profile Link")
    .setHelpText("Link to your ResearchGate profile.");

  form.addTextItem()
    .setTitle("Personal Website")
    .setHelpText("Link to your personal webpage or institutional faculty page (if any).");

  // 8. Keep Upload Profile Image at the end
  if (fileUploadItem) {
    form.moveItem(fileUploadItem.getIndex(), form.getItems().length - 1);
  }

  Logger.log("SUCCESS! Form updated cleanly on a single page: " + form.getPublishedUrl());
}
