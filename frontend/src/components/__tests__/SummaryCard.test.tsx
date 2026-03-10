import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SummaryCard } from '../SummaryCard';

describe('SummaryCard', () => {
  it('renders summary text and source links', () => {
    render(
      <SummaryCard
        summary="The Moon influences tides and planetary stability."
        sources={[
          { title: 'NASA Moon Overview', url: 'https://www.nasa.gov/moon' },
          { title: 'Britannica Moon', url: 'https://www.britannica.com/science/Moon' },
        ]}
      />,
    );

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('The Moon influences tides and planetary stability.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NASA Moon Overview' })).toHaveAttribute('href', 'https://www.nasa.gov/moon');
    expect(screen.getByRole('link', { name: 'Britannica Moon' })).toHaveAttribute(
      'href',
      'https://www.britannica.com/science/Moon',
    );
  });

  it('shows fallback copy when there are no sources', () => {
    render(<SummaryCard summary="Short summary." sources={[]} />);
    expect(screen.getByText('No citations yet.')).toBeInTheDocument();
  });

  it('renders evidence toggle when structured claims are available', () => {
    render(
      <SummaryCard
        summary="Cookies reduce token exposure in scripts."
        sources={[]}
        claims={[
          {
            id: 'claim-1',
            text: 'HTTP-only cookies reduce token exposure to JavaScript.',
            evidence: [
              {
                id: 'src-1',
                title: 'MDN Cookies',
                url: 'https://developer.mozilla.org',
                domain: 'developer.mozilla.org',
                snippet: 'HTTP-only cookies are not available to JavaScript APIs.',
                sourceType: 'web',
                sourceIndex: 0,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show evidence' })).toBeInTheDocument();
  });

  it('hides bottom sources while evidence is expanded', () => {
    const { container } = render(
      <SummaryCard
        summary="Physics summary text."
        sources={[
          { title: 'Britannica Physics', url: 'https://www.britannica.com/science/physics-science' },
          { title: 'Wikipedia Physics', url: 'https://en.wikipedia.org/wiki/Physics' },
        ]}
        claims={[
          {
            id: 'claim-1',
            text: 'Physics studies matter and energy.',
            evidence: [
              {
                id: 'src-1',
                title: 'Britannica Physics',
                url: 'https://www.britannica.com/science/physics-science',
                domain: 'britannica.com',
                snippet: 'Physics is the science that deals with the structure of matter.',
                sourceType: 'web',
                sourceIndex: 0,
              },
            ],
          },
        ]}
      />,
    );

    const summaryCard = container.querySelector('section');
    expect(summaryCard).not.toBeNull();
    const scoped = within(summaryCard as HTMLElement);

    expect(scoped.getByText('Sources')).toBeInTheDocument();
    fireEvent.click(scoped.getByRole('button', { name: 'Show evidence' }));
    expect(scoped.queryByText('Sources')).not.toBeInTheDocument();
    expect(scoped.getByText('Claim')).toBeInTheDocument();
    expect(scoped.getByRole('button', { name: 'Hide evidence' })).toBeInTheDocument();
  });
});
