import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResultList } from '../ResultList';

describe('ResultList', () => {
  it('renders empty state when no results are provided', () => {
    render(<ResultList results={[]} query="physics" />);
    expect(screen.getByText('No results found. Try another query.')).toBeInTheDocument();
  });

  it('highlights matched query terms in snippets', () => {
    render(
      <ResultList
        query="moon tides"
        results={[
          {
            id: '1',
            title: 'Moon overview',
            url: 'https://example.com/moon',
            description: 'The Moon influences Earth tides and climate systems.',
            displayUrl: 'example.com',
          },
        ]}
      />,
    );

    const marks = screen.getAllByText(/moon|tides/i, { selector: 'mark' });
    expect(marks.length).toBeGreaterThanOrEqual(2);
  });
});
