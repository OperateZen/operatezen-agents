/**
 * decision_sync.js — Syncs discussion decisions to local file
 * Used by discussion_engine.cjs as a backup when KB save fails
 * or as additional persistence after successful KB save.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DECISIONS_FILE = path.join(__dirname, '..', 'agent-brain', 'decisions.jsonl');

/**
 * Sync a discussion decision to local file + optionally GitHub
 * @param {string} id - Question/decision ID
 * @param {string} q - The question
 * @param {string} cat - Category
 * @param {string} finalDecision - Final decision text
 * @param {string} discussionText - Full discussion text
 */
async function syncDecision(id, q, cat, finalDecision, discussionText) {
  const record = {
    id,
    question: q,
    category: cat,
    decision: finalDecision,
    discussion: discussionText,
    timestamp: new Date().toISOString()
  };

  // Append to local JSONL file
  const dir = path.dirname(DECISIONS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(DECISIONS_FILE, JSON.stringify(record) + '\n');
}

module.exports = { syncDecision };
