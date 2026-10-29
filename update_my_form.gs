/**
 * ============================================================================
 * 1-CLICK UPGRADE SCRIPT FOR YOUR EXISTING GOOGLE FORM (FIXED FOR FILE_UPLOAD)
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

  // IMPORTANT: Google Forms API does NOT allow calling .setTitle(), .setHelpText(),
  // or .moveItem() on a FILE_UPLOAD item (it throws "Invalid data updating form").
  // Also, MULTIPLE_CHOICE items with page-navigation must be deleted BEFORE PAGE_BREAK items.
  // Pass 1: Delete all normal items (except FILE_UPLOAD and PAGE_BREAK)
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) {
    var t = items[i].getType();
    if (t !== FormApp.ItemType.FILE_UPLOAD && t !== FormApp.ItemType.PAGE_BREAK) {
      form.deleteItem(items[i]);
    }
  }
  // Pass 2: Now safely delete any PAGE_BREAK items
  var rem = form.getItems();
  for (var j = rem.length - 1; j >= 0; j--) {
    if (rem[j].getType() === FormApp.ItemType.PAGE_BREAK) {
      form.deleteItem(rem[j]);
    }
  }

  // Helper to add each item and place it BEFORE the File Upload item (without moving the File Upload item itself)
  var created = [];
  function keep(item) {
    created.push(item);
    return item;
  }

  // 1. Full Name (without title or examples)
  keep(form.addTextItem()
    .setTitle("Full Name")
    .setHelpText("Enter your full name without title (do not include Dr. or Prof.).")
    .setRequired(true));

  // 2. Two Email Addresses: Institutional & Personal
  keep(form.addTextItem()
    .setTitle("Institutional Email Address")
    .setHelpText("Your institute or official work email address."));

  keep(form.addTextItem()
    .setTitle("Personal Email Address")
    .setHelpText("Your personal email address."));

  // 3. PhD Thesis Title & Brief Overview
  keep(form.addParagraphTextItem()
    .setTitle("PhD Thesis Title and Overview")
    .setHelpText("Title of your PhD / MS thesis."));

  keep(form.addParagraphTextItem()
    .setTitle("Brief Overview")
    .setHelpText("A short 2–4 sentence biography describing your research background and focus."));

  // 4. Research Domains & Topics (Simple, general topics + Other separated by ";")
  keep(form.addCheckboxItem()
    .setTitle("Research Domains & Topics")
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
    .showOtherOption(true));

  // 5. Current Affiliation
  keep(form.addTextItem()
    .setTitle("Current Affiliation")
    .setHelpText("Your current designation, department, and institution/organization."));

  // 6. Previous Affiliation (if any) — single box with From–To year and ";" / new line for multiple affiliations
  keep(form.addParagraphTextItem()
    .setTitle("Previous Affiliation (if any)")
    .setHelpText("Format: Position / Degree, Institution (Year From – Year To). To add multiple previous affiliations, separate them with ';' or put each on a new line."));

  // 7. Academic Profile Links
  keep(form.addTextItem()
    .setTitle("Google Scholar Profile Link")
    .setHelpText("Full Google Scholar URL or your 12-character Scholar ID."));

  keep(form.addTextItem()
    .setTitle("ORCID ID")
    .setHelpText("Your 16-digit ORCID iD or link."));

  keep(form.addTextItem()
    .setTitle("ResearchGate Profile Link")
    .setHelpText("Link to your ResearchGate profile."));

  keep(form.addTextItem()
    .setTitle("Personal Website")
    .setHelpText("Link to your personal webpage or institutional faculty page (if any)."));

  // Move our newly created items to the top (indices 0 .. created.length-1),
  // which automatically leaves "Upload Profile Image" at the very bottom!
  for (var k = 0; k < created.length; k++) {
    form.moveItem(created[k].getIndex(), k);
  }

  Logger.log("SUCCESS! Form updated cleanly on a single page: " + form.getPublishedUrl());
}
