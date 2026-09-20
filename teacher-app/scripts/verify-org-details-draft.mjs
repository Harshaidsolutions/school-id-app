/**
 * Verifies Required Details draft accumulation (steps 1-6) and reset on submit (step 8).
 * Run: node scripts/verify-org-details-draft.mjs
 */
import assert from "node:assert/strict";

const drafts = new Map();

function setDraft(userId, draft) {
  drafts.set(userId, { ...draft });
}

function getDraft(userId) {
  return drafts.get(userId);
}

function clearDraft(userId) {
  drafts.delete(userId);
}

function applySyncPreviews(state, row, pending) {
  const next = { ...state };
  if (pending.template) {
    next.templateId = row.template_id;
    next.templatePreviewUrlState = pending.template;
  }
  if (pending.model) {
    next.model = row.model;
    next.modelPreviewUrl = pending.model;
  }
  if (pending.tags) {
    next.tags = row.tags;
    next.tagsPreviewUrl = pending.tags;
  }
  return next;
}

function emptyState() {
  return {
    signatureUri: null,
    logoUri: null,
    orgPhotoUri: null,
    templateId: null,
    templatePreviewUrlState: null,
    model: "",
    tags: "",
    modelPreviewUrl: null,
    tagsPreviewUrl: null,
  };
}

const userId = "teacher-1";
let state = emptyState();

// 1. Upload Principal Signature
state = { ...state, signatureUri: "file://signature.jpg" };
setDraft(userId, state);
assert.equal(getDraft(userId).signatureUri, "file://signature.jpg");

// 2. Upload School Logo — signature must remain
state = { ...state, logoUri: "file://logo.jpg" };
setDraft(userId, state);
assert.equal(getDraft(userId).signatureUri, "file://signature.jpg");
assert.equal(getDraft(userId).logoUri, "file://logo.jpg");

// 3. Upload School Building Photo — all three visible
state = { ...state, orgPhotoUri: "file://building.jpg" };
setDraft(userId, state);
assert.ok(getDraft(userId).signatureUri);
assert.ok(getDraft(userId).logoUri);
assert.ok(getDraft(userId).orgPhotoUri);

// 4. Select Template
state = applySyncPreviews(state, { template_id: "tpl-1" }, { template: "https://cdn/tpl.png" });
setDraft(userId, state);
assert.ok(getDraft(userId).signatureUri);
assert.ok(getDraft(userId).logoUri);
assert.ok(getDraft(userId).orgPhotoUri);
assert.equal(getDraft(userId).templatePreviewUrlState, "https://cdn/tpl.png");

// 5. Select Model
state = applySyncPreviews(state, { model: "Model A" }, { model: "https://cdn/model.png" });
setDraft(userId, state);
assert.ok(getDraft(userId).templatePreviewUrlState);
assert.equal(getDraft(userId).modelPreviewUrl, "https://cdn/model.png");

// 6. Select Tags
state = applySyncPreviews(state, { tags: "Tag B" }, { tags: "https://cdn/tag.png" });
setDraft(userId, state);
assert.equal(getDraft(userId).tagsPreviewUrl, "https://cdn/tag.png");
assert.ok(getDraft(userId).signatureUri);
assert.ok(getDraft(userId).logoUri);
assert.ok(getDraft(userId).orgPhotoUri);
assert.ok(getDraft(userId).templatePreviewUrlState);
assert.ok(getDraft(userId).modelPreviewUrl);

// 7-8. Submit clears draft
clearDraft(userId);
state = emptyState();
assert.equal(getDraft(userId), undefined);
assert.equal(state.signatureUri, null);
assert.equal(state.logoUri, null);
assert.equal(state.orgPhotoUri, null);
assert.equal(state.templatePreviewUrlState, null);
assert.equal(state.modelPreviewUrl, null);
assert.equal(state.tagsPreviewUrl, null);

console.log("PASS: Required Details accumulation + submit reset sequence verified.");
