import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePortrait, buildPortraitPrompt } from '../../../services/llm/portrait';
import { getEnv } from '../../../utils/envHelper';

vi.mock('../../../utils/envHelper', () => ({
  getEnv: vi.fn(() => undefined),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../../services/llm/llmApiClient', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from '../../../services/llm/llmApiClient';

function makeImageResponse(url: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({ data: [{ url }] }),
  } as unknown as Response;
}

describe('buildPortraitPrompt', () => {
  it('uses the appearance description when present', () => {
    const prompt = buildPortraitPrompt({ name: 'Thalia', race: 'human', class: 'fighter', appearance: 'tall with a scar over her left eye' });
    expect(prompt).toContain('tall with a scar over her left eye');
    expect(prompt).toContain('character portrait');
  });

  it('falls back to name + race + class when no appearance', () => {
    const prompt = buildPortraitPrompt({ name: 'Gor', race: 'orc', class: 'barbarian' });
    expect(prompt).toContain('"Gor"');
    expect(prompt).toContain('a Orc Barbarian');
  });

  it('title-cases the lowercased race/class for prompt readability', () => {
    const prompt = buildPortraitPrompt({ name: 'X', race: 'half-elf', class: 'rogue' });
    expect(prompt).toContain('Half-elf Rogue');
  });

  it('omits the race/class clause when neither is provided', () => {
    const prompt = buildPortraitPrompt({ name: 'Nemo' });
    expect(prompt).toContain('"Nemo"');
    expect(prompt).not.toContain('adventurer');
  });

  it('treats whitespace-only appearance as absent', () => {
    const prompt = buildPortraitPrompt({ name: 'Ada', race: 'human', class: 'wizard', appearance: '   ' });
    expect(prompt).toContain('a Human Wizard');
  });
});

describe('generatePortrait', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('fails open (returns undefined) when no ImageRouter API key is configured', async () => {
    vi.mocked(getEnv).mockReturnValue(undefined);
    const result = await generatePortrait({ name: 'Thalia' });
    expect(result).toBeUndefined();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('extracts and returns the image URL from a successful response', async () => {
    vi.mocked(getEnv).mockImplementation((key: string) =>
      key === 'VITE_IMAGE_ROUTER_API_KEY' ? 'test-key' : undefined
    );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(makeImageResponse('https://cdn.example.com/p.png'));
    const result = await generatePortrait({ name: 'Thalia', appearance: 'red hair' });
    expect(result).toBe('https://cdn.example.com/p.png');
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('sends the portrait style prefix and seed in the request body', async () => {
    vi.mocked(getEnv).mockImplementation((key: string) =>
      key === 'VITE_IMAGE_ROUTER_API_KEY' ? 'test-key' : undefined
    );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(makeImageResponse('https://cdn.example.com/p2.png'));
    await generatePortrait({ name: 'Thalia', race: 'human', class: 'fighter' });
    const callArgs = vi.mocked(fetchWithTimeout).mock.calls[0];
    const body = JSON.parse((callArgs[1]?.body as string) ?? '{}');
    expect(body.prompt).toContain('character portrait');
    expect(body.prompt).toContain('"Thalia"');
    expect(body.size).toBe('1024x1024');
    expect(body.n).toBe(1);
  });

  it('fails open (returns undefined) when fetch rejects', async () => {
    vi.mocked(getEnv).mockImplementation((key: string) =>
      key === 'VITE_IMAGE_ROUTER_API_KEY' ? 'test-key' : undefined
    );
    vi.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('network down'));
    const result = await generatePortrait({ name: 'Thalia' });
    expect(result).toBeUndefined();
  });

  it('fails open when the response has no URL field', async () => {
    vi.mocked(getEnv).mockImplementation((key: string) =>
      key === 'VITE_IMAGE_ROUTER_API_KEY' ? 'test-key' : undefined
    );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ data: [] }),
    } as unknown as Response);
    const result = await generatePortrait({ name: 'Thalia' });
    expect(result).toBeUndefined();
  });
});
