import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import Tooltip from '../../components/ui/Tooltip';

// Tooltip portals its card to document.body, so we read body.textContent after events.
const bodyText = () => document.body.textContent || '';

describe('<Tooltip>', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders its trigger children', () => {
    const { getByText } = render(
      <Tooltip content="hello world">
        <span>hover me</span>
      </Tooltip>
    );
    expect(getByText('hover me')).toBeTruthy();
  });

  it('does not show the tooltip card before hover', () => {
    const { container } = render(
      <Tooltip content="secret text">
        <span>trigger</span>
      </Tooltip>
    );
    expect(container.textContent).not.toContain('secret text');
    expect(bodyText()).not.toContain('secret text');
  });

  it('shows the tooltip card on mouse enter', () => {
    const { getByText } = render(
      <Tooltip content="shown on hover">
        <span>trigger</span>
      </Tooltip>
    );
    fireEvent.mouseEnter(getByText('trigger'));
    expect(bodyText()).toContain('shown on hover');
  });

  it('hides on mouse leave', () => {
    const { getByText } = render(
      <Tooltip content="peekaboo">
        <span>trigger</span>
      </Tooltip>
    );
    fireEvent.mouseEnter(getByText('trigger'));
    expect(bodyText()).toContain('peekaboo');
    fireEvent.mouseLeave(getByText('trigger'));
    expect(bodyText()).not.toContain('peekaboo');
  });

  it('renders ReactNode content, not just strings', () => {
    const { getByText } = render(
      <Tooltip content={<div>node content</div>}>
        <span>trigger</span>
      </Tooltip>
    );
    fireEvent.mouseEnter(getByText('trigger'));
    expect(bodyText()).toContain('node content');
  });

  it('is disabled when content is empty', () => {
    const { getByText } = render(
      <Tooltip content="">
        <span>trigger</span>
      </Tooltip>
    );
    fireEvent.mouseEnter(getByText('trigger'));
    expect(bodyText()).not.toContain('role="tooltip"');
  });

  it('supports a long-press via touchstart', async () => {
    vi.useFakeTimers();
    try {
      const { getByText } = render(
        <Tooltip content="touch shown">
          <span>trigger</span>
        </Tooltip>
      );
      await act(async () => {
        fireEvent.touchStart(getByText('trigger'));
        vi.advanceTimersByTime(400);
      });
      expect(bodyText()).toContain('touch shown');
    } finally {
      vi.useRealTimers();
    }
  });
});
