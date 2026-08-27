import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraft,
  clearSubmission,
  loadDraft,
  loadSubmission,
  saveDraft,
  saveSubmission,
} from './draftStorage';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('draft round-trip', () => {
  it('returns what was stored', () => {
    saveDraft({ first_name: 'Ada' }, 'abc/resume.pdf', 'ada-lovelace-cv.pdf');
    expect(loadDraft()).toEqual({
      formData: { first_name: 'Ada' },
      resumePath: 'abc/resume.pdf',
      resumeName: 'ada-lovelace-cv.pdf',
    });
  });

  // The stored path is a server-chosen UUID, so the filename is the only thing
  // that tells an applicant which document they actually attached. Losing it on
  // reload would leave them staring at "Resume attached." with no way to check.
  it('keeps the resume filename across a reload', () => {
    saveDraft({ first_name: 'Ada' }, 'abc/resume.pdf', 'final-FINAL-v3.pdf');
    expect(loadDraft().resumeName).toBe('final-FINAL-v3.pdf');
  });

  // Drafts written before the filename was tracked still load; they just fall
  // back to the generic wording rather than rendering "undefined".
  it('defaults the filename to empty for a draft saved without one', () => {
    saveDraft({ first_name: 'Ada' }, 'abc/resume.pdf');
    expect(loadDraft().resumeName).toBe('');
  });

  it('reports no draft when nothing has been stored', () => {
    expect(loadDraft()).toBeNull();
  });

  it('clears', () => {
    saveDraft({ first_name: 'Ada' });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('defaults a missing resume path to an empty string', () => {
    saveDraft({ first_name: 'Ada' });
    expect(loadDraft().resumePath).toBe('');
  });
});

/**
 * The draft is the only copy of an application in progress -- there is no
 * server-side draft row behind it any more. Every one of these is a real
 * browser state, and in each of them the form has to keep working: a storage
 * failure must cost the applicant their autosave, never their ability to
 * apply.
 */
describe('hostile storage', () => {
  it('survives localStorage holding something that is not JSON', () => {
    window.localStorage.setItem('bots2026.application.draft.v1', 'not json{');
    expect(loadDraft()).toBeNull();
  });

  it('survives a stored value of the wrong shape', () => {
    for (const value of ['null', '[]', '"a string"', '42', '{"formData":"nope"}']) {
      window.localStorage.setItem('bots2026.application.draft.v1', value);
      expect(loadDraft()).toBeNull();
    }
  });

  // Safari's private mode and "block site data" both make this throw outright
  // rather than no-op, which would take the whole page down on mount.
  it('does not throw when reading is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    expect(() => loadDraft()).not.toThrow();
    expect(loadDraft()).toBeNull();
  });

  it('does not throw when writing is blocked, and says it failed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota');
    });
    expect(() => saveDraft({ first_name: 'Ada' })).not.toThrow();
    expect(saveDraft({ first_name: 'Ada' })).toBe(false);
  });

  it('does not throw when removing is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    expect(() => clearDraft()).not.toThrow();
    expect(() => clearSubmission()).not.toThrow();
  });
});

/**
 * The submission receipt is what stops a returning applicant from being shown
 * an empty form that invites a second attempt the unique index would reject.
 * It also carries the status token, which is the only route back to the
 * application -- so a malformed one must read as "no submission" rather than
 * as a submission with no way to look it up.
 */
describe('submission receipt', () => {
  it('round-trips', () => {
    const receipt = { id: 'x', statusToken: 'tok', submittedAt: '2026-09-01' };
    saveSubmission(receipt);
    expect(loadSubmission()).toEqual(receipt);
  });

  it('is null when there is no receipt', () => {
    expect(loadSubmission()).toBeNull();
  });

  it('rejects a receipt with no usable status token', () => {
    for (const value of ['{}', '{"statusToken":""}', '{"statusToken":42}', '[]']) {
      window.localStorage.setItem('bots2026.application.submitted.v1', value);
      expect(loadSubmission()).toBeNull();
    }
  });

  // Clearing the draft on submit must not clear the receipt: the receipt is
  // the only thing holding the status token at that point.
  it('survives the draft being cleared', () => {
    saveDraft({ first_name: 'Ada' });
    saveSubmission({ id: 'x', statusToken: 'tok' });
    clearDraft();
    expect(loadSubmission()).toEqual({ id: 'x', statusToken: 'tok' });
  });
});
