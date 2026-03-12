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
        trace={{
          query: 'moon',
          intent: 'definition',
          expandedQueries: ['moon explained'],
          retrievedCount: 10,
          selectedCount: 3,
          selectedSources: [{ title: 'NASA Moon Overview', url: 'https://www.nasa.gov/moon', domain: 'www.nasa.gov' }],
          latencyMs: 1140,
          claimCount: 0,
          capabilities: {
            plan: 'free',
            deepSearchRequested: false,
            deepSearchAllowed: false,
            deepSearchApplied: false,
          },
          rankingAudit: {
            safeSearchLevel: 'strict',
            reranked: true,
            lowTrustDemotions: 1,
            spammyDemotions: 0,
            sensitiveDemotions: 0,
            contextualSensitiveDemotions: 0,
            topDemotionReasons: ['low-trust domains'],
          },
        }}
      />,
    );

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Top sources')).toBeInTheDocument();
    expect(screen.getByText('The Moon influences tides and planetary stability.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'www.nasa.gov' })).toHaveAttribute('href', 'https://www.nasa.gov/moon');
    expect(screen.getByRole('link', { name: 'www.britannica.com' })).toHaveAttribute(
      'href',
      'https://www.britannica.com/science/Moon',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show system trace' }));
    expect(screen.getByText('System trace')).toBeInTheDocument();
    expect(screen.getByText('moon')).toBeInTheDocument();
    expect(screen.getByText('definition')).toBeInTheDocument();
    expect(screen.getByText(/Deep search unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Quality reranking applied/)).toBeInTheDocument();
  });

  it('shows fallback copy when there are no sources', () => {
    render(<SummaryCard summary="Short summary." sources={[]} />);
    expect(screen.getByText('No citations yet.')).toBeInTheDocument();
  });

  it('renders evidence toggle when structured claims are available', () => {
    const { container } = render(
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

    const summaryCard = container.querySelector('section');
    expect(summaryCard).not.toBeNull();
    const scoped = within(summaryCard as HTMLElement);

    expect(scoped.getByRole('button', { name: 'Show evidence' })).toBeInTheDocument();
  });

  it('renders evidence toggle when sources exist without structured claims', () => {
    const { container } = render(
      <SummaryCard
        summary="Physics is the science that deals with matter and energy. Reference sources generally describe this concept in similar terms."
        sources={[
          {
            title: 'Physics | Britannica',
            url: 'https://www.britannica.com/science/physics-science',
            domain: 'www.britannica.com',
            snippet: 'Physics is the science that deals with the structure of matter.',
          },
        ]}
      />,
    );

    const summaryCard = container.querySelector('section');
    expect(summaryCard).not.toBeNull();
    const scoped = within(summaryCard as HTMLElement);

    fireEvent.click(scoped.getByRole('button', { name: 'Show sources' }));
    expect(scoped.getByText('Key sources behind this summary')).toBeInTheDocument();
    expect(scoped.getByRole('link', { name: 'Physics | Britannica' })).toHaveAttribute(
      'href',
      'https://www.britannica.com/science/physics-science',
    );
    expect(scoped.queryByText('Sources')).not.toBeInTheDocument();
    expect(scoped.getByRole('button', { name: 'Hide sources' })).toBeInTheDocument();
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
    expect(scoped.getByText('Fact 1')).toBeInTheDocument();
    expect(scoped.getByRole('button', { name: 'Hide evidence' })).toBeInTheDocument();
  });
});
