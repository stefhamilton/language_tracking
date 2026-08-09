const STORAGE_KEY = 'hiligaynon_apps_script_url';

let scriptUrl = localStorage.getItem(STORAGE_KEY) || '';
let vocabDeck = [];
let stages = [];
let log = [];
let concepts = [];
let progressHistory = [];
let openStageIds = null;

let currentCardIndex = 0;
let fieldCountToday = 0;

document.getElementById('script-url').value = scriptUrl;
if (scriptUrl) {
    document.getElementById('settings-panel').removeAttribute('open');
    loadData();
} else {
    document.getElementById('settings-panel').setAttribute('open', 'true');
    setStatus('Paste your Apps Script Web App URL above to connect.', true);
}

function saveScriptUrl() {
    const url = document.getElementById('script-url').value.trim();
    if (!url) return;
    scriptUrl = url;
    localStorage.setItem(STORAGE_KEY, url);
    document.getElementById('settings-panel').removeAttribute('open');
    loadData();
}

function setStatus(msg, isError) {
    const el = document.getElementById('status-banner');
    el.innerText = msg;
    el.className = isError ? 'error' : '';
}

async function loadData() {
    setStatus('Loading from Google Sheets…');
    try {
        const res = await fetch(scriptUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        vocabDeck = (data.vocab || []).map(v => ({
            ...v,
            mastered: v.mastered === true || v.mastered === 'TRUE',
            flipped: false,
        }));
        stages = data.stages || [];
        log = data.log || [];
        concepts = (data.concepts || []).map(c => ({
            ...c,
            mastered: c.mastered === true || c.mastered === 'TRUE',
        }));
        progressHistory = data.progressHistory || [];

        fieldCountToday = countTodayFieldEntries(log);

        setStatus('Connected. Last synced ' + new Date().toLocaleTimeString());
        renderCard();
        renderStages();
        renderProgressChart();
        updateDashboard();

        // Log a baseline snapshot if we have no history yet
        if (progressHistory.length === 0 && stages.length > 0) {
            await logProgressSnapshot();
        }
    } catch (err) {
        setStatus('Could not load data: ' + err.message, true);
    }
}

function countTodayFieldEntries(entries) {
    const today = new Date().toDateString();
    return entries.filter(e => e.type === 'field' && new Date(e.timestamp).toDateString() === today).length;
}

async function callScript(payload) {
    if (!scriptUrl) return false;
    try {
        await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
        });
        return true;
    } catch (err) {
        setStatus('Sync failed: ' + err.message, true);
        return false;
    }
}

function renderCard() {
    if (vocabDeck.length === 0) {
        document.getElementById('card-word').innerText = 'No vocab loaded';
        document.getElementById('card-context').innerText = '';
        document.getElementById('card-hint').innerText = '';
        return;
    }
    const card = vocabDeck[currentCardIndex];
    const wordElem = document.getElementById('card-word');
    const contextElem = document.getElementById('card-context');
    const hintElem = document.getElementById('card-hint');

    if (!card.flipped) {
        wordElem.innerText = card.eng;
        contextElem.innerText = "Click to reveal Hiligaynon";
        hintElem.innerText = "Category: " + card.cat;
    } else {
        wordElem.innerText = card.hil;
        contextElem.innerText = "English: " + card.eng;
        hintElem.innerText = card.mastered ? "Remembered ✓" : "";
    }

    renderMnemonicPanel(card);
}

function renderMnemonicPanel(card) {
    const imgElem = document.getElementById('mnemonic-img');
    const imgUrlInput = document.getElementById('mnemonic-image-url');
    const noteInput = document.getElementById('mnemonic-note');

    imgUrlInput.value = card.mnemonicImageUrl || '';
    noteInput.value = card.mnemonic || '';

    if (card.mnemonicImageUrl) {
        imgElem.src = card.mnemonicImageUrl;
        imgElem.style.display = 'block';
    } else {
        imgElem.style.display = 'none';
    }
}

async function saveMnemonic() {
    if (vocabDeck.length === 0) return;
    const card = vocabDeck[currentCardIndex];
    const mnemonic = document.getElementById('mnemonic-note').value.trim();
    const mnemonicImageUrl = document.getElementById('mnemonic-image-url').value.trim();
    const btn = document.getElementById('mnemonic-save-btn');
    const statusElem = document.getElementById('mnemonic-save-status');

    card.mnemonic = mnemonic;
    card.mnemonicImageUrl = mnemonicImageUrl;

    btn.disabled = true;
    statusElem.innerText = 'Saving…';
    statusElem.className = 'context';

    const ok = await callScript({ action: 'setMnemonic', hil: card.hil, mnemonic, mnemonicImageUrl });

    btn.disabled = false;
    statusElem.innerText = ok ? `✓ Saved for ${card.hil}` : 'Save failed — check connection';
    statusElem.className = ok ? 'context' : 'context error-text';
    setTimeout(() => { statusElem.innerText = ''; }, 3000);

    renderMnemonicPanel(card);
}

function flipCard() {
    if (vocabDeck.length === 0) return;
    vocabDeck[currentCardIndex].flipped = !vocabDeck[currentCardIndex].flipped;
    renderCard();
}

function scoreCard(isMastered) {
    if (vocabDeck.length === 0) return;
    const card = vocabDeck[currentCardIndex];
    card.mastered = isMastered;
    if (isMastered) card.timesCorrect = (card.timesCorrect || 0) + 1;
    else card.timesMissed = (card.timesMissed || 0) + 1;

    callScript({ action: 'markVocab', hil: card.hil, mastered: isMastered });

    card.flipped = false;
    currentCardIndex = (currentCardIndex + 1) % vocabDeck.length;
    updateDashboard();
    renderCard();
}

function incField() {
    fieldCountToday++;
    callScript({ action: 'logEntry', type: 'field', detail: '+1 phrase' });
    updateDashboard();
}

function renderStages() {
    const container = document.getElementById('stage-list');

    if (openStageIds === null) {
        openStageIds = new Set(stages.filter(s => s.status === 'In Progress').map(s => String(s.id)));
    } else {
        container.querySelectorAll('.stage-item').forEach(el => {
            const id = el.dataset.stageId;
            if (el.open) openStageIds.add(id);
            else openStageIds.delete(id);
        });
    }

    container.innerHTML = '';
    stages.forEach(stage => {
        const item = document.createElement('details');
        item.className = 'stage-item';
        item.dataset.stageId = String(stage.id);
        if (openStageIds.has(String(stage.id))) item.setAttribute('open', 'true');

        const statusClass = 'status-' + String(stage.status).replace(/\s+/g, '');
        const stageConcepts = concepts.filter(c => String(c.phase) === String(stage.id));
        const stageVocab = vocabDeck.filter(v => String(v.phase) === String(stage.id));
        const vocabMastered = stageVocab.filter(v => v.mastered).length;

        const conceptRows = stageConcepts.map(c => `
            <div class="concept-row">
                <div>
                    <div class="concept-name">${c.name}${c.bloomLevel ? ` <span class="bloom-badge">${c.bloomLevel}</span>` : ''}</div>
                    <div class="concept-desc">${c.description}</div>
                </div>
                <button class="concept-toggle-btn ${c.mastered ? 'got-it' : 'not-yet'}" onclick="toggleConcept('${escapeAttr(c.name)}', ${!c.mastered})">${c.mastered ? 'Got It ✓' : 'Mark Understood'}</button>
            </div>
        `).join('');

        item.innerHTML = `
            <summary>
                <div class="stage-row-main">
                    <span class="stage-toggle-icon">▶</span>
                    <div>
                        <div class="stage-name">${stage.name}</div>
                        <div class="stage-focus">${stage.focus}</div>
                    </div>
                </div>
                <span class="status-pill ${statusClass}">${stage.status}</span>
            </summary>
            <div class="concept-list">
                ${conceptRows || '<div class="concept-desc">No concepts logged for this phase yet.</div>'}
                <div class="vocab-progress-line">Vocab for this phase: ${vocabMastered} / ${stageVocab.length} remembered</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'");
}

function toggleConcept(name, mastered) {
    const concept = concepts.find(c => c.name === name);
    if (!concept) return;
    concept.mastered = mastered;
    if (mastered) concept.timesCorrect = (concept.timesCorrect || 0) + 1;
    else concept.timesMissed = (concept.timesMissed || 0) + 1;

    callScript({ action: 'markConcept', name, mastered });
    renderStages();
    updateDashboard();
}

function currentStage() {
    return stages.find(s => s.status === 'In Progress') || stages[stages.length - 1];
}

function updateDashboard() {
    const masteredCount = vocabDeck.filter(v => v.mastered).length;
    document.getElementById('retention-val').innerText = `${masteredCount} / ${vocabDeck.length}`;
    document.getElementById('field-val').innerText = fieldCountToday;

    const stage = currentStage();
    document.getElementById('stage-val').innerText = stage ? stage.name : '—';

    // Build structured JSON context payload
    const currentPhaseConcepts = stage ? concepts.filter(c => String(c.phase) === String(stage.id)) : [];
    const currentPhaseVocab = stage ? vocabDeck.filter(v => String(v.phase) === String(stage.id)) : [];

    const contextPayload = {
        format: 'hiligaynon-tutor-interchange',
        version: '1.0',
        generated_at: new Date().toISOString(),
        direction: 'context',
        payload: {
            learner_profile: {
                location: 'Sapi-an, Capiz',
                context: 'Farm environment',
                target_language: 'Hiligaynon (Capiznon variant)',
            },
            srs_policy: {
                target_retention_rate: 0.88,
                interval_sequence_days: [1, 2, 4, 7, 12, 20],
            },
            current_phase: stage ? {
                id: Number(stage.id),
                name: stage.name,
                focus: stage.focus,
                status: stage.status,
            } : null,
            all_phases: stages.map(s => ({
                id: Number(s.id),
                name: s.name,
                status: s.status,
            })),
            concepts: currentPhaseConcepts.map(c => ({
                id: Number(c.id),
                phase: Number(c.phase),
                name: c.name,
                description: c.description,
                mastered: !!c.mastered,
                bloom_level: c.bloomLevel || 'Level 1: Remembering',
                srs_state: {
                    current_step_index: Number(c.currentStepIndex) || 0,
                    consecutive_first_try_passes: Number(c.consecutivePasses) || 0,
                    total_reviews: Number(c.totalReviews) || 0,
                    first_try_failures: Number(c.firstTryFailures) || 0,
                    last_reviewed: c.lastReviewed || null,
                    next_review_due: c.nextReviewDue || null,
                },
            })),
            vocab: currentPhaseVocab.map(v => ({
                hil: v.hil,
                eng: v.eng,
                cat: v.cat,
                phase: Number(v.phase),
                mastered: !!v.mastered,
                times_correct: Number(v.timesCorrect) || 0,
                times_missed: Number(v.timesMissed) || 0,
                last_reviewed: v.lastReviewed || null,
            })),
            session_stats: {
                today_field_output_count: fieldCountToday,
                vocab_mastered_count: masteredCount,
                vocab_total_count: vocabDeck.length,
            },
        },
    };

    const systemPrompt = `You are a Hiligaynon language tutor for a learner living in Sapi-an, Capiz (farm context). You will receive a structured JSON payload describing the learner's current state. Use it to run an effective tutoring session, then produce a structured JSON result at the end.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The JSON has "format": "hiligaynon-tutor-interchange" and "direction": "context". Key sections:

• srs_policy — spaced-repetition settings:
  - target_retention_rate: desired recall probability (e.g. 0.88)
  - interval_sequence_days: fixed interval ladder in days (e.g. [1, 2, 4, 7, 12, 20])

• current_phase — which phase the learner is in, with its focus goal.

• concepts[] — concepts to master this phase. Each has:
  - name, description: what the concept is
  - bloom_level: current Bloom's Taxonomy level
  - mastered: true if bloom_level >= Level 3 (Applying)
  - srs_state: scheduling data (current_step_index, consecutive_first_try_passes, next_review_due)

• vocab[] — vocabulary items for this phase with mastery state.

• session_stats — aggregate progress.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT ASSESSMENT (Bloom's Taxonomy)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Assess each concept based on what the learner DEMONSTRATES this session:

  Level 1: Remembering — can recall the rule/words when prompted
  Level 2: Understanding — can explain the rule in their own words
  Level 3: Applying — can correctly use it in a new sentence they construct
  Level 4: Analyzing — can spot when it's used wrong, or compare to a related concept
  Level 5: Evaluating — can judge which phrasing is more natural/correct and why
  Level 6: Creating — can combine it fluently with other concepts in original, unprompted speech

mastered = true only at Level 3+. Be honest — lower levels if the learner regresses.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Prioritize concepts whose next_review_due is today or overdue.
2. For concepts with low step_index or recent failures, drill more heavily.
3. Use the learner's farm/Sapi-an context for all example sentences.
4. Test production (learner produces Hiligaynon) more than recognition.
5. Track whether the learner passes on FIRST attempt vs. needing hints/retries.
6. Note production latency where relevant (fast = automatic, slow = still constructing).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOCABULARY SCAFFOLDING (STRICT RECALL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• NEVER provide parenthetical translations or unsolicited vocabulary helpers for words where mastered == true or bloom_level >= Level 3.
• Always require the learner to produce mastered vocabulary from memory during drills.
• Provide vocabulary hints ONLY for unmastered items (mastered == false) or when the learner explicitly requests a hint.
• When introducing a new target sentence, state the sentence in English and let the learner perform total recall of all vocabulary and grammar markers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERACTION FORMAT (SINGLE ITEM PER TURN)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• NEVER ask the learner to produce or translate multiple sentences or items in a single turn.
• Present exactly ONE prompt, question, or sentence translation at a time.
• Provide immediate, direct feedback on that single response before moving on to the next item.
• Keep conversational filler minimal to maximize speed and feedback loop frequency.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SRS ADVANCEMENT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Per concept reviewed:

• First-try PASS:
  new_step_index = min(current_step_index + 1, len(interval_sequence_days) - 1)
  consecutive_first_try_passes += 1

• First-try FAIL (regardless of final outcome):
  new_step_index = 0
  consecutive_first_try_passes = 0

• next_review_due = today + interval_sequence_days[new_step_index] days

Graduated = step_index at max AND consecutive_passes >= len(intervals).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

At session END, output exactly ONE fenced JSON code block (\`\`\`json ... \`\`\`) with this structure:

{
  "format": "hiligaynon-tutor-interchange",
  "version": "1.0",
  "generated_at": "<ISO 8601>",
  "direction": "results",
  "payload": {
    "session_summary": {
      "started_at": "<ISO 8601>",
      "ended_at": "<ISO 8601>",
      "concepts_drilled": <number>,
      "vocab_items_tested": <number>,
      "notes": "<free-text observations>"
    },
    "concept_results": [
      {
        "name": "<must match input exactly>",
        "bloom_level_before": "<from input>",
        "bloom_level_after": "<assessed this session>",
        "mastered": <true if level >= 3>,
        "review": {
          "date": "<YYYY-MM-DD>",
          "first_attempt_passed": <boolean>,
          "final_attempt_passed": <boolean>,
          "latency_seconds": <number or null>
        }
      }
    ],
    "vocab_results": [
      {
        "hil": "<must match input spelling>",
        "tested": true,
        "passed": <boolean>,
        "latency_seconds": <number or null>
      }
    ],
    "srs_updates": [
      {
        "concept": "<concept name>",
        "previous_step_index": <from input>,
        "new_step_index": <computed>,
        "consecutive_first_try_passes": <updated>,
        "next_review_due": "<ISO 8601>"
      }
    ],
    "new_vocab_discovered": [
      {
        "hil": "<word>",
        "eng": "<gloss>",
        "cat": "<category>",
        "phase": <number>,
        "source": "<how it came up>"
      }
    ],
    "phase_recommendation": {
      "advance": <boolean>,
      "reason": "<justification>"
    }
  }
}

RULES:
• Only include concepts/vocab actually tested this session.
• Concept names and hil values must match input EXACTLY.
• Compute srs_updates yourself using the rules above.
• Omit new_vocab_discovered if none.
• advance = true only if ALL current-phase concepts are mastered (bloom >= 3) with step_index >= 2.
• Output ONLY the JSON code block — no commentary before or after.`;

    const promptText = systemPrompt + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSESSION CONTEXT (paste begins here)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' + JSON.stringify(contextPayload, null, 2);

    document.getElementById('prompt-output').value = promptText;
}

function renderProgressChart() {
    const container = document.getElementById('progress-charts');

    // Group history by phase
    const phaseGroups = {};
    for (const entry of (progressHistory || [])) {
        const phase = String(entry.phase);
        if (!phaseGroups[phase]) phaseGroups[phase] = [];
        phaseGroups[phase].push(entry);
    }

    // Sort each phase's entries by timestamp
    for (const phase of Object.keys(phaseGroups)) {
        phaseGroups[phase].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    let html = '';
    const phaseIds = stages.map(s => String(s.id));

    for (const phaseId of phaseIds) {
        const entries = phaseGroups[phaseId] || [];
        const stage = stages.find(s => String(s.id) === phaseId);
        const phaseName = stage ? stage.name : `Phase ${phaseId}`;

        html += `<div class="progress-chart-container">`;
        html += `<h3>${phaseName}</h3>`;
        html += renderSVGChart(entries);
        html += `<div class="chart-legend">`;
        html += `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#10b981;"></span>Vocab</span>`;
        html += `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#38bdf8;"></span>Concepts</span>`;
        html += `</div>`;
        html += `</div>`;
    }

    container.innerHTML = html;
}

function renderSVGChart(entries) {
    const width = 600;
    const height = 140;
    const padLeft = 30;
    const padRight = 10;
    const padTop = 10;
    const padBottom = 25;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const maxY = 6; // Bloom levels 1–6

    function toY(val) { return padTop + chartH - (val / maxY) * chartH; }

    // Y-axis grid lines (always shown)
    let gridLines = '';
    for (let level = 1; level <= 6; level++) {
        const y = toY(level).toFixed(1);
        gridLines += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#334155" stroke-width="0.5" stroke-dasharray="3,3"/>`;
        gridLines += `<text x="${padLeft - 5}" y="${Number(y) + 3}" fill="#94a3b8" font-size="9" text-anchor="end">${level}</text>`;
    }

    // No data — just the empty grid
    if (entries.length === 0) {
        return `<svg class="progress-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            ${gridLines}
        </svg>`;
    }

    // X positions evenly spaced
    const n = entries.length;
    function toX(i) {
        if (n === 1) return padLeft + chartW / 2;
        return padLeft + i * (chartW / (n - 1));
    }

    // Build points
    let vocabPoints = '';
    let conceptPoints = '';
    let vocabDots = '';
    let conceptDots = '';

    for (let i = 0; i < n; i++) {
        const x = toX(i).toFixed(1);
        const yv = toY(Number(entries[i].avgBloomVocab) || 0).toFixed(1);
        const yc = toY(Number(entries[i].avgBloomConcepts) || 0).toFixed(1);
        vocabPoints += `${x},${yv} `;
        conceptPoints += `${x},${yc} `;
        vocabDots += `<circle cx="${x}" cy="${yv}" r="3" fill="#10b981"/>`;
        conceptDots += `<circle cx="${x}" cy="${yc}" r="3" fill="#38bdf8"/>`;
    }

    // Only draw lines if more than 1 point
    let lines = '';
    if (n > 1) {
        lines += `<polyline points="${vocabPoints.trim()}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        lines += `<polyline points="${conceptPoints.trim()}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    // Date labels
    const dateLabels = [];
    dateLabels.push({ i: 0, label: formatDate(entries[0].timestamp) });
    if (n >= 3) dateLabels.push({ i: Math.floor(n / 2), label: formatDate(entries[Math.floor(n / 2)].timestamp) });
    if (n >= 2) dateLabels.push({ i: n - 1, label: formatDate(entries[n - 1].timestamp) });

    let dateText = dateLabels.map(d =>
        `<text x="${toX(d.i).toFixed(1)}" y="${height - 3}" fill="#94a3b8" font-size="9" text-anchor="middle">${d.label}</text>`
    ).join('');

    return `<svg class="progress-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        ${lines}
        ${vocabDots}
        ${conceptDots}
        ${dateText}
    </svg>`;
}

function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function importTutorState() {
    const text = document.getElementById('tutor-import-input').value;
    const statusElem = document.getElementById('tutor-import-status');
    const btn = document.getElementById('tutor-import-btn');

    if (!text.trim()) {
        statusElem.innerText = 'Paste the tutor\'s state block first.';
        statusElem.className = 'context error-text';
        return;
    }

    // Try to extract JSON from a fenced code block or raw JSON
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);
    let parsed = null;
    try {
        parsed = JSON.parse(jsonBlock ? jsonBlock[1].trim() : text.trim());
    } catch (e) {
        parsed = null;
    }

    // Detect structured JSON results envelope
    if (parsed && parsed.format === 'hiligaynon-tutor-interchange' && parsed.direction === 'results') {
        await importStructuredResults(parsed, btn, statusElem);
    } else {
        // Fall back to legacy text parsing
        await importLegacyText(text, btn, statusElem);
    }

    renderCard();
    renderStages();
    updateDashboard();
}

async function importStructuredResults(data, btn, statusElem) {
    const payload = data.payload;
    if (!payload) {
        statusElem.innerText = 'JSON envelope found but payload is missing.';
        statusElem.className = 'context error-text';
        return;
    }

    btn.disabled = true;
    statusElem.innerText = 'Syncing structured results…';
    statusElem.className = 'context';

    let conceptChanges = 0;
    let vocabChanges = 0;
    let srsChanges = 0;

    // Apply concept_results
    if (payload.concept_results && payload.concept_results.length) {
        for (const cr of payload.concept_results) {
            const concept = concepts.find(c => c.name === cr.name);
            if (!concept) continue;
            const mastered = !!cr.mastered;
            const bloomLevel = cr.bloom_level_after || undefined;
            const masteredChanged = concept.mastered !== mastered;
            const bloomChanged = bloomLevel && concept.bloomLevel !== bloomLevel;
            if (!masteredChanged && !bloomChanged) continue;
            concept.mastered = mastered;
            if (bloomLevel) concept.bloomLevel = bloomLevel;
            if (mastered) concept.timesCorrect = (concept.timesCorrect || 0) + 1;
            else concept.timesMissed = (concept.timesMissed || 0) + 1;
            await callScript({ action: 'markConcept', name: cr.name, mastered, bloomLevel });
            conceptChanges++;
        }
    }

    // Apply vocab_results
    if (payload.vocab_results && payload.vocab_results.length) {
        for (const vr of payload.vocab_results) {
            if (!vr.tested) continue;
            const card = vocabDeck.find(v => v.hil.trim().toLowerCase() === vr.hil.trim().toLowerCase());
            if (!card) continue;
            const mastered = !!vr.passed;
            if (card.mastered === mastered) continue;
            card.mastered = mastered;
            if (mastered) card.timesCorrect = (card.timesCorrect || 0) + 1;
            else card.timesMissed = (card.timesMissed || 0) + 1;
            await callScript({ action: 'markVocab', hil: card.hil, mastered });
            vocabChanges++;
        }
    }

    // Apply srs_updates
    if (payload.srs_updates && payload.srs_updates.length) {
        for (const su of payload.srs_updates) {
            const concept = concepts.find(c => c.name === su.concept);
            if (!concept) continue;
            concept.currentStepIndex = su.new_step_index;
            concept.consecutivePasses = su.consecutive_first_try_passes;
            concept.nextReviewDue = su.next_review_due;
            concept.totalReviews = (Number(concept.totalReviews) || 0) + 1;
            if (su.new_step_index === 0 && su.previous_step_index > 0) {
                concept.firstTryFailures = (Number(concept.firstTryFailures) || 0) + 1;
            }
            await callScript({
                action: 'updateSRS',
                name: su.concept,
                currentStepIndex: su.new_step_index,
                consecutivePasses: su.consecutive_first_try_passes,
                nextReviewDue: su.next_review_due,
                totalReviews: concept.totalReviews,
                firstTryFailures: concept.firstTryFailures || 0,
            });
            srsChanges++;
        }
    }

    // Handle new_vocab_discovered — add to deck (user already consented by pasting)
    let newVocabAdded = 0;
    if (payload.new_vocab_discovered && payload.new_vocab_discovered.length) {
        for (const nv of payload.new_vocab_discovered) {
            const exists = vocabDeck.find(v => v.hil.trim().toLowerCase() === nv.hil.trim().toLowerCase());
            if (exists) continue;
            const newCard = {
                eng: nv.eng,
                hil: nv.hil,
                cat: nv.cat || '',
                phase: nv.phase || '',
                mastered: false,
                timesCorrect: 0,
                timesMissed: 0,
                lastReviewed: '',
                flipped: false,
            };
            vocabDeck.push(newCard);
            await callScript({ action: 'addVocab', eng: nv.eng, hil: nv.hil, cat: nv.cat || '', phase: nv.phase || '' });
            newVocabAdded++;
        }
    }

    // Show phase recommendation if present
    let recNote = '';
    if (payload.phase_recommendation) {
        const rec = payload.phase_recommendation;
        recNote = rec.advance
            ? ` | Phase advance recommended: ${rec.reason}`
            : ` | Stay in phase: ${rec.reason}`;
    }

    // Log progress snapshot for each phase
    await logProgressSnapshot();

    btn.disabled = false;
    const parts = [];
    if (conceptChanges) parts.push(`${conceptChanges} concept${conceptChanges === 1 ? '' : 's'}`);
    if (vocabChanges) parts.push(`${vocabChanges} word${vocabChanges === 1 ? '' : 's'}`);
    if (srsChanges) parts.push(`${srsChanges} SRS schedule${srsChanges === 1 ? '' : 's'}`);
    if (newVocabAdded) parts.push(`${newVocabAdded} new word${newVocabAdded === 1 ? '' : 's'} added`);
    statusElem.innerText = `✓ Synced — ${parts.join(', ') || 'no changes needed'}${recNote}`;
    statusElem.className = 'context';
}

async function logProgressSnapshot() {
    // Compute average Bloom level per phase for vocab and concepts
    const phaseIds = [...new Set(stages.map(s => String(s.id)))];
    const snapshots = phaseIds.map(phaseId => {
        const phaseVocab = vocabDeck.filter(v => String(v.phase) === phaseId);
        const phaseConcepts = concepts.filter(c => String(c.phase) === phaseId);

        // Vocab: mastered = 3, not mastered = 1
        const avgBloomVocab = phaseVocab.length > 0
            ? phaseVocab.reduce((sum, v) => sum + (v.mastered ? 3 : 1), 0) / phaseVocab.length
            : 0;

        // Concepts: parse Bloom level number from string like "Level 3: Applying"
        const avgBloomConcepts = phaseConcepts.length > 0
            ? phaseConcepts.reduce((sum, c) => {
                const match = (c.bloomLevel || '').match(/Level\s*(\d+)/);
                return sum + (match ? Number(match[1]) : 1);
            }, 0) / phaseConcepts.length
            : 0;

        return {
            phase: Number(phaseId),
            avgBloomVocab: Math.round(avgBloomVocab * 100) / 100,
            avgBloomConcepts: Math.round(avgBloomConcepts * 100) / 100,
        };
    });

    await callScript({ action: 'logProgress', snapshots });
}

async function importLegacyText(text, btn, statusElem) {
    // Parse concept checkboxes: "  - [x - Level 3: Applying] Name: description"
    // (also accepts the plain "  - [x] Name: description" form for backward compat)
    const conceptMatches = [...text.matchAll(/-\s*\[(x|X|\s)?\s*(?:-\s*(Level\s*\d+\s*:\s*[^\]]+))?\]\s*([^:]+):/g)]
        .map(m => ({
            name: m[3].trim(),
            mastered: (m[1] || '').toLowerCase() === 'x',
            bloomLevel: m[2] ? m[2].trim() : undefined,
        }));

    // Parse the per-phase "VOCAB PROGRESS THIS PHASE" checklist
    const vocabSectionMatch = text.match(/VOCAB PROGRESS THIS PHASE[^\n]*\n([\s\S]*?)(?:\n\s*OVERALL PROGRESS|$)/);
    const phaseVocabMap = new Map();
    if (vocabSectionMatch) {
        for (const line of vocabSectionMatch[1].split('\n')) {
            const m = line.match(/^\s*(✓|-)?\s*([^=\n]+?)\s*=\s*(.+)$/);
            if (!m) continue;
            phaseVocabMap.set(m[2].trim().toLowerCase(), m[1] === '✓');
        }
    }

    // Parse "All Remembered Words: a, b, c"
    const wordsMatch = text.match(/All Remembered Words:\s*([^\n]*)/);
    if (conceptMatches.length === 0 && !wordsMatch && phaseVocabMap.size === 0) {
        statusElem.innerText = 'Could not find any concepts or vocab in that text — check the format.';
        statusElem.className = 'context error-text';
        return;
    }
    const rememberedSet = wordsMatch
        ? new Set(wordsMatch[1].split(',').map(w => w.trim().toLowerCase()).filter(Boolean))
        : null;

    btn.disabled = true;
    statusElem.innerText = 'Syncing…';
    statusElem.className = 'context';

    let conceptChanges = 0;
    let vocabChanges = 0;

    for (const { name, mastered, bloomLevel } of conceptMatches) {
        const concept = concepts.find(c => c.name === name);
        if (!concept) continue;
        const masteredChanged = concept.mastered !== mastered;
        const bloomChanged = bloomLevel !== undefined && concept.bloomLevel !== bloomLevel;
        if (!masteredChanged && !bloomChanged) continue;
        concept.mastered = mastered;
        if (bloomLevel !== undefined) concept.bloomLevel = bloomLevel;
        if (mastered) concept.timesCorrect = (concept.timesCorrect || 0) + 1;
        else concept.timesMissed = (concept.timesMissed || 0) + 1;
        await callScript({ action: 'markConcept', name, mastered, bloomLevel });
        conceptChanges++;
    }

    if (rememberedSet || phaseVocabMap.size > 0) {
        for (const card of vocabDeck) {
            const key = card.hil.trim().toLowerCase();
            let mastered;
            if (rememberedSet) {
                mastered = rememberedSet.has(key);
            } else if (phaseVocabMap.has(key)) {
                mastered = phaseVocabMap.get(key);
            } else {
                continue;
            }
            if (card.mastered === mastered) continue;
            card.mastered = mastered;
            if (mastered) card.timesCorrect = (card.timesCorrect || 0) + 1;
            else card.timesMissed = (card.timesMissed || 0) + 1;
            await callScript({ action: 'markVocab', hil: card.hil, mastered });
            vocabChanges++;
        }
    }

    // Log progress snapshot
    await logProgressSnapshot();

    btn.disabled = false;
    statusElem.innerText = `✓ Synced — ${conceptChanges} concept${conceptChanges === 1 ? '' : 's'}, ${vocabChanges} word${vocabChanges === 1 ? '' : 's'} updated.`;
    statusElem.className = 'context';
}

function copyPrompt() {
    const copyText = document.getElementById("prompt-output");
    copyText.select();
    document.execCommand("copy");
    alert("Copied context! Paste this directly into your next AI chat session.");
}
