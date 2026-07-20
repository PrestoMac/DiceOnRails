import { Character, StartingLocation, InventoryItem, FeatSelection } from '../../types';
import { FeatDefinition, FeatCategory } from '../../utils/feats';
import { ClassDefinition } from '../../utils/classes';
import { RaceDefinition } from '../../utils/races';
import { SpellDefinition } from '../../types';

/** Complete state of the character creation wizard, tracking all selections across every step. */
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

/** Base props shared by all wizard step components. */
export interface StepProps {
  wizardState: WizardState;
  updateWizard: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  goToStep: (step: number) => void;
}

/** An item available for purchase in the gear shop. */
export interface ShopItem {
  name: string;
  category: 'Weapon' | 'Armor' | 'Gear' | 'Consumable';
  price: number;
  description: string;
}

/** Props for the SubclassList component. */
export interface SubclassListProps {
  subclasses: ClassDefinition['subclasses'];
  selectedSubclassId: string | null;
  onSelect: (id: string) => void;
  level: number;
}

/** Props for the SpellCard component. */
export interface SpellCardProps {
  spell: SpellDefinition;
  isSelected: boolean;
  onToggle: () => void;
  onView: () => void;
  showLevel?: boolean;
}
