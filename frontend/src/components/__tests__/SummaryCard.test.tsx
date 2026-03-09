import React from 'react';
import { render, screen } from '@testing-library/react';
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

    expect(screen.getByText('AI Summary')).toBeInTheDocument();
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
});
