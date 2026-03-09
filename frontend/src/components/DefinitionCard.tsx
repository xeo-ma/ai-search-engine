import { useEffect, useRef, useState } from 'react';

import type { DefinitionResponse } from '../lib/api-client';

interface DefinitionCardProps {
  definition: DefinitionResponse;
}

export function DefinitionCard({ definition }: DefinitionCardProps) {
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    audioElementRef.current = new Audio();
    audioElementRef.current.preload = 'auto';
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  async function playWithAudioElement(url: string): Promise<void> {
    const audio = audioElementRef.current;
    if (!audio) {
      throw new Error('Audio element unavailable');
    }

    audio.pause();
    audio.currentTime = 0;
    audio.src = url;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error('Audio playback timed out'));
      }, 8000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        audio.onended = null;
        audio.onerror = null;
      };

      audio.onended = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      audio.onerror = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error('Audio playback failed'));
      };

      void audio.play().catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      });
    });
  }

  async function playFromApiTts(text: string): Promise<void> {
    const response = await fetch(`/api/tts?text=${encodeURIComponent(text)}`, { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Audio fetch failed');
    }

    const audioBlob = await response.blob();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(audioBlob);
    objectUrlRef.current = objectUrl;
    await playWithAudioElement(objectUrl);
  }

  async function playWithSpeechSynthesis(text: string): Promise<void> {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('Speech synthesis unavailable');
    }

    window.speechSynthesis.cancel();
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error('Speech synthesis failed'));
      window.speechSynthesis.speak(utterance);
    });
  }

  async function playText(text: string): Promise<void> {
    setPlaybackError(null);
    setIsPlaying(true);
    try {
      if (definition.audioUrl) {
        try {
          await playWithAudioElement(definition.audioUrl);
          return;
        } catch {
          // Fall through to hosted TTS.
        }
      }

      try {
        await playFromApiTts(text);
        return;
      } catch {
        // Fall through to browser speech synthesis.
      }

      await playWithSpeechSynthesis(text);
    } catch {
      setPlaybackError('Pronunciation unavailable right now.');
    } finally {
      setIsPlaying(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Definition</h2>
      <div className="definition-header">
        <div className="definition-term-group">
          <strong className="definition-term">{definition.word}</strong>
          <button
            type="button"
            className={`pronunciation-icon-button${isPlaying ? ' is-playing' : ''}`}
            disabled={isPlaying}
            aria-label={isPlaying ? 'Playing pronunciation' : 'Play pronunciation'}
            title={isPlaying ? 'Playing pronunciation' : 'Play pronunciation'}
            aria-busy={isPlaying}
            onClick={() => {
              void playText(definition.word);
            }}
          >
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
                <path
                  d="M3 10v4h4l5 4V6L7 10H3zm12.5 2a3.5 3.5 0 0 0-2-3.15v6.3a3.5 3.5 0 0 0 2-3.15zm0-7a1 1 0 1 1 1.41-1.41A11 11 0 0 1 20 12a11 11 0 0 1-3.09 8.41 1 1 0 1 1-1.41-1.41A9 9 0 0 0 18 12a9 9 0 0 0-2.5-6z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </button>
        </div>
        {definition.phonetic || definition.partOfSpeech ? (
          <div className="definition-subline">
            {definition.phonetic ? <span>{definition.phonetic}</span> : null}
            {definition.phonetic && definition.partOfSpeech ? <span aria-hidden="true">·</span> : null}
            {definition.partOfSpeech ? <span>{definition.partOfSpeech}</span> : null}
          </div>
        ) : null}
      </div>

      <p>{definition.definition}</p>

      {definition.example ? <p className="muted">Example: {definition.example}</p> : null}
      {playbackError ? <p className="muted">{playbackError}</p> : null}
    </section>
  );
}
