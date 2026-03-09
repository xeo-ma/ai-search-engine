import { NextResponse } from 'next/server';

import {
  CompositeDefinitionProvider,
  DatamuseDefinitionProvider,
  DictionaryApiProvider,
} from '../../../lib/definition-provider';

const LETTERS_ONLY_PATTERN = /^[a-zA-Z]+$/;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const wordParam = (url.searchParams.get('word') ?? '').trim();
  const word = wordParam.toLowerCase();

  if (!word || !LETTERS_ONLY_PATTERN.test(word)) {
    return NextResponse.json({ message: 'Invalid word query parameter' }, { status: 400 });
  }

  try {
    const provider = new CompositeDefinitionProvider([
      new DictionaryApiProvider(),
      new DatamuseDefinitionProvider(),
    ]);
    const definition = await provider.define(word);
    if (!definition) {
      return NextResponse.json({ message: 'Definition not found' }, { status: 404 });
    }

    return NextResponse.json(definition, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Definition service unavailable' }, { status: 503 });
  }
}
