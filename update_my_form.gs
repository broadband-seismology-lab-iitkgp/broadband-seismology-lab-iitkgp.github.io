/**
 * ============================================================================
 * 1-CLICK UPGRADE SCRIPT FOR YOUR EXISTING GOOGLE FORM
 * ============================================================================
 * Form URL stays the exact same:
 * https://docs.google.com/forms/d/e/1FAIpQLSdfI0O4l3guIgTeRflh-GBpwBQFOuXrEA1G02-NyYPHcDXpIA/viewform
 *
 * HOW TO RUN THIS (TAKES 15 SECONDS):
 * 1. Open your Google Form's linked Google Sheet (where responses arrive).
 * 2. Click "Extensions" -> "Apps Script" in the top menu.
 * 3. Delete any code in the editor and paste this entire script.
 * 4. Click "Save" (floppy disk icon) and click "Run" (▶) on `upgradeMyExistingForm`.
 * 5. Approve permissions when prompted.
 *
 * What this script modifies on your existing Google Form (without deleting your
 * File Upload question or changing your Form/Sheet links):
 *   1. Splits Email into TWO fields:
 *      - "Institutional / Official Email Address" (e.g., @gg.iitkgp.ac.in, @kgpian.iitkgp.ac.in)
 *      - "Personal Email Address" (e.g., @gmail.com)
 *   2. Adds Current Affiliation with Year From & Year To/Present
 *   3. Replaces "Previous Affiliations" with structured entries + option to add
 *      multiple previous affiliations with "Year From" and "Year To" (using
 *      "Add another Previous Affiliation? Yes/No" sections so it stays clean!)
 *   4. Converts "Topics of Research Interest" into an informative "Research Domains
 *      & Seismology Topics" Checkboxes selector (Attenuation, Receiver Functions,
 *      Shear-Wave Splitting, Ambient Noise Tomography, FWI, Seismotectonics, etc.
 *      + "Other..." option for custom topics).
 * ============================================================================
 */
function upgradeMyExistingForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var formUrl = ss ? ss.getFormUrl() : null;
  if (!formUrl) {
    throw new Error("Please run this script from Extensions -> Apps Script inside the Google Sheet linked to your Google Form.");
  }
  var form = FormApp.openByUrl(formUrl);

  form.setTitle("Broadband Seismology Lab (IIT Kharagpur) — Researcher Profile Form");
  form.setDescription(
    "Submit or update your profile for the Broadband Seismology Lab website (https://broadband-seismology-lab-iitkgp.github.io/).\n" +
    "You only need to fill in your Name (or Email/Scholar ID) and the specific fields you wish to add or update."
  );

  // Keep any existing File Upload item ("Upload Profile Image") intact because
  // Google Forms API does not allow creating new File Upload items from scratch;
  // remove all other old items so we can rebuild them cleanly in the right order.
  var items = form.getItems();
  var fileUploadItem = null;
  for (var i = items.length - 1; i >= 0; i--) {
    var it = items[i];
    if (it.getType() === FormApp.ItemType.FILE_UPLOAD || /upload|image|photo/i.test(it.getTitle())) {
      fileUploadItem = it;
      fileUploadItem.setTitle("Upload Profile Image");
      fileUploadItem.setHelpText("Upload a clear portrait photograph (JPG or PNG). It will be framed in the rectangular portrait layout on your profile page.");
    } else {
      form.deleteItem(it);
    }
  }

  // 1. Full Name
  form.addTextItem()
    .setTitle("Full Name")
    .setHelpText("Enter your full name (e.g., Shirish Bose, Dr. Rahul Biswas, Prof. Arun Singh).")
    .setRequired(true);

  // 2. Two Email Addresses: Institutional & Personal
  form.addTextItem()
    .setTitle("Institutional / Official Email Address")
    .setHelpText("Your institute or work email address (e.g., name@gg.iitkgp.ac.in, name@kgpian.iitkgp.ac.in, or current employer email).");

  form.addTextItem()
    .setTitle("Personal Email Address")
    .setHelpText("Your personal or permanent email address (e.g., name@gmail.com).");

  // 3. PhD / MS Thesis Title & Brief Overview
  form.addParagraphTextItem()
    .setTitle("PhD Thesis Title and Overview")
    .setHelpText("Title of your PhD / MS thesis at IIT Kharagpur.");

  form.addParagraphTextItem()
    .setTitle("Brief Overview")
    .setHelpText("A short 2–4 sentence biography describing your research background and focus.");

  // 4. Informative Research Domains / Research Topics (Checkboxes + Other)
  var domainItem = form.addCheckboxItem();
  domainItem.setTitle("Research Domains & Seismology Topics")
    .setHelpText("Select your primary research domains and methodologies (tick all that apply, and use 'Other' to add any specific topic):")
    .setChoiceValues([
      "Seismic Wave Attenuation & Coda Q (Pg, Lg, Sn, Qc, Q0)",
      "Receiver Function Analysis & Crustal Structure (P-RF, S-RF, H-k Stacking)",
      "Seismic Anisotropy & Shear-Wave Splitting (SKS, SKKS, Direct-S)",
      "Ambient Seismic Noise & Surface-Wave Dispersion Tomography",
      "Body-Wave & Local Earthquake Travel-Time Tomography",
      "Full-Waveform Inversion (FWI) & Waveform Modeling",
      "Himalayan, Tibetan Plateau & Indo-Burman Seismotectonics",
      "Cratonic Lithosphere, Indian Shield & Sedimentary Basins",
      "Earthquake Source Parameters, Focal Mechanisms & Stress Drop",
      "Seismic Hazard Assessment, Site Response & Ground Motion",
      "Reservoir-Triggered & Induced Seismicity",
      "Deep Learning, AI & Earthquake Early Warning Systems"
    ])
    .showOtherOption(true);

  // 5. Current Affiliation (with Year From & Year To/Present)
  form.addTextItem()
    .setTitle("Current Affiliation")
    .setHelpText("Your current designation, department, and institution/company (e.g., Senior Scientist, CSIR-NGRI Hyderabad OR PhD Scholar, Dept. of Geology & Geophysics, IIT Kharagpur).");

  form.addTextItem()
    .setTitle("Current Affiliation — Year From")
    .setHelpText("Starting year of your current position (e.g., 2021).");

  form.addTextItem()
    .setTitle("Current Affiliation — Year To (or Present)")
    .setHelpText("Enter 'Present' or end year (e.g., Present).");

  // 6. Previous Affiliations (with Year From, Year To, and option to add more!)
  form.addSectionHeaderItem()
    .setTitle("Previous Affiliations & Past Positions")
    .setHelpText("Add your previous positions, postdoctoral fellowships, or degrees along with the years (From – To).");

  form.addTextItem()
    .setTitle("Previous Affiliation 1 — Position / Degree & Institution")
    .setHelpText("E.g., Postdoctoral Researcher, University of Naples Federico II OR M.Sc. Geophysics, BHU Varanasi");

  form.addTextItem()
    .setTitle("Previous Affiliation 1 — Year From")
    .setHelpText("Start year (e.g., 2018)");

  form.addTextItem()
    .setTitle("Previous Affiliation 1 — Year To")
    .setHelpText("End year (e.g., 2020)");

  var addMore1 = form.addMultipleChoiceItem()
    .setTitle("Do you want to add a 2nd Previous Affiliation?");

  // Section for Previous Affiliation 2
  var secAff2 = form.addPageBreakItem()
    .setTitle("Previous Affiliation 2");

  form.addTextItem()
    .setTitle("Previous Affiliation 2 — Position / Degree & Institution")
    .setHelpText("E.g., Senior Research Fellow, IIT Kharagpur");

  form.addTextItem()
    .setTitle("Previous Affiliation 2 — Year From")
    .setHelpText("Start year (e.g., 2016)");

  form.addTextItem()
    .setTitle("Previous Affiliation 2 — Year To")
    .setHelpText("End year (e.g., 2018)");

  var addMore2 = form.addMultipleChoiceItem()
    .setTitle("Do you want to add a 3rd Previous Affiliation?");

  // Section for Previous Affiliation 3
  var secAff3 = form.addPageBreakItem()
    .setTitle("Previous Affiliation 3");

  form.addTextItem()
    .setTitle("Previous Affiliation 3 — Position / Degree & Institution")
    .setHelpText("E.g., B.Sc. (Hons.) Geological Sciences, Jadavpur University");

  form.addTextItem()
    .setTitle("Previous Affiliation 3 — Year From")
    .setHelpText("Start year (e.g., 2013)");

  form.addTextItem()
    .setTitle("Previous Affiliation 3 — Year To")
    .setHelpText("End year (e.g., 2016)");

  // Section for Academic Profile Links & Photo
  var secLinks = form.addPageBreakItem()
    .setTitle("Academic Profile Links & Photograph")
    .setHelpText("Provide your external research profile links and portrait photo.");

  // Wire up the Yes/No branching so users who select "No" skip straight to Academic Links!
  addMore1.setChoices([
    addMore1.createChoice("Yes — add another previous affiliation", secAff2),
    addMore1.createChoice("No — continue to Academic Profile Links", secLinks)
  ]);
  addMore2.setChoices([
    addMore2.createChoice("Yes — add a 3rd previous affiliation", secAff3),
    addMore2.createChoice("No — continue to Academic Profile Links", secLinks)
  ]);

  form.addTextItem()
    .setTitle("Google Scholar Profile Link")
    .setHelpText("Full Google Scholar URL (e.g., https://scholar.google.com/citations?user=XXXXXXXXXXXX) or your 12-character Scholar ID.");

  form.addTextItem()
    .setTitle("ORCID ID")
    .setHelpText("Your 16-digit ORCID iD or link (e.g., 0000-0002-1825-0097).");

  form.addTextItem()
    .setTitle("ResearchGate Profile Link")
    .setHelpText("E.g., https://www.researchgate.net/profile/Your-Name");

  form.addTextItem()
    .setTitle("Personal Website")
    .setHelpText("Link to your personal webpage or institutional faculty page (if any).");

  // Move existing File Upload item to the very bottom of the form so it appears right after the links
  if (fileUploadItem) {
    form.moveItem(fileUploadItem.getIndex(), form.getItems().length - 1);
  }

  Logger.log("SUCCESS! Your existing Google Form has been upgraded in-place.");
  Logger.log("Live Form URL: " + form.getPublishedUrl());
}
