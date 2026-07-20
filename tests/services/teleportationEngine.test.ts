import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  teleportCharacter,
  dimensionDoor,
  mistyStep,
  teleport,
} from '../../services/teleportationEngine';
import { makeCharacter } from '../helpers/characters';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('teleportCharacter', () => {
  it('returns success', () => {
    const character = makeCharacter();
    const result = teleportCharacter(character, 100, 'the castle courtyard');
    expect(result.success).toBe(true);
  });

  it('includes character name in message', () => {
    const character = makeCharacter();
    const result = teleportCharacter(character, 100, 'the castle courtyard');
    expect(result.message).toContain(character.name);
  });

  it('includes destination in message', () => {
    const character = makeCharacter();
    const result = teleportCharacter(character, 100, 'the castle courtyard');
    expect(result.message).toContain('the castle courtyard');
  });
});

describe('dimensionDoor', () => {
  it('default range is 500', () => {
    const character = makeCharacter();
    const result = dimensionDoor(character);
    expect(result.message).toContain('500');
  });

  it('accepts custom range', () => {
    const character = makeCharacter();
    const result = dimensionDoor(character, 300);
    expect(result.message).toContain('300');
  });

  it('always succeeds', () => {
    const character = makeCharacter();
    const result = dimensionDoor(character);
    expect(result.success).toBe(true);
  });
});

describe('mistyStep', () => {
  it('default range is 30', () => {
    const character = makeCharacter();
    const result = mistyStep(character);
    expect(result.message).toContain('30');
  });

  it('accepts custom range', () => {
    const character = makeCharacter();
    const result = mistyStep(character, 60);
    expect(result.message).toContain('60');
  });

  it('message mentions mist', () => {
    const character = makeCharacter();
    const result = mistyStep(character);
    expect(result.message).toContain('mist');
  });
});

describe('teleport', () => {
  it('clear familiarity has no mishap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const character = makeCharacter();
    const result = teleport(character, 10, 'clear');
    expect(result.message).not.toContain('mishap');
  });

  it('none familiarity with low roll triggers mishap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const character = makeCharacter();
    const result = teleport(character, 10, 'none');
    expect(result.message).toContain('mishap');
  });

  it('none familiarity with high roll succeeds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = makeCharacter();
    const result = teleport(character, 10, 'none');
    expect(result.message).not.toContain('mishap');
  });

  it('poor familiarity with low roll triggers mishap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const character = makeCharacter();
    const result = teleport(character, 10, 'poor');
    expect(result.message).toContain('mishap');
  });

  it('poor familiarity with mid roll succeeds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const character = makeCharacter();
    const result = teleport(character, 10, 'poor');
    expect(result.message).not.toContain('mishap');
  });

  it('moderate familiarity has no mishap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const character = makeCharacter();
    const result = teleport(character, 10, 'moderate');
    expect(result.message).not.toContain('mishap');
  });

  it('default range is 10', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = makeCharacter();
    const result = teleport(character);
    expect(result.message).toContain('teleports');
  });

  it('includes character name in message', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = makeCharacter();
    const result = teleport(character);
    expect(result.message).toContain(character.name);
  });
});
