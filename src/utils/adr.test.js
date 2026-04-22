import { describe, it, expect } from 'vitest';
import { generateAdrMarkdown } from './adr.js';
import { DEFAULT_TYPES } from '../hooks/useBuilder.js';

const base = {
  title: 'Test arch',
  baseline: null,
  current: {
    title: 'Test arch',
    components: [
      { id: 'a', type: 'service', name: 'API', notes: '', icon: '', color: '' }
    ],
    connections: []
  },
  diff: null,
  allTypes: DEFAULT_TYPES,
  mermaid: 'flowchart LR\n  a["API"]',
  baselineMermaid: '',
  diffMermaid: ''
};

describe('generateAdrMarkdown', () => {
  it('emits a header with the title and status', () => {
    const md = generateAdrMarkdown({ ...base, status: 'Accepted' });
    expect(md).toMatch(/# .*Test arch/);
    expect(md).toMatch(/Accepted/);
  });

  it('includes the mermaid code block', () => {
    const md = generateAdrMarkdown({ ...base });
    expect(md).toMatch(/```mermaid/);
    expect(md).toMatch(/flowchart LR/);
  });

  it('omits diff section when there is no baseline', () => {
    const md = generateAdrMarkdown({ ...base });
    expect(md).not.toMatch(/Diff overview/);
  });

  it('emits alternatives, related ADRs, and reviewers sections when provided', () => {
    const md = generateAdrMarkdown({
      ...base,
      alternatives: 'We considered B but rejected it.',
      relatedAdrs: 'ADR-0003: Eventing\nADR-0007: Auth',
      reviewers: 'Alice\nBob'
    });
    expect(md).toMatch(/## Alternatives considered/);
    expect(md).toMatch(/We considered B/);
    expect(md).toMatch(/## Related ADRs/);
    expect(md).toMatch(/ADR-0003/);
    expect(md).toMatch(/## Reviewers/);
    expect(md).toMatch(/\[ \] Alice/);
  });

  it('pads ADR number in title', () => {
    const md = generateAdrMarkdown({ ...base, number: 12 });
    expect(md).toMatch(/ADR[- ]0012/);
  });

  it('omits sections when toggled off via `sections`', () => {
    const md = generateAdrMarkdown({
      ...base,
      sections: { context: false, decision: false, consequences: false, diagrams: false }
    });
    expect(md).not.toMatch(/## Context/);
    expect(md).not.toMatch(/## Decision/);
    expect(md).not.toMatch(/## Consequences/);
    expect(md).not.toMatch(/## Diagrams/);
  });

  it('renders an explicit `diagrams` list (sequence diagrams etc.)', () => {
    const md = generateAdrMarkdown({
      ...base,
      diagrams: [
        { id: 'current', label: 'Architecture', code: 'flowchart LR\n  a' },
        { id: 'seq-1',   label: 'Sequence — User', code: 'sequenceDiagram\n  A->>B: hi' }
      ]
    });
    expect(md).toMatch(/### Architecture/);
    expect(md).toMatch(/### Sequence — User/);
    expect(md).toMatch(/sequenceDiagram/);
  });

  it('skips diagrams flagged include:false', () => {
    const md = generateAdrMarkdown({
      ...base,
      diagrams: [
        { id: 'a', label: 'Keep me',  code: 'flowchart LR\n  a', include: true },
        { id: 'b', label: 'Drop me',  code: 'flowchart LR\n  b', include: false }
      ]
    });
    expect(md).toMatch(/### Keep me/);
    expect(md).not.toMatch(/### Drop me/);
  });

  it('emits user-supplied custom sections', () => {
    const md = generateAdrMarkdown({
      ...base,
      customSections: [
        { heading: 'Security review', body: 'Reviewed by AppSec on 2026-04-22.' }
      ]
    });
    expect(md).toMatch(/## Security review/);
    expect(md).toMatch(/Reviewed by AppSec/);
  });

  it('uses fallback icons for generic component types like service', () => {
    const md = generateAdrMarkdown({
      ...base,
      current: {
        ...base.current,
        components: [{ id: 'a', type: 'service', name: 'API', notes: '', icon: '', color: '' }]
      }
    });
    expect(md).toContain('⚙️ API');
  });
});
