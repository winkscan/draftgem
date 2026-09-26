import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicKey, PublicKeyInitData } from "@solana/web3.js";
import {
  Account as AuthorizedAccount,
  AuthorizationResult,
  AuthorizeAPI,
  AuthToken,
  Base64EncodedAddress,
  DeauthorizeAPI,
  SignInPayload,
} from "@solana-mobile/mobile-wallet-adapter-protocol";
import { toUint8Array } from "js-base64";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { IS_MAINNET } from "../pumpfantasy/config";

// The network follows the switch in src/pumpfantasy/config.ts (wallets label it "solana:mainnet" / "solana:devnet").
const CHAIN_IDENTIFIER = IS_MAINNET ? ("solana:mainnet" as const) : ("solana:devnet" as const);

export type Account = Readonly<{
  address: Base64EncodedAddress;
  label?: string;
  /** The wallet's own picture for this account (a data URI or URL), when it sends one. */
  icon?: string;
  publicKey: PublicKey;
}>;

type WalletAuthorization = Readonly<{
  accounts: Account[];
  authToken: AuthToken;
  selectedAccount: Account;
  /** The network the wallet authorized us for: a token from another network is no good after a switch. */
  chain?: string;
}>;

function getAccountFromAuthorizedAccount(account: AuthorizedAccount): Account {
  return {
    ...account,
    publicKey: getPublicKeyFromAddress(account.address),
  };
}

function getAuthorizationFromAuthorizationResult(
  authorizationResult: AuthorizationResult,
  previouslySelectedAccount?: Account
): WalletAuthorization {
  let selectedAccount: Account;
  if (
    previouslySelectedAccount == null ||
    !authorizationResult.accounts.some(
      ({ address }) => address === previouslySelectedAccount.address
    )
  ) {
    const firstAccount = authorizationResult.accounts[0];
    selectedAccount = getAccountFromAuthorizedAccount(firstAccount);
  } else {
    selectedAccount = previouslySelectedAccount;
  }
  return {
    accounts: authorizationResult.accounts.map(getAccountFromAuthorizedAccount),
    authToken: authorizationResult.auth_token,
    selectedAccount,
  };
}

function getPublicKeyFromAddress(address: Base64EncodedAddress): PublicKey {
  const publicKeyByteArray = toUint8Array(address);
  return new PublicKey(publicKeyByteArray);
}

function cacheReviver(key: string, value: any) {
  if (key === "publicKey") {
    return new PublicKey(value as PublicKeyInitData);
  }
  return value;
}

const AUTHORIZATION_STORAGE_KEY = "pumpfantasy-authorization-cache";

async function fetchAuthorization(): Promise<WalletAuthorization | null> {
  const cacheFetchResult = await AsyncStorage.getItem(AUTHORIZATION_STORAGE_KEY);
  if (!cacheFetchResult) {
    return null;
  }
  const cached = JSON.parse(cacheFetchResult, cacheReviver) as WalletAuthorization;
  // Authorized for another network (e.g. before the switch from devnet to mainnet): the wallet would refuse
  // it ("authorization request failed"), so forget it and let the wallet ask afresh.
  if (cached.chain !== CHAIN_IDENTIFIER) {
    await AsyncStorage.removeItem(AUTHORIZATION_STORAGE_KEY);
    return null;
  }
  return cached;
}

async function persistAuthorization(auth: WalletAuthorization | null): Promise<void> {
  await AsyncStorage.setItem(AUTHORIZATION_STORAGE_KEY, JSON.stringify(auth));
}

export const APP_IDENTITY = {
  // Shown in the wallet's connect prompt. The uri stays as-is: changing it can
  // invalidate wallets' cached authorization and force everyone to reconnect.
  name: "DraftGem",
  uri: "https://pumpfantasy.app",
  icon: "favicon.ico",
};

export function useAuthorization() {
  const queryClient = useQueryClient();
  const { data: authorization, isLoading } = useQuery({
    queryKey: ["wallet-authorization"],
    queryFn: () => fetchAuthorization(),
  });
  const { mutate: setAuthorization } = useMutation({
    mutationFn: persistAuthorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-authorization"] });
    },
  });

  const handleAuthorizationResult = useCallback(
    async (authorizationResult: AuthorizationResult): Promise<WalletAuthorization> => {
      const nextAuthorization = getAuthorizationFromAuthorizationResult(
        authorizationResult,
        authorization?.selectedAccount
      );
      const withChain = { ...nextAuthorization, chain: CHAIN_IDENTIFIER };
      await setAuthorization(withChain);
      return withChain;
    },
    [authorization]
  );
  const authorizeSession = useCallback(
    async (wallet: AuthorizeAPI) => {
      let authorizationResult: AuthorizationResult;
      try {
        authorizationResult = await wallet.authorize({
          identity: APP_IDENTITY,
          chain: CHAIN_IDENTIFIER,
          auth_token: authorization?.authToken,
        });
      } catch (e) {
        // The wallet refused the remembered authorization: ask again without it.
        if (!authorization?.authToken) throw e;
        authorizationResult = await wallet.authorize({ identity: APP_IDENTITY, chain: CHAIN_IDENTIFIER });
      }
      return (await handleAuthorizationResult(authorizationResult)).selectedAccount;
    },
    [authorization, handleAuthorizationResult]
  );
  const authorizeSessionWithSignIn = useCallback(
    async (wallet: AuthorizeAPI, signInPayload: SignInPayload) => {
      const authorizationResult = await wallet.authorize({
        identity: APP_IDENTITY,
        chain: CHAIN_IDENTIFIER,
        auth_token: authorization?.authToken,
        sign_in_payload: signInPayload,
      });
      return (await handleAuthorizationResult(authorizationResult)).selectedAccount;
    },
    [authorization, handleAuthorizationResult]
  );
  const deauthorizeSession = useCallback(
    async (wallet: DeauthorizeAPI) => {
      if (authorization?.authToken == null) {
        return;
      }
      await wallet.deauthorize({ auth_token: authorization.authToken });
      await setAuthorization(null);
    },
    [authorization]
  );
  // Forget the wallet locally without talking to the wallet app — the fallback
  // for signing out when the wallet can't be reached to deauthorize properly.
  const clearAuthorization = useCallback(async () => {
    await setAuthorization(null);
  }, []);
  return useMemo(
    () => ({
      accounts: authorization?.accounts ?? null,
      authorizeSession,
      authorizeSessionWithSignIn,
      deauthorizeSession,
      clearAuthorization,
      selectedAccount: authorization?.selectedAccount ?? null,
      isLoading,
    }),
    [authorization, authorizeSession, deauthorizeSession]
  );
}
