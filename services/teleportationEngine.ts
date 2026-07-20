import { Character } from '../types';

/** Result of a teleportation attempt, including success status and a descriptive message. */
export interface TeleportResult {
  success: boolean;
  message: string;
  occupiedSpace?: boolean;
  outOfRange?: boolean;
}

/** Teleports a character to a named destination within the given range, returning a success result. */
export function teleportCharacter(
  character: Character,
  range: number,
  destinationDescription: string
): TeleportResult {
  return {
    success: true,
    message: `${character.name} teleports to ${destinationDescription}.`
  };
}

/** Teleports a character up to 500 feet via the Dimension Door spell. */
export function dimensionDoor(
  character: Character,
  range: number = 500
): TeleportResult {
  return {
    success: true,
    message: `${character.name} teleports up to ${range} feet to a destination of their choice.`
  };
}

/** Teleports a character up to 30 feet via Misty Step. */
export function mistyStep(
  character: Character,
  range: number = 30
): TeleportResult {
  return {
    success: true,
    message: `${character.name} shrouds themselves in mist and teleports up to ${range} feet to a visible spot.`
  };
}

/** Teleports a character with the Teleport spell, applying mishap chance based on destination familiarity. */
export function teleport(
  character: Character,
  _range: number = 10,
  familiarity: 'clear' | 'moderate' | 'poor' | 'none' = 'clear'
): TeleportResult {
  const mishapChance = familiarity === 'none' ? 33 : familiarity === 'poor' ? 13 : 0;
  
  if (Math.random() * 100 < mishapChance) {
    return {
      success: true,
      message: `${character.name} arrives at their destination but approximately ${Math.floor(Math.random() * 100) + 1}% off course due to a teleportation mishap.`
    };
  }
  
  return {
    success: true,
    message: `${character.name} teleports successfully to their destination.`
  };
}
