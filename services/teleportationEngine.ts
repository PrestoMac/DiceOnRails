import { Character } from '../types';

export interface TeleportResult {
  success: boolean;
  message: string;
  occupiedSpace?: boolean;
  outOfRange?: boolean;
}

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

export function dimensionDoor(
  character: Character,
  range: number = 500
): TeleportResult {
  return {
    success: true,
    message: `${character.name} teleports up to ${range} feet to a destination of their choice.`
  };
}

export function mistyStep(
  character: Character,
  range: number = 30
): TeleportResult {
  return {
    success: true,
    message: `${character.name} shrouds themselves in mist and teleports up to ${range} feet to a visible spot.`
  };
}

export function teleport(
  character: Character,
  range: number = 10,
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
