import * as authService from '@/services/auth';
import { useAuthStore } from '../auth';

jest.mock('@/services/auth', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  subscribeToAuthChanges: jest.fn(),
}));

const mocked = authService as jest.Mocked<typeof authService>;
const USER = { uid: 'u1', email: 'a@b.cr' };

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'loading', user: null });
  });

  it('follows Firebase auth changes after start', () => {
    let emit: (user: authService.AuthUser | null) => void = () => undefined;
    const unsubscribe = jest.fn();
    mocked.subscribeToAuthChanges.mockImplementation((cb) => {
      emit = cb;
      return unsubscribe;
    });

    const stop = useAuthStore.getState().start();
    emit(USER);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user: USER });
    emit(null);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });

    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('stores the user after sign-in and sign-up', async () => {
    mocked.signIn.mockResolvedValueOnce(USER);
    await useAuthStore.getState().signIn('a@b.cr', 'secret1');
    expect(useAuthStore.getState().status).toBe('signedIn');

    useAuthStore.setState({ status: 'signedOut', user: null });
    mocked.signUp.mockResolvedValueOnce(USER);
    await useAuthStore.getState().signUp('a@b.cr', 'secret1');
    expect(useAuthStore.getState().user).toEqual(USER);
  });

  it('clears the user on sign-out', async () => {
    useAuthStore.setState({ status: 'signedIn', user: USER });
    mocked.signOut.mockResolvedValueOnce();
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('keeps the previous state when sign-in fails', async () => {
    useAuthStore.setState({ status: 'signedOut', user: null });
    mocked.signIn.mockRejectedValueOnce(new Error('invalid-credential'));
    await expect(useAuthStore.getState().signIn('a@b.cr', 'bad')).rejects.toBeTruthy();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});
