import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PracticePocScreen } from '../src/components/PracticePocScreen';
import type { DevSimulationProfileControls } from '../src/platform/devSimulationProfile';
import { createTestMobilePlatformCapabilities } from '../src/testing/testMobilePlatformCapabilities';

type SimulationControlSpy = DevSimulationProfileControls & {
  calls: string[];
  pendingSeed: string | undefined;
};

function simulationControls(active: boolean, pendingSeed?: string): SimulationControlSpy {
  const spy: SimulationControlSpy = {
    active,
    calls: [],
    pendingSeed,
    setActive(enabled) {
      spy.calls.push(`setActive:${enabled}`);
    },
    clear() {
      spy.calls.push('clear');
    },
    replaceWithSeed(scenario) {
      spy.calls.push(`replaceWithSeed:${scenario}`);
    },
    takePendingSeed() {
      const seed = spy.pendingSeed;
      spy.pendingSeed = undefined;
      return seed as ReturnType<DevSimulationProfileControls['takePendingSeed']>;
    },
  };
  return spy;
}

function renderPanel(
  simulation: DevSimulationProfileControls | undefined,
  seeded: string[],
): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <PracticePocScreen
        platformCapabilities={createTestMobilePlatformCapabilities({
          testControls: {
            seedTacticalHistory: (scenario) => {
              seeded.push(scenario);
              return Promise.resolve({
                scenario,
                runs: 1,
                attempts: 1,
                phase: 'ready',
                durationMs: 1,
              });
            },
            ...(simulation ? { simulationProfile: simulation } : {}),
          },
        })}
      />,
    );
  });
  return renderer as TestRenderer.ReactTestRenderer;
}

function find(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  return renderer.root.findAllByProps({ testID });
}

async function press(renderer: TestRenderer.ReactTestRenderer, testID: string): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({ testID }).props.onPress();
    await Promise.resolve();
  });
}

describe('Dev simulation data panel', () => {
  it('offers no simulation controls without a device-persistent Dev service', () => {
    const renderer = renderPanel(undefined, []);

    expect(find(renderer, 'test-simulation-profile-toggle')).toEqual([]);
    expect(find(renderer, 'simulation-profile-indicator')).toEqual([]);
  });

  it('shows the switch off by default and turns simulation data on', async () => {
    const simulation = simulationControls(false);
    const seeded: string[] = [];
    const renderer = renderPanel(simulation, seeded);

    expect(find(renderer, 'test-simulation-profile-toggle').length).toBeGreaterThan(0);
    expect(find(renderer, 'test-simulation-profile-clear')).toEqual([]);
    expect(find(renderer, 'simulation-profile-indicator')).toEqual([]);

    await press(renderer, 'test-simulation-profile-toggle');
    expect(simulation.calls).toEqual(['setActive:true']);

    // Without simulation data a scenario seeds the real service directly.
    await press(renderer, 'test-seed-tactical-history-slow-fork-speed');
    expect(seeded).toEqual(['slow-fork-speed']);
    expect(simulation.calls).toEqual(['setActive:true']);
  });

  it('marks active simulation data and turns it off or clears it', async () => {
    const simulation = simulationControls(true);
    const renderer = renderPanel(simulation, []);

    const indicator = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'simulation-profile-indicator',
    );
    expect(indicator).toHaveLength(1);
    expect(indicator[0]?.props.children).toBe('Simulation data');
    expect(find(renderer, 'test-simulation-profile-clear').length).toBeGreaterThan(0);

    await press(renderer, 'test-simulation-profile-clear');
    await press(renderer, 'test-simulation-profile-toggle');
    expect(simulation.calls).toEqual(['clear', 'setActive:false']);
  });

  it('replaces simulation data with a picked scenario without asking', async () => {
    const simulation = simulationControls(true);
    const seeded: string[] = [];
    const renderer = renderPanel(simulation, seeded);

    await press(renderer, 'test-seed-tactical-history-weak-fork-solve');

    expect(simulation.calls).toEqual(['replaceWithSeed:weak-fork-solve']);
    // No dialog; the reopened simulation database is seeded after the reload.
    expect(seeded).toEqual([]);
  });

  it('seeds the fresh simulation database with the scenario picked before the reload', async () => {
    const simulation = simulationControls(true, 'weak-fork-solve');
    const seeded: string[] = [];

    const renderer = renderPanel(simulation, seeded);
    await act(async () => {
      await Promise.resolve();
    });

    expect(seeded).toEqual(['weak-fork-solve']);
    expect(simulation.pendingSeed).toBeUndefined();
    expect(find(renderer, 'test-seed-tactical-history-status').length).toBeGreaterThan(0);
  });
});
