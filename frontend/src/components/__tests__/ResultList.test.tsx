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

  it('does not highlight short terms inside larger words', () => {
    render(
      <ResultList
        query="ai"
        results={[
          {
            id: '1',
            title: 'AI overview',
            url: 'https://example.com/ai',
            description: 'AI appears here, but retail should not be highlighted as a match.',
            displayUrl: 'example.com',
          },
        ]}
      />,
    );

    const marks = screen.getAllByText(/ai/i, { selector: 'mark' });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('AI');
    expect(screen.queryByText('ai', { selector: 'mark' })).not.toBeInTheDocument();
  });

  it('shows a clear loading label on the load more button', () => {
    render(<ResultList results={[]} query="physics" canLoadMore onLoadMore={() => undefined} isLoadingMore />);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeInTheDocument();
  });
});
