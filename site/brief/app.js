import {STORAGE_KEY, MAX_BRIEF_BYTES, FIT_LABELS, assertBriefSize, createBrief, snapshot, addSelection,
  filterRecords, sourceChanged, reviewIssues, manifest, toMarkdown, parseBrief, safeURL} from './core.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let brief = createBrief(), catalog = null, currentSnapshot = null, visibleFamilies = 8;
let savedRaw = null, saveTimer = null, protectedStorage = false, dirty = false;
let acceptedDraft = JSON.stringify(brief);
const fields = ['title','question','system','context','constraints','gaps','next_steps'];
const say = text => { $('#message').textContent = text; };
const hasWork = () => brief.selections.length > 0 || fields.some(key => brief[key].trim());
const stateLabel = r => r.review_status === 'reviewed' ? 'Documentary assessment, not replication' : r.review_status === 'catalogued' ? 'Sources catalogued; method not assessed' : 'Imported; method not assessed';
function restore() {
  try {
    savedRaw = localStorage.getItem(STORAGE_KEY);
    if (savedRaw) brief = parseBrief(savedRaw);
    $('#save-status').textContent = savedRaw ? 'Restored the draft saved on this device.' : 'Your draft will be saved on this device as you edit.';
  } catch {
    protectedStorage = true;
    $('#save-status').textContent = 'The saved draft or local storage could not be read. Nothing was overwritten. Export your work, or start a new brief to clear this draft.';
  }
}
function save() {
  clearTimeout(saveTimer);
  if (protectedStorage) return;
  try {
    const other = localStorage.getItem(STORAGE_KEY);
    if (other !== savedRaw) {
      protectedStorage = true;
      $('#storage-conflict').hidden = false;
      $('#save-status').textContent = 'Not saved: another tab changed this draft. Export this tab before reloading.';
      return;
    }
    const raw = JSON.stringify(brief);
    localStorage.setItem(STORAGE_KEY, raw);
    savedRaw = raw;
    dirty = false;
    $('#save-status').textContent = `Saved on this device · Revision ${brief.revision}`;
  } catch {
    $('#save-status').textContent = 'Not saved locally. Storage may be blocked or full. Export JSON to keep your work.';
  }
}
function changed() {
  brief.updated_at = new Date().toISOString();
  brief.revision = Math.min(Number.MAX_SAFE_INTEGER, brief.revision + 1);
  try { assertBriefSize(brief); } catch (error) {
    brief = JSON.parse(acceptedDraft);
    fillFields(); renderSelections(); renderCandidates(); say(error.message);
    return false;
  }
  dirty = true;
  acceptedDraft = JSON.stringify(brief);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
  if (!protectedStorage) $('#save-status').textContent = 'Saving on this device...';
  renderSummary();
  return true;
}
function fillFields() {
  document.querySelectorAll('[data-field]').forEach(node => { node.value = brief[node.dataset.field] || ''; });
}
function renderSummary() {
  const count = brief.selections.length;
  $('#brief-count').textContent = `${count} selected`;
  $('#review-link').textContent = count ? `Review ${count} selected evaluation${count === 1 ? '' : 's'}` : 'Review your selections';
  const issues = reviewIssues(brief);
  $('#open-items-label').textContent = issues.length ? `${issues.length} open planning item${issues.length === 1 ? '' : 's'}` : 'No blank planning fields detected';
  $('#issue-list').innerHTML = issues.length ? issues.map(item => `<li>${esc(item)}</li>`).join('')
    : '<li>This is a completeness check, not a safety judgement. Review all assumptions and evidence before using the plan.</li>';
  const old = brief.selections.filter(item => sourceChanged(item.catalogue_snapshot, currentSnapshot));
  const missing = brief.selections.filter(item => !item.catalogue_snapshot?.catalog_sha256);
  $('#snapshot-warning').hidden = !old.length && !missing.length;
  $('#snapshot-warning').textContent = [
    old.length ? `${old.length} selection(s) came from a different catalogue snapshot. Captured evidence is preserved, not automatically updated.` : '',
    missing.length ? `${missing.length} selection(s) have no catalogue fingerprint. Their source snapshot cannot be checked.` : '',
    'Verify the original sources before relying on this plan.'
  ].filter(Boolean).join(' ');
  if ($('.brief-preview').open) { printView(); $('#preview').innerHTML = $('#print-view').innerHTML; }
}
function row(record) {
  const selected = brief.selections.some(item => item.record.id === record.id);
  return `<article class="candidate"><div><h3><a href="/#/eval/${encodeURIComponent(record.id)}" target="_blank" rel="noopener noreferrer">${esc(record.name)} ↗</a></h3>
    <p>${esc((record.methodological_review?.construct || record.measures || record.description || 'Read the source before assessing fit.').slice(0, 250))}</p>
    <span class="record-state">${esc(stateLabel(record))}</span></div>
    <button type="button" data-add="${esc(record.id)}" aria-pressed="${selected}" aria-label="${selected ? 'Remove' : 'Add'} ${esc(record.name)} ${selected ? 'from' : 'to'} brief">${selected ? 'Selected' : 'Add to brief'}</button></article>`;
}
function renderCandidates() {
  if (!catalog) return;
  const labels = Object.fromEntries(Object.entries(catalog.topics || {}).map(([id, value]) => [id, value.label || id]));
  const records = filterRecords(catalog.records, $('#query').value, $('#topic').value, labels);
  const groups = new Map();
  for (const record of records) {
    const key = record.source_key || record.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const shown = [...groups.values()].slice(0, visibleFamilies);
  $('#result-count').textContent = `${records.length} text matches in ${groups.size} source families. Showing ${shown.length} families.`;
  $('#candidates').innerHTML = shown.length ? shown.map(group => group.length === 1 ? row(group[0]) :
    `<details class="variants"><summary>${esc(group[0].family_title || group[0].group || group[0].name)} · ${group.length} matching variants</summary>${group.map(row).join('')}</details>`).join('')
    : '<div class="brief-empty">No catalogue text match. Try a broader term or another topic. This does not establish that no suitable evaluation exists.</div>';
  $('#show-more').hidden = groups.size <= visibleFamilies;
}
function links(record) {
  return record.sources.map(source => `<a href="${esc(safeURL(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`).join('');
}
function renderSelections() {
  $('#selections').innerHTML = brief.selections.length ? brief.selections.map((item, index) => {
    const r = item.record;
    return `<article class="selection" data-selection="${index}"><div class="selection-heading"><div><h3>${index + 1}. ${esc(r.name)}</h3><p>${esc(stateLabel(r))} · Protocol: ${esc(r.version)}</p></div><button type="button" data-remove="${index}" aria-label="Remove ${esc(r.name)}">Remove</button></div>
    <div class="source-limit"><p><strong>Can support:</strong> ${esc(r.measures || 'Not assessed in this snapshot.')}</p><p><strong>Cannot establish by itself:</strong> ${esc(r.limit || 'Limits not recorded. Read the original protocol.')}</p></div>
    <div class="selection-sources">${links(r)}</div>
    <div class="selection-grid"><div><label for="fit-${index}">Methodological fit <span>Your judgement</span></label><select id="fit-${index}" data-note="fit">${Object.entries(FIT_LABELS).map(([key, label]) => `<option value="${key}" ${item.fit === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
    <label for="rationale-${index}">Why include this evaluation?</label><textarea id="rationale-${index}" data-note="rationale" rows="3" maxlength="16000" placeholder="Connect this method to the decision question.">${esc(item.rationale)}</textarea></div>
    <div><label for="gap-${index}">What does this leave untested?</label><textarea id="gap-${index}" data-note="gap" rows="2" maxlength="16000" placeholder="For example, your language, users, tools, or real-world outcomes.">${esc(item.gap)}</textarea>
    <label for="next-${index}">Next verification or execution step</label><textarea id="next-${index}" data-note="next_action" rows="2" maxlength="16000" placeholder="Specify the protocol check, local adaptation, test or evidence needed.">${esc(item.next_action)}</textarea></div></div></article>`;
  }).join('') : '<div class="brief-empty">No evaluations selected yet. <a href="#select">Choose candidates from the catalogue</a>, then explain why each belongs in your plan.</div>';
  const dimensions = [['Construct','construct'],['Unit of analysis','unit'],['Outcome','outcome'],['Scoring','scoring'],['Protocol version','version'],['Implementation commit','implementation_commit'],['Comparability conditions','comparability'],['Evidence limit','limit']];
  $('#comparison-details').hidden = brief.selections.length < 2;
  $('#comparison').innerHTML = brief.selections.length < 2 ? '' : `<table class="${brief.selections.length > 3 ? 'comparison-wide' : ''}"><caption>Captured method descriptions. Shared topics do not imply comparable results.</caption><thead><tr><th scope="col">Method</th>${brief.selections.map(item => `<th scope="col">${esc(item.record.name)}</th>`).join('')}</tr></thead><tbody>${dimensions.map(([label,key]) => `<tr><th scope="row">${label}</th>${brief.selections.map(item => `<td>${esc(item.record[key] || 'Not recorded; verify the source.')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  renderSummary();
}
async function loadCatalogue() {
  $('#catalogue-error').hidden = true;
  $('#retry').disabled = true;
  try {
    const response = await fetch('/data/catalog.json', {cache:'no-cache', signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('Catalogue unavailable');
    const raw = await response.text();
    const value = JSON.parse(raw);
    if (!Array.isArray(value.records) || !value.records.every(r => r && typeof r.id === 'string' && typeof r.name === 'string')) throw new Error('Invalid catalogue');
    let hash = null;
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    catalog = value;
    currentSnapshot = snapshot(value, hash);
    $('#catalogue-date').textContent = `${String(value.generated_at || 'Date not recorded').slice(0, 10)} · ${value.records.length} published records${hash ? '' : ' · fingerprint unavailable'}`;
    $('#topic').innerHTML = '<option value="">All topics</option>' + Object.entries(value.topics || {}).map(([id,topic]) => `<option value="${esc(id)}">${esc(topic.label || id)}</option>`).join('');
    renderCandidates(); renderSummary();
  } catch {
    $('#catalogue-error').hidden = false;
    $('#catalogue-date').textContent = 'Unavailable. Captured selections remain usable.';
    $('#result-count').textContent = 'Catalogue unavailable; retry to select new records.';
  } finally { $('#retry').disabled = false; }
}
function remove(index) {
  const item = brief.selections[index];
  if (!item) return;
  if ((item.rationale || item.gap || item.next_action) && !confirm(`Remove ${item.record.name} and its selection notes?`)) return;
  brief.selections.splice(index, 1);
  changed(); renderSelections(); renderCandidates(); say(`${item.record.name} removed.`);
  const next = $('#selections [data-remove]') || $('#query');
  next.focus({preventScroll:true});
}
function confirmReplacement(message) {
  return !(hasWork() || protectedStorage || savedRaw !== null) || confirm(message);
}
function replaceDraft(next) {
  assertBriefSize(next);
  clearTimeout(saveTimer);
  brief = next; dirty = true; acceptedDraft = JSON.stringify(brief);
  try {
    savedRaw = localStorage.getItem(STORAGE_KEY);
    protectedStorage = false;
  } catch { protectedStorage = false; }
  $('#storage-conflict').hidden = true;
  fillFields(); renderSelections(); renderCandidates(); save();
}
function exportFile(text, extension, type) {
  save();
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fronteraeval-brief-${new Date().toISOString().slice(0,10)}-r${brief.revision}.${extension}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function printView() {
  const pair = (label, text) => `<p><strong>${esc(label)}:</strong> ${esc(text || 'Not recorded')}</p>`;
  $('#print-view').innerHTML = `<h1>${esc(brief.title || 'Evaluation brief')}</h1><p>Draft plan · Revision ${brief.revision} · ${esc(brief.updated_at)}</p><p>${esc(manifest(brief).boundary)}</p>
    <h2>Decision and system</h2>${pair('Question',brief.question)}${pair('System',brief.system)}${pair('Language, users and context',brief.context)}${pair('Constraints',brief.constraints)}
    <h2>Selected evaluations</h2><p>Fit labels and notes are user judgements, not FronteraEval validation.</p>${brief.selections.map(item => {
      const r=item.record;
      return `<h3>${esc(r.name)}</h3>${pair('Fit',FIT_LABELS[item.fit])}${pair('Why included',item.rationale)}${pair('Construct',r.construct)}${pair('Unit',r.unit)}${pair('Outcome',r.outcome)}${pair('Scoring',r.scoring)}${pair('Can support',r.measures)}${pair('Cannot establish by itself',r.limit)}${pair('Comparability',r.comparability)}${pair('Protocol version',r.version)}${pair('Implementation commit',r.implementation_commit)}${pair('Record state',stateLabel(r))}${pair('Remaining gap',item.gap)}${pair('Next action',item.next_action)}${pair('Snapshot date',item.catalogue_snapshot?.generated_at)}${pair('Catalogue SHA-256',item.catalogue_snapshot?.catalog_sha256)}${pair('Inspect source commit',item.catalogue_snapshot?.inspect_source_commit)}${r.sources.map(s=>`<p class="print-source">${esc(s.label)}: ${esc(safeURL(s.url))}</p>`).join('')}`;
    }).join('')}<h2>Evidence gaps and next steps</h2>${pair('Gaps',brief.gaps)}${pair('Next action and owner',brief.next_steps)}<h2>Open planning items</h2><ul>${reviewIssues(brief).map(item=>`<li>${esc(item)}</li>`).join('') || '<li>No blank planning fields. This is not a safety judgement.</li>'}</ul>`;
}
restore(); acceptedDraft = JSON.stringify(brief); fillFields(); renderSelections();
document.querySelectorAll('[data-field]').forEach(node => node.addEventListener('input', () => { brief[node.dataset.field] = node.value; changed(); }));
$('#candidates').addEventListener('click', event => {
  const button = event.target.closest('[data-add]');
  if (!button || !catalog) return;
  const index = brief.selections.findIndex(item => item.record.id === button.dataset.add);
  if (index >= 0) { remove(index); return; }
  const record = catalog.records.find(item => item.id === button.dataset.add);
  if (!record) return;
  if (brief.selections.length >= 100) { say('A brief supports up to 100 evaluations. Start a separate brief for a larger plan.'); return; }
  addSelection(brief, record, currentSnapshot);
  if (!changed()) return;
  renderSelections();
  button.textContent = 'Selected'; button.setAttribute('aria-pressed','true');
  button.setAttribute('aria-label', `Remove ${record.name} from brief`);
  say(`${record.name} added. Explain its fit in section 03.`);
});
$('#selections').addEventListener('click', event => { const node=event.target.closest('[data-remove]'); if(node) remove(Number(node.dataset.remove)); });
function editNote(event) {
  const node = event.target.closest('[data-note]');
  if (!node) return;
  const item = brief.selections[Number(node.closest('[data-selection]').dataset.selection)];
  if (!item) return;
  item[node.dataset.note] = node.value; changed();
}
$('#selections').addEventListener('input', event => { if (event.target.tagName !== 'SELECT') editNote(event); });
$('#selections').addEventListener('change', event => { if (event.target.tagName === 'SELECT') editNote(event); });
for (const id of ['query','topic']) $('#'+id).addEventListener(id==='query'?'input':'change', () => {visibleFamilies=8;renderCandidates();});
$('#show-more').addEventListener('click', () => {visibleFamilies+=8;renderCandidates();});
$('#retry').addEventListener('click', loadCatalogue);
$('#example').addEventListener('click', () => {
  if (!confirmReplacement('Replace the current or saved draft with an assistant-security example? Saved work, including an unreadable draft, will be replaced. Export existing work first.')) return;
  const next = createBrief(currentSnapshot);
  next.title = 'Tool-using assistant security';
  next.question = 'What evidence is needed to assess indirect prompt-injection resistance while preserving legitimate task performance?';
  replaceDraft(next); $('#query').value = 'prompt injection'; renderCandidates();
  say('Example question loaded. Specify your system and context. No evaluations or fit judgements were selected for you.');
  $('#system').focus();
});
$('#reset').addEventListener('click', () => {
  if (!confirm('Clear this saved draft and start a new brief? Export JSON first to keep a copy.')) return;
  clearTimeout(saveTimer);
  let cleared = false;
  try {localStorage.removeItem(STORAGE_KEY);savedRaw=null;cleared=true;} catch {}
  protectedStorage=!cleared; brief=createBrief(currentSnapshot); dirty=false; acceptedDraft=JSON.stringify(brief);
  $('#storage-conflict').hidden=true; fillFields();renderSelections();renderCandidates();
  $('#save-status').textContent=cleared
    ? 'Draft cleared. The new draft will be saved as you edit.'
    : 'Cleared this tab only. The saved draft could not be removed. Autosave is paused; export new work to keep it.';
  say(cleared ? 'Draft cleared. Other browser settings were not changed.' : 'Browser storage blocked removal. The saved copy may still exist.'); $('#title').focus();
});
$('#reload-draft').addEventListener('click', () => {
  if (!confirm('Discard changes in this tab and reload the saved draft? Export this tab first to keep its work.')) return;
  try { const raw=localStorage.getItem(STORAGE_KEY); const next=raw?parseBrief(raw):createBrief(currentSnapshot); savedRaw=raw; brief=next; dirty=false; acceptedDraft=JSON.stringify(brief); protectedStorage=false; $('#storage-conflict').hidden=true; fillFields();renderSelections();renderCandidates();$('#save-status').textContent='Reloaded the saved draft.'; }
  catch {say('The saved draft could not be read. Current work was not changed.');}
});
$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file=event.target.files?.[0]; if(!file)return;
  try {
    if(file.size>MAX_BRIEF_BYTES)throw new Error('Use a JSON brief no larger than 8 MB.');
    const next=parseBrief(await file.text());
    if(!confirmReplacement('Replace the current or saved draft with this JSON brief? This also replaces any unreadable saved draft. Export current work first.'))return;
    replaceDraft(next);say('Brief opened. Imported source metadata is preserved, not revalidated.');
  }catch(error){say(error.message || 'Could not open this brief. Current work was not changed.');}
  finally {event.target.value='';}
});
$('#export-json').addEventListener('click', () => exportFile(JSON.stringify(manifest(brief),null,2),'json','application/json;charset=utf-8'));
$('#export-markdown').addEventListener('click', () => exportFile(toMarkdown(brief),'md','text/markdown;charset=utf-8'));
$('.brief-preview').addEventListener('toggle', () => {if($('.brief-preview').open){printView();$('#preview').innerHTML=$('#print-view').innerHTML;}});
$('#print').addEventListener('click', () => {save();printView();window.print();});
window.addEventListener('beforeprint', printView);
// Flush pending deletions as well as nonempty drafts; never recreate a cleared draft.
window.addEventListener('pagehide', () => {if(dirty)save();});
document.addEventListener('visibilitychange', () => {if(document.visibilityState === 'hidden' && dirty)save();});
window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  save();
  if (dirty) {event.preventDefault(); event.returnValue='';}
});
window.addEventListener('storage', event => {
  if(event.key!==null && event.key!==STORAGE_KEY)return;
  if(event.newValue===savedRaw)return;
  clearTimeout(saveTimer);protectedStorage=true;$('#storage-conflict').hidden=false;
  $('#save-status').textContent='Another tab changed the saved draft. Autosave paused to protect both versions.';
});
$('#brief-theme').addEventListener('click', () => {
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;
  try{localStorage.setItem('fronteraeval-theme',next);}catch{}
});
loadCatalogue();
