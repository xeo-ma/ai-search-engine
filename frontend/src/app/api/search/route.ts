import { NextResponse } from 'next/server';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body' }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(`${BACKEND_BASE_URL}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const contentType = backendResponse.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const data = (await backendResponse.json()) as unknown;
      return NextResponse.json(data, { status: backendResponse.status });
    }

    const text = await backendResponse.text();
    return NextResponse.json(
      { message: text || `Backend request failed with status ${backendResponse.status}` },
      { status: backendResponse.status },
    );
  } catch {
    return NextResponse.json(
      { message: 'Search backend is unavailable. Make sure it is running on port 3001.' },
      { status: 503 },
    );
  }
}
