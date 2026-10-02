// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Input } from './Input';
import { Pill, PillGroup } from './Pill';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Share link</Button>);
    expect(screen.getByRole('button', { name: 'Share link' })).toHaveAttribute('type', 'button');
  });
});

describe('Input', () => {
  it('is labeled and describes its hint and error', () => {
    render(<Input label="Mobile number" hint="We'll text you a code." error="Check the number." />);
    const input = screen.getByLabelText('Mobile number');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription("We'll text you a code. Check the number.");
    expect(screen.getByRole('alert')).toHaveTextContent('Check the number.');
  });
});

describe('Pill', () => {
  it('toggles and exposes aria-pressed', async () => {
    const onChange = vi.fn();
    render(
      <Pill selected={false} onSelectedChange={onChange}>
        Text
      </Pill>,
    );
    const pill = screen.getByRole('button', { name: 'Text' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pill);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('PillGroup', () => {
  function Minutes() {
    const [value, setValue] = useState(10);
    return (
      <PillGroup
        label="Minutes apart"
        value={value}
        onChange={setValue}
        options={[8, 9, 10, 12].map((v) => ({ value: v, label: String(v) }))}
      />
    );
  }

  it('is a radio group with one tab stop and arrow-key selection', async () => {
    render(<Minutes />);
    expect(screen.getByRole('radiogroup', { name: 'Minutes apart' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1);

    await userEvent.click(screen.getByRole('radio', { name: '8' }));
    expect(screen.getByRole('radio', { name: '8' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '12' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '12' })).toHaveFocus();
  });
});

describe('Stepper', () => {
  function Guests({ max }: { max: number }) {
    const [value, setValue] = useState(0);
    return (
      <Stepper
        label="Bringing a buddy?"
        value={value}
        min={0}
        max={max}
        onChange={setValue}
        decrementLabel="One fewer guest"
        incrementLabel="One more guest"
      />
    );
  }

  it('steps within bounds and disables the buttons at the ends', async () => {
    render(<Guests max={2} />);
    const minus = screen.getByRole('button', { name: 'One fewer guest' });
    const plus = screen.getByRole('button', { name: 'One more guest' });
    expect(minus).toBeDisabled();

    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(plus).toBeDisabled();
    expect(minus).toBeEnabled();
  });
});

describe('Sheet', () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Grab it</Button>
        <Sheet
          open={open}
          title="Grab 7:50 AM"
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        >
          <p>No account needed.</p>
        </Sheet>
      </>
    );
  }

  it('opens as a labeled modal dialog and closes from the close button', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Grab it' }));
    const dialog = screen.getByRole('dialog', { name: 'Grab 7:50 AM' });
    expect(dialog).toHaveAttribute('open');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Grab it' }));
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
