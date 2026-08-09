/**
 * Hiligaynon SLA Mastery Dashboard — Apps Script backend.
 *
 * Bind this script to the Google Sheet that stores your data, then
 * Deploy > New deployment > Web app (Execute as: Me, Access: Anyone with the link).
 * Paste the resulting /exec URL into the app's Settings panel.
 */

const SPREADSHEET_ID = '1zY2OxL3Yi8tGqhnCZMbQEiaOcXyBWqCKjKYOohhZLDo';
const SHEET_VOCAB = 'Vocab';
const SHEET_LOG = 'Log';
const SHEET_STAGES = 'Stages';
const SHEET_CONCEPTS = 'Concepts';

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  const ss = getSpreadsheet();
  const data = {
    vocab: sheetToObjects(ss, SHEET_VOCAB),
    log: sheetToObjects(ss, SHEET_LOG),
    stages: sheetToObjects(ss, SHEET_STAGES),
    concepts: sheetToObjects(ss, SHEET_CONCEPTS),
  };
  return jsonResponse(data);
}

// Apps Script can't set CORS response headers on preflight OPTIONS requests,
// so the frontend must POST with Content-Type: text/plain to stay a "simple
// request" and avoid a preflight. The body is still JSON; we parse it here.
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  const ss = getSpreadsheet();

  switch (action) {
    case 'markVocab':
      updateVocabMastery(ss, body.hil, body.mastered);
      break;
    case 'logEntry':
      appendLogEntry(ss, body.type, body.detail, body.latencySeconds);
      break;
    case 'setStage':
      updateStageStatus(ss, body.stageId, body.status);
      break;
    case 'setMnemonic':
      updateMnemonic(ss, body.hil, body.mnemonic, body.mnemonicImageUrl);
      break;
    case 'markConcept':
      updateConceptMastery(ss, body.name, body.mastered, body.bloomLevel);
      break;
    case 'updateSRS':
      updateConceptSRS(ss, body.name, body.currentStepIndex, body.consecutivePasses, body.nextReviewDue, body.totalReviews, body.firstTryFailures);
      break;
    case 'addVocab':
      addVocabWord(ss, body.eng, body.hil, body.cat, body.phase);
      break;
    default:
      return jsonResponse({ error: 'Unknown action: ' + action });
  }

  return jsonResponse({ ok: true });
}

function sheetToObjects(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function updateVocabMastery(ss, hil, mastered) {
  const sheet = ss.getSheetByName(SHEET_VOCAB);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const hilCol = headers.indexOf('hil');
  const masteredCol = headers.indexOf('mastered');
  const timesCorrectCol = headers.indexOf('timesCorrect');
  const timesMissedCol = headers.indexOf('timesMissed');
  const lastReviewedCol = headers.indexOf('lastReviewed');

  for (let r = 1; r < values.length; r++) {
    if (values[r][hilCol] === hil) {
      sheet.getRange(r + 1, masteredCol + 1).setValue(mastered);
      const counterCol = mastered ? timesCorrectCol : timesMissedCol;
      const current = values[r][counterCol] || 0;
      sheet.getRange(r + 1, counterCol + 1).setValue(current + 1);
      sheet.getRange(r + 1, lastReviewedCol + 1).setValue(new Date());
      break;
    }
  }
}

function updateMnemonic(ss, hil, mnemonic, mnemonicImageUrl) {
  const sheet = ss.getSheetByName(SHEET_VOCAB);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const hilCol = headers.indexOf('hil');
  const mnemonicCol = headers.indexOf('mnemonic');
  const imageCol = headers.indexOf('mnemonicImageUrl');

  for (let r = 1; r < values.length; r++) {
    if (values[r][hilCol] === hil) {
      sheet.getRange(r + 1, mnemonicCol + 1).setValue(mnemonic || '');
      sheet.getRange(r + 1, imageCol + 1).setValue(mnemonicImageUrl || '');
      break;
    }
  }
}

function updateConceptMastery(ss, name, mastered, bloomLevel) {
  const sheet = ss.getSheetByName(SHEET_CONCEPTS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const nameCol = headers.indexOf('name');
  const masteredCol = headers.indexOf('mastered');
  const timesCorrectCol = headers.indexOf('timesCorrect');
  const timesMissedCol = headers.indexOf('timesMissed');
  const lastReviewedCol = headers.indexOf('lastReviewed');
  const bloomLevelCol = headers.indexOf('bloomLevel');

  for (let r = 1; r < values.length; r++) {
    if (values[r][nameCol] === name) {
      sheet.getRange(r + 1, masteredCol + 1).setValue(mastered);
      const counterCol = mastered ? timesCorrectCol : timesMissedCol;
      const current = values[r][counterCol] || 0;
      sheet.getRange(r + 1, counterCol + 1).setValue(current + 1);
      sheet.getRange(r + 1, lastReviewedCol + 1).setValue(new Date());
      if (bloomLevel !== undefined && bloomLevel !== null && bloomLevelCol !== -1) {
        sheet.getRange(r + 1, bloomLevelCol + 1).setValue(bloomLevel);
      }
      break;
    }
  }
}

function updateConceptSRS(ss, name, currentStepIndex, consecutivePasses, nextReviewDue, totalReviews, firstTryFailures) {
  const sheet = ss.getSheetByName(SHEET_CONCEPTS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const nameCol = headers.indexOf('name');

  // Ensure SRS columns exist; add them if missing
  const srsColumns = ['currentStepIndex', 'consecutivePasses', 'nextReviewDue', 'totalReviews', 'firstTryFailures'];
  let currentHeaders = sheet.getDataRange().getValues()[0];
  for (const col of srsColumns) {
    if (currentHeaders.indexOf(col) === -1) {
      sheet.getRange(1, currentHeaders.length + 1).setValue(col);
      currentHeaders.push(col);
    }
  }

  // Re-read after potential column additions
  const updatedHeaders = sheet.getDataRange().getValues()[0];
  const stepCol = updatedHeaders.indexOf('currentStepIndex');
  const passesCol = updatedHeaders.indexOf('consecutivePasses');
  const nextDueCol = updatedHeaders.indexOf('nextReviewDue');
  const totalCol = updatedHeaders.indexOf('totalReviews');
  const failCol = updatedHeaders.indexOf('firstTryFailures');
  const lastReviewedCol = updatedHeaders.indexOf('lastReviewed');

  for (let r = 1; r < values.length; r++) {
    if (values[r][nameCol] === name) {
      sheet.getRange(r + 1, stepCol + 1).setValue(currentStepIndex);
      sheet.getRange(r + 1, passesCol + 1).setValue(consecutivePasses);
      sheet.getRange(r + 1, nextDueCol + 1).setValue(nextReviewDue || '');
      sheet.getRange(r + 1, totalCol + 1).setValue(totalReviews || 0);
      sheet.getRange(r + 1, failCol + 1).setValue(firstTryFailures || 0);
      if (lastReviewedCol !== -1) {
        sheet.getRange(r + 1, lastReviewedCol + 1).setValue(new Date());
      }
      break;
    }
  }
}

function addVocabWord(ss, eng, hil, cat, phase) {
  const sheet = ss.getSheetByName(SHEET_VOCAB);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const hilCol = headers.indexOf('hil');

  // Check if word already exists (case-insensitive)
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][hilCol]).toLowerCase().trim() === hil.toLowerCase().trim()) {
      return; // already exists, skip
    }
  }

  // Determine column order from headers and build the row
  const row = headers.map(h => {
    switch (h) {
      case 'eng': return eng || '';
      case 'hil': return hil || '';
      case 'cat': return cat || '';
      case 'phase': return phase || '';
      case 'mastered': return false;
      case 'timesCorrect': return 0;
      case 'timesMissed': return 0;
      case 'lastReviewed': return '';
      case 'mnemonic': return '';
      case 'mnemonicImageUrl': return '';
      default: return '';
    }
  });
  sheet.appendRow(row);
}

function appendLogEntry(ss, type, detail, latencySeconds) {
  const sheet = ss.getSheetByName(SHEET_LOG);
  sheet.appendRow([new Date(), type, detail, latencySeconds || '']);
}

function updateStageStatus(ss, stageId, status) {
  const sheet = ss.getSheetByName(SHEET_STAGES);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(stageId)) {
      sheet.getRange(r + 1, statusCol + 1).setValue(status);
      break;
    }
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the Apps Script editor (select seedData, click Run)
 * to create the sheets and populate them with your Sapi-an farm starter data.
 */
function seedData() {
  const ss = getSpreadsheet();

  const vocabSheet = getOrCreateSheet(ss, SHEET_VOCAB);
  vocabSheet.clear();
  vocabSheet.appendRow(['eng', 'hil', 'cat', 'mastered', 'timesCorrect', 'timesMissed', 'lastReviewed', 'mnemonic', 'mnemonicImageUrl']);
  const vocab = [
    ['Move / Transfer object', 'Saylo', 'Actions'],
    ['Shift body / Wiggle', 'Gihuk', 'Actions'],
    ['Step aside / Move out of way', 'Iwas', 'Commands'],
    ['Lazy', 'Tamad', 'Descriptors'],
    ['Cheap / Stingy person', 'Kuripot', 'Descriptors'],
    ['Cheap item / Price', 'Barato', 'Descriptors'],
    ['Rushed job / Cutting corners', 'Kinadali', 'Descriptors'],
    ['Surface-level / Careless', 'Hapaw', 'Descriptors'],
    ['Heavy Bolo / Machete', 'Sanduko', 'Farm Tools'],
    ['Helper / Worker', 'Bata-bata', 'Roles'],
    ['Where is (Object)?', 'Diin ang...', 'Patterns'],
    ['Where is (Person)?', 'Diin si...', 'Patterns'],
    ['There is / Located', 'May ara', 'Patterns'],
  ];
  vocab.forEach(([eng, hil, cat]) => vocabSheet.appendRow([eng, hil, cat, false, 0, 0, '', '', '']));

  const logSheet = getOrCreateSheet(ss, SHEET_LOG);
  logSheet.clear();
  logSheet.appendRow(['timestamp', 'type', 'detail', 'latencySeconds']);

  const stagesSheet = getOrCreateSheet(ss, SHEET_STAGES);
  stagesSheet.clear();
  stagesSheet.appendRow(['id', 'name', 'focus', 'status']);
  stagesSheet.appendRow([1, 'Stage 1', 'Survival phrases & greetings', 'Done']);
  stagesSheet.appendRow([2, 'Stage 2', 'Commands & Verb Focus', 'In Progress']);
  stagesSheet.appendRow([3, 'Stage 3', 'Descriptive language & storytelling', 'Not Started']);
  stagesSheet.appendRow([4, 'Stage 4', 'Conversational fluency', 'Not Started']);

  ss.setActiveSheet(vocabSheet);
}

/**
 * Run this once if your Vocab sheet was created before the mnemonic
 * feature existed — adds the two new columns without touching existing rows.
 */
function addMnemonicColumns() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_VOCAB);
  const headers = sheet.getDataRange().getValues()[0];

  if (headers.indexOf('mnemonic') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('mnemonic');
    headers.push('mnemonic');
  }
  if (headers.indexOf('mnemonicImageUrl') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('mnemonicImageUrl');
  }
}

/**
 * Run this once from the Apps Script editor to replace the Stages plan with
 * the 4-phase Hiligaynon curriculum and add any new vocab words that aren't
 * already in your Vocab sheet. Non-destructive: existing vocab rows (mastery,
 * mnemonics, review counts) are left untouched — words already present
 * (matched case-insensitively) are skipped, not overwritten.
 */
function importCurriculum() {
  const ss = getSpreadsheet();

  const stagesSheet = getOrCreateSheet(ss, SHEET_STAGES);
  stagesSheet.clear();
  stagesSheet.appendRow(['id', 'name', 'focus', 'status']);
  stagesSheet.appendRow([1, 'Phase 1: Core Survival & Location', 'Navigate the immediate environment, point to things, ask basic questions, and declare what exists or is missing.', 'In Progress']);
  stagesSheet.appendRow([2, 'Phase 2: Daily Farm Operations & Verb Focus', 'Direct labor, describe how work is done, assign ownership, and issue commands on the farm.', 'Not Started']);
  stagesSheet.appendRow([3, 'Phase 3: Troubleshooting & Market Interactions', 'Complain about bad work, express conditions/feelings, negotiate prices, and count objects.', 'Not Started']);
  stagesSheet.appendRow([4, 'Phase 4: Natural Socializing & Nuance', 'Express thoughts, recall memories, understand social dynamics, and navigate abstract communication.', 'Not Started']);

  const newVocab = [
    // Phase 1 — Existence / Negation
    ['there is', 'may ara', 'Existence / Negation'],
    ['none', 'wala', 'Existence / Negation'],
    ['no/not', 'indi', 'Existence / Negation'],
    ['not yet', 'bwas', 'Existence / Negation'],
    ["don't", 'ayaw', 'Existence / Negation'],
    // Phase 1 — Markers
    ['the (topic)', 'ang', 'Markers'],
    ['the (object)', 'sang', 'Markers'],
    ['[person marker]', 'si', 'Markers'],
    ["[person's]", 'ni', 'Markers'],
    ['to/at/in', 'sa', 'Markers'],
    ['towards [person]', 'kay', 'Markers'],
    // Phase 1 — Pointers (Location)
    ['here it is', 'ari', 'Pointers (Location)'],
    ['there it is', 'ara', 'Pointers (Location)'],
    ['over there', 'adto', 'Pointers (Location)'],
    ['here', 'diri', 'Pointers (Location)'],
    ['there', 'dira', 'Pointers (Location)'],
    ['yonder', 'didto', 'Pointers (Location)'],
    // Phase 1 — Question Words
    ['where', 'diin', 'Question Words'],
    ['what', 'ano', 'Question Words'],
    ['who', 'sin-o', 'Question Words'],
    ['when', 'san-o', 'Question Words'],
    ['why', 'nga', 'Question Words'],
    // Phase 1 — Actor Pronouns
    ['I', 'ako', 'Actor Pronouns'],
    ['you', 'ikaw (ka)', 'Actor Pronouns'],
    ['he/she', 'sia', 'Actor Pronouns'],
    ['we (inclusive)', 'kita', 'Actor Pronouns'],
    ['we (exclusive)', 'kami', 'Actor Pronouns'],
    ['you all', 'kamo', 'Actor Pronouns'],
    ['they', 'sila', 'Actor Pronouns'],
    // Phase 1 — Basic Nouns
    ['house', 'balay', 'Basic Nouns'],
    ['farm/field', 'uma', 'Basic Nouns'],
    ['water', 'tubig', 'Basic Nouns'],
    ['person', 'tawo', 'Basic Nouns'],

    // Phase 2 — Owner/Doer Pronouns
    ['my/by me', 'ko', 'Owner/Doer Pronouns'],
    ['your/by you', 'mo', 'Owner/Doer Pronouns'],
    ['his/her', 'niya', 'Owner/Doer Pronouns'],
    ['our (inc)', 'naton', 'Owner/Doer Pronouns'],
    ['our (exc)', 'namon', 'Owner/Doer Pronouns'],
    ['your all', 'ninyo', 'Owner/Doer Pronouns'],
    ['their', 'nila', 'Owner/Doer Pronouns'],
    // Phase 2 — Farm Nouns (Sapi-an)
    ['grass', 'kogon', 'Farm Nouns (Sapi-an)'],
    ['electrical', 'kuryente', 'Farm Nouns (Sapi-an)'],
    ['road/path', 'dalan', 'Farm Nouns (Sapi-an)'],
    // Phase 2 — Movement Verbs
    ['go', 'kadto', 'Movement Verbs'],
    ['come from', 'halin', 'Movement Verbs'],
    ['go up', 'saka', 'Movement Verbs'],
    ['go down', 'naog', 'Movement Verbs'],
    // Phase 2 — Labor Verbs
    ['work/do', 'obra (ubra)', 'Labor Verbs'],
    ['slice', 'kihad', 'Labor Verbs'],
    ['sever/cut', 'utod', 'Labor Verbs'],
    ['repair', 'kay-o', 'Labor Verbs'],
    ['clean', 'limpyo', 'Labor Verbs'],
    ['plant', 'tanum', 'Labor Verbs'],
    // Phase 2 — Daily Survival Verbs
    ['eat', 'kaon', 'Daily Survival Verbs'],
    ['drink', 'inum', 'Daily Survival Verbs'],
    ['sleep', 'turog', 'Daily Survival Verbs'],
    ['wake up', 'bugtaw', 'Daily Survival Verbs'],
    ['get/take', 'kuha', 'Daily Survival Verbs'],
    ['give', 'hatag', 'Daily Survival Verbs'],
    ['rest', 'pahuway', 'Daily Survival Verbs'],
    // Phase 2 — Basic Descriptors
    ['hardworking', 'kugi', 'Basic Descriptors'],
    ['big', 'daku', 'Basic Descriptors'],
    ['small', 'gamay', 'Basic Descriptors'],
    ['hot', 'init', 'Basic Descriptors'],
    ['cold', 'tugnaw', 'Basic Descriptors'],
    ['new', 'bag-o', 'Basic Descriptors'],
    ['old', 'daan', 'Basic Descriptors'],

    // Phase 3 — Connectors/Clitics
    ['and', 'kag', 'Connectors/Clitics'],
    ['but', 'pero', 'Connectors/Clitics'],
    ['because', 'kay', 'Connectors/Clitics'],
    ['really (emphasis)', 'gid', 'Connectors/Clitics'],
    ['also/too', 'man', 'Connectors/Clitics'],
    ['still/yet', 'pa', 'Connectors/Clitics'],
    ['already', 'na', 'Connectors/Clitics'],
    // Phase 3 — Work Quality
    ['sloppy', 'salapak', 'Work Quality'],
    ['worn down', 'pudpod', 'Work Quality'],
    ['annoying', 'sabad', 'Work Quality'],
    ['broken', 'guba', 'Work Quality'],
    ['wrong', 'sala', 'Work Quality'],
    // Phase 3 — Market Verbs
    ['buy', 'bakal', 'Market Verbs'],
    ['sell', 'baligya', 'Market Verbs'],
    ['pay', 'bayad', 'Market Verbs'],
    // Phase 3 — Evaluation & Cost
    ['good', 'maayo', 'Evaluation & Cost'],
    ['bad/ugly', 'law-ay', 'Evaluation & Cost'],
    ['nice', 'nami', 'Evaluation & Cost'],
    ['expensive', 'mahal', 'Evaluation & Cost'],
    ['exact/correct', 'santo', 'Evaluation & Cost'],
    // Phase 3 — Quantities
    ['1', 'isa', 'Quantities'],
    ['2', 'duha', 'Quantities'],
    ['3', 'tatlo', 'Quantities'],
    ['4', 'apat', 'Quantities'],
    ['5', 'lima', 'Quantities'],
    ['many', 'damo', 'Quantities'],
    ['few', 'diyutay', 'Quantities'],
    ['all', 'tanan', 'Quantities'],
    ['half', 'tunga', 'Quantities'],
    ['how much/many', 'pila', 'Quantities'],
    // Phase 3 — Time & Space
    ['now', 'subong', 'Time & Space'],
    ['yesterday', 'kahapon', 'Time & Space'],
    ['later', 'karon', 'Time & Space'],
    ['morning', 'aga', 'Time & Space'],
    ['afternoon', 'hapon', 'Time & Space'],
    ['night', 'gab-i', 'Time & Space'],
    ['above', 'babaw', 'Time & Space'],
    ['under', 'idalom', 'Time & Space'],
    ['inside', 'sulod', 'Time & Space'],
    ['outside', 'guwa', 'Time & Space'],
    // Phase 3 — Physical States
    ['tired', 'kapoy', 'Physical States'],
    ['painful/sick', 'sakit', 'Physical States'],
    ['hungry', 'gutom', 'Physical States'],
    ['thirsty', 'uhaw', 'Physical States'],

    // Phase 4 — Mind & Senses
    ['watch/look', 'lantaw', 'Mind & Senses'],
    ['listen', 'pamati', 'Mind & Senses'],
    ['know (info)', 'hibalo', 'Mind & Senses'],
    ['know (person)', 'kilala', 'Mind & Senses'],
    ['remember', 'dumdum', 'Mind & Senses'],
    ['forget', 'lipat', 'Mind & Senses'],
    // Phase 4 — Communication Verbs
    ['speak/say', 'hambal', 'Communication Verbs'],
    ['tell', 'sugid', 'Communication Verbs'],
    ['ask', 'pamangkot', 'Communication Verbs'],
    // Phase 4 — Emotional States
    ['happy', 'lipay', 'Emotional States'],
    ['angry', 'akig', 'Emotional States'],
    ['afraid', 'hadlok', 'Emotional States'],
    // Phase 4 — Social Roles
    ['friend', 'amigo', 'Social Roles'],
    ['father', 'tatay', 'Social Roles'],
    ['mother', 'nanay', 'Social Roles'],
    ['companion/coworker', 'kasama', 'Social Roles'],
    // Phase 4 — Demonstratives
    ['this', 'ini', 'Demonstratives'],
    ['that (near you)', 'ina', 'Demonstratives'],
  ];

  const vocabSheet = getOrCreateSheet(ss, SHEET_VOCAB);
  const existing = sheetToObjects(ss, SHEET_VOCAB);
  const existingHil = existing.map(v => String(v.hil).toLowerCase().trim());

  let added = 0;
  newVocab.forEach(([eng, hil, cat]) => {
    if (existingHil.indexOf(hil.toLowerCase().trim()) === -1) {
      vocabSheet.appendRow([eng, hil, cat, false, 0, 0, '', '', '']);
      existingHil.push(hil.toLowerCase().trim());
      added++;
    }
  });

  Logger.log('Added ' + added + ' new vocab words. Skipped ' + (newVocab.length - added) + ' already-known words.');
}

/**
 * Run this once from the Apps Script editor to add a 'phase' column to Vocab
 * (linking each word to one of the 4 curriculum phases) and to create the
 * Concepts sheet, seeded with the "Concepts to Master" list from each phase.
 * Non-destructive: only adds the phase column/values and new Concepts rows;
 * does not touch mastery, mnemonics, or review counts on existing vocab.
 */
function importConceptsAndPhases() {
  const ss = getSpreadsheet();

  // --- Vocab: add + backfill the 'phase' column ---
  const vocabSheet = ss.getSheetByName(SHEET_VOCAB);
  const values = vocabSheet.getDataRange().getValues();
  const headers = values[0];
  let phaseCol = headers.indexOf('phase');
  if (phaseCol === -1) {
    vocabSheet.getRange(1, headers.length + 1).setValue('phase');
    phaseCol = headers.length;
  }

  const catCol = headers.indexOf('cat');
  const hilCol = headers.indexOf('hil');

  const categoryToPhase = {
    'Existence / Negation': 1, 'Markers': 1, 'Pointers (Location)': 1,
    'Question Words': 1, 'Actor Pronouns': 1, 'Basic Nouns': 1,
    'Owner/Doer Pronouns': 2, 'Farm Nouns (Sapi-an)': 2, 'Movement Verbs': 2,
    'Labor Verbs': 2, 'Daily Survival Verbs': 2, 'Basic Descriptors': 2,
    'Connectors/Clitics': 3, 'Work Quality': 3, 'Market Verbs': 3,
    'Evaluation & Cost': 3, 'Quantities': 3, 'Time & Space': 3, 'Physical States': 3,
    'Mind & Senses': 4, 'Communication Verbs': 4, 'Emotional States': 4,
    'Social Roles': 4, 'Demonstratives': 4,
    // legacy starter categories that map cleanly to one phase
    'Actions': 2, 'Commands': 2, 'Farm Tools': 2, 'Roles': 2, 'Patterns': 1,
  };
  // legacy starter words whose category ("Descriptors") spans phases
  const wordOverrides = {
    'tamad': 2, 'kuripot': 3, 'barato': 3, 'kinadali': 3, 'hapaw': 3,
  };

  for (let r = 1; r < values.length; r++) {
    const hil = String(values[r][hilCol]).toLowerCase().trim();
    const cat = values[r][catCol];
    const phase = wordOverrides[hil] || categoryToPhase[cat] || '';
    vocabSheet.getRange(r + 1, phaseCol + 1).setValue(phase);
  }

  // --- Concepts sheet ---
  const conceptsSheet = getOrCreateSheet(ss, SHEET_CONCEPTS);
  conceptsSheet.clear();
  conceptsSheet.appendRow(['id', 'phase', 'name', 'description', 'mastered', 'timesCorrect', 'timesMissed', 'lastReviewed', 'mnemonic', 'mnemonicImageUrl', 'bloomLevel']);

  const concepts = [
    [1, 1, 'Existence vs Void', "Using May ara (There is) and Wala (There is none)."],
    [2, 1, 'Topic vs Object Markers', "Using Ang (focus object) vs Sang (general object), and Si (focus person) vs Ni (person's object)."],
    [3, 1, 'Spatial Pointing', 'The difference between diri (here near me), dira (there near you), and didto (far away).'],
    [4, 1, 'Actor Pronouns', 'The "I/You/He/She" layer of the pronoun chessboard.'],

    [5, 2, 'Owner/Doer Pronouns', 'The "My/Your/By me" layer of the chessboard (crucial for assigning blame or ownership).'],
    [6, 2, 'The LEGO Time Prefixes', 'Sticking Nag- (past/completed), Naga- (ongoing), and Maga- (future) onto root verbs.'],
    [7, 2, 'Adjective Glue (nga)', 'Linking descriptions to nouns (tamad nga bata-bata).'],
    [8, 2, 'Direct Command Form', 'Using I- or -on to command actions on an object (I-saylo mo = Move it).'],

    [9, 3, 'Connectors & Clitics', 'Flow words that make sentences sound natural (and, but, already, still).'],
    [10, 3, 'Spatial Relations & Time', 'Specifying exactly when and where things happen.'],
    [11, 3, 'Number Systems', 'Counting and quantifying objects.'],

    [12, 4, 'Mental & Communication Verbs', 'Expressing thoughts, knowledge, and conversation.'],
    [13, 4, 'Emotional States', 'Describing internal feelings.'],
    [14, 4, 'Capiznon Integration', 'Leaving room in the app architecture to swap out standard Hiligaynon words for hyper-local Sapi-an variants as they are discovered in the field.'],
  ];
  concepts.forEach(([id, phase, name, description]) =>
    conceptsSheet.appendRow([id, phase, name, description, false, 0, 0, '', '', '', ''])
  );

  Logger.log('Phase column backfilled on Vocab. Concepts sheet seeded with ' + concepts.length + ' concepts.');
}

/**
 * Run this once if your Concepts sheet was created before Bloom's-level
 * tracking existed — adds the column without touching existing rows.
 */
function addBloomLevelColumn() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONCEPTS);
  const headers = sheet.getDataRange().getValues()[0];
  if (headers.indexOf('bloomLevel') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('bloomLevel');
  }
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}
