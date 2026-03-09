import { NextResponse } from 'next/server';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const text = (url.searchParams.get('text') ?? '').trim();
  if (!text) {
    return NextResponse.json({ message: 'Missing text query parameter' }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(`${BACKEND_BASE_URL}/tts?text=${encodeURIComponent(text)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      const contentType = backendResponse.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const data = (await backendResponse.json()) as { message?: string };
        return NextResponse.json(
          { message: data.message ?? `Backend request failed with status ${backendResponse.status}` },
          { status: backendResponse.status },
        );
      }

      const textBody = await backendResponse.text();
      return NextResponse.json(
        { message: textBody || `Backend request failed with status ${backendResponse.status}` },
        { status: backendResponse.status },
      );
    }

    const audioBuffer = await backendResponse.arrayBuffer();
    const headers = new Headers();
    headers.set('content-type', backendResponse.headers.get('content-type') ?? 'audio/wav');
    headers.set('cache-control', 'no-store');
    return new NextResponse(audioBuffer, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { message: 'TTS backend is unavailable. Make sure it is running on port 3001.' },
      { status: 503 },
    );
  }
}
