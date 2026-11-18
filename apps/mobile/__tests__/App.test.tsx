
import React from 'react';
import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import App from '../App';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../src/db', () => ({
  getJobs: jest.fn(),
  putJob: jest.fn(),
  getServerUrl: jest.fn(),
  setServerUrl: jest.fn(),
}));

jest.mock('../src/files', () => ({
  retainPhoto: jest.fn(),
}));

jest.mock('../src/serverStatus', () => ({
  checkServerHealth: jest.fn(),
}));

jest.mock('../src/queue', () => ({
  initQueue: jest.fn(),
  drainQueue: jest.fn(),
  retryJob: jest.fn(),
  subscribeQueue: jest.fn(),
}));

const db = require('../src/db');
const picker = require('expo-image-picker');
const files = require('../src/files');
const server = require('../src/serverStatus');
const queue = require('../src/queue');

describe('equipment intake screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    db.getJobs.mockReturnValue([]);
    db.getServerUrl.mockReturnValue('http://10.0.2.2:4000');

    queue.initQueue.mockResolvedValue(undefined);
    queue.subscribeQueue.mockReturnValue(jest.fn());
    queue.drainQueue.mockResolvedValue(undefined);

    server.checkServerHealth.mockResolvedValue({
      state: 'connected',
      detail: 'Backend reachable',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Render the application and wait for the initial
   * asynchronous backend health check to finish.
   *
   * Prevents tests from ending while the initial
   * setServerStatus() update is still pending.
   */
  const renderApp = async (
    expectedStatus: 'CONNECTED' | 'FAILED' = 'CONNECTED',
  ) => {
    const screen = render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(expectedStatus),
      ).toBeTruthy();
    });

    return screen;
  };

  it('renders the form and shows backend connectivity', async () => {
    const screen = await renderApp();

    expect(
      screen.getByText('Equipment intake'),
    ).toBeTruthy();

    expect(
      screen.getByText('Save & queue submission'),
    ).toBeTruthy();

    expect(
      screen.getByText('CONNECTED'),
    ).toBeTruthy();
  });

  it('shows connection failure returned by the backend check', async () => {
    server.checkServerHealth.mockResolvedValue({
      state: 'failed',
      detail: 'Connection timed out',
    });

    const screen = await renderApp('FAILED');

    expect(
      screen.getByText('FAILED'),
    ).toBeTruthy();

    expect(
      screen.getByText('Connection timed out'),
    ).toBeTruthy();
  });

  it('does not enqueue an invalid empty draft', async () => {
    const screen = await renderApp();

    fireEvent.press(
      screen.getByText('Save & queue submission'),
    );

    expect(db.putJob).not.toHaveBeenCalled();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Check the form',
      expect.any(String),
    );
  });

  it('allows changing equipment categories', async () => {
    const screen = await renderApp();

    fireEvent.press(
      screen.getByText('Agricultural equipment'),
    );

    expect(
      screen.getByPlaceholderText('Enter engine hours'),
    ).toBeTruthy();
  });

  it('persists a valid submission before requesting synchronization', async () => {
    const screen = await renderApp();

    fireEvent.changeText(
      screen.getByPlaceholderText('Enter make'),
      'Caterpillar',
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('Enter model'),
      '320',
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('Enter year'),
      '2021',
    );

    fireEvent.changeText(
      screen.getByPlaceholderText(
        'Condition, damage, known issues...',
      ),
      'Good condition',
    );

    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///photo.jpg',
        },
      ],
    });

    files.retainPhoto.mockResolvedValue({
      id: 'photo-1',
      uri: 'file:///saved.jpg',
      name: 'photo.jpg',
      mime: 'image/jpeg',
      size: 3,
    });

    fireEvent.press(
      screen.getByText('Choose photos'),
    );

    await waitFor(() => {
      expect(
        screen.getByText('Photos (1)'),
      ).toBeTruthy();
    });

    fireEvent.press(
      screen.getByText('Save & queue submission'),
    );

    await waitFor(() => {
      expect(db.putJob).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          draft: expect.objectContaining({
            category: 'construction',
            photos: [
              expect.objectContaining({
                id: 'photo-1',
              }),
            ],
          }),
        }),
      );

      expect(queue.drainQueue).toHaveBeenCalled();
    });
  });

  it('persists a new server URL when saved', async () => {
    const screen = await renderApp();

    fireEvent.changeText(
      screen.getByPlaceholderText('http://192.168.x.x:4000'),
      'http://192.168.0.20:4000/',
    );

    fireEvent.press(screen.getByText('Save server address'));

    await waitFor(() => {
      expect(db.setServerUrl).toHaveBeenCalledWith(
        'http://192.168.0.20:4000',
      );

      expect(server.checkServerHealth).toHaveBeenCalledWith(
        'http://192.168.0.20:4000',
      );

      expect(screen.getByText('CONNECTED')).toBeTruthy();
    });
  });
});