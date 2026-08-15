const STORAGE_KEY = 'hiligaynon_apps_script_url';

let scriptUrl = localStorage.getItem(STORAGE_KEY) || '';
let vocabDeck = [];
let stages = [];
let log = [];
let concepts = [];
let progressHistory = [];
let openStageIds = null;
let pendingOpenStageId = null;
let fieldVocab = [];

// Core Vocab and Field Vocab are the same flashcard + manager UI pointed at
// two different lists, differing only in their extra per-word field (phase
// vs. source) and whether that field also filters the deck. Only one list
// is shown at a time, picked via the #vocab-list-select dropdown.
const VOCAB_LISTS = {
    core: {
        getDeck: () => vocabDeck,
        extraKey: 'phase',
        extraType: 'select',
        extraLabel: 'Phase',
        filterable: true,
        description: 'Your phase-plan vocabulary — the closed word set grammar is built on.',
        mnemonicPlaceholder: `Mnemonic note, e.g. "Iwas sounds like 'eye was' — my eye WAS almost poked, so I stepped aside"`,
        actions: { add: 'addVocab', edit: 'editVocab', delete: 'deleteVocab', mark: 'markVocab', mnemonic: 'setMnemonic' },
    },
    field: {
        getDeck: () => fieldVocab,
        extraKey: 'source',
        extraType: 'text',
        extraLabel: 'Source',
        filterable: false,
        description: 'Words you pick up outside the curriculum (e.g. from conversation) — kept separate from the phase plan and not counted in Overall Plan Progress.',
        mnemonicPlaceholder: 'Mnemonic note',
        actions: { add: 'addFieldVocab', edit: 'editFieldVocab', delete: 'deleteFieldVocab', mark: 'markFieldVocab', mnemonic: 'setFieldMnemonic' },
    },
};
const listState = {
    core: { cardIndex: 0, editingIndex: null },
    field: { cardIndex: 0, editingIndex: null },
};
let activeListKey = 'core';

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
        fieldVocab = (data.fieldVocab || []).map(v => ({
            ...v,
            mastered: v.mastered === true || v.mastered === 'TRUE',
            flipped: false,
        }));

        setStatus('Connected. Last synced ' + new Date().toLocaleTimeString());
        applyListSelectUI();
        renderCard();
        renderManager();
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

function escapeHtmlAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function applyListSelectUI() {
    const cfg = VOCAB_LISTS[activeListKey];
    document.getElementById('vocab-list-select').value = activeListKey;
    document.getElementById('vocab-list-desc').innerText = cfg.description;
    document.getElementById('vocab-phase-filter').style.display = cfg.filterable ? '' : 'none';
    document.getElementById('vocab-phase-filter-hint').style.display = cfg.filterable ? '' : 'none';
    const extraInput = document.getElementById('vocab-new-extra');
    extraInput.style.display = cfg.filterable ? 'none' : '';
    extraInput.placeholder = cfg.extraKey === 'source' ? 'Source (e.g. Tatay, at the market)' : cfg.extraLabel;
    document.getElementById('vocab-mnemonic-note').placeholder = cfg.mnemonicPlaceholder;
    document.getElementById('vocab-manager-search').value = '';
}

function onListSelectChange() {
    activeListKey = document.getElementById('vocab-list-select').value;
    applyListSelectUI();
    renderCard();
    renderManager();
}

// Deck filtered by the shared phase select, for lists where extraKey
// doubles as a deck filter (currently just 'core').
function displayDeck() {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = cfg.getDeck();
    if (!cfg.filterable) return deck;
    const filterElem = document.getElementById('vocab-phase-filter');
    const val = filterElem ? filterElem.value : '';
    return val ? deck.filter(v => String(v[cfg.extraKey] || '') === val) : deck;
}

function onDeckFilterChange() {
    listState[activeListKey].cardIndex = 0;
    renderCard();
    renderManager();
}

function renderCard() {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = displayDeck();
    const state = listState[activeListKey];
    const wordElem = document.getElementById('vocab-card-word');
    const contextElem = document.getElementById('vocab-card-context');
    const hintElem = document.getElementById('vocab-card-hint');

    if (deck.length === 0) {
        wordElem.innerText = cfg.getDeck().length === 0 ? 'No vocab yet' : 'No words match this filter';
        contextElem.innerText = cfg.getDeck().length === 0 ? 'Add a word below' : '';
        hintElem.innerText = '';
        return;
    }
    if (state.cardIndex >= deck.length) state.cardIndex = 0;
    const card = deck[state.cardIndex];

    if (!card.flipped) {
        wordElem.innerText = card.eng;
        contextElem.innerText = 'Click to reveal Hiligaynon';
        hintElem.innerText = card.cat ? 'Category: ' + card.cat : '';
    } else {
        wordElem.innerText = card.hil;
        contextElem.innerText = 'English: ' + card.eng;
        const extraVal = card[cfg.extraKey];
        hintElem.innerText = card.mastered ? 'Remembered ✓' : (extraVal ? cfg.extraLabel + ': ' + extraVal : '');
    }

    renderMnemonicPanel(card);
}

function renderMnemonicPanel(card) {
    const imgElem = document.getElementById('vocab-mnemonic-img');
    const imgUrlInput = document.getElementById('vocab-mnemonic-image-url');
    const noteInput = document.getElementById('vocab-mnemonic-note');

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
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = displayDeck();
    if (deck.length === 0) return;
    const state = listState[activeListKey];
    const card = deck[state.cardIndex];
    const mnemonic = document.getElementById('vocab-mnemonic-note').value.trim();
    const mnemonicImageUrl = document.getElementById('vocab-mnemonic-image-url').value.trim();
    const btn = document.getElementById('vocab-mnemonic-save-btn');
    const statusElem = document.getElementById('vocab-mnemonic-save-status');

    card.mnemonic = mnemonic;
    card.mnemonicImageUrl = mnemonicImageUrl;

    btn.disabled = true;
    statusElem.innerText = 'Saving…';
    statusElem.className = 'context';

    const ok = await callScript({ action: cfg.actions.mnemonic, hil: card.hil, mnemonic, mnemonicImageUrl });

    btn.disabled = false;
    statusElem.innerText = ok ? `✓ Saved for ${card.hil}` : 'Save failed — check connection';
    statusElem.className = ok ? 'context' : 'context error-text';
    setTimeout(() => { statusElem.innerText = ''; }, 3000);

    renderMnemonicPanel(card);
}

function flipCard() {
    const deck = displayDeck();
    if (deck.length === 0) return;
    const state = listState[activeListKey];
    deck[state.cardIndex].flipped = !deck[state.cardIndex].flipped;
    renderCard();
}

function scoreCard(isMastered) {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = displayDeck();
    if (deck.length === 0) return;
    const state = listState[activeListKey];
    const card = deck[state.cardIndex];
    card.mastered = isMastered;
    if (isMastered) card.timesCorrect = (card.timesCorrect || 0) + 1;
    else card.timesMissed = (card.timesMissed || 0) + 1;

    callScript({ action: cfg.actions.mark, hil: card.hil, mastered: isMastered });

    card.flipped = false;
    state.cardIndex = (state.cardIndex + 1) % deck.length;
    if (activeListKey === 'core') updateDashboard();
    renderCard();
}

function renderManager() {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = cfg.getDeck();
    const container = document.getElementById('vocab-manager-list');
    if (!container) return;
    const search = document.getElementById('vocab-manager-search').value.trim().toLowerCase();
    const filterElem = cfg.filterable ? document.getElementById('vocab-phase-filter') : null;
    const filterVal = filterElem ? filterElem.value : '';

    const filtered = deck.filter(v => {
        const matchesSearch = !search
            || v.eng.toLowerCase().includes(search)
            || v.hil.toLowerCase().includes(search)
            || String(v.cat || '').toLowerCase().includes(search)
            || String(v[cfg.extraKey] || '').toLowerCase().includes(search);
        const matchesFilter = !filterVal || String(v[cfg.extraKey] || '') === filterVal;
        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="concept-desc">No matching words.</div>';
        return;
    }

    const state = listState[activeListKey];
    container.innerHTML = filtered.map(card => {
        const idx = deck.indexOf(card);

        if (state.editingIndex === idx) {
            const extraField = cfg.extraType === 'select'
                ? `<select id="vocab-edit-extra-${idx}">${['', '1', '2', '3', '4'].map(p =>
                    `<option value="${p}" ${String(card[cfg.extraKey] || '') === p ? 'selected' : ''}>${p ? 'Phase ' + p : 'Phase —'}</option>`
                  ).join('')}</select>`
                : `<input type="text" id="vocab-edit-extra-${idx}" value="${escapeHtmlAttr(card[cfg.extraKey] || '')}" placeholder="${cfg.extraLabel}">`;
            return `
                <div class="vocab-row">
                    <div class="vocab-row-edit">
                        <input type="text" id="vocab-edit-eng-${idx}" value="${escapeHtmlAttr(card.eng)}" placeholder="English">
                        <input type="text" id="vocab-edit-hil-${idx}" value="${escapeHtmlAttr(card.hil)}" placeholder="Hiligaynon">
                        <input type="text" id="vocab-edit-cat-${idx}" value="${escapeHtmlAttr(card.cat || '')}" placeholder="Category">
                        ${extraField}
                    </div>
                    <button onclick="saveEditUI(${idx})">Save</button>
                    <button class="secondary" onclick="cancelEdit()">Cancel</button>
                </div>
            `;
        }

        const extraDisplay = card[cfg.extraKey]
            ? ' · ' + (cfg.extraType === 'select' ? 'Phase ' + card[cfg.extraKey] : card[cfg.extraKey])
            : '';
        return `
            <div class="vocab-row">
                <div class="vocab-row-main">
                    <div class="vocab-row-eng">${card.eng}</div>
                    <div class="vocab-row-meta">${card.hil}${card.cat ? ' · ' + card.cat : ''}${extraDisplay}</div>
                </div>
                <button class="secondary" onclick="startEdit(${idx})">Edit</button>
                <button class="danger" onclick="deleteWordUI(${idx})">Delete</button>
            </div>
        `;
    }).join('');
}

async function addWordUI() {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = cfg.getDeck();
    const eng = document.getElementById('vocab-new-eng').value.trim();
    const hil = document.getElementById('vocab-new-hil').value.trim();
    const cat = document.getElementById('vocab-new-cat').value.trim();
    // Filterable lists (core) reuse the shared phase filter as the new
    // word's extra value; non-filterable lists (field) have their own input.
    const extraElem = cfg.filterable
        ? document.getElementById('vocab-phase-filter')
        : document.getElementById('vocab-new-extra');
    const extraVal = extraElem ? extraElem.value.trim() : '';
    const statusElem = document.getElementById('vocab-add-status');

    if (!eng || !hil) {
        statusElem.innerText = 'English and Hiligaynon are both required.';
        statusElem.className = 'context error-text';
        return;
    }
    if (deck.some(v => v.hil.trim().toLowerCase() === hil.toLowerCase())) {
        statusElem.innerText = `"${hil}" already exists in this list.`;
        statusElem.className = 'context error-text';
        return;
    }

    statusElem.innerText = 'Adding…';
    statusElem.className = 'context';
    const payload = { action: cfg.actions.add, eng, hil, cat };
    payload[cfg.extraKey] = extraVal;
    const ok = await callScript(payload);
    if (!ok) {
        statusElem.innerText = 'Failed to add — check connection.';
        statusElem.className = 'context error-text';
        return;
    }

    const newCard = {
        eng, hil, cat,
        mastered: false, timesCorrect: 0, timesMissed: 0,
        lastReviewed: '', mnemonic: '', mnemonicImageUrl: '', flipped: false,
    };
    newCard[cfg.extraKey] = extraVal;
    deck.push(newCard);

    document.getElementById('vocab-new-eng').value = '';
    document.getElementById('vocab-new-hil').value = '';
    document.getElementById('vocab-new-cat').value = '';
    // For filterable lists, the extra field IS the filter — clearing it
    // here would reset any filter the user has active, so leave it alone.
    if (!cfg.filterable) document.getElementById('vocab-new-extra').value = '';

    statusElem.innerText = `✓ Added "${hil}"`;
    statusElem.className = 'context';
    setTimeout(() => { statusElem.innerText = ''; }, 3000);

    renderManager();
    renderCard();
    if (activeListKey === 'core') {
        renderStages();
        updateDashboard();
    }
}

function startEdit(idx) {
    listState[activeListKey].editingIndex = idx;
    renderManager();
}

function cancelEdit() {
    listState[activeListKey].editingIndex = null;
    renderManager();
}

async function saveEditUI(idx) {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = cfg.getDeck();
    const card = deck[idx];
    const originalHil = card.hil;
    const eng = document.getElementById(`vocab-edit-eng-${idx}`).value.trim();
    const hil = document.getElementById(`vocab-edit-hil-${idx}`).value.trim();
    const cat = document.getElementById(`vocab-edit-cat-${idx}`).value.trim();
    const extraVal = document.getElementById(`vocab-edit-extra-${idx}`).value.trim();

    if (!eng || !hil) return;

    const payload = { action: cfg.actions.edit, originalHil, eng, hil, cat };
    payload[cfg.extraKey] = extraVal;
    const ok = await callScript(payload);
    if (ok) {
        card.eng = eng;
        card.hil = hil;
        card.cat = cat;
        card[cfg.extraKey] = extraVal;
    }
    listState[activeListKey].editingIndex = null;
    renderManager();
    renderCard();
    if (activeListKey === 'core') {
        renderStages();
        updateDashboard();
    }
}

async function deleteWordUI(idx) {
    const cfg = VOCAB_LISTS[activeListKey];
    const deck = cfg.getDeck();
    const card = deck[idx];
    if (!confirm(`Delete "${card.hil}" (${card.eng})? This can't be undone.`)) return;

    const ok = await callScript({ action: cfg.actions.delete, hil: card.hil });
    if (ok) {
        deck.splice(idx, 1);
        const state = listState[activeListKey];
        if (state.cardIndex >= deck.length) state.cardIndex = 0;
    }
    renderManager();
    renderCard();
    if (activeListKey === 'core') {
        renderStages();
        updateDashboard();
    }
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
    // A just-advanced stage should open even though its (not-yet-rendered)
    // DOM node was still collapsed a moment ago — apply it after the DOM
    // sync above so it isn't immediately deleted as "closed".
    if (pendingOpenStageId) {
        openStageIds.add(pendingOpenStageId);
        pendingOpenStageId = null;
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
                <div class="concept-status">${formatLastStudied(c.lastReviewed)}</div>
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

function formatLastStudied(lastReviewed) {
    if (!lastReviewed) return 'Not yet studied';
    const d = new Date(lastReviewed);
    if (isNaN(d.getTime())) return 'Not yet studied';
    return `Last studied ${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function currentStage() {
    return stages.find(s => s.status === 'In Progress') || stages[stages.length - 1];
}

function updateDashboard() {
    const masteredCount = vocabDeck.filter(v => v.mastered).length;
    document.getElementById('retention-val').innerText = `${masteredCount} / ${vocabDeck.length}`;

    const conceptsMastered = concepts.filter(c => {
        const match = (c.bloomLevel || '').match(/Level\s*(\d+)/);
        return match && Number(match[1]) >= 3;
    }).length;
    document.getElementById('concepts-val').innerText = `${conceptsMastered} / ${concepts.length}`;

    renderProgressGauge();

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
                bloom_level: v.mastered ? 'Level 1: Remembering' : 'Not yet reviewed',
                times_correct: Number(v.timesCorrect) || 0,
                times_missed: Number(v.timesMissed) || 0,
                last_reviewed: v.lastReviewed || null,
            })),
            session_stats: {
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

• vocab[] — vocabulary items for this phase. bloom_level is "Level 1:
  Remembering" once the learner has passed it via flashcard recall in the
  app, "Not yet reviewed" otherwise. This is a floor, not a ceiling —
  passing Level 1 means the word is available for use, not that it's fully
  mastered.

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
PROGRESSION PHILOSOPHY: INTERLEAVED, NOT GATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SRS scheduling (step_index, next_review_due) exists to protect long-term
retention — it is NOT a gate on moving to new material. Do not make the
learner wait out review intervals before advancing phases.

• Once a concept reaches Level 3+ (Applying), the phase it belongs to may
  advance regardless of SRS step_index or consecutive_passes.
• Prior-phase concepts/vocab don't get abandoned on advancement — they
  keep circulating via the SRS schedule below as warm-up review, interleaved
  with new-phase material, not gated ahead of it.
• A missed review is a signal to re-schedule that item sooner (reset
  step_index per the rules below) — never a reason to block new material.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Start each session with a brief warm-up on any concepts (from ANY phase,
   not just the current one) whose next_review_due is today or overdue.
2. Then move to new-phase material — don't let overdue reviews block progress,
   just work them in first.
3. For concepts with low step_index or recent failures, drill more heavily
   during their warm-up slot.
4. Use the learner's farm/Sapi-an context for all example sentences.
5. Test production (learner produces Hiligaynon) more than recognition.
6. Track whether the learner passes on FIRST attempt vs. needing hints/retries.
7. Note production latency where relevant (fast = automatic, slow = still constructing).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOCABULARY SCAFFOLDING (STRICT RECALL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• NEVER provide parenthetical translations or unsolicited vocabulary helpers for words where mastered == true or bloom_level >= Level 3.
• Always require the learner to produce mastered vocabulary from memory during drills.
• Provide vocabulary hints ONLY for unmastered items (mastered == false) or when the learner explicitly requests a hint.
• When introducing a new target sentence, state the sentence in English and let the learner perform total recall of all vocabulary and grammar markers.
• The learner's vocabulary for this phase is a deliberately small, closed set — vocab[] above, nothing more. This is the core of the app's syntactic-bootstrapping approach: master grammatical structure on a fixed word set so the learner's brain later deduces new vocabulary from context on its own. NEVER introduce a Hiligaynon word in an example or practice sentence that isn't in vocab[] for this phase (or an already-mastered word from a prior phase's warm-up review) — vocabulary expansion is not the goal here, grammar mastery is.
• When introducing a NEW concept for the first time this session, prefer building example/practice sentences from vocab where bloom_level is "Level 1: Remembering" or higher — don't stack unfamiliar grammar and unfamiliar vocabulary in the same unprompted-recall sentence.
• If a concept genuinely requires a word the learner hasn't passed Level 1 on yet, either gloss/give that word directly (don't test it) or introduce it briefly via simple exposure before folding it into concept practice.

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

Graduated = step_index at max AND consecutive_passes >= len(intervals). This
describes how well-retained a concept's review schedule is — it is a
retention metric, not a prerequisite for phase advancement (see above).

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
• advance = true if ALL current-phase concepts are mastered (bloom_level >= Level 3: Applying). Do NOT require any SRS step_index or consecutive_passes threshold — SRS state only controls when a mastered concept resurfaces for review, never whether the phase can advance.
• Output ONLY the JSON code block — no commentary before or after.`;

    const promptText = systemPrompt + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSESSION CONTEXT (paste begins here)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' + JSON.stringify(contextPayload, null, 2);

    document.getElementById('prompt-output').value = promptText;
}

function overallProgressPercent() {
    const vocabTotal = vocabDeck.length;
    const vocabMastered = vocabDeck.filter(v => v.mastered).length;
    const conceptsTotal = concepts.length;
    const conceptsMastered = concepts.filter(c => c.mastered).length;

    const vocabPct = vocabTotal > 0 ? vocabMastered / vocabTotal : 0;
    const conceptsPct = conceptsTotal > 0 ? conceptsMastered / conceptsTotal : 0;

    if (vocabTotal === 0 && conceptsTotal === 0) return 0;
    if (conceptsTotal === 0) return Math.round(vocabPct * 100);
    if (vocabTotal === 0) return Math.round(conceptsPct * 100);
    return Math.round(((vocabPct + conceptsPct) / 2) * 100);
}

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// percent 0-100 maps to angle 180deg (left/0%) -> 0deg (right/100%)
function percentToAngle(percent) {
    return 180 - (percent / 100) * 180;
}

function describeArc(cx, cy, r, startPercent, endPercent) {
    const startAngle = percentToAngle(startPercent);
    const endAngle = percentToAngle(endPercent);
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArcFlag = startAngle - endAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function renderProgressGauge() {
    const container = document.getElementById('progress-gauge-container');
    if (!container) return;
    const percent = overallProgressPercent();

    const cx = 110, cy = 105, r = 90;
    const needleAngle = percentToAngle(percent);
    const needleLen = r - 14;
    const needleTip = polarToCartesian(cx, cy, needleLen, needleAngle);

    const zones = [
        { from: 0, to: 33, color: '#ef4444' },
        { from: 33, to: 66, color: '#f59e0b' },
        { from: 66, to: 100, color: '#10b981' },
    ];
    const zoneArcs = zones.map(z =>
        `<path d="${describeArc(cx, cy, r, z.from, z.to)}" fill="none" stroke="${z.color}" stroke-width="16" stroke-linecap="butt"/>`
    ).join('');

    const svg = `
        <svg viewBox="0 0 220 130" style="width: 260px; max-width: 100%;">
            ${zoneArcs}
            <line x1="${cx}" y1="${cy}" x2="${needleTip.x.toFixed(1)}" y2="${needleTip.y.toFixed(1)}" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"/>
            <circle cx="${cx}" cy="${cy}" r="7" fill="#f8fafc"/>
            <text x="${cx}" y="${cy - 20}" text-anchor="middle" class="gauge-value">${percent}%</text>
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="gauge-label">Overall Plan Progress</text>
        </svg>
    `;
    container.innerHTML = svg;
}

const MAX_CHART_DAYS = 30;

// Collapse a sorted array of {timestamp, avgBloomVocab, avgBloomConcepts}
// entries down to one point per calendar day (the max value seen that day),
// capped to the most recent MAX_CHART_DAYS days.
function bucketByDayMax(entries) {
    const byDay = new Map();
    for (const entry of entries) {
        const d = new Date(entry.timestamp);
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const existing = byDay.get(dayKey);
        if (!existing) {
            byDay.set(dayKey, { ...entry });
        } else {
            existing.avgBloomVocab = Math.max(Number(existing.avgBloomVocab) || 0, Number(entry.avgBloomVocab) || 0);
            existing.avgBloomConcepts = Math.max(Number(existing.avgBloomConcepts) || 0, Number(entry.avgBloomConcepts) || 0);
            existing.timestamp = entry.timestamp; // keep the latest timestamp of that day
        }
    }
    const daily = [...byDay.values()];
    return daily.slice(Math.max(0, daily.length - MAX_CHART_DAYS));
}

function renderProgressChart() {
    renderProgressGauge();
    const container = document.getElementById('progress-charts');

    // Group history by phase
    const phaseGroups = {};
    for (const entry of (progressHistory || [])) {
        const phase = String(entry.phase);
        if (!phaseGroups[phase]) phaseGroups[phase] = [];
        phaseGroups[phase].push(entry);
    }

    // Sort each phase's entries by timestamp, then collapse to one
    // (max-value) point per day, capped to the most recent MAX_CHART_DAYS.
    for (const phase of Object.keys(phaseGroups)) {
        phaseGroups[phase].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        phaseGroups[phase] = bucketByDayMax(phaseGroups[phase]);
    }

    let html = '';
    const phaseIds = stages.map(s => String(s.id));

    for (const phaseId of phaseIds) {
        const entries = phaseGroups[phaseId] || [];
        const stage = stages.find(s => String(s.id) === phaseId);
        const phaseName = stage ? stage.name : `Phase ${phaseId}`;
        const isActive = stage && stage.status === 'In Progress';

        html += `<details class="progress-chart-container"${isActive ? ' open' : ''}>`;
        html += `<summary><h3>${phaseName}</h3></summary>`;
        html += renderSVGChart(entries);
        html += `<div class="chart-legend">`;
        html += `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#10b981;"></span>Vocab</span>`;
        html += `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#38bdf8;"></span>Concepts</span>`;
        html += `</div>`;
        html += `</details>`;
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

    // Apply phase recommendation — advance the current stage to Done and
    // open the next one, so this doesn't require a manual Sheet edit.
    // Concepts/vocab already mastered keep circulating via the SRS warm-up
    // rotation regardless of phase, and a failed review still resets
    // step_index to 0 (see srs_updates above), so nothing here weakens
    // review of items you get wrong — advancing just unlocks new material.
    let recNote = '';
    if (payload.phase_recommendation) {
        const rec = payload.phase_recommendation;
        if (rec.advance) {
            const stage = currentStage();
            if (stage && stage.status === 'In Progress') {
                const nextStage = stages.find(s => Number(s.id) === Number(stage.id) + 1);
                stage.status = 'Done';
                await callScript({ action: 'setStage', stageId: stage.id, status: 'Done' });
                if (nextStage) {
                    nextStage.status = 'In Progress';
                    await callScript({ action: 'setStage', stageId: nextStage.id, status: 'In Progress' });
                    pendingOpenStageId = String(nextStage.id);
                    recNote = ` | ✓ Advanced to ${nextStage.name}: ${rec.reason}`;
                } else {
                    recNote = ` | ✓ Phase ${stage.id} complete (final phase): ${rec.reason}`;
                }
            } else {
                recNote = ` | Phase advance recommended: ${rec.reason}`;
            }
        } else {
            recNote = ` | Stay in phase: ${rec.reason}`;
        }
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
