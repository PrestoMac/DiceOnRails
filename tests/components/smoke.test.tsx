import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    })),
  },
}));

vi.mock('../../services/audioService', () => ({
  speakText: vi.fn(() => Promise.resolve(true)),
  stopSpeaking: vi.fn(),
  getVoices: vi.fn(() => Promise.resolve([
    { name: 'Default', lang: 'en-US' },
  ])),
}));

vi.mock('../../services/authService', () => ({
  authService: {
    signUp: vi.fn(() => Promise.resolve({ error: null })),
    signIn: vi.fn(() => Promise.resolve({ session: null, error: new Error('Mocked') })),
    signOut: vi.fn(),
    getSession: vi.fn(() => Promise.resolve(null)),
    updatePassword: vi.fn(() => Promise.resolve({ error: null })),
    resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })),
  },
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
  setDebugMode: vi.fn(),
}));

import SplashScreen from '../../components/SplashScreen';
import AuthScreen from '../../components/AuthScreen';
import CampaignDashboard from '../../components/CampaignDashboard';
import CampaignModal from '../../components/CampaignModal';
import InputArea from '../../components/InputArea';
import ChatLog from '../../components/ChatLog';
import DiceRollModal from '../../components/DiceRollModal';
import Journal from '../../components/Journal';
import TypingIndicator from '../../components/shared/TypingIndicator';
import SettingsModal from '../../components/SettingsModal';
import LevelUpModal from '../../components/LevelUpModal';
import CharacterSheet from '../../components/CharacterSheet';
import { AppSettings, Character, MessageRole, AppStage } from '../../types';

const defaultSettings: AppSettings = {
  voiceName: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  autoSpeak: false,
  enableAtmosphere: false,
  debugMode: false,
};

const mockCharacter: Character = {
  id: 'player-1',
  name: 'Valerius',
  class: 'Paladin',
  race: 'Human',
  level: 1,
  hp: { current: 12, max: 12 },
  stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
  inventory: [{ name: 'Longsword', quantity: 1 }],
  currency: { gp: 15, sp: 5, cp: 0 },
  location: 'Tavern',
  experience: 0,
  experienceToNextLevel: 300,
  unusedStatPoints: 0,
  maxHpBonus: 0,
  hitDice: { current: 1, max: 1 },
  skills: { athletics: 1 },
  unusedSkillPoints: 2,
  resources: [], knownSpells: [], preparedSpells: [], racialTraits: [], unlockedSubclassFeatures: [],
};

describe('Component Smoke Tests', () => {
  describe('SplashScreen', () => {
    it('renders title and enter button', () => {
      render(<SplashScreen onComplete={() => {}} />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/DiceOnRails/i);
      expect(screen.getByText(/Enter the Realm/i)).toBeInTheDocument();
    });

    it('calls onComplete when enter button clicked', () => {
      vi.useFakeTimers();
      const onComplete = vi.fn();
      render(<SplashScreen onComplete={onComplete} />);
      fireEvent.click(screen.getByText(/Enter the Realm/i));
      vi.advanceTimersByTime(600);
      expect(onComplete).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('AuthScreen', () => {
    it('renders login form by default', () => {
      render(<AuthScreen onComplete={() => {}} />);
      expect(screen.getByText(/Begin your chronicle/i)).toBeInTheDocument();
      expect(screen.getByText(/Continue Anonymously/i)).toBeInTheDocument();
    });

    it('switches to signup form', () => {
      render(<AuthScreen onComplete={() => {}} />);
      fireEvent.click(screen.getByText(/Create Account/i));
      expect(screen.getByText(/Sign Up/i)).toBeInTheDocument();
    });

    it('auto-logs in and calls onComplete with user id on successful signup', async () => {
      const { authService } = await import('../../services/authService');
      const fakeSession = { user: { id: 'new-user-1' } };
      vi.mocked(authService.signUp).mockResolvedValueOnce({ session: fakeSession as unknown as import('@supabase/supabase-js').Session, error: null });
      const onComplete = vi.fn();
      render(<AuthScreen onComplete={onComplete} />);
      fireEvent.click(screen.getByText(/Create Account/i));
      fireEvent.change(screen.getByPlaceholderText(/adventurer@example.com/i), { target: { value: 'new@test.com' } });
      fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: 'password123' } });
      fireEvent.click(screen.getByText(/Sign Up/i));
      await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith('new-user-1'));
    });
  });

  describe('CampaignDashboard', () => {
    it('renders empty state', () => {
      render(
        <CampaignDashboard
          campaigns={[]}
          onSelectCampaign={() => {}}
          onCreateNew={() => {}}
          onDeleteCampaign={() => {}}
          onRenameCampaign={() => Promise.resolve()}
        />
      );
      expect(screen.getByText(/Your Chronicles/i)).toBeInTheDocument();
      expect(screen.getByText(/The archives are empty/i)).toBeInTheDocument();
    });

    it('renders loading state', () => {
      render(
        <CampaignDashboard
          campaigns={[]}
          onSelectCampaign={() => {}}
          onCreateNew={() => {}}
          onDeleteCampaign={() => {}}
          onRenameCampaign={() => Promise.resolve()}
          loading={true}
        />
      );
      expect(screen.getByText(/Summoning Archives/i)).toBeInTheDocument();
    });

    it('renders campaign list', () => {
      render(
        <CampaignDashboard
          campaigns={[{
            id: 'camp-1',
            name: 'Test Campaign',
            createdAt: 0,
            lastPlayed: 0,
            characterName: 'Hero',
            stage: AppStage.PLAY,
          }]}
          onSelectCampaign={() => {}}
          onCreateNew={() => {}}
          onDeleteCampaign={() => {}}
          onRenameCampaign={() => Promise.resolve()}
        />
      );
      expect(screen.getByText('Test Campaign')).toBeInTheDocument();
      expect(screen.getByText('Resume')).toBeInTheDocument();
    });
  });

  describe('CampaignModal', () => {
    describe('create mode', () => {
      it('renders when open', () => {
        render(<CampaignModal mode="create" isOpen={true} onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.getByText(/Name Your Chronicle/i)).toBeInTheDocument();
      });
      it('calls onConfirm with name', () => {
        const onConfirm = vi.fn();
        render(<CampaignModal mode="create" isOpen={true} onConfirm={onConfirm} onCancel={() => {}} />);
        const input = screen.getByPlaceholderText(/e\.g\., The Lost Mines/i);
        fireEvent.change(input, { target: { value: 'My Campaign' } });
        fireEvent.click(screen.getByText(/Begin Journey/i));
        expect(onConfirm).toHaveBeenCalledWith('My Campaign');
      });
      it('returns null when not open', () => {
        render(<CampaignModal mode="create" isOpen={false} onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.queryByText(/Name Your Chronicle/i)).not.toBeInTheDocument();
      });
    });
    describe('rename mode', () => {
      it('renders when open', () => {
        render(<CampaignModal mode="rename" isOpen={true} currentName="Old" onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.getByText(/Rename Chronicle/i)).toBeInTheDocument();
      });
      it('returns null when not open', () => {
        render(<CampaignModal mode="rename" isOpen={false} currentName="Old" onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.queryByText(/Rename Chronicle/i)).not.toBeInTheDocument();
      });
    });
    describe('join mode', () => {
      it('renders when open', () => {
        render(<CampaignModal mode="join" isOpen={true} onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.getByText(/Join Existing Chronicle/i)).toBeInTheDocument();
      });
      it('calls onConfirm with campaign ID', () => {
        const onConfirm = vi.fn();
        render(<CampaignModal mode="join" isOpen={true} onConfirm={onConfirm} onCancel={() => {}} />);
        const input = screen.getByPlaceholderText(/550e8400/i);
        fireEvent.change(input, { target: { value: 'camp-abc' } });
        fireEvent.click(screen.getByText(/Join Party/i));
        expect(onConfirm).toHaveBeenCalledWith('camp-abc');
      });
    });
  });

  describe('InputArea', () => {
    it('renders input and submit button', () => {
      render(<InputArea onSendMessage={() => {}} isLoading={false} />);
      expect(screen.getByPlaceholderText(/What do you do/i)).toBeInTheDocument();
      expect(screen.getByText(/Act Now/i)).toBeInTheDocument();
    });

    it('sends message on submit', () => {
      const onSend = vi.fn();
      render(<InputArea onSendMessage={onSend} isLoading={false} />);
      const input = screen.getByPlaceholderText(/What do you do/i);
      fireEvent.change(input, { target: { value: 'Attack the dragon' } });
      fireEvent.click(screen.getByText(/Act Now/i));
      expect(onSend).toHaveBeenCalledWith('Attack the dragon');
    });

    it('disables input when loading', () => {
      render(<InputArea onSendMessage={() => {}} isLoading={true} />);
      expect(screen.getByPlaceholderText(/The GM is narrating/i)).toBeDisabled();
    });
  });

  describe('ChatLog', () => {
    it('renders empty state', () => {
      render(<ChatLog messages={[]} settings={defaultSettings} />);
      expect(screen.getByText(/await your first move/i)).toBeInTheDocument();
    });

    it('renders user messages', () => {
      render(
        <ChatLog
          messages={[{
            id: '1',
            role: MessageRole.USER,
            text: 'Hello GM!',
            timestamp: Date.now(),
          }]}
          settings={defaultSettings}
        />
      );
      expect(screen.getByText('Hello GM!')).toBeInTheDocument();
    });

    it('renders model messages', () => {
      render(
        <ChatLog
          messages={[{
            id: '2',
            role: MessageRole.MODEL,
            text: 'Welcome, adventurer!',
            timestamp: Date.now(),
          }]}
          settings={defaultSettings}
        />
      );
      expect(screen.getByText('Welcome, adventurer!')).toBeInTheDocument();
    });
  });

  describe('DiceRollModal', () => {
    it('renders with rolling state initially', () => {
      render(
        <DiceRollModal
          characterName="Hero"
          rollType="skill"
          label="perception"
          rollResult={15}
          modifier={3}
          difficulty={12}
          success={true}
          onClose={() => {}}
        />
      );
      expect(screen.getByText(/perception Check/i)).toBeInTheDocument();
      expect(screen.getByText(/The dice are tumbling/i)).toBeInTheDocument();
    });

    it('renders attack roll type', () => {
      render(
        <DiceRollModal
          characterName="Hero"
          rollType="attack"
          label="Longsword Attack"
          rollResult={10}
          modifier={5}
          onClose={() => {}}
        />
      );
      expect(screen.getByText(/Longsword Attack/i)).toBeInTheDocument();
    });
  });

  describe('Journal', () => {
    it('renders empty state', () => {
      render(<Journal quests={[]} lore={[]} />);
      expect(screen.getByText(/Active Deeds/i)).toBeInTheDocument();
      expect(screen.getByText(/No destiny has been carved yet/i)).toBeInTheDocument();
    });

    it('renders quests and lore', () => {
      render(
        <Journal
          quests={[{ id: 'q1', title: 'Save the Town', description: 'Defeat the goblins', status: 'active' }]}
          lore={[{ id: 'l1', title: 'Ancient Dragon', content: 'A wyrm of great power', category: 'NPC' }]}
        />
      );
      expect(screen.getByText('Save the Town')).toBeInTheDocument();
    });
  });

  describe('TypingIndicator', () => {
    it('renders nothing when no users are typing', () => {
      const { queryByText } = render(<TypingIndicator users={[]} />);
      expect(queryByText(/writing/i)).toBeNull();
    });

    it('renders a typing chip with the user name', () => {
      render(<TypingIndicator users={[{ userId: 'u1', characterId: 'c1', name: 'Hero' }]} />);
      expect(screen.getByText(/Hero is writing/i)).toBeInTheDocument();
    });
  });

  describe('SettingsModal', () => {
    it('renders settings form', () => {
      render(
        <SettingsModal
          settings={defaultSettings}
          onSave={() => {}}
          onClose={() => {}}
        />
      );
      expect(screen.getByText(/Chronicle Settings/i)).toBeInTheDocument();
      expect(screen.getByText(/Save Changes/i)).toBeInTheDocument();
    });

    it('renders account section when userId provided', () => {
      render(
        <SettingsModal
          settings={defaultSettings}
          userId="user-1"
          onSave={() => {}}
          onClose={() => {}}
        />
      );
      expect(screen.getByText(/Account Security/i)).toBeInTheDocument();
    });
  });

  describe('LevelUpModal', () => {
    it('renders level up interface', () => {
      render(
        <LevelUpModal
          character={mockCharacter}
          selectedAllocations={{}}
          remainingPoints={2}
          previewHp={14}
          error={null}
          onAllocate={() => {}}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
      expect(screen.getByText(/Level Up Progression/i)).toBeInTheDocument();
      expect(screen.getByText(/HP Roll/i)).toBeInTheDocument();
      expect(screen.getByText(/Attributes/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Skills/i).length).toBeGreaterThanOrEqual(1);
    });

    it('shows error message when provided', () => {
      render(
        <LevelUpModal
          character={mockCharacter}
          selectedAllocations={{}}
          remainingPoints={2}
          previewHp={14}
          error="Something went wrong"
          onAllocate={() => {}}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('CharacterSheet', () => {
    it('renders character info', () => {
      render(
        <CharacterSheet
          character={mockCharacter}
          onUpdateInventory={() => {}}
          onUpdateCurrency={() => {}}
        />
      );
      expect(screen.getByText('Valerius')).toBeInTheDocument();
      expect(screen.getByText(/Level 1 Human Paladin/i)).toBeInTheDocument();
    });
  });

  describe('CharacterCreation - SetupWizard', () => {
    it('SetupWizard renders step 1', async () => {
      const { default: SetupWizard } = await import('../../components/SetupWizard');
      render(<SetupWizard />);
      expect(screen.getByText(/DiceOnRails Setup/i)).toBeInTheDocument();
      expect(screen.getByText(/Next/i)).toBeInTheDocument();
    });

    it('SetupWizard advances to step 2', async () => {
      const { default: SetupWizard } = await import('../../components/SetupWizard');
      render(<SetupWizard />);
      fireEvent.click(screen.getByText('Next'));
      expect(screen.getByText(/Database Connection/i)).toBeInTheDocument();
    });
  });
});
