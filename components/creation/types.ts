import { Character, StartingLocation, InventoryItem, FeatSelection } from '../../types';
import { FeatDefinition, FeatCategory } from '../../utils/feats';
import { ClassDefinition } from '../../utils/classes';
import { RaceDefinition } from '../../utils/races';
import { SpellDefinition } from '../../types';

export interface WizardState {
  name: string;
  level: number;
  backstory: string;
  selectedRace: RaceDefinition;
  selectedClass: ClassDefinition;
  stats: Character['stats'];
  inventory: InventoryItem[];
  allocatedSkills: Record<string, number>;
  goldPool: number;
  selectedSpells: string[];
  selectedCantrips: string[];
  selectedSubclassId: string | null;
  asiFeatSlots: FeatSelection[];
  draconicAncestry: string | null;
  halfElfChoice1: string | null;
  halfElfChoice2: string | null;
  generatedLocations: StartingLocation[];
  selectedLocation: StartingLocation | null;
  isGeneratingLocs: boolean;
  isRerolling: boolean;
}

export interface StepProps {
  wizardState: WizardState;
  updateWizard: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  goToStep: (step: number) => void;
}

export interface ShopItem {
  name: string;
  category: 'Weapon' | 'Armor' | 'Gear' | 'Consumable';
  price: number;
  description: string;
}

export interface SubclassListProps {
  subclasses: ClassDefinition['subclasses'];
  selectedSubclassId: string | null;
  onSelect: (id: string) => void;
  level: number;
}

export interface SpellCardProps {
  spell: SpellDefinition;
  isSelected: boolean;
  onToggle: () => void;
  onView: () => void;
  showLevel?: boolean;
}
